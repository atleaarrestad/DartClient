import { describe, expect, it } from 'vitest';

import type { AchievementLegalHit, LastDartHint } from '../models/achievementBuilderApi.js';
import { AchievementTier, RoundStatus, ThrowType } from '../models/enums.js';
import type { PlayerRounds, Round } from '../models/schemas.js';
import {
	createAchievementInstance,
	createPlayer as createFixturePlayer,
	createRound as createFixtureRound,
	type Dart,
	testPlayerId,
} from '../test/gameFixtures.js';
import {
	buildHintStrip,
	formatHit,
	getBoardShade,
	getHighestTier,
	getHitKind,
	groupByName,
	isLastDartWindowOpen,
	listWinningHits,
	rankThrows,
} from './lastDartHints.js';

function createRound(roundIndex: number, roundStatus: RoundStatus, darts: Dart[]): Round {
	return createFixtureRound(roundIndex, { roundStatus, darts });
}

function createPlayer(...rounds: Round[]): PlayerRounds {
	return createFixturePlayer(testPlayerId, rounds);
}

const hit = (hitLocation: number, throwType: ThrowType): AchievementLegalHit =>
	({ hitLocation, throwType });

describe('isLastDartWindowOpen', () => {
	it('is open only for the hinted round with two darts down and the last one empty', () => {
		const twoDown = createPlayer(
			createRound(0, RoundStatus.Valid, [ [ 20, ThrowType.Triple ], [ 0, ThrowType.Miss ] ]),
			createRound(1, RoundStatus.Unplayed, []),
		);

		expect(isLastDartWindowOpen(twoDown, 0)).toBe(true);
		expect(isLastDartWindowOpen(twoDown, 1)).toBe(false);
		expect(isLastDartWindowOpen(createPlayer(
			createRound(0, RoundStatus.Valid, [ [ 20, ThrowType.Triple ] ]),
		), 0)).toBe(false);
		expect(isLastDartWindowOpen(createPlayer(
			createRound(0, RoundStatus.Valid, [ [ 1, ThrowType.Single ], [ 2, ThrowType.Single ], [ 3, ThrowType.Single ] ]),
			createRound(1, RoundStatus.Unplayed, []),
		), 0)).toBe(false);
	});

	it('is closed when the third dart was entered before the second', () => {
		expect(isLastDartWindowOpen(createPlayer(
			createRound(0, RoundStatus.Valid, [ [ 1, ThrowType.Single ], null, [ 3, ThrowType.Single ] ]),
		), 0)).toBe(false);
	});

	it('is closed when the round already ended', () => {
		for (const status of [ RoundStatus.Overshoot, RoundStatus.Victory, RoundStatus.WinConditionFailed ]) {
			expect(isLastDartWindowOpen(createPlayer(
				createRound(0, status, [ [ 20, ThrowType.Triple ], [ 20, ThrowType.Triple ] ]),
			), 0)).toBe(false);
		}
	});
});

describe('formatHit', () => {
	it('uses dart notation', () => {
		expect(formatHit(hit(20, ThrowType.Triple))).toBe('T20');
		expect(formatHit(hit(16, ThrowType.Double))).toBe('D16');
		expect(formatHit(hit(5, ThrowType.Single))).toBe('S5');
		expect(formatHit(hit(25, ThrowType.Single))).toBe('25');
		expect(formatHit(hit(50, ThrowType.Single))).toBe('Bull');
		expect(formatHit(hit(0, ThrowType.Rim))).toBe('Rim');
		expect(formatHit(hit(0, ThrowType.Miss))).toBe('Miss');
	});
});

describe('listWinningHits', () => {
	it('lists every target in the server order', () => {
		expect(listWinningHits([ hit(1, ThrowType.Single), hit(20, ThrowType.Triple) ]))
			.toBe('S1, T20');
	});
});

describe('getHitKind', () => {
	it('names the part of the board', () => {
		expect(getHitKind(hit(20, ThrowType.Single))).toBe('single');
		expect(getHitKind(hit(20, ThrowType.Double))).toBe('double');
		expect(getHitKind(hit(20, ThrowType.Triple))).toBe('treble');
		expect(getHitKind(hit(25, ThrowType.Single))).toBe('outer-bull');
		expect(getHitKind(hit(50, ThrowType.Single))).toBe('bull');
		expect(getHitKind(hit(0, ThrowType.Miss))).toBe('off-board');
	});
});

const hint = (name: string, hits: AchievementLegalHit[], tier = AchievementTier.bronze): LastDartHint => ({
	achievement: { ...createAchievementInstance(name, name), achievementTier: tier },
	winningHits: hits,
});

describe('getBoardShade', () => {
	it('alternates around the board like its colours', () => {
		expect(getBoardShade(20)).toBe('dark');
		expect(getBoardShade(1)).toBe('light');
		expect(getBoardShade(18)).toBe('dark');
		expect(getBoardShade(5)).toBe('light');
	});
});

