import { describe, expect, it } from 'vitest';

import { createEmptySeasonStatistics, getSeasonRows, type SeasonRow } from '../../helpers/seasonStatistics.js';
import { ThrowType } from '../../models/enums.js';
import type { SeasonStatistics, User } from '../../models/schemas.js';
import {
	getSeasonSpotlightCards,
	getSeasonSpotlightDefinition,
	getSeasonSpotlightTop10,
	seasonSpotlightDefinitions,
} from './season-spotlight-definitions.js';
import type { SeasonSpotlightAction } from './season-spotlights.js';

const seasonId = 'season-1';

/** Small deterministic PRNG so the fixture is stable across runs. */
function createRandom(seed: number): (max: number) => number {
	let state = seed;

	return max => {
		state = (state * 1103515245 + 12345) % 2147483648;

		return Math.floor(state / 65536) % max;
	};
}

/** Players with deliberately few distinct values, so the tie-breaks decide many places. */
function createUsers(count: number, seed: number): User[] {
	const random = createRandom(seed);

	return Array.from({ length: count }, (_, index) => {
		const id = `user-${ index }`;
		const throwScale = [ 0, 20, 60, 90 ][random(4)]!;
		const hits = [
			[ 20, ThrowType.Single ],
			[ 19, ThrowType.Single ],
			[ 16, ThrowType.Double ],
			[ 14, ThrowType.Triple ],
			[ 25, ThrowType.Single ],
			[ 50, ThrowType.Double ],
			[ 0, ThrowType.Miss ],
			[ 0, ThrowType.Rim ],
		].map(([ hitLocation, throwType ]) => ({
			hitLocation,
			throwType,
			count: throwScale === 0 ? 0 : random(4) * throwScale / 2,
		}));
		const matchCount = [ 0, 4, 10, 12 ][random(4)]!;
		const finishCount = random(3) === 0
			? []
			: [ { roundNumber: 3 + random(3), count: random(3) }, { roundNumber: 7, count: random(2) } ];

		return {
			id,
			name:             `name-${ index }`,
			alias:            `alias-${ index }`,
			seasonStatistics: random(8) === 0
				? []
				: [ {
					...createEmptySeasonStatistics(id, seasonId),
					mmr:                            [ 1000, 1200, 1500 ][random(3)],
					highestRoundScore:              [ 60, 100, 140 ][random(3)],
					highestRoundScoreForVictory:    [ 0, 60, 100 ][random(3)],
					highestRoundScoreNoSeasonRules: [ 60, 100 ][random(2)],
					hitCounts:                      hits,
					matchSnapshots:                 Array.from({ length: matchCount }, () => ({ playerCount: 2 + random(3) })),
					finishCount,
					unlockedV2Achievements:         Array.from({ length: random(4) }, () => ({})),
				} as unknown as SeasonStatistics ],
		};
	});
}

// The pre-refactor spotlight getters, copied verbatim apart from `this.`, as the parity reference.
const minimumQualifiedThrows = 250;
const minimumQualifiedMatchesForGroupSize = 10;
const hasQualifiedThrowSample = (row: SeasonRow) => row.totalThrowCount >= minimumQualifiedThrows;
const hasQualifiedGroupSizeSample = (row: SeasonRow) => row.matchCount >= minimumQualifiedMatchesForGroupSize;
const formatPercent = (value?: number) => value === undefined ? '-' : `${ value.toFixed(1) }%`;
const formatNumber = (value?: number) => value === undefined ? '-' : value.toFixed(1);
const formatWholeNumber = (value?: number) => value === undefined ? '-' : value.toString();

