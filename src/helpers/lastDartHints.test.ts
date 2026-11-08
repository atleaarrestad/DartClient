import { describe, expect, it } from 'vitest';

import type { AchievementLegalHit, LastDartHint } from '../models/achievementBuilderApi.js';
import { AchievementTier, RoundStatus, ThrowType } from '../models/enums.js';
import type { PlayerRounds, Round } from '../models/schemas.js';
import {
	createPlayer as createFixturePlayer,
	createRound as createFixtureRound,
	type Dart,
	testPlayerId,
} from '../test/gameFixtures.js';
import {
	buildHintStrip,
	describeHit,
	formatHit,
	getFinishValue,
	getHeatLevel,
	getHighestTier,
	getHitKind,
	getLastDartRoundIndex,
	groupByName,
	isLastDartUp,
	isLastDartWindowOpen,
	parseHit,
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

describe('describeHit', () => {
	it('calls the 50 the double bull, and reads everything else as notation', () => {
		expect(describeHit(hit(50, ThrowType.Single))).toBe('Double Bull');
		expect(describeHit(hit(25, ThrowType.Single))).toBe('25');
		expect(describeHit(hit(20, ThrowType.Double))).toBe('D20');
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

describe('parseHit', () => {
	it('reads back every segment of the board', () => {
		const segments = buildHintStrip([]).flatMap(column => column.segments).filter(segment => segment !== undefined);

		expect(segments).toHaveLength(20 * 3 + 2 + 2);
		for (const segment of segments)
			expect(parseHit(formatHit(segment.hit))).toEqual(segment.hit);
	});

	it('skips what is not dart notation', () => {
		for (const code of [ '', 'T21', 'S0', 'D25', 'X5', 'bull', 'T 20', 'S20 ' ])
			expect(parseHit(code)).toBeUndefined();
	});
});

describe('isLastDartUp', () => {
	const player = createPlayer(
		createRound(0, RoundStatus.Valid, [ [ 1, ThrowType.Single ], [ 2, ThrowType.Single ], [ 3, ThrowType.Single ] ]),
		createRound(1, RoundStatus.Valid, [ [ 20, ThrowType.Triple ], [ 0, ThrowType.Miss ] ]),
		createRound(2, RoundStatus.Unplayed, []),
	);

	it('is only the third dart of the round whose first two are down', () => {
		expect(isLastDartUp(player, { roundIndex: 1, throwIndex: 2 })).toBe(true);
		expect(isLastDartUp(player, { roundIndex: 1, throwIndex: 1 })).toBe(false);
		expect(isLastDartUp(player, { roundIndex: 0, throwIndex: 2 })).toBe(false);
		expect(isLastDartUp(player, { roundIndex: 2, throwIndex: 2 })).toBe(false);
	});

	it('is never a dart of a player who is not about to throw a last dart', () => {
		const firstDartOnly = createPlayer(createRound(0, RoundStatus.Valid, [ [ 20, ThrowType.Triple ] ]));

		expect(isLastDartUp(firstDartOnly, { roundIndex: 0, throwIndex: 2 })).toBe(false);
	});
});

describe('getLastDartRoundIndex', () => {
	it('is the round with two darts down and the last one to come', () => {
		expect(getLastDartRoundIndex(createPlayer(
			createRound(0, RoundStatus.Valid, [ [ 1, ThrowType.Single ], [ 2, ThrowType.Single ], [ 3, ThrowType.Single ] ]),
			createRound(1, RoundStatus.Valid, [ [ 20, ThrowType.Triple ], [ 0, ThrowType.Miss ] ]),
			createRound(2, RoundStatus.Unplayed, []),
		))).toBe(1);
	});

	it('is nothing before the second dart, after the third, or once the round has ended', () => {
		expect(getLastDartRoundIndex(createPlayer(
			createRound(0, RoundStatus.Valid, [ [ 20, ThrowType.Triple ] ]),
		))).toBeUndefined();
		expect(getLastDartRoundIndex(createPlayer(
			createRound(0, RoundStatus.Valid, [ [ 1, ThrowType.Single ], [ 2, ThrowType.Single ], [ 3, ThrowType.Single ] ]),
			createRound(1, RoundStatus.Unplayed, []),
		))).toBeUndefined();
		expect(getLastDartRoundIndex(createPlayer(
			createRound(0, RoundStatus.Overshoot, [ [ 20, ThrowType.Triple ], [ 20, ThrowType.Triple ] ]),
		))).toBeUndefined();
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
	id:   name,
	name,
	tier,
	hits: hits.map(formatHit),
});

describe('getHeatLevel', () => {
	it('splits the counts into four steps against the most on the board', () => {
		expect([ 1, 2, 3, 4, 5, 6, 8, 9, 11 ].map(count => getHeatLevel(count, 11)))
			.toEqual([ 1, 1, 2, 2, 2, 3, 3, 4, 4 ]);
		expect([ 1, 2 ].map(count => getHeatLevel(count, 2))).toEqual([ 2, 4 ]);
	});

	it('is strongest when every lit segment unlocks the same, and 0 for unlit ones', () => {
		expect(getHeatLevel(1, 1)).toBe(4);
		expect(getHeatLevel(0, 5)).toBe(0);
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

	it('leaves out hits it cannot read', () => {
		const strip = buildHintStrip([ { ...hint('Odd', []), hits: [ 'Q7', 'S7' ] } ]);

		expect(strip.flatMap(column => column.segments).filter(segment => segment?.hintIndexes.length).map(segment => segment!.key))
			.toEqual([ 'S7' ]);
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
	const s20 = hit(20, ThrowType.Single);
	const d20 = hit(20, ThrowType.Double);
	const t20 = hit(20, ThrowType.Triple);
	const golds = (count: number, ...hits: AchievementLegalHit[]): LastDartHint[] =>
		Array.from({ length: count }, (_, index) => hint(`Gold ${ index }`, hits, AchievementTier.gold));

	it('aims at the easy single when a harder target adds little to it', () => {
		const ranked = rankThrows([
			...golds(3, s20, t20),
			hint('Maximum', [ t20 ], AchievementTier.bronze),
		], { tierRewards: rewards });

		expect(ranked.map(item => [ item.key, item.mmr ])).toEqual([ [ 'S20', 45 ], [ 'T20', 50 ] ]);
		expect(ranked[0]!.hintIndexes).toEqual([ 0, 1, 2 ]);
	});

	it('goes for a double that unlocks far more, since a miss usually still lands in the single', () => {
		// The game in question: S20 unlocks 4, D20 those 4 and 22 more.
		const ranked = rankThrows([
			...golds(4, s20, d20),
			...Array.from({ length: 22 }, (_, index) => hint(`Silver ${ index }`, [ d20 ], AchievementTier.silver)),
		], { tierRewards: rewards });

		expect(ranked[0]!.key).toBe('D20');
		expect(ranked[0]!.hintIndexes).toHaveLength(26);
		// 0.18 × 280 + 0.35 × 60 = 71.4 against 60; winning as well adds 0.18 × 118.
		expect(ranked[0]!.payoff).toBeCloseTo(71.4);
	});

	it('weighs a dart that wins the game by what finishing is worth, even with nothing else to unlock', () => {
		const hints = golds(2, s20);
		const values = { tierRewards: rewards, victoryHits: [ 'D20' ], victoryValue: 118 };

		const ranked = rankThrows(hints, values);

		expect(ranked.map(item => [ item.key, item.wins ])).toEqual([ [ 'D20', true ], [ 'S20', false ] ]);
		expect(ranked[0]!.hintIndexes).toEqual([]);
		expect(rankThrows(hints, { ...values, victoryValue: 0 })[0]!.key).toBe('S20');
	});

	it('ranks singles, trebles, 25 and doubles in that order for the same reward and no fallback', () => {
		const sameReward = [
			hit(5, ThrowType.Double),
			hit(25, ThrowType.Single),
			hit(6, ThrowType.Triple),
			hit(7, ThrowType.Single),
		];
		const ranked = rankThrows(sameReward.map(item => hint(`Hit ${ formatHit(item) }`, [ item ])), { tierRewards: rewards });

		expect(ranked.map(item => item.key)).toEqual([ 'S7', 'T6', '25', 'D5' ]);
		expect(rankThrows([ hint('A', [ hit(5, ThrowType.Double) ]), hint('B', [ hit(50, ThrowType.Single) ]) ])
			.map(item => item.key)).toEqual([ 'Bull', 'D5' ]);
	});

	it('counts the 25 a missed bull often lands in', () => {
		const ranked = rankThrows([
			hint('Outer', [ hit(25, ThrowType.Single), hit(50, ThrowType.Single) ], AchievementTier.gold),
			hint('Inner', [ hit(50, ThrowType.Single) ], AchievementTier.diamond),
		], { tierRewards: rewards });

		// Aiming at the bull: 0.2 × 45 + 0.35 × 15 = 14.25; at the 25: 0.25 × 15 = 3.75.
		expect(ranked.map(item => item.key)).toEqual([ 'Bull', '25' ]);
		expect(ranked[0]!.payoff).toBeCloseTo(14.25);
	});

	it('lets a high tier pay for a harder throw', () => {
		const ranked = rankThrows([
			hint('Bronze single', [ hit(1, ThrowType.Single) ], AchievementTier.bronze),
			hint('Diamond treble', [ t20 ], AchievementTier.diamond),
		], { tierRewards: rewards });

		expect(ranked[0]!.key).toBe('T20');
	});

	it('uses the season\u2019s rewards, with the defaults for a missing tier', () => {
		const gold = [ hint('A', [ s20 ], AchievementTier.gold) ];

		expect(rankThrows(gold)[0]!.mmr).toBe(15);
		expect(rankThrows(gold, { tierRewards: { [AchievementTier.gold]: 40 } })[0]!.mmr).toBe(40);
	});
});

describe('getFinishValue', () => {
	const configuration = { placementBonus: 30, finishBonus: 100, roundPenalty: 6 };

	it('is the placement bonus for the place plus the finish bonus less the rounds played', () => {
		expect(getFinishValue(configuration, 2, 1)).toBe(30 + 88);
		expect(getFinishValue(configuration, 2, 2)).toBe(15 + 88);
		expect(getFinishValue(configuration, 4, 3)).toBe(10 + 76);
	});

	it('never takes away from the placement bonus however long the game ran', () => {
		expect(getFinishValue(configuration, 40, 1)).toBe(30);
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
			[ 'Score At Least 50 (Modified, Raw)', 2 ],
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
