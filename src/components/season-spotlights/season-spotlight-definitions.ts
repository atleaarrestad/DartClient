import {
	formatDecimal,
	formatPercent,
	formatWholeNumber,
	minimumQualifiedMatchesForGroupSize,
	minimumQualifiedThrows,
	type SeasonRow,
} from '../../helpers/seasonStatistics.js';
import type {
	SeasonSpotlightAction,
	SeasonSpotlightCard,
	SeasonSpotlightQualification,
} from './season-spotlights.js';

type SpotlightQualificationKind = 'throws' | 'games';

/** Everything one spotlight needs: the card, its eligibility and ranking, and the top 10 dialog. */
export interface SeasonSpotlightDefinition {
	action:         SeasonSpotlightAction;
	title:          string;
	iconClass:      string;
	/** Card text under the value. */
	subtext:        string;
	/** Top 10 dialog text. */
	description:    string;
	valueLabel:     string;
	qualification?: SpotlightQualificationKind;
	isEligible?:    (row: SeasonRow) => boolean;
	/** Best row first. */
	compare:        (left: SeasonRow, right: SeasonRow) => number;
	formatValue:    (row: SeasonRow) => string;
}

export interface SeasonSpotlightLeaderboardEntry {
	position: number;
	alias:    string;
	value:    string;
}

type NumericRowKey = {
	[Key in keyof SeasonRow]-?: SeasonRow[Key] extends number ? Key : never
}[keyof SeasonRow];

type PercentRowKey =
	| 'bullPercent'
	| 'twentyHitPercent'
	| 'nineteenHitPercent'
	| 'sixteenHitPercent'
	| 'fourteenHitPercent'
	| 'rimPercent'
	| 'missPercent';

const qualifications: Record<SpotlightQualificationKind, SeasonSpotlightQualification> = {
	throws: {
		iconClass:   'fas fa-crosshairs',
		label:       `${ minimumQualifiedThrows }+ throws`,
		explanation: `Only players with at least ${ minimumQualifiedThrows } total throws are eligible for this spotlight.`,
	},
	games: {
		iconClass:   'fas fa-dice',
		label:       `${ minimumQualifiedMatchesForGroupSize }+ games`,
		explanation: `Only players with at least ${ minimumQualifiedMatchesForGroupSize } games are eligible for this spotlight.`,
	},
};

const throwsEligibility = `Eligible players need at least ${ minimumQualifiedThrows } total throws.`;
const gamesEligibility = `Eligible players need at least ${ minimumQualifiedMatchesForGroupSize } games.`;

/** Highest `key` wins; ties go to the higher MMR. */
const countSpotlight = (
	key: NumericRowKey,
	spotlight: Omit<SeasonSpotlightDefinition, 'compare' | 'formatValue'>,
): SeasonSpotlightDefinition => ({
	...spotlight,
	compare:     (left, right) => (right[key] - left[key]) || (right.mmr - left.mmr),
	formatValue: row => formatWholeNumber(row[key]),
});

/** Percentage of a player's throws; needs the throw minimum. Ties go to more throws, then MMR. */
const percentSpotlight = (
	key: PercentRowKey,
	order: 'highest' | 'lowest',
	spotlight: Omit<SeasonSpotlightDefinition, 'compare' | 'formatValue' | 'isEligible' | 'qualification'>,
): SeasonSpotlightDefinition => ({
	...spotlight,
	qualification: 'throws',
	isEligible:    row => row.totalThrowCount >= minimumQualifiedThrows && row[key] !== undefined,
	compare:       (left, right) =>
		(order === 'highest' ? right[key]! - left[key]! : left[key]! - right[key]!) ||
		(right.totalThrowCount - left.totalThrowCount) ||
		(right.mmr - left.mmr),
	formatValue: row => formatPercent(row[key]),
});