const legacy: Record<SeasonSpotlightAction, {
	rank:   (rows: SeasonRow[]) => SeasonRow[];
	format: (row: SeasonRow) => string;
}> = {
	'bull-specialist': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedThrowSample(x) && x.bullPercent !== undefined)
			.sort((a, b) => (b.bullPercent! - a.bullPercent!) || (b.totalThrowCount - a.totalThrowCount) || (b.mmr - a.mmr)),
		format: row => formatPercent(row.bullPercent),
	},
	'biggest-grinder': {
		rank:   rows => [ ...rows ].sort((a, b) => b.matchCount - a.matchCount || b.mmr - a.mmr),
		format: row => formatWholeNumber(row.matchCount),
	},
	'biggest-group-player': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedGroupSizeSample(x))
			.sort((a, b) => (b.averagePlayersPerMatch - a.averagePlayersPerMatch) || (b.matchCount - a.matchCount) || (b.mmr - a.mmr)),
		format: row => row.averagePlayersPerMatch.toFixed(1),
	},
	'smallest-group-player': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedGroupSizeSample(x))
			.sort((a, b) => (a.averagePlayersPerMatch - b.averagePlayersPerMatch) || (b.matchCount - a.matchCount) || (b.mmr - a.mmr)),
		format: row => row.averagePlayersPerMatch.toFixed(1),
	},
	'twenty-master': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedThrowSample(x) && x.twentyHitPercent !== undefined)
			.sort((a, b) => (b.twentyHitPercent! - a.twentyHitPercent!) || (b.totalThrowCount - a.totalThrowCount) || (b.mmr - a.mmr)),
		format: row => formatPercent(row.twentyHitPercent),
	},
	'nineteen-master': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedThrowSample(x) && x.nineteenHitPercent !== undefined)
			.sort((a, b) => (b.nineteenHitPercent! - a.nineteenHitPercent!) || (b.totalThrowCount - a.totalThrowCount) || (b.mmr - a.mmr)),
		format: row => formatPercent(row.nineteenHitPercent),
	},
	'sixteen-master': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedThrowSample(x) && x.sixteenHitPercent !== undefined)
			.sort((a, b) => (b.sixteenHitPercent! - a.sixteenHitPercent!) || (b.totalThrowCount - a.totalThrowCount) || (b.mmr - a.mmr)),
		format: row => formatPercent(row.sixteenHitPercent),
	},
	'fourteen-master': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedThrowSample(x) && x.fourteenHitPercent !== undefined)
			.sort((a, b) => (b.fourteenHitPercent! - a.fourteenHitPercent!) || (b.totalThrowCount - a.totalThrowCount) || (b.mmr - a.mmr)),
		format: row => formatPercent(row.fourteenHitPercent),
	},
	'finisher': {
		rank:   rows => [ ...rows ].sort((a, b) => b.finishEvents - a.finishEvents || b.mmr - a.mmr),
		format: row => formatWholeNumber(row.finishEvents),
	},
	'achievement-hunter': {
		rank:   rows => [ ...rows ].sort((a, b) => b.totalAchievements - a.totalAchievements || b.mmr - a.mmr),
		format: row => formatWholeNumber(row.totalAchievements),
	},
	'power-player': {
		rank:   rows => [ ...rows ].sort((a, b) => b.highestRoundScore - a.highestRoundScore || b.mmr - a.mmr),
		format: row => formatWholeNumber(row.highestRoundScore),
	},
	'clean-power-player': {
		rank: rows => [ ...rows ].sort(
			(a, b) => b.highestRoundScoreNoSeasonRules - a.highestRoundScoreNoSeasonRules || b.mmr - a.mmr,
		),
		format: row => formatWholeNumber(row.highestRoundScoreNoSeasonRules),
	},
	'range-king': {
		rank: rows => [ ...rows ].sort(
			(a, b) => b.highestRoundScoreForVictory - a.highestRoundScoreForVictory || b.mmr - a.mmr,
		),
		format: row => formatWholeNumber(row.highestRoundScoreForVictory),
	},
	'rim-king': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedThrowSample(x) && x.rimPercent !== undefined)
			.sort((a, b) => (b.rimPercent! - a.rimPercent!) || (b.totalThrowCount - a.totalThrowCount) || (b.mmr - a.mmr)),
		format: row => formatPercent(row.rimPercent),
	},
	'cleanest-thrower': {
		rank: rows => [ ...rows ]
			.filter(x => hasQualifiedThrowSample(x) && x.missPercent !== undefined)
			.sort((a, b) => (a.missPercent! - b.missPercent!) || (b.totalThrowCount - a.totalThrowCount) || (b.mmr - a.mmr)),
		format: row => formatPercent(row.missPercent),
	},
	'earliest-finisher': {
		rank: rows => [ ...rows ]
			.filter(x => x.averageFinishRound !== undefined)
			.sort((a, b) => (a.averageFinishRound! - b.averageFinishRound!) || (b.finishEvents - a.finishEvents) || (b.mmr - a.mmr)),
		format: row => formatNumber(row.averageFinishRound),
	},
};

