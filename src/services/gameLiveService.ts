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