/** Average players per match; needs the game minimum. Ties go to more matches, then MMR. */
const groupSizeSpotlight = (
	order: 'highest' | 'lowest',
	spotlight: Omit<SeasonSpotlightDefinition, 'compare' | 'formatValue' | 'isEligible' | 'qualification'>,
): SeasonSpotlightDefinition => ({
	...spotlight,
	qualification: 'games',
	isEligible:    row => row.matchCount >= minimumQualifiedMatchesForGroupSize,
	compare:       (left, right) =>
		(order === 'highest'
			? right.averagePlayersPerMatch - left.averagePlayersPerMatch
			: left.averagePlayersPerMatch - right.averagePlayersPerMatch) ||
		(right.matchCount - left.matchCount) ||
		(right.mmr - left.mmr),
	formatValue: row => row.averagePlayersPerMatch.toFixed(1),
});

const masterOf = (
	target: 20 | 19 | 16 | 14,
	key: PercentRowKey,
	iconClass: string,
): SeasonSpotlightDefinition => percentSpotlight(key, 'highest', {
	action:      ({ 20: 'twenty-master', 19: 'nineteen-master', 16: 'sixteen-master', 14: 'fourteen-master' } as const)[target],
	title:       `Master of ${ target }`,
	iconClass,
	subtext:     `Percent of throws landing in ${ target } (excludes misses)`,
	description: `Top 10 players by percentage of non-miss throws landing in ${ target }. ${ throwsEligibility }`,
	valueLabel:  `${ target }%`,
});

/** In card order. */
export const seasonSpotlightDefinitions: readonly SeasonSpotlightDefinition[] = [
	percentSpotlight('bullPercent', 'highest', {
		action:      'bull-specialist',
		title:       'Bully',
		iconClass:   'fas fa-bullseye',
		subtext:     'Most amount of throws landing in bull (25 or 50)',
		description: `Top 10 players by bull hit percentage. ${ throwsEligibility }`,
		valueLabel:  'Bull%',
	}),
	countSpotlight('matchCount', {
		action:      'biggest-grinder',
		title:       'Biggest grinder',
		iconClass:   'fas fa-hammer',
		subtext:     'Most games played this season',
		description: 'Top 10 players by total matches played this season.',
		valueLabel:  'Matches',
	}),
	groupSizeSpotlight('highest', {
		action:      'biggest-group-player',
		title:       'Biggest group player',
		iconClass:   'fas fa-users',
		subtext:     'Highest average player count per match',
		description: `Top 10 players by highest average players per match. ${ gamesEligibility }`,
		valueLabel:  'Avg players',
	}),
	groupSizeSpotlight('lowest', {
		action:      'smallest-group-player',
		title:       'Smallest group player',
		iconClass:   'fas fa-user',
		subtext:     'Lowest average player count per match',
		description: `Top 10 players by lowest average players per match. ${ gamesEligibility }`,
		valueLabel:  'Avg players',
	}),
	masterOf(20, 'twentyHitPercent', 'fas fa-bullseye'),
	masterOf(19, 'nineteenHitPercent', 'fas fa-crosshairs'),
	masterOf(16, 'sixteenHitPercent', 'fas fa-location-crosshairs'),
	masterOf(14, 'fourteenHitPercent', 'fas fa-star'),
	countSpotlight('finishEvents', {
		action:      'finisher',
		title:       'Closer',
		iconClass:   'fas fa-flag-checkered',
		subtext:     'Most finishes secured.',
		description: 'Top 10 players by total finishes secured this season.',
		valueLabel:  'Finishes',
	}),
	countSpotlight('totalAchievements', {
		action:      'achievement-hunter',
		title:       'Achievement hunter',
		iconClass:   'fas fa-trophy',
		subtext:     'Progress + session achievements unlocked.',
		description: 'Top 10 players by total unlocked achievements this season.',
		valueLabel:  'Achievements',
	}),
	countSpotlight('highestRoundScore', {
		action:      'power-player',
		title:       'Assisted skill',
		iconClass:   'fas fa-bolt',
		subtext:     'Highest single-round score with season modifiers.',
		description: 'Top 10 players by highest single-round score with season modifiers applied.',
		valueLabel:  'Score',
	}),
	countSpotlight('highestRoundScoreNoSeasonRules', {
		action:      'clean-power-player',
		title:       'Pure skill',
		iconClass:   'fas fa-brain',
		subtext:     'Highest single-round score without season modifiers.',
		description: 'Top 10 players by highest single-round score without season modifiers.',
		valueLabel:  'Score',
	}),
	countSpotlight('highestRoundScoreForVictory', {
		action:      'range-king',
		title:       'Range king',
		iconClass:   'fas fa-fire',
		subtext:     'Highest round score leading to victory',
		description: 'Top 10 players by highest round score that resulted in victory.',
		valueLabel:  'Score',
	}),
	percentSpotlight('rimPercent', 'highest', {
		action:      'rim-king',
		title:       'Rim magnet',
		iconClass:   'fas fa-circle',
		subtext:     'Highest percentage of throws landing in the rim',
		description: `Top 10 players by rim percentage. ${ throwsEligibility }`,
		valueLabel:  'Rim%',
	}),
	percentSpotlight('missPercent', 'lowest', {
		action:      'cleanest-thrower',
		title:       'Cleanest thrower',
		iconClass:   'fas fa-ban',
		subtext:     'Lowest miss percentage',
		description: `Top 10 players by lowest miss percentage. ${ throwsEligibility }`,
		valueLabel:  'Miss%',
	}),
	{
		action:      'earliest-finisher',
		title:       'Earliest finisher',
		iconClass:   'fas fa-hourglass-half',
		subtext:     'Lowest average round number for finish',
		description: 'Top 10 players by lowest average round number needed to finish.',
		valueLabel:  'Avg round',
		isEligible:  row => row.averageFinishRound !== undefined,
		compare:     (left, right) =>
			(left.averageFinishRound! - right.averageFinishRound!) ||
			(right.finishEvents - left.finishEvents) ||
			(right.mmr - left.mmr),
		formatValue: row => formatDecimal(row.averageFinishRound),
	},
];