describe('buildHintStrip', () => {
	const hints = [
		hint('Classic 20', [ hit(20, ThrowType.Single) ]),
		hint('Score At Least 60 (Raw)', [ hit(20, ThrowType.Triple), hit(19, ThrowType.Triple) ]),
		hint('Bull Bully', [ hit(50, ThrowType.Single) ]),
		hint('Rimmer', [ hit(0, ThrowType.Rim) ]),
	];

	it('has a column per number, then the bulls, the rim and a miss', () => {
		const strip = buildHintStrip([]);

		const numbers = Array.from({ length: 20 }, (_, index) => String(index + 1));

		expect(strip.map(column => column.label)).toEqual([ ...numbers, 'Bull', 'Rim', 'Miss' ]);
		expect(strip[19]!.segments.map(segment => segment?.key)).toEqual([ 'T20', 'D20', 'S20' ]);
		expect(strip[20]!.segments.map(segment => segment?.key)).toEqual([ undefined, 'Bull', '25' ]);
		expect(strip[21]!.segments.map(segment => segment?.key)).toEqual([ undefined, undefined, 'Rim' ]);
		expect(strip[22]!.segments.map(segment => segment?.key)).toEqual([ undefined, undefined, 'Miss' ]);
		expect(strip.every(column => column.segments.every(segment => !segment?.hintIndexes.length))).toBe(true);
	});

	it('marks every segment with the hints it unlocks', () => {
		const strip = buildHintStrip(hints);
		const indexes = (column: number, row: number): number[] | undefined => strip[column]!.segments[row]?.hintIndexes;

		expect(indexes(19, 0)).toEqual([ 1 ]);
		expect(indexes(19, 2)).toEqual([ 0 ]);
		expect(indexes(18, 0)).toEqual([ 1 ]);
		expect(indexes(19, 1)).toEqual([]);
		expect(indexes(20, 1)).toEqual([ 2 ]);
		expect(indexes(21, 2)).toEqual([ 3 ]);
	});
});

describe('rankThrows', () => {
	const rewards = {
		[AchievementTier.bronze]:   5,
		[AchievementTier.silver]:   10,
		[AchievementTier.gold]:     15,
		[AchievementTier.platinum]: 20,
		[AchievementTier.diamond]:  30,
	};

	it('weighs what a throw is worth by how hard it is: an easy single beats a harder treble', () => {
		const s20 = hit(20, ThrowType.Single);
		const t20 = hit(20, ThrowType.Triple);
		const ranked = rankThrows([
			hint('Score At Least 50 (Raw)', [ s20, t20 ]),
			hint('Score At Least 50 (Modified)', [ s20, t20 ]),
			hint('Score At Least 60 (Raw)', [ s20, t20 ]),
			hint('Maximum', [ t20 ], AchievementTier.gold),
		], rewards);

		expect(ranked.map(item => [ item.key, item.mmr ])).toEqual([ [ 'S20', 15 ], [ 'T20', 30 ] ]);
		expect(ranked[0]!.hintIndexes).toEqual([ 0, 1, 2 ]);
	});

	it('ranks singles, trebles, 25, the bull and doubles in that order for the same reward', () => {
		const sameReward = [
			hit(5, ThrowType.Double),
			hit(50, ThrowType.Single),
			hit(25, ThrowType.Single),
			hit(5, ThrowType.Triple),
			hit(5, ThrowType.Single),
		];
		const ranked = rankThrows(sameReward.map(item => hint(`Hit ${ item.hitLocation }`, [ item ])), rewards);

		expect(ranked.map(item => item.key)).toEqual([ 'S5', 'T5', '25', 'Bull', 'D5' ]);
	});

	it('lets a high tier pay for a harder throw', () => {
		const ranked = rankThrows([
			hint('Bronze single', [ hit(1, ThrowType.Single) ], AchievementTier.bronze),
			hint('Diamond treble', [ hit(20, ThrowType.Triple) ], AchievementTier.diamond),
		], rewards);

		expect(ranked[0]!.key).toBe('T20');
	});

	it('uses the season\u2019s rewards, with the defaults for a missing tier', () => {
		const [ only ] = rankThrows([ hint('A', [ hit(20, ThrowType.Single) ], AchievementTier.gold) ], {});

		expect(only!.mmr).toBe(15);
		const gold = [ hint('A', [ hit(20, ThrowType.Single) ], AchievementTier.gold) ];
		const goldWorth40 = rankThrows(gold, { [AchievementTier.gold]: 40 });

		expect(goldWorth40[0]!.mmr).toBe(40);
	});
});

describe('groupByName', () => {
	it('joins achievements whose names differ only in brackets, in the server order', () => {
		const groups = groupByName([
			hint('Score At Least 50 (Modified)', []),
			hint('Classic 20', []),
			hint('Score At Least 50 (Raw)', []),
		]);

		expect(groups.map(group => [ group.name, group.hints.length ])).toEqual([
			[ 'Score At Least 50 (Modified · Raw)', 2 ],
			[ 'Classic 20', 1 ],
		]);
	});
});

describe('getHighestTier', () => {
	it('picks the highest tier, or nothing without hints', () => {
		expect(getHighestTier([ hint('A', [], AchievementTier.silver), hint('B', [], AchievementTier.diamond) ]))
			.toBe(AchievementTier.diamond);
		expect(getHighestTier([])).toBeUndefined();
	});
});
