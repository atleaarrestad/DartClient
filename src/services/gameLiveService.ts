import { container, injectable } from 'tsyringe';
import { z } from 'zod';

import {
	type AchievementInstanceResponse,
	AchievementInstanceResponseSchema,
} from '../models/achievementBuilderApi.js';
import {
	type GameResult,
	GameResultSchema,
	type GameTracker,
	type GameTrackerDelta,
	GameTrackerDeltaSchema,
	GameTrackerSchema,
} from '../models/schemas.js';
import {
	combineSignalRSubscriptions,
	SignalRService,
	SignalRSubscription,
	signalRGroups,
} from './signalRService.js';

/**
 * Validates a hub payload. An invalid one is logged and dropped; for trackers and deltas
 * the next revision gap then triggers a resync.
 */
function parsePayload<T>(event: string, schema: z.ZodType<T>, payload: unknown): T | undefined {
	const parsed = schema.safeParse(payload);
	if (parsed.success)
		return parsed.data;

	console.error(`[SignalR] ignored an invalid "${ event }" payload`, parsed.error);

	return undefined;
}

/** Keys only: the reaction and the sender's animal. The client gives them their look. */
const SpectatorReactionKeySchema = z.string().min(1).max(32);

const SpectatorReactionSchema = z.object({
	reaction: SpectatorReactionKeySchema,
	animal:   SpectatorReactionKeySchema,
});
export type SpectatorReaction = z.infer<typeof SpectatorReactionSchema>;

const SpectatorReactionResultSchema = z.object({
	accepted: z.boolean(),
	animal:   SpectatorReactionKeySchema.nullish(),
});
export type SpectatorReactionResult = z.infer<typeof SpectatorReactionResultSchema>;

/** The animals watching a game, in arrival order. Newer snapshots have higher versions. */
const SpectatorsSnapshotSchema = z.object({
	version: z.number().int(),
	animals: z.array(SpectatorReactionKeySchema).max(500),
});
export type SpectatorsSnapshot = z.infer<typeof SpectatorsSnapshotSchema>;

export interface ReactionHandlers {
	onReaction:   (gameId: string, reaction: SpectatorReaction) => void;
	onSpectators: (gameId: string, snapshot: SpectatorsSnapshot) => void;
}

@injectable()
export class GameLiveService {
	private readonly signalRService: SignalRService;

	constructor() {
		this.signalRService = container.resolve(SignalRService);
	}

	subscribeToV2Achievements(
		gameId: string,
		handler: (
			gameId: string,
			playerId: string,
			achievements: AchievementInstanceResponse[],
		) => void,
	): SignalRSubscription {
		return this.signalRService.registerSubscription({
			event:   'OnV2AchievementProjectionAdded',
			handler: (eventGameId, playerId, payload) => {
				const achievements = parsePayload(
					'OnV2AchievementProjectionAdded',
					z.array(AchievementInstanceResponseSchema),
					payload,
				);
				if (achievements)
					handler(eventGameId, playerId, achievements);
			},
			group: signalRGroups.achievements(gameId),
		});
	}

	/**
	 * Reactions spectators send on a game, and who is watching it; everyone on the game
	 * receives both. `onJoined` runs on every (re)join, which is when a spectator's animal
	 * changes and the crowd needs fetching again.
	 */
	subscribeToReactions(
		gameId: string,
		handlers: ReactionHandlers,
		onJoined: () => void | Promise<void>,
	): SignalRSubscription {
		return combineSignalRSubscriptions([
			this.signalRService.registerSubscription({
				event:   'OnSpectatorReaction',
				handler: (eventGameId, payload) => {
					const reaction = parsePayload('OnSpectatorReaction', SpectatorReactionSchema, payload);
					if (reaction)
						handlers.onReaction(eventGameId, reaction);
				},
				group:         signalRGroups.reactions(gameId),
				onGroupJoined: onJoined,
			}),
			this.signalRService.registerSubscription({
				event:   'OnSpectatorsChanged',
				handler: (eventGameId, payload) => {
					const snapshot = parsePayload('OnSpectatorsChanged', SpectatorsSnapshotSchema, payload);
					if (snapshot)
						handlers.onSpectators(eventGameId, snapshot);
				},
				group: signalRGroups.reactions(gameId),
			}),
		]);
	}

	/** Who is watching the game now. */
	async getSpectators(gameId: string): Promise<SpectatorsSnapshot | undefined> {
		const answer = await this.signalRService.invokeWithResult('GetSpectators', gameId);

		return parsePayload('GetSpectators', SpectatorsSnapshotSchema, answer);
	}

	/** The animal key this connection spectates the game as; undefined when the game is gone. */
	async claimSpectatorName(gameId: string): Promise<string | undefined> {
		const answer = await this.signalRService.invokeWithResult('ClaimSpectatorName', gameId);

		return parsePayload('ClaimSpectatorName', SpectatorReactionKeySchema.nullable(), answer) ?? undefined;
	}

	/** Sends a reaction to everyone else on the game. */
	async sendSpectatorReaction(gameId: string, reaction: string): Promise<SpectatorReactionResult | undefined> {
		const answer = await this.signalRService.invokeWithResult('SendSpectatorReaction', gameId, reaction);

		return parsePayload('SendSpectatorReaction', SpectatorReactionResultSchema, answer);
	}

	subscribeToGame(
		gameId: string,
		handlers: {
			onUpdated: (gameId: string, gameTracker: GameTracker) => void;
			onDelta: (gameId: string, delta: GameTrackerDelta) => void;
			onFinished: (gameId: string, gameResult: GameResult) => void;
		},
		onSynchronized: () => void | Promise<void>,
	): SignalRSubscription {
		return combineSignalRSubscriptions([
			this.signalRService.registerSubscription({
				event:   'OnGameUpdated',
				handler: (eventGameId, payload) => {
					const gameTracker = parsePayload('OnGameUpdated', GameTrackerSchema, payload);
					if (gameTracker)
						handlers.onUpdated(eventGameId, gameTracker);
				},
				onGroupJoined: onSynchronized,
				group:         signalRGroups.spectate(gameId),
			}),
			this.signalRService.registerSubscription({
				event:   'OnGameDelta',
				handler: (eventGameId, payload) => {
					const delta = parsePayload('OnGameDelta', GameTrackerDeltaSchema, payload);
					if (delta)
						handlers.onDelta(eventGameId, delta);
				},
				group: signalRGroups.spectate(gameId),
			}),
			this.signalRService.registerSubscription({
				event:   'OnGameFinished',
				handler: (eventGameId, payload) => {
					const gameResult = parsePayload('OnGameFinished', GameResultSchema, payload);
					if (gameResult)
						handlers.onFinished(eventGameId, gameResult);
				},
				group: signalRGroups.spectate(gameId),
			}),
		]);
	}
}
