import { describe, expect, it } from 'vitest';

import { ThrowType } from '../models/enums.js';
import type { SeasonStatistics, User } from '../models/schemas.js';
import {
	aggregateHitCounts,
	createEmptySeasonStatistics,
	createSeasonRow,
	formatDecimal,
	formatPercent,
	formatWholeNumber,
	getSeasonOverview,
	getSeasonPodium,
	getSeasonRows,
	getSeasonStatistics,
} from './seasonStatistics.js';

const seasonId = 'season-1';

type Hit = [ hitLocation: number, throwType: ThrowType, count: number ];

function createUser(
	id: string,
	stats: Partial<Omit<SeasonStatistics, 'hitCounts' | 'matchSnapshots' | 'finishCount'>> & {
		hits?:          Hit[];
		playerCounts?:  number[];
		finishes?:      [ roundNumber: number, count: number ][];
		achievements?:  number;
	} = {},
	otherSeasonOnly = false,
): User {
	const { hits = [], playerCounts = [], finishes = [], achievements = 0, ...rest } = stats;

	return {
		id,
		name:             `name-${ id }`,
		alias:            `alias-${ id }`,
		seasonStatistics: [ {
			...createEmptySeasonStatistics(id, otherSeasonOnly ? 'other-season' : seasonId),
			...rest,
			hitCounts:              hits.map(([ hitLocation, throwType, count ]) => ({ hitLocation, throwType, count })),
			matchSnapshots:         playerCounts.map(playerCount => ({ playerCount })),
			finishCount:            finishes.map(([ roundNumber, count ]) => ({ roundNumber, count })),
			unlockedV2Achievements: Array.from({ length: achievements }, () => ({})),
		} as unknown as SeasonStatistics ],
	};
}

describe('getSeasonStatistics', () => {
	it('returns the statistics for the season', () => {
		const user = createUser('a', { mmr: 1234 });

		expect(getSeasonStatistics(user, seasonId).mmr).toBe(1234);
	});

	it('returns empty statistics when the user has none for the season', () => {
		const user = createUser('a', { mmr: 1234 }, true);
		const stats = getSeasonStatistics(user, seasonId);

		expect(stats).toMatchObject({ userId: 'a', seasonId, mmr: 0, hitCounts: [], matchSnapshots: [] });
		expect(createSeasonRow(user, seasonId)).toMatchObject({
			mmr:                    0,
			totalThrowCount:        0,
			matchCount:             0,
			averagePlayersPerMatch: 0,
			averageFinishRound:     undefined,
			bullPercent:            undefined,
		});
	});
});

describe('createSeasonRow', () => {
	it('computes counts and averages', () => {
		const row = createSeasonRow(createUser('a', {
			mmr:          1500,
			hits:         [ [ 20, ThrowType.Single, 6 ], [ 0, ThrowType.Miss, 4 ] ],
			playerCounts: [ 2, 3, 3 ],
			finishes:     [ [ 5, 2 ], [ 8, 1 ] ],
			achievements: 3,
		}), seasonId);

		expect(row).toMatchObject({
			alias:                  'alias-a',
			mmr:                    1500,
			totalThrowCount:        10,
			nonZeroHitCount:        6,
			matchCount:             3,
			finishEvents:           3,
			totalAchievements:      3,
			averagePlayersPerMatch: 2.7,
			averageFinishRound:     6,
			// Below the throw minimum.
			twentyHitPercent:       undefined,
			missPercent:            undefined,
		});
	});

	it('computes location percentages without misses and type percentages with them', () => {
		const row = createSeasonRow(createUser('a', {
			hits: [
				[ 20, ThrowType.Single, 100 ],
				[ 20, ThrowType.Triple, 20 ],
				[ 19, ThrowType.Single, 30 ],
				[ 25, ThrowType.Single, 10 ],
				[ 50, ThrowType.Double, 5 ],
				[ 0, ThrowType.Miss, 70 ],
				[ 0, ThrowType.Rim, 15 ],
			],
		}), seasonId);

		// 250 throws, 165 on the board.
		expect(row.totalThrowCount).toBe(250);
		expect(row.twentyHitPercent).toBe(72.7);
		expect(row.nineteenHitPercent).toBe(18.2);
		expect(row.sixteenHitPercent).toBe(0);
		expect(row.bullPercent).toBe(6);
		expect(row.missPercent).toBe(28);
		expect(row.rimPercent).toBe(6);
	});

	it('leaves percentages undefined below 250 throws', () => {
		const row = createSeasonRow(createUser('a', { hits: [ [ 20, ThrowType.Single, 249 ] ] }), seasonId);

		expect(row.twentyHitPercent).toBeUndefined();
		expect(row.bullPercent).toBeUndefined();
	});
});

