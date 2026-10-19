import { describe, expect, it } from 'vitest';

import type { AchievementLegalHit } from '../models/achievementBuilderApi.js';
import { RoundStatus, ThrowType } from '../models/enums.js';
import type { PlayerRounds, Round } from '../models/schemas.js';
import {
	describeWinningHits,
	easiestTargets,
	formatHit,
	getHitKind,
	isLastDartWindowOpen,
	listWinningHits,
} from './lastDartHints.js';

type Dart = [ hitLocation: number, throwType: ThrowType ] | null;

function createRound(roundIndex: number, roundStatus: RoundStatus, darts: Dart[]): Round {
	return {
		roundIndex,
		roundStatus,
		cumulativePoints:    0,
		indexOfVictoryThrow: null,
		dartThrows:          [ 0, 1, 2 ].map(throwIndex => {
			const dart = darts[throwIndex] ?? null;

			return {
				hitLocation:        dart?.[0] ?? 0,
				throwType:          dart?.[1] ?? ThrowType.Single,
				finalPoints:        dart ? 1 : 0,
				throwIndex,
				activatedModifiers: [],
			};
		}),
	};
}

function createPlayer(...rounds: Round[]): PlayerRounds {
	return { playerId: '11ea5813-f41e-4301-b7ed-881f8466100c', rounds };
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

describe('describeWinningHits', () => {
	it('names one target, or a few targets best first', () => {
		expect(describeWinningHits([ hit(20, ThrowType.Triple) ])).toBe('T20');
		expect(describeWinningHits([ hit(19, ThrowType.Double), hit(20, ThrowType.Triple) ]))
			.toBe('T20 / D19');
		expect(describeWinningHits([ hit(25, ThrowType.Single), hit(50, ThrowType.Single) ]))
			.toBe('Bull / 25');
	});

	it('summarizes a whole number or a whole ring', () => {
		expect(describeWinningHits([
			hit(20, ThrowType.Single),
			hit(20, ThrowType.Double),
			hit(20, ThrowType.Triple),
		])).toBe('Any 20');

		const doubles = Array.from({ length: 20 }, (_, index) => hit(index + 1, ThrowType.Double));
		expect(describeWinningHits(doubles)).toBe('Any double');
		expect(describeWinningHits(doubles.slice(0, 6))).toBe('6 doubles');
	});

	it('falls back to a target count for mixed sets', () => {
		expect(describeWinningHits([
			hit(1, ThrowType.Single),
			hit(2, ThrowType.Double),
			hit(3, ThrowType.Triple),
			hit(50, ThrowType.Single),
		])).toBe('4 targets');
	});

	it('lists every target for tooltips in the server order', () => {
		expect(listWinningHits([ hit(1, ThrowType.Single), hit(20, ThrowType.Triple) ]))
			.toBe('S1, T20');
	});
});

describe('easiestTargets', () => {
	it('keeps the first three of the easiest-first list from the server, or fewer', () => {
		const hits = [
			hit(20, ThrowType.Single),
			hit(20, ThrowType.Double),
			hit(20, ThrowType.Triple),
			hit(50, ThrowType.Single),
		];

		expect(easiestTargets(hits)).toEqual(hits.slice(0, 3));
		expect(easiestTargets([ hit(16, ThrowType.Triple) ])).toEqual([ hit(16, ThrowType.Triple) ]);
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
