import { describe, expect, it } from 'vitest';

import {
	createAchievementInstance,
	createLastDartHints,
	createRound,
	testGameId,
	testPlayerId,
	testSecondPlayerId,
} from '../test/gameFixtures.js';
import { GameTrackerDeltaSchema } from './schemas.js';

type DeltaInput = Record<string, unknown> & {
	playerRoundDeltas: Record<string, unknown>[];
};

/** A valid delta that replaces rounds 1 and 2 of the first player. */
function createDeltaInput(): DeltaInput {
	return {
		gameId:                  testGameId,
		baseRevision:            4,
		revision:                5,
		maximumRounds:           10,
		configuredMaximumRounds: 10,
		playerRoundDeltas:       [ {
			playerId:        testPlayerId,
			startRoundIndex: 1,
			roundCount:      3,
			rounds:          [ createRound(1), createRound(2) ],
		} ],
	};
}

function issueMessages(input: unknown): string[] {
	const result = GameTrackerDeltaSchema.safeParse(input);

	return result.success ? [] : result.error.issues.map(issue => issue.message);
}

describe('GameTrackerDeltaSchema', () => {
	it('accepts a complete, contiguous tail', () => {
		expect(issueMessages(createDeltaInput())).toEqual([]);
	});

	it('requires the revision to follow the base revision', () => {
		const delta = createDeltaInput();
		delta['revision'] = 6;

		expect(issueMessages(delta)).toEqual([ 'revision must immediately follow baseRevision' ]);
	});

	it('rejects duplicate players', () => {
		const delta = createDeltaInput();
		delta.playerRoundDeltas.push({ ...delta.playerRoundDeltas[0]! });

		expect(issueMessages(delta)).toEqual([ 'playerRoundDeltas cannot contain duplicate players' ]);
		expect(GameTrackerDeltaSchema.safeParse(delta).error?.issues[0]?.path)
			.toEqual([ 'playerRoundDeltas', 1, 'playerId' ]);
	});

	it('accepts several distinct players', () => {
		const delta = createDeltaInput();
		delta.playerRoundDeltas.push({ ...delta.playerRoundDeltas[0]!, playerId: testSecondPlayerId });

		expect(issueMessages(delta)).toEqual([]);
	});

	it('rejects a start index past the round count', () => {
		const delta = createDeltaInput();
		delta.playerRoundDeltas[0] = {
			playerId:        testPlayerId,
			startRoundIndex: 4,
			roundCount:      3,
			rounds:          [],
		};

		expect(issueMessages(delta)).toContain('startRoundIndex cannot exceed roundCount');
	});

	it('requires the whole tail up to the round count', () => {
		const delta = createDeltaInput();
		delta.playerRoundDeltas[0]!['roundCount'] = 4;

		expect(issueMessages(delta)).toEqual([ 'rounds must contain the complete authoritative tail' ]);
	});

	it('requires contiguous round indexes from the start index', () => {
		const delta = createDeltaInput();
		delta.playerRoundDeltas[0]!['rounds'] = [ createRound(1), createRound(3) ];

		const result = GameTrackerDeltaSchema.safeParse(delta);
		expect(result.error?.issues.map(issue => [ issue.message, issue.path ])).toEqual([
			[ 'round indexes must be contiguous from startRoundIndex', [ 'playerRoundDeltas', 0, 'rounds', 1, 'roundIndex' ] ],
		]);
	});

	it('accepts an empty tail at the round count', () => {
		const delta = createDeltaInput();
		delta.playerRoundDeltas[0] = {
			playerId:        testPlayerId,
			startRoundIndex: 3,
			roundCount:      3,
			rounds:          [],
		};

		expect(issueMessages(delta)).toEqual([]);
	});

	it('parses the server projection field and defaults it when absent', () => {
		const instance = createAchievementInstance('7c2a4b5e-0d8c-4d3a-9e4f-5e6f7a8b9c03', 'Projected');
		const delta = createDeltaInput();

		expect(GameTrackerDeltaSchema.parse(delta).projectedV2AchievementsByPlayer).toEqual({});
		expect(GameTrackerDeltaSchema.parse({
			...delta,
			projectedV2AchievementsByPlayer: { [testPlayerId]: [ instance ] },
		}).projectedV2AchievementsByPlayer).toEqual({ [testPlayerId]: [ instance ] });
	});

	it('parses null hint entries as clears and defaults the field when absent', () => {
		const hints = createLastDartHints(
			createAchievementInstance('8d3b5c6f-1e9d-4e4b-8f5a-6f7a8b9c0d14', 'Hinted'),
		);
		const delta = createDeltaInput();

		expect(GameTrackerDeltaSchema.parse(delta).lastDartHintsByPlayer).toEqual({});
		expect(GameTrackerDeltaSchema.parse({
			...delta,
			lastDartHintsByPlayer: { [testPlayerId]: null, [testSecondPlayerId]: hints },
		}).lastDartHintsByPlayer).toEqual({ [testPlayerId]: null, [testSecondPlayerId]: hints });
	});
});
