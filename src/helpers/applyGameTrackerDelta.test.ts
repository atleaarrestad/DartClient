import { describe, expect, it } from 'vitest';

import { RoundStatus, ScoreModifier, ThrowType } from '../models/enums.js';
import type {
	GameTrackerDelta,
	PlayerRounds,
	Round,
} from '../models/schemas.js';
import {
	applyGameTrackerDelta,
	GameTrackerState,
} from './applyGameTrackerDelta.js';

const gameId = '81a3e496-7530-4678-82ff-323a27d50410';
const firstPlayerId = '11ea5813-f41e-4301-b7ed-881f8466100c';
const secondPlayerId = '444a1f88-cdb8-4fd7-8cf7-92f9cc2ab0d8';

function createRound(roundIndex: number, cumulativePoints = 0): Round {
	return {
		roundIndex,
		cumulativePoints,
		roundStatus: RoundStatus.Valid,
		indexOfVictoryThrow: null,
		dartThrows: [ 0, 1, 2 ].map(throwIndex => ({
			hitLocation:        0,
			throwType:          ThrowType.Single,
			finalPoints:        0,
			throwIndex,
			activatedModifiers: [],
		})),
	};
}

function createPlayer(playerId: string): PlayerRounds {
	return {
		playerId,
		rounds: [
			createRound(0),
			createRound(1),
			createRound(2),
		],
	};
}

function createState(): GameTrackerState {
	return {
		gameId,
		revision:                4,
		maximumRounds:           10,
		configuredMaximumRounds: 10,
		playersRounds: [
			createPlayer(firstPlayerId),
			createPlayer(secondPlayerId),
		],
		projectedSessionAchievementsByPlayer: {
			[firstPlayerId]:  [],
			[secondPlayerId]: [],
		},
	};
}

function createDelta(rounds: Round[]): GameTrackerDelta {
	return {
		gameId,
		baseRevision:            4,
		revision:                5,
		maximumRounds:           10,
		configuredMaximumRounds: 10,
		playerRoundDeltas: [ {
			playerId:        firstPlayerId,
			startRoundIndex: rounds[0]!.roundIndex,
			roundCount:      rounds[0]!.roundIndex + rounds.length,
			rounds,
		} ],
		projectedSessionAchievementsByPlayer: {},
	};
}

describe('applyGameTrackerDelta', () => {
	it('replaces only the authoritative tail for the changed player', () => {
		const state = createState();
		const changedRound = createRound(1, 69);
		changedRound.dartThrows[2] = {
			hitLocation:        20,
			throwType:          ThrowType.Single,
			finalPoints:        40,
			throwIndex:         2,
			activatedModifiers: [ ScoreModifier.DoublePointsAt69 ],
		};
		const trailingRound = createRound(2, 109);

		const result = applyGameTrackerDelta(
			state,
			createDelta([ changedRound, trailingRound ]),
		);

		expect(result.status).toBe('applied');
		if (result.status !== 'applied')
			return;

		expect(result.state.playersRounds[0]!.rounds).toEqual([
			state.playersRounds[0]!.rounds[0],
			changedRound,
			trailingRound,
		]);
		expect(result.state.playersRounds[1]).toBe(state.playersRounds[1]);
		expect(result.state.revision).toBe(5);
	});

	it('applies changed tails for every player when trailing rounds are added', () => {
		const state = createState();
		const firstTrailingRound = createRound(3);
		const secondTrailingRound = createRound(3);
		const delta = createDelta([ firstTrailingRound ]);
		delta.playerRoundDeltas = [
			{
				playerId:        firstPlayerId,
				startRoundIndex: 3,
				roundCount:      4,
				rounds:          [ firstTrailingRound ],
			},
			{
				playerId:        secondPlayerId,
				startRoundIndex: 3,
				roundCount:      4,
				rounds:          [ secondTrailingRound ],
			},
		];

		const result = applyGameTrackerDelta(state, delta);

		expect(result.status).toBe('applied');
		if (result.status !== 'applied')
			return;

		expect(result.state.playersRounds[0]!.rounds).toHaveLength(4);
		expect(result.state.playersRounds[1]!.rounds).toHaveLength(4);
	});

	it('replaces projected achievements with an empty authoritative value', () => {
		const state = createState();
		state.projectedSessionAchievementsByPlayer[firstPlayerId] = [ 0 ];
		const delta = createDelta([ createRound(0) ]);
		delta.projectedSessionAchievementsByPlayer[firstPlayerId] = [];

		const result = applyGameTrackerDelta(state, delta);

		expect(result.status).toBe('applied');
		if (result.status !== 'applied')
			return;

		expect(result.state.projectedSessionAchievementsByPlayer[firstPlayerId]).toEqual([]);
	});

	it('rejects revision gaps without changing local state', () => {
		const state = createState();
		const delta = createDelta([ createRound(0) ]);
		delta.baseRevision = 5;
		delta.revision = 6;

		expect(applyGameTrackerDelta(state, delta)).toEqual({ status: 'gap' });
	});

	it('ignores stale or duplicate deltas', () => {
		const state = createState();
		const delta = createDelta([ createRound(0) ]);
		delta.baseRevision = 3;
		delta.revision = 4;

		expect(applyGameTrackerDelta(state, delta)).toEqual({ status: 'stale' });
	});
});