export function getSeasonSpotlightDefinition(action: SeasonSpotlightAction): SeasonSpotlightDefinition | undefined {
	return seasonSpotlightDefinitions.find(definition => definition.action === action);
}

/** Eligible rows, best first. The sort is stable, so equal rows keep their incoming order. */
export function rankSeasonSpotlight(
	definition: SeasonSpotlightDefinition,
	rows: readonly SeasonRow[],
): SeasonRow[] {
	const eligible = definition.isEligible ? rows.filter(definition.isEligible) : [ ...rows ];

	return eligible.sort(definition.compare);
}

export function getSeasonSpotlightTop10(
	definition: SeasonSpotlightDefinition,
	rows: readonly SeasonRow[],
): SeasonSpotlightLeaderboardEntry[] {
	return rankSeasonSpotlight(definition, rows)
		.slice(0, 10)
		.map((row, index) => ({
			position: index + 1,
			alias:    row.alias,
			value:    definition.formatValue(row),
		}));
}

/** One card per spotlight that has a winner, in definition order. */
export function getSeasonSpotlightCards(rows: readonly SeasonRow[]): SeasonSpotlightCard[] {
	return seasonSpotlightDefinitions.flatMap(definition => {
		const winner = rankSeasonSpotlight(definition, rows)[0];
		if (!winner)
			return [];

		const card: SeasonSpotlightCard = {
			action:        definition.action,
			title:         definition.title,
			iconClass:     definition.iconClass,
			alias:         winner.alias,
			value:         definition.formatValue(winner),
			subtext:       definition.subtext,
			qualification: definition.qualification && qualifications[definition.qualification],
		};

		return [ card ];
	});
}