const throwsQualification = {
	iconClass:   'fas fa-crosshairs',
	label:       '250+ throws',
	explanation: 'Only players with at least 250 total throws are eligible for this spotlight.',
};
const gamesQualification = {
	iconClass:   'fas fa-dice',
	label:       '10+ games',
	explanation: 'Only players with at least 10 games are eligible for this spotlight.',
};

// The pre-refactor card and dialog texts, in card order.
const expectedTexts: [
	action: SeasonSpotlightAction,
	title: string,
	iconClass: string,
	subtext: string,
	description: string,
	valueLabel: string,
	qualification: typeof throwsQualification | undefined,
][] = [
	[ 'bull-specialist', 'Bully', 'fas fa-bullseye', 'Most amount of throws landing in bull (25 or 50)',
		'Top 10 players by bull hit percentage. Eligible players need at least 250 total throws.', 'Bull%', throwsQualification ],
	[ 'biggest-grinder', 'Biggest grinder', 'fas fa-hammer', 'Most games played this season',
		'Top 10 players by total matches played this season.', 'Matches', undefined ],
	[ 'biggest-group-player', 'Biggest group player', 'fas fa-users', 'Highest average player count per match',
		'Top 10 players by highest average players per match. Eligible players need at least 10 games.', 'Avg players', gamesQualification ],
	[ 'smallest-group-player', 'Smallest group player', 'fas fa-user', 'Lowest average player count per match',
		'Top 10 players by lowest average players per match. Eligible players need at least 10 games.', 'Avg players', gamesQualification ],
	[ 'twenty-master', 'Master of 20', 'fas fa-bullseye', 'Percent of throws landing in 20 (excludes misses)',
		'Top 10 players by percentage of non-miss throws landing in 20. Eligible players need at least 250 total throws.', '20%', throwsQualification ],
	[ 'nineteen-master', 'Master of 19', 'fas fa-crosshairs', 'Percent of throws landing in 19 (excludes misses)',
		'Top 10 players by percentage of non-miss throws landing in 19. Eligible players need at least 250 total throws.', '19%', throwsQualification ],
	[ 'sixteen-master', 'Master of 16', 'fas fa-location-crosshairs', 'Percent of throws landing in 16 (excludes misses)',
		'Top 10 players by percentage of non-miss throws landing in 16. Eligible players need at least 250 total throws.', '16%', throwsQualification ],
	[ 'fourteen-master', 'Master of 14', 'fas fa-star', 'Percent of throws landing in 14 (excludes misses)',
		'Top 10 players by percentage of non-miss throws landing in 14. Eligible players need at least 250 total throws.', '14%', throwsQualification ],
	[ 'finisher', 'Closer', 'fas fa-flag-checkered', 'Most finishes secured.',
		'Top 10 players by total finishes secured this season.', 'Finishes', undefined ],
	[ 'achievement-hunter', 'Achievement hunter', 'fas fa-trophy', 'Progress + session achievements unlocked.',
		'Top 10 players by total unlocked achievements this season.', 'Achievements', undefined ],
	[ 'power-player', 'Assisted skill', 'fas fa-bolt', 'Highest single-round score with season modifiers.',
		'Top 10 players by highest single-round score with season modifiers applied.', 'Score', undefined ],
	[ 'clean-power-player', 'Pure skill', 'fas fa-brain', 'Highest single-round score without season modifiers.',
		'Top 10 players by highest single-round score without season modifiers.', 'Score', undefined ],
	[ 'range-king', 'Range king', 'fas fa-fire', 'Highest round score leading to victory',
		'Top 10 players by highest round score that resulted in victory.', 'Score', undefined ],
	[ 'rim-king', 'Rim magnet', 'fas fa-circle', 'Highest percentage of throws landing in the rim',
		'Top 10 players by rim percentage. Eligible players need at least 250 total throws.', 'Rim%', throwsQualification ],
	[ 'cleanest-thrower', 'Cleanest thrower', 'fas fa-ban', 'Lowest miss percentage',
		'Top 10 players by lowest miss percentage. Eligible players need at least 250 total throws.', 'Miss%', throwsQualification ],
	[ 'earliest-finisher', 'Earliest finisher', 'fas fa-hourglass-half', 'Lowest average round number for finish',
		'Top 10 players by lowest average round number needed to finish.', 'Avg round', undefined ],
];

