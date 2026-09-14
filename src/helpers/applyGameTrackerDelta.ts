import type {
	GameTrackerDelta,
	PlayerRounds,
} from '../models/schemas.js';

export interface GameTrackerState {
	gameId: string;
	revision: number;
	maximumRounds: number | null;
	configuredMaximumRounds: number | null;
	playersRounds: PlayerRounds[];
}

export type ApplyGameTrackerDeltaResult =
	| { status: 'applied'; state: GameTrackerState; }
	| { status: 'stale'; }
	| { status: 'gap'; }
	| { status: 'invalid'; };

export function applyGameTrackerDelta(
	current: GameTrackerState,
	delta: GameTrackerDelta,
): ApplyGameTrackerDeltaResult {
	if (delta.gameId !== current.gameId)
		return { status: 'invalid' };

	if (delta.revision <= current.revision)
		return { status: 'stale' };

	if (delta.baseRevision !== current.revision)
		return { status: 'gap' };

	const deltasByPlayerId = new Map(
		delta.playerRoundDeltas.map(playerDelta => [ playerDelta.playerId, playerDelta ]),
	);

	for (const playerId of deltasByPlayerId.keys()) {
		if (!current.playersRounds.some(player => player.playerId === playerId))
			return { status: 'invalid' };
	}

	const playersRounds = current.playersRounds.map(player => {
		const playerDelta = deltasByPlayerId.get(player.playerId);
		if (!playerDelta)
			return player;

		if (playerDelta.startRoundIndex > player.rounds.length)
			return null;

		return {
			...player,
			rounds: [
				...player.rounds.slice(0, playerDelta.startRoundIndex),
				...playerDelta.rounds,
			],
		};
	});

	if (playersRounds.some(player => player === null))
		return { status: 'invalid' };

	return {
		status: 'applied',
		state: {
			gameId:                  current.gameId,
			revision:                delta.revision,
			maximumRounds:           delta.maximumRounds,
			configuredMaximumRounds: delta.configuredMaximumRounds,
			playersRounds:           playersRounds as PlayerRounds[],
		},
	};
}
