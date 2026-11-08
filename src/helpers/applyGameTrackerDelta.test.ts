import { describe, expect, it } from 'vitest';

import { ScoreModifier, ThrowType } from '../models/enums.js';
import type { GameTrackerDelta, Round } from '../models/schemas.js';
import {
	createAchievementInstance as createInstance,
	createPlayer,
	createRound,
	testGameId as gameId,
	testPlayerId as firstPlayerId,
	testSecondPlayerId as secondPlayerId,
} from '../test/gameFixtures.js';
import {
	applyGameTrackerDelta,
	GameTrackerState,
} from './applyGameTrackerDelta.js';

const createThreeRounds = (): Round[] => [ createRound(0), createRound(1), createRound(2) ];

function createState(): GameTrackerState {
	return {
		gameId,
		revision:                4,
		maximumRounds:           10,
		configuredMaximumRounds: 10,
		playersRounds: [
			createPlayer(firstPlayerId, createThreeRounds()),
			createPlayer(secondPlayerId, createThreeRounds()),
		],
		projectedV2AchievementsByPlayer: {},
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
		const changedRound = createRound(1, { cumulativePoints: 69 });
		changedRound.dartThrows[2] = {
			hitLocation:        20,
			throwType:          ThrowType.Single,
			finalPoints:        40,
			throwIndex:         2,
			activatedModifiers: [ ScoreModifier.DoublePointsAt69 ],
		};
		const trailingRound = createRound(2, { cumulativePoints: 109 });

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
		const snapshot = structuredClone(state);

		expect(applyGameTrackerDelta(state, delta)).toEqual({ status: 'gap' });
		expect(state).toEqual(snapshot);
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

	it('ignores stale or duplicate deltas without changing local state', () => {
		const state = createState();
		const snapshot = structuredClone(state);
		const delta = createDelta([ createRound(0) ]);
		delta.baseRevision = 3;
		delta.revision = 4;

		expect(applyGameTrackerDelta(state, delta)).toEqual({ status: 'stale' });
		delta.baseRevision = 2;
		delta.revision = 3;
		expect(applyGameTrackerDelta(state, delta)).toEqual({ status: 'stale' });
		expect(state).toEqual(snapshot);
	});

	it('rejects a delta for another game', () => {
		const delta = createDelta([ createRound(2) ]);
		delta.gameId = '9b0c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4';

		expect(applyGameTrackerDelta(createState(), delta)).toEqual({ status: 'invalid' });
	});

	it('rejects a delta for a player who is not in the game', () => {
		const delta = createDelta([ createRound(2) ]);
		delta.playerRoundDeltas[0]!.playerId = '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f';

		expect(applyGameTrackerDelta(createState(), delta)).toEqual({ status: 'invalid' });
	});

	it('rejects a tail that starts after the rounds known locally', () => {
		const state = createState();
		const snapshot = structuredClone(state);

		expect(applyGameTrackerDelta(state, createDelta([ createRound(4) ])))
			.toEqual({ status: 'invalid' });
		expect(state).toEqual(snapshot);
	});

	it('accepts a tail that starts right after the last local round', () => {
		const result = applyGameTrackerDelta(createState(), createDelta([ createRound(3) ]));

		expect(result.status).toBe('applied');
		if (result.status === 'applied')
			expect(result.state.playersRounds[0]!.rounds.map(round => round.roundIndex)).toEqual([ 0, 1, 2, 3 ]);
	});
});
