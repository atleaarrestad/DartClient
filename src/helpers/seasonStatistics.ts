import { ThrowType } from '../models/enums.js';
import type { Rank } from '../models/rank.js';
import type { HitCount, SeasonStatistics, User } from '../models/schemas.js';
import { sum } from './sum.js';

/** Players need this many throws before percentage spotlights consider them. */
export const minimumQualifiedThrows = 250;
/** Players need this many games before group-size statistics consider them. */
export const minimumQualifiedMatchesForGroupSize = 10;

export interface SeasonRow {
	user:                           User;
	stats:                          SeasonStatistics;
	alias:                          string;
	mmr:                            number;
	rank?:                          Rank;
	highestRank?:                   Rank;
	totalThrowCount:                number;
	nonZeroHitCount:                number;
	matchCount:                     number;
	finishEvents:                   number;
	totalAchievements:              number;
	highestRoundScore:              number;
	highestRoundScoreForVictory:    number;
	highestRoundScoreNoSeasonRules: number;
	averagePlayersPerMatch:         number;
	averageFinishRound?:            number;
	bullPercent?:                   number;
	twentyHitPercent?:              number;
	nineteenHitPercent?:            number;
	sixteenHitPercent?:             number;
	fourteenHitPercent?:            number;
	missPercent?:                   number;
	rimPercent?:                    number;
}

export interface SeasonOverviewValue {
	label: string;
	value: number;
}

export interface SeasonPodium {
	first?:  SeasonRow;
	second?: SeasonRow;
	third?:  SeasonRow;
}

export const round1 = (value: number): number =>
	Math.round((value + Number.EPSILON) * 10) / 10;

export const formatPercent = (value?: number): string =>
	value === undefined ? '-' : `${ value.toFixed(1) }%`;

export const formatDecimal = (value?: number): string =>
	value === undefined ? '-' : value.toFixed(1);

export const formatWholeNumber = (value?: number): string =>
	value === undefined ? '-' : value.toString();

/** Statistics for a player who has not played in the season yet. */
export function createEmptySeasonStatistics(userId: string, seasonId: string): SeasonStatistics {
	return {
		id:                             0,
		userId,
		seasonId,
		currentRank:                    undefined,
		highestAchievedRank:            undefined,
		highestRoundScore:              0,
		highestRoundScoreForVictory:    0,
		highestRoundScoreNoSeasonRules: 0,
		mmr:                            0,
		matchSnapshots:                 [],
		hitCounts:                      [],
		finishCount:                    [],
		unlockedV2Achievements:         [],
		progressionAchievementProgress: [],
	} as unknown as SeasonStatistics;
}

export function getSeasonStatistics(user: User, seasonId: string): SeasonStatistics {
	return user.seasonStatistics?.find(stats => stats.seasonId === seasonId)
		?? createEmptySeasonStatistics(user.id, seasonId);
}

const countOf = (items: readonly { count?: number; }[]): number =>
	sum(items, item => item.count ?? 0);

/** Percentage (one decimal) of `hits` matching `predicate`, or undefined below the throw minimum. */
function getQualifiedPercent(
	totalThrowCount: number,
	hits: readonly HitCount[],
	predicate: (hit: HitCount) => boolean,
): number | undefined {
	if (totalThrowCount < minimumQualifiedThrows)
		return undefined;

	const total = countOf(hits);
	const matching = countOf(hits.filter(predicate));

	return total > 0 ? round1((matching / total) * 100) : undefined;
}

function getAveragePlayersPerMatch(stats: SeasonStatistics): number {
	const snapshots = stats.matchSnapshots ?? [];

	return snapshots.length > 0
		? round1(sum(snapshots, snapshot => snapshot.playerCount ?? 0) / snapshots.length)
		: 0;
}

function getAverageFinishRound(stats: SeasonStatistics): number | undefined {
	const finishCounts = stats.finishCount ?? [];
	const totalFinishes = countOf(finishCounts);
	if (totalFinishes === 0)
		return undefined;

	const weightedRoundSum = sum(finishCounts, finish => (finish.roundNumber ?? 0) * (finish.count ?? 0));

	return round1(weightedRoundSum / totalFinishes);
}