describe('getSeasonRows and getSeasonPodium', () => {
	const users = [
		createUser('low', { mmr: 100 }),
		createUser('high', { mmr: 300 }),
		createUser('mid', { mmr: 200 }),
	];

	it('sorts by MMR, highest first', () => {
		expect(getSeasonRows(users, seasonId).map(row => row.user.id)).toEqual([ 'high', 'mid', 'low' ]);
	});

	it('names the podium places', () => {
		const podium = getSeasonPodium(getSeasonRows(users, seasonId));

		expect(podium.first?.user.id).toBe('high');
		expect(podium.second?.user.id).toBe('mid');
		expect(podium.third?.user.id).toBe('low');
	});

	it('shows a single player only once', () => {
		const podium = getSeasonPodium(getSeasonRows([ users[0]! ], seasonId));

		expect(podium.first?.user.id).toBe('low');
		expect(podium.second).toBeUndefined();
		expect(podium.third).toBeUndefined();
	});
});

describe('aggregateHitCounts', () => {
	it('sums hits per type and location, ordered by location then type', () => {
		const rows = getSeasonRows([
			createUser('a', { hits: [ [ 20, ThrowType.Triple, 2 ], [ 20, ThrowType.Single, 5 ] ] }),
			createUser('b', { hits: [ [ 20, ThrowType.Single, 3 ], [ 1, ThrowType.Single, 1 ] ] }),
		], seasonId);

		expect(aggregateHitCounts(rows)).toEqual([
			{ hitLocation: 1, throwType: ThrowType.Single, count: 1 },
			{ hitLocation: 20, throwType: ThrowType.Single, count: 8 },
			{ hitLocation: 20, throwType: ThrowType.Triple, count: 2 },
		]);
	});

	it('does not change the players\' own hit counts', () => {
		const user = createUser('a', { hits: [ [ 20, ThrowType.Single, 5 ] ] });
		const rows = getSeasonRows([ user, createUser('b', { hits: [ [ 20, ThrowType.Single, 3 ] ] }) ], seasonId);
		aggregateHitCounts(rows);

		expect(user.seasonStatistics[0]!.hitCounts[0]!.count).toBe(5);
	});
});

describe('getSeasonOverview', () => {
	it('summarises the season', () => {
		const rows = getSeasonRows([
			createUser('a', {
				mmr:          2000,
				hits:         [ [ 20, ThrowType.Single, 7 ], [ 0, ThrowType.Miss, 3 ] ],
				playerCounts: Array.from({ length: 10 }, () => 2),
				finishes:     [ [ 4, 2 ] ],
				achievements: 2,
			}),
			createUser('b', {
				mmr:          1001,
				playerCounts: Array.from({ length: 10 }, () => 4),
				achievements: 1,
			}),
			// Fewer than 10 games: left out of the average MMR.
			createUser('c', { mmr: 9000, playerCounts: [ 2 ] }),
		], seasonId);

		expect(getSeasonOverview(rows)).toEqual([
			{ label: 'Players', value: 3 },
			{ label: 'Avg MMR (10+ games)', value: 1501 },
			{ label: 'Board Hits', value: 7 },
			{ label: 'Individual Finishes', value: 2 },
			{ label: 'Achievements', value: 3 },
			// 21 snapshots over 5 + 2.5 + 0.5 = 8 estimated matches.
			{ label: 'Avg Players / Match', value: 2.6 },
		]);
	});

	it('is all zeros without players', () => {
		expect(getSeasonOverview([]).map(stat => stat.value)).toEqual([ 0, 0, 0, 0, 0, 0 ]);
	});
});

describe('formatters', () => {
	it('format values and a dash for missing ones', () => {
		expect(formatPercent(12.34)).toBe('12.3%');
		expect(formatPercent(undefined)).toBe('-');
		expect(formatDecimal(4)).toBe('4.0');
		expect(formatDecimal(undefined)).toBe('-');
		expect(formatWholeNumber(7)).toBe('7');
		expect(formatWholeNumber(undefined)).toBe('-');
	});
});
