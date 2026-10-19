import { describe, expect, it } from 'vitest';

import type { AchievementInstanceResponse } from '../models/achievementBuilderApi.js';
import { RoundStatus, ScoreModifier, ThrowType } from '../models/enums.js';
import {
	type GameTrackerDelta,
	GameTrackerDeltaSchema,
	type PlayerRounds,
	type Round,
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
		projectedV2AchievementsByPlayer: {},
	};
}

function createInstance(id: string, renderedName: string): AchievementInstanceResponse {
	return {
		id,
		templateId:          '0f6a2a6e-5a8c-4c43-9a43-5b0b8f2f7d10',
		templateVersionId:   'a1c1d7e5-1c35-4a8e-9a43-2c7f4b8e5e21',
		versionNumber:       1,
		seasonId:            'c3d6a9f2-7b1e-4c5d-8e9f-0a1b2c3d4e5f',
		binding:             {},
		bindingHash:         '',
		renderedName,
		renderedDescription: '',
		evaluationPhase:     'Live',
		achievementTier:     1,
		categoryId:          'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70',
		categoryName:        'Custom',
		categoryIsArchived:  false,
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
		projectedV2AchievementsByPlayer: {},
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

	it('replaces the projection of players in the delta and keeps the others', () => {
		const state = createState();
		const kept = createInstance('5a0f2f3e-8d6c-4b1a-9e2f-3c4d5e6f7a81', 'Kept');
		const revoked = createInstance('6b1f3f4e-9d7c-4c2a-8e3f-4d5e6f7a8b92', 'Revoked');
		state.projectedV2AchievementsByPlayer = {
			[firstPlayerId]:  [ revoked ],
			[secondPlayerId]: [ kept ],
		};
		const delta = createDelta([ createRound(2) ]);
		delta.projectedV2AchievementsByPlayer = { [firstPlayerId]: [] };

		const result = applyGameTrackerDelta(state, delta);

		expect(result.status).toBe('applied');
		if (result.status !== 'applied')
			return;

		expect(result.state.projectedV2AchievementsByPlayer).toEqual({
			[firstPlayerId]:  [],
			[secondPlayerId]: [ kept ],
		});
		expect(state.projectedV2AchievementsByPlayer[firstPlayerId]).toEqual([ revoked ]);
	});

	it('parses the server projection field and defaults it when absent', () => {
		const instance = createInstance('7c2a4b5e-0d8c-4d3a-9e4f-5e6f7a8b9c03', 'Projected');
		const { projectedV2AchievementsByPlayer: _omitted, ...withoutProjection } =
			createDelta([ createRound(2) ]);

		expect(GameTrackerDeltaSchema.parse(withoutProjection).projectedV2AchievementsByPlayer)
			.toEqual({});
		expect(GameTrackerDeltaSchema.parse({
			...withoutProjection,
			projectedV2AchievementsByPlayer: { [firstPlayerId]: [ instance ] },
		}).projectedV2AchievementsByPlayer).toEqual({ [firstPlayerId]: [ instance ] });
	});
});