export function createSeasonRow(user: User, seasonId: string): SeasonRow {
	const stats = getSeasonStatistics(user, seasonId);
	const allHits = stats.hitCounts ?? [];
	// Location percentages exclude misses (hit location 0); type percentages use every throw.
	const boardHits = allHits.filter(hit => hit.hitLocation !== 0);
	const totalThrowCount = countOf(allHits);
	const locationPercent = (hitLocation: number) =>
		getQualifiedPercent(totalThrowCount, boardHits, hit => hit.hitLocation === hitLocation);
	const throwTypePercent = (throwType: ThrowType) =>
		getQualifiedPercent(totalThrowCount, allHits, hit => hit.throwType === throwType);

	return {
		user,
		stats,
		alias:                          user.alias ?? user.name,
		mmr:                            stats.mmr ?? 0,
		rank:                           stats.currentRank,
		highestRank:                    stats.highestAchievedRank,
		totalThrowCount,
		nonZeroHitCount:                countOf(boardHits),
		matchCount:                     stats.matchSnapshots?.length ?? 0,
		finishEvents:                   countOf(stats.finishCount ?? []),
		totalAchievements:              stats.unlockedV2Achievements?.length ?? 0,
		highestRoundScore:              stats.highestRoundScore ?? 0,
		highestRoundScoreForVictory:    stats.highestRoundScoreForVictory ?? 0,
		highestRoundScoreNoSeasonRules: stats.highestRoundScoreNoSeasonRules ?? 0,
		averagePlayersPerMatch:         getAveragePlayersPerMatch(stats),
		averageFinishRound:             getAverageFinishRound(stats),
		bullPercent:                    getQualifiedPercent(
			totalThrowCount,
			allHits,
			hit => hit.hitLocation === 25 || hit.hitLocation === 50,
		),
		twentyHitPercent:   locationPercent(20),
		nineteenHitPercent: locationPercent(19),
		sixteenHitPercent:  locationPercent(16),
		fourteenHitPercent: locationPercent(14),
		missPercent:        throwTypePercent(ThrowType.Miss),
		rimPercent:         throwTypePercent(ThrowType.Rim),
	};
}

/** One row per user for the season, highest MMR first. */
export function getSeasonRows(users: readonly User[], seasonId: string): SeasonRow[] {
	return users
		.map(user => createSeasonRow(user, seasonId))
		.sort((left, right) => right.mmr - left.mmr);
}

export function getSeasonPodium(rows: readonly SeasonRow[]): SeasonPodium {
	return { first: rows[0], second: rows[1], third: rows[2] };
}

/** Sums every player's hit counts per throw type and location, ordered by location then type. */
export function aggregateHitCounts(rows: readonly SeasonRow[]): HitCount[] {
	const map: Map<string, HitCount> = new Map();

	for (const row of rows) {
		for (const hit of row.stats.hitCounts ?? []) {
			const key = `${ hit.throwType }:${ hit.hitLocation }`;
			const existing = map.get(key);

			if (existing) {
				existing.count = (existing.count ?? 0) + (hit.count ?? 0);
			}
			else {
				map.set(key, {
					throwType:   hit.throwType,
					hitLocation: hit.hitLocation,
					count:       hit.count ?? 0,
				} as HitCount);
			}
		}
	}

	return [ ...map.values() ].sort((left, right) =>
		(left.hitLocation - right.hitLocation) || ((left.throwType ?? 0) - (right.throwType ?? 0)));
}

export function getSeasonOverview(rows: readonly SeasonRow[]): SeasonOverviewValue[] {
	const qualifiedRowsForAvgMmr = rows.filter(row => row.matchCount >= minimumQualifiedMatchesForGroupSize);
	const avgMmr = qualifiedRowsForAvgMmr.length
		? Math.round(sum(qualifiedRowsForAvgMmr, row => row.mmr) / qualifiedRowsForAvgMmr.length)
		: 0;
	// Every player in a match has a snapshot, so a snapshot counts as 1/playerCount of a match.
	const allSnapshots = rows.flatMap(row => row.stats.matchSnapshots ?? []);
	const estimatedMatchCount = sum(
		allSnapshots,
		snapshot => snapshot.playerCount > 0 ? 1 / snapshot.playerCount : 0,
	);
	const avgPlayersPerMatch = estimatedMatchCount > 0
		? round1(allSnapshots.length / estimatedMatchCount)
		: 0;

	return [
		{ label: 'Players', value: rows.length },
		{ label: 'Avg MMR (10+ games)', value: avgMmr },
		{ label: 'Board Hits', value: sum(rows, row => row.nonZeroHitCount) },
		{ label: 'Individual Finishes', value: sum(rows, row => row.finishEvents) },
		{ label: 'Achievements', value: sum(rows, row => row.totalAchievements) },
		{ label: 'Avg Players / Match', value: avgPlayersPerMatch },
	];
}