describe('season spotlight definitions', () => {
	it('keep the card order and every text', () => {
		expect(seasonSpotlightDefinitions.map(definition => [
			definition.action,
			definition.title,
			definition.iconClass,
			definition.subtext,
			definition.description,
			definition.valueLabel,
		])).toEqual(expectedTexts.map(texts => texts.slice(0, 6)));
	});

	it.each([ 1, 7, 42, 1337, 9001 ])('rank and format like the original getters (seed %i)', seed => {
		const rows = getSeasonRows(createUsers(40, seed), seasonId);

		for (const definition of seasonSpotlightDefinitions) {
			const reference = legacy[definition.action].rank(rows);
			const expected = reference.slice(0, 10).map((row, index) => ({
				position: index + 1,
				alias:    row.alias,
				value:    legacy[definition.action].format(row),
			}));

			expect(getSeasonSpotlightTop10(definition, rows), definition.action).toEqual(expected);
		}
	});

	it.each([ 1, 7, 42, 1337, 9001 ])('build the same cards as the original page (seed %i)', seed => {
		const rows = getSeasonRows(createUsers(40, seed), seasonId);
		const expected = expectedTexts.flatMap(([ action, title, iconClass, subtext, , , qualification ]) => {
			const winner = legacy[action].rank(rows)[0];

			return winner
				? [ { action, title, iconClass, alias: winner.alias, value: legacy[action].format(winner), subtext, qualification } ]
				: [];
		});

		expect(getSeasonSpotlightCards(rows)).toEqual(expected);
	});

	it('fixtures exercise eligibility on both sides', () => {
		const rows = getSeasonRows(createUsers(40, 42), seasonId);

		for (const action of [ 'bull-specialist', 'biggest-group-player', 'earliest-finisher' ] as const) {
			const eligible = legacy[action].rank(rows).length;
			expect(eligible, action).toBeGreaterThan(0);
			expect(eligible, action).toBeLessThan(rows.length);
		}
	});

	it('skip cards without an eligible player', () => {
		const rows = getSeasonRows([ {
			id:               'solo',
			name:             'Solo',
			alias:            'Solo',
			seasonStatistics: [],
		} ], seasonId);

		expect(getSeasonSpotlightCards(rows).map(card => card.action)).toEqual([
			'biggest-grinder',
			'finisher',
			'achievement-hunter',
			'power-player',
			'clean-power-player',
			'range-king',
		]);
		expect(getSeasonSpotlightCards([])).toEqual([]);
	});

	it('look up definitions by action', () => {
		expect(getSeasonSpotlightDefinition('rim-king')?.title).toBe('Rim magnet');
	});
});
