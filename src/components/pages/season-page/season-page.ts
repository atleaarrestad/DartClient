import '../../aa-loading-state/aa-loading-state.js';
import '../../rank-display/aa-rank-display.js';
import '../../season-hit-chart/season-hit-chart.js';
import '../../season-leaderboard/season-leaderboard.js';
import '../../season-overview/season-overview.js';
import '../../season-spotlights/season-spotlights.js';

import { html, nothing, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { faIcons } from '../../../faIcons.js';
import { ThrowType } from '../../../models/enums.js';
import { getRankDisplayValue } from '../../../models/rank.js';
import { HitCount, Season, SeasonStatistics, User } from '../../../models/schemas.js';
import { DialogService } from '../../../services/dialogService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import { seasonSpotlightDialogTemplate, SeasonSpotlightLeaderboardRow } from '../../../templates/dialogTemplates.js';
import type { SeasonLeaderboardRow } from '../../season-leaderboard/season-leaderboard.js';
import type { SeasonOverviewStat } from '../../season-overview/season-overview.js';
import type {
	SeasonSpotlightAction,
	SeasonSpotlightActionEvent,
	SeasonSpotlightCard,
	SeasonSpotlightQualification,
} from '../../season-spotlights/season-spotlights.js';
import seasonPageStyles from './season-page.css?inline';

@customElement('season-page')
export class SeasonPage extends LitElement {
	private seasonService:  SeasonService;
	private userService:    UserService;
	private dialogService:  DialogService;
	private readonly minimumQualifiedThrows = 250;
	private readonly minimumQualifiedMatchesForGroupSize = 10;

	@state() private season?: Season;
	@state() private users: User[] = [];
	@state() private isLoading = true;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
	}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		this.isLoading = true;

		try {
			this.season = await this.seasonService.getCurrentSeason();
			this.users = await this.userService.getAllUsers({
				forceRefresh: true,
				query: {
					includeFinishCounts: true,
					includeHitCounts: true,
					includeMatchSnapshots: true,
					includeSeasonStatistics: true,
					limitToSeasonId: this.season!.id,
				},
			});
		}
		finally {
			this.isLoading = false;
			this.requestUpdate();
		}
	}

	private getStatsForCurrentSeason(user: User): SeasonStatistics {
		const match = user?.seasonStatistics?.find((seasonStats) => seasonStats.seasonId === this.season?.id);
		if (match) {
			return match;
		}

		return {
			id: 0,
			userId: user.id,
			seasonId: this.season?.id ?? '',
			currentRank: undefined,
			highestAchievedRank: undefined,
			highestRoundScore: 0,
			highestRoundScoreForVictory: 0,
			highestRoundScoreNoSeasonRules: 0,
			mmr: 0,
			matchSnapshots: [],
			hitCounts: [],
			finishCount: [],
			unlockedProgressAchievements: [],
			unlockedSessionAchievements: [],
		} as unknown as SeasonStatistics;
	}

	private round1(value: number): number {
		return Math.round((value + Number.EPSILON) * 10) / 10;
	}

	private getNonZeroHitCounts(stats: SeasonStatistics) {
		return (stats?.hitCounts ?? []).filter((x) => x.hitLocation !== 0);
	}

	private getAllHitCounts(stats: SeasonStatistics) {
		return stats?.hitCounts ?? [];
	}

	private getTotalThrowCount(stats: SeasonStatistics): number {
		return this.getAllHitCounts(stats).reduce((sum, x) => sum + (x.count ?? 0), 0);
	}

	private getNonZeroHitCount(stats: SeasonStatistics): number {
		return this.getNonZeroHitCounts(stats).reduce((sum, x) => sum + (x.count ?? 0), 0);
	}

	private getHitLocationPercent(stats: SeasonStatistics, hitLocation: number): number | undefined {
		const totalThrowCount = this.getTotalThrowCount(stats);
		if (totalThrowCount < this.minimumQualifiedThrows) {
			return undefined;
		}

		const hitCounts = this.getNonZeroHitCounts(stats);
		const totalThrows = hitCounts.reduce((sum, x) => sum + (x.count ?? 0), 0);
		const locationHits = hitCounts
			.filter((x) => x.hitLocation === hitLocation)
			.reduce((sum, x) => sum + (x.count ?? 0), 0);

		return totalThrows > 0 ? this.round1((locationHits / totalThrows) * 100) : undefined;
	}

	private getThrowTypePercent(stats: SeasonStatistics, throwType: ThrowType): number | undefined {
		const totalThrowCount = this.getTotalThrowCount(stats);
		if (totalThrowCount < this.minimumQualifiedThrows) {
			return undefined;
		}

		const hitCounts = this.getAllHitCounts(stats);
		const totalThrows = hitCounts.reduce((sum, x) => sum + (x.count ?? 0), 0);
		const matchingThrows = hitCounts
			.filter((x) => x.throwType === throwType)
			.reduce((sum, x) => sum + (x.count ?? 0), 0);

		return totalThrows > 0 ? this.round1((matchingThrows / totalThrows) * 100) : undefined;
	}

	private getAveragePlayersPerMatch(stats: SeasonStatistics): number {
		const snapshots = stats?.matchSnapshots ?? [];
		const matchCount = snapshots.length;
		const totalPlayers = snapshots.reduce((sum, x) => sum + (x.playerCount ?? 0), 0);

		return matchCount > 0 ? this.round1(totalPlayers / matchCount) : 0;
	}

	private getAverageFinishRound(stats: SeasonStatistics): number | undefined {
		const finishCounts = stats?.finishCount ?? [];
		const totalFinishes = finishCounts.reduce((sum, x) => sum + (x.count ?? 0), 0);

		if (totalFinishes === 0) {
			return undefined;
		}

		const weightedRoundSum = finishCounts.reduce(
			(sum, x) => sum + ((x.roundNumber ?? 0) * (x.count ?? 0)),
			0,
		);

		return this.round1(weightedRoundSum / totalFinishes);
	}

	private hasQualifiedThrowSample(row: (typeof this.seasonRows)[number]): boolean {
		return row.totalThrowCount >= this.minimumQualifiedThrows;
	}

	private hasQualifiedGroupSizeSample(row: (typeof this.seasonRows)[number]): boolean {
		return row.matchCount >= this.minimumQualifiedMatchesForGroupSize;
	}

	private formatPercent(value?: number): string {
		return value === undefined ? '-' : `${value.toFixed(1)}%`;
	}

	private formatNumber(value?: number): string {
		return value === undefined ? '-' : value.toFixed(1);
	}

	private formatWholeNumber(value?: number): string {
		return value === undefined ? '-' : value.toString();
	}

	private getPlacementFaClass(placement?: string): string {
		switch (placement) {
			case '1st':
				return 'fas fa-trophy';
			case '2nd':
				return 'fas fa-medal';
			case '3rd':
				return 'fas fa-award';
			default:
				return 'fas fa-star';
		}
	}

	private getSpotlightIconClass(kind: string): string {
		switch (kind) {
			case 'leader':
				return 'fas fa-crown';
			case 'grinder':
				return 'fas fa-hammer';
			case 'twenty':
				return 'fas fa-bullseye';
			case 'nineteen':
				return 'fas fa-crosshairs';
			case 'sixteen':
				return 'fas fa-location-crosshairs';
			case 'fourteen':
				return 'fas fa-star';
			case 'finisher':
				return 'fas fa-flag-checkered';
			case 'achievements':
				return 'fas fa-trophy';
			case 'assistedSkill':
				return 'fas fa-bolt';
			case 'pureSkill':
				return 'fas fa-brain';
			case 'rangeKing':
				return 'fas fa-fire';
			case 'rim':
				return 'fas fa-circle';
			case 'miss':
				return 'fas fa-ban';
			case 'players':
				return 'fas fa-users';
			case 'finishRound':
				return 'fas fa-hourglass-half';
			case 'bigGroup':
				return 'fas fa-users';
			case 'smallGroup':
				return 'fas fa-user';
			case 'bull':
				return 'fas fa-bullseye';
			case 'qualifiedThrows':
				return 'fas fa-crosshairs';
			case 'qualifiedGames':
				return 'fas fa-dice';
			default:
				return 'fas fa-star';
		}
	}

	private get seasonRows() {
		return this.users
			.map((user) => {
				const stats = this.getStatsForCurrentSeason(user);

				return {
					user,
					stats,
					alias: user.alias ?? user.name,
					mmr: stats?.mmr ?? 0,
					rank: stats?.currentRank,
					bullPercent: this.getBullPercent(stats),
					totalThrowCount: this.getTotalThrowCount(stats),
					highestRank: stats?.highestAchievedRank,
					highestRoundScore: stats?.highestRoundScore ?? 0,
					highestRoundScoreForVictory: stats?.highestRoundScoreForVictory ?? 0,
					highestRoundScoreNoSeasonRules: stats?.highestRoundScoreNoSeasonRules ?? 0,
					matchCount: stats?.matchSnapshots?.length ?? 0,
					nonZeroHitCount: this.getNonZeroHitCount(stats),
					twentyHitPercent: this.getHitLocationPercent(stats, 20),
					nineteenHitPercent: this.getHitLocationPercent(stats, 19),
					sixteenHitPercent: this.getHitLocationPercent(stats, 16),
					fourteenHitPercent: this.getHitLocationPercent(stats, 14),
					missPercent: this.getThrowTypePercent(stats, ThrowType.Miss),
					rimPercent: this.getThrowTypePercent(stats, ThrowType.Rim),
					averagePlayersPerMatch: this.getAveragePlayersPerMatch(stats),
					averageFinishRound: this.getAverageFinishRound(stats),
					finishEvents: stats?.finishCount?.reduce((sum, x) => sum + (x.count ?? 0), 0) ?? 0,
					progressAchievements: stats?.unlockedProgressAchievements?.length ?? 0,
					sessionAchievements: stats?.unlockedSessionAchievements?.length ?? 0,
					totalAchievements:
						(stats?.unlockedProgressAchievements?.length ?? 0) +
						(stats?.unlockedSessionAchievements?.length ?? 0),
				};
			})
			.sort((a, b) => b.mmr - a.mmr);
	}

	private get aggregatedHitCounts(): HitCount[] {
		const map = new Map<string, HitCount>();

		for (const row of this.seasonRows) {
			for (const hit of row.stats.hitCounts ?? []) {
				const key = `${hit.throwType}:${hit.hitLocation}`;
				const existing = map.get(key);

				if (existing) {
					existing.count = (existing.count ?? 0) + (hit.count ?? 0);
				}
				else {
					map.set(key, {
						throwType: hit.throwType,
						hitLocation: hit.hitLocation,
						count: hit.count ?? 0,
					} as HitCount);
				}
			}
		}

		return [...map.values()].sort((a, b) => {
			if (a.hitLocation !== b.hitLocation) return a.hitLocation - b.hitLocation;
			return (a.throwType ?? 0) - (b.throwType ?? 0);
		});
	}

	private get podium() {
		const rows = this.seasonRows.slice(0, 3);

		if (rows.length === 3) return [rows[1], rows[0], rows[2]];
		if (rows.length === 2) return [rows[1], rows[0]];
		return rows;
	}

	private get champion() {
		return this.seasonRows[0];
	}

	private get biggestGrinder() {
		return [...this.seasonRows].sort((a, b) => b.matchCount - a.matchCount || b.mmr - a.mmr)[0];
	}

	private getBullPercent(stats: SeasonStatistics): number | undefined {
		const totalThrowCount = this.getTotalThrowCount(stats);
		if (totalThrowCount < this.minimumQualifiedThrows) {
			return undefined;
		}

		const hitCounts = this.getAllHitCounts(stats);
		const totalThrows = hitCounts.reduce((sum, x) => sum + (x.count ?? 0), 0);
		const bullHits = hitCounts
			.filter((x) => x.hitLocation === 25 || x.hitLocation === 50)
			.reduce((sum, x) => sum + (x.count ?? 0), 0);

		return totalThrows > 0 ? this.round1((bullHits / totalThrows) * 100) : undefined;
	}

	private get bullSpecialist() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedThrowSample(x) && x.bullPercent !== undefined)
			.sort(
				(a, b) =>
					(b.bullPercent! - a.bullPercent!) ||
					(b.totalThrowCount - a.totalThrowCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get biggestGroupPlayer() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedGroupSizeSample(x))
			.sort(
				(a, b) =>
					(b.averagePlayersPerMatch - a.averagePlayersPerMatch) ||
					(b.matchCount - a.matchCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get smallestGroupPlayer() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedGroupSizeSample(x))
			.sort(
				(a, b) =>
					(a.averagePlayersPerMatch - b.averagePlayersPerMatch) ||
					(b.matchCount - a.matchCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get twentyMaster() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedThrowSample(x) && x.twentyHitPercent !== undefined)
			.sort(
				(a, b) =>
					(b.twentyHitPercent! - a.twentyHitPercent!) ||
					(b.totalThrowCount - a.totalThrowCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get nineteenMaster() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedThrowSample(x) && x.nineteenHitPercent !== undefined)
			.sort(
				(a, b) =>
					(b.nineteenHitPercent! - a.nineteenHitPercent!) ||
					(b.totalThrowCount - a.totalThrowCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get sixteenMaster() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedThrowSample(x) && x.sixteenHitPercent !== undefined)
			.sort(
				(a, b) =>
					(b.sixteenHitPercent! - a.sixteenHitPercent!) ||
					(b.totalThrowCount - a.totalThrowCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get fourteenMaster() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedThrowSample(x) && x.fourteenHitPercent !== undefined)
			.sort(
				(a, b) =>
					(b.fourteenHitPercent! - a.fourteenHitPercent!) ||
					(b.totalThrowCount - a.totalThrowCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get finisher() {
		return [...this.seasonRows].sort((a, b) => b.finishEvents - a.finishEvents || b.mmr - a.mmr)[0];
	}

	private get achievementHunter() {
		return [...this.seasonRows].sort((a, b) => b.totalAchievements - a.totalAchievements || b.mmr - a.mmr)[0];
	}

	private get powerPlayer() {
		return [...this.seasonRows].sort((a, b) => b.highestRoundScore - a.highestRoundScore || b.mmr - a.mmr)[0];
	}

	private get cleanPowerPlayer() {
		return [...this.seasonRows].sort(
			(a, b) => b.highestRoundScoreNoSeasonRules - a.highestRoundScoreNoSeasonRules || b.mmr - a.mmr,
		)[0];
	}

	private get rangeKing() {
		return [...this.seasonRows].sort(
			(a, b) => b.highestRoundScoreForVictory - a.highestRoundScoreForVictory || b.mmr - a.mmr,
		)[0];
	}

	private get rimKing() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedThrowSample(x) && x.rimPercent !== undefined)
			.sort(
				(a, b) =>
					(b.rimPercent! - a.rimPercent!) ||
					(b.totalThrowCount - a.totalThrowCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get cleanestThrower() {
		return [...this.seasonRows]
			.filter((x) => this.hasQualifiedThrowSample(x) && x.missPercent !== undefined)
			.sort(
				(a, b) =>
					(a.missPercent! - b.missPercent!) ||
					(b.totalThrowCount - a.totalThrowCount) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get crowdedTableRegular() {
		return [...this.seasonRows].sort(
			(a, b) => b.averagePlayersPerMatch - a.averagePlayersPerMatch || b.mmr - a.mmr,
		)[0];
	}

	private get earliestFinisher() {
		return [...this.seasonRows]
			.filter((x) => x.averageFinishRound !== undefined)
			.sort(
				(a, b) =>
					(a.averageFinishRound! - b.averageFinishRound!) ||
					(b.finishEvents - a.finishEvents) ||
					(b.mmr - a.mmr),
			)[0];
	}

	private get overviewStats(): SeasonOverviewStat[] {
		const rows = this.seasonRows;
		const totalPlayers = rows.length;
		const totalNonZeroHits = rows.reduce((sum, row) => sum + row.nonZeroHitCount, 0);
		const totalFinishes = rows.reduce((sum, row) => sum + row.finishEvents, 0);
		const totalAchievements = rows.reduce((sum, row) => sum + row.totalAchievements, 0);
		const qualifiedRowsForAvgMmr = rows.filter(row => row.matchCount >= 10);
		const avgMmr = qualifiedRowsForAvgMmr.length
			? Math.round(qualifiedRowsForAvgMmr.reduce((sum, row) => sum + row.mmr, 0) / qualifiedRowsForAvgMmr.length)
			: 0;
		const allSnapshots = rows.flatMap((row) => row.stats.matchSnapshots ?? []);
		const totalSnapshots = allSnapshots.length;
		const estimatedMatchCount = allSnapshots.reduce(
			(sum, snapshot) => sum + (snapshot.playerCount > 0 ? 1 / snapshot.playerCount : 0),
			0,
		);
		const avgPlayersPerMatch = estimatedMatchCount > 0
			? this.round1(totalSnapshots / estimatedMatchCount)
			: 0;

		return [
			{ label: 'Players', value: totalPlayers },
			{ label: 'Avg MMR (10+ games)', value: avgMmr },
			{ label: 'Board Hits', value: totalNonZeroHits },
			{ label: 'Individual Finishes', value: totalFinishes },
			{ label: 'Achievements', value: totalAchievements },
			{ label: 'Avg Players / Match', value: avgPlayersPerMatch },
		];
	}

	private buildSpotlightTop10<T>(
		rows: T[],
		mapper: (row: T, index: number) => SeasonSpotlightLeaderboardRow,
	): SeasonSpotlightLeaderboardRow[] {
		return rows.slice(0, 10).map(mapper);
	}

	private async openSpotlightDialog(options: {
		title: string;
		description: string;
		valueLabel: string;
		rows: SeasonSpotlightLeaderboardRow[];
	}): Promise<void> {
		await this.dialogService.open(
			seasonSpotlightDialogTemplate({
				title: options.title,
				description: options.description,
				valueLabel: options.valueLabel,
				rows: options.rows,
			}),
			{ title: options.title },
		);
	}

	private async openBullSpecialistDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedThrowSample(x) && x.bullPercent !== undefined)
				.sort(
					(a, b) =>
						(b.bullPercent! - a.bullPercent!) ||
						(b.totalThrowCount - a.totalThrowCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatPercent(row.bullPercent),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Bully',
			description: `Top 10 players by bull hit percentage. Eligible players need at least ${this.minimumQualifiedThrows} total throws.`,
			valueLabel: 'Bull%',
			rows,
		});
	}

	private async openBiggestGrinderDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows].sort((a, b) => b.matchCount - a.matchCount || b.mmr - a.mmr),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatWholeNumber(row.matchCount),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Biggest grinder',
			description: 'Top 10 players by total matches played this season.',
			valueLabel: 'Matches',
			rows,
		});
	}

	private async openBiggestGroupPlayerDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedGroupSizeSample(x))
				.sort(
					(a, b) =>
						(b.averagePlayersPerMatch - a.averagePlayersPerMatch) ||
						(b.matchCount - a.matchCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: row.averagePlayersPerMatch.toFixed(1),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Biggest group player',
			description: `Top 10 players by highest average players per match. Eligible players need at least ${this.minimumQualifiedMatchesForGroupSize} games.`,
			valueLabel: 'Avg players',
			rows,
		});
	}

	private async openSmallestGroupPlayerDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedGroupSizeSample(x))
				.sort(
					(a, b) =>
						(a.averagePlayersPerMatch - b.averagePlayersPerMatch) ||
						(b.matchCount - a.matchCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: row.averagePlayersPerMatch.toFixed(1),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Smallest group player',
			description: `Top 10 players by lowest average players per match. Eligible players need at least ${this.minimumQualifiedMatchesForGroupSize} games.`,
			valueLabel: 'Avg players',
			rows,
		});
	}

	private async openTwentyMasterDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedThrowSample(x) && x.twentyHitPercent !== undefined)
				.sort(
					(a, b) =>
						(b.twentyHitPercent! - a.twentyHitPercent!) ||
						(b.totalThrowCount - a.totalThrowCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatPercent(row.twentyHitPercent),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Master of 20',
			description: `Top 10 players by percentage of non-miss throws landing in 20. Eligible players need at least ${this.minimumQualifiedThrows} total throws.`,
			valueLabel: '20%',
			rows,
		});
	}

	private async openNineteenMasterDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedThrowSample(x) && x.nineteenHitPercent !== undefined)
				.sort(
					(a, b) =>
						(b.nineteenHitPercent! - a.nineteenHitPercent!) ||
						(b.totalThrowCount - a.totalThrowCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatPercent(row.nineteenHitPercent),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Master of 19',
			description: `Top 10 players by percentage of non-miss throws landing in 19. Eligible players need at least ${this.minimumQualifiedThrows} total throws.`,
			valueLabel: '19%',
			rows,
		});
	}

	private async openSixteenMasterDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedThrowSample(x) && x.sixteenHitPercent !== undefined)
				.sort(
					(a, b) =>
						(b.sixteenHitPercent! - a.sixteenHitPercent!) ||
						(b.totalThrowCount - a.totalThrowCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatPercent(row.sixteenHitPercent),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Master of 16',
			description: `Top 10 players by percentage of non-miss throws landing in 16. Eligible players need at least ${this.minimumQualifiedThrows} total throws.`,
			valueLabel: '16%',
			rows,
		});
	}

	private async openFourteenMasterDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedThrowSample(x) && x.fourteenHitPercent !== undefined)
				.sort(
					(a, b) =>
						(b.fourteenHitPercent! - a.fourteenHitPercent!) ||
						(b.totalThrowCount - a.totalThrowCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatPercent(row.fourteenHitPercent),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Master of 14',
			description: `Top 10 players by percentage of non-miss throws landing in 14. Eligible players need at least ${this.minimumQualifiedThrows} total throws.`,
			valueLabel: '14%',
			rows,
		});
	}

	private async openFinisherDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows].sort((a, b) => b.finishEvents - a.finishEvents || b.mmr - a.mmr),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatWholeNumber(row.finishEvents),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Closer',
			description: 'Top 10 players by total finishes secured this season.',
			valueLabel: 'Finishes',
			rows,
		});
	}

	private async openAchievementHunterDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows].sort((a, b) => b.totalAchievements - a.totalAchievements || b.mmr - a.mmr),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatWholeNumber(row.totalAchievements),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Achievement hunter',
			description: 'Top 10 players by total unlocked achievements this season.',
			valueLabel: 'Achievements',
			rows,
		});
	}

	private async openPowerPlayerDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows].sort((a, b) => b.highestRoundScore - a.highestRoundScore || b.mmr - a.mmr),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatWholeNumber(row.highestRoundScore),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Assisted skill',
			description: 'Top 10 players by highest single-round score with season modifiers applied.',
			valueLabel: 'Score',
			rows,
		});
	}

	private async openCleanPowerPlayerDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows].sort(
				(a, b) => b.highestRoundScoreNoSeasonRules - a.highestRoundScoreNoSeasonRules || b.mmr - a.mmr,
			),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatWholeNumber(row.highestRoundScoreNoSeasonRules),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Pure skill',
			description: 'Top 10 players by highest single-round score without season modifiers.',
			valueLabel: 'Score',
			rows,
		});
	}

	private async openRangeKingDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows].sort(
				(a, b) => b.highestRoundScoreForVictory - a.highestRoundScoreForVictory || b.mmr - a.mmr,
			),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatWholeNumber(row.highestRoundScoreForVictory),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Range king',
			description: 'Top 10 players by highest round score that resulted in victory.',
			valueLabel: 'Score',
			rows,
		});
	}

	private async openRimKingDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedThrowSample(x) && x.rimPercent !== undefined)
				.sort(
					(a, b) =>
						(b.rimPercent! - a.rimPercent!) ||
						(b.totalThrowCount - a.totalThrowCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatPercent(row.rimPercent),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Rim magnet',
			description: `Top 10 players by rim percentage. Eligible players need at least ${this.minimumQualifiedThrows} total throws.`,
			valueLabel: 'Rim%',
			rows,
		});
	}

	private async openCleanestThrowerDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => this.hasQualifiedThrowSample(x) && x.missPercent !== undefined)
				.sort(
					(a, b) =>
						(a.missPercent! - b.missPercent!) ||
						(b.totalThrowCount - a.totalThrowCount) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatPercent(row.missPercent),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Cleanest thrower',
			description: `Top 10 players by lowest miss percentage. Eligible players need at least ${this.minimumQualifiedThrows} total throws.`,
			valueLabel: 'Miss%',
			rows,
		});
	}

	private async openEarliestFinisherDialog(): Promise<void> {
		const rows = this.buildSpotlightTop10(
			[...this.seasonRows]
				.filter((x) => x.averageFinishRound !== undefined)
				.sort(
					(a, b) =>
						(a.averageFinishRound! - b.averageFinishRound!) ||
						(b.finishEvents - a.finishEvents) ||
						(b.mmr - a.mmr),
				),
			(row, index) => ({
				position: index + 1,
				alias: row.alias,
				value: this.formatNumber(row.averageFinishRound),
			}),
		);

		await this.openSpotlightDialog({
			title: 'Earliest finisher',
			description: 'Top 10 players by lowest average round number needed to finish.',
			valueLabel: 'Avg round',
			rows,
		});
	}

	private podiumCell(entry?: (typeof this.seasonRows)[number], placement?: string) {
		if (!entry) return html``;

		const highestLabel = entry.highestRank !== undefined ? getRankDisplayValue(entry.highestRank) : '—';
		const placementFaClass = this.getPlacementFaClass(placement);

		return html`
			<div class="player player-card">
				${placement
					? html`
						<div class="placement">
							<i class=${placementFaClass} aria-hidden="true"></i>
							<span>${placement}</span>
						</div>
					`
					: nothing}
				<div class="alias">${entry.alias}</div>
				<aa-rank-display
					.rank=${entry.rank}
					orientation="vertical"
				></aa-rank-display>
				<div class="mmr">MMR ${entry.mmr}</div>
				<div class="player-meta-grid">
					<div><span>Peak</span><strong>${highestLabel}</strong></div>
					<div><span>Matches</span><strong>${entry.matchCount}</strong></div>
					<div><span>Avg players</span><strong>${entry.averagePlayersPerMatch.toFixed(1)}</strong></div>
					<div><span>Avg finish rnd</span><strong>${this.formatNumber(entry.averageFinishRound)}</strong></div>
				</div>
			</div>
		`;
	}

	private get spotlightCards(): SeasonSpotlightCard[] {
		const cards: SeasonSpotlightCard[] = [];
		const throwQualification: SeasonSpotlightQualification = {
			iconClass: this.getSpotlightIconClass('qualifiedThrows'),
			label: `${this.minimumQualifiedThrows}+ throws`,
			explanation: `Only players with at least ${this.minimumQualifiedThrows} total throws are eligible for this spotlight.`,
		};
		const gamesQualification: SeasonSpotlightQualification = {
			iconClass: this.getSpotlightIconClass('qualifiedGames'),
			label: `${this.minimumQualifiedMatchesForGroupSize}+ games`,
			explanation: `Only players with at least ${this.minimumQualifiedMatchesForGroupSize} games are eligible for this spotlight.`,
		};
		const add = (
			action: SeasonSpotlightAction,
			title: string,
			iconKind: string,
			entry: { alias: string } | undefined,
			value: string | number,
			subtext: string,
			qualification?: SeasonSpotlightQualification,
		): void => {
			if (!entry) return;

			cards.push({
				action,
				title,
				iconClass: this.getSpotlightIconClass(iconKind),
				alias: entry.alias,
				value: String(value),
				subtext,
				qualification,
			});
		};

		add('bull-specialist', 'Bully', 'bull', this.bullSpecialist,
			this.formatPercent(this.bullSpecialist?.bullPercent),
			'Most amount of throws landing in bull (25 or 50)', throwQualification);
		add('biggest-grinder', 'Biggest grinder', 'grinder', this.biggestGrinder,
			this.biggestGrinder?.matchCount ?? 0, 'Most games played this season');
		add('biggest-group-player', 'Biggest group player', 'bigGroup', this.biggestGroupPlayer,
			this.biggestGroupPlayer ? this.biggestGroupPlayer.averagePlayersPerMatch.toFixed(1) : '-',
			'Highest average player count per match', gamesQualification);
		add('smallest-group-player', 'Smallest group player', 'smallGroup', this.smallestGroupPlayer,
			this.smallestGroupPlayer ? this.smallestGroupPlayer.averagePlayersPerMatch.toFixed(1) : '-',
			'Lowest average player count per match', gamesQualification);
		add('twenty-master', 'Master of 20', 'twenty', this.twentyMaster,
			this.formatPercent(this.twentyMaster?.twentyHitPercent),
			'Percent of throws landing in 20 (excludes misses)', throwQualification);
		add('nineteen-master', 'Master of 19', 'nineteen', this.nineteenMaster,
			this.formatPercent(this.nineteenMaster?.nineteenHitPercent),
			'Percent of throws landing in 19 (excludes misses)', throwQualification);
		add('sixteen-master', 'Master of 16', 'sixteen', this.sixteenMaster,
			this.formatPercent(this.sixteenMaster?.sixteenHitPercent),
			'Percent of throws landing in 16 (excludes misses)', throwQualification);
		add('fourteen-master', 'Master of 14', 'fourteen', this.fourteenMaster,
			this.formatPercent(this.fourteenMaster?.fourteenHitPercent),
			'Percent of throws landing in 14 (excludes misses)', throwQualification);
		add('finisher', 'Closer', 'finisher', this.finisher,
			this.finisher?.finishEvents ?? 0, 'Most finishes secured.');
		add('achievement-hunter', 'Achievement hunter', 'achievements', this.achievementHunter,
			this.achievementHunter?.totalAchievements ?? 0, 'Progress + session achievements unlocked.');
		add('power-player', 'Assisted skill', 'assistedSkill', this.powerPlayer,
			this.powerPlayer?.highestRoundScore ?? 0, 'Highest single-round score with season modifiers.');
		add('clean-power-player', 'Pure skill', 'pureSkill', this.cleanPowerPlayer,
			this.cleanPowerPlayer?.highestRoundScoreNoSeasonRules ?? 0,
			'Highest single-round score without season modifiers.');
		add('range-king', 'Range king', 'rangeKing', this.rangeKing,
			this.rangeKing?.highestRoundScoreForVictory ?? 0, 'Highest round score leading to victory');
		add('rim-king', 'Rim magnet', 'rim', this.rimKing,
			this.formatPercent(this.rimKing?.rimPercent),
			'Highest percentage of throws landing in the rim', throwQualification);
		add('cleanest-thrower', 'Cleanest thrower', 'miss', this.cleanestThrower,
			this.formatPercent(this.cleanestThrower?.missPercent), 'Lowest miss percentage', throwQualification);
		add('earliest-finisher', 'Earliest finisher', 'finishRound', this.earliestFinisher,
			this.formatNumber(this.earliestFinisher?.averageFinishRound),
			'Lowest average round number for finish');

		return cards;
	}

	private handleSpotlightAction(event: SeasonSpotlightActionEvent): void {
		switch (event.detail) {
			case 'bull-specialist': void this.openBullSpecialistDialog(); break;
			case 'biggest-grinder': void this.openBiggestGrinderDialog(); break;
			case 'biggest-group-player': void this.openBiggestGroupPlayerDialog(); break;
			case 'smallest-group-player': void this.openSmallestGroupPlayerDialog(); break;
			case 'twenty-master': void this.openTwentyMasterDialog(); break;
			case 'nineteen-master': void this.openNineteenMasterDialog(); break;
			case 'sixteen-master': void this.openSixteenMasterDialog(); break;
			case 'fourteen-master': void this.openFourteenMasterDialog(); break;
			case 'finisher': void this.openFinisherDialog(); break;
			case 'achievement-hunter': void this.openAchievementHunterDialog(); break;
			case 'power-player': void this.openPowerPlayerDialog(); break;
			case 'clean-power-player': void this.openCleanPowerPlayerDialog(); break;
			case 'range-king': void this.openRangeKingDialog(); break;
			case 'rim-king': void this.openRimKingDialog(); break;
			case 'cleanest-thrower': void this.openCleanestThrowerDialog(); break;
			case 'earliest-finisher': void this.openEarliestFinisherDialog(); break;
		}
	}

	private renderLeaderboard() {
		const rows: SeasonLeaderboardRow[] = this.seasonRows.map((row) => ({
			alias: row.alias,
			rank: row.rank,
			rankLabel: getRankDisplayValue(row.rank),
			mmr: row.mmr,
			rimPercent: this.formatPercent(row.rimPercent),
			totalAchievements: this.formatWholeNumber(row.totalAchievements),
			averagePlayersPerMatch: row.averagePlayersPerMatch.toFixed(1),
			averageFinishRound: this.formatNumber(row.averageFinishRound),
		}));
		if (!rows.length) return html``;

		return html`<aa-season-leaderboard .rows=${rows}></aa-season-leaderboard>`;
	}

	override render(): unknown {
		return html`
			<aa-loading-state
				?loading=${this.isLoading}
				label="Loading season stats"
			>
				${this.isLoading ? null : this.renderContent()}
			</aa-loading-state>
		`;
	}

	private renderContent(): unknown {
		const p = this.podium;

		return html`
			<section class="wrap">
				${p.length === 0
					? html`<div class="empty">No players found for this season.</div>`
					: html`
						<section class="podium-stage">
							<div class="podium">
								<div class="column second">
									${this.podiumCell(p[0], '2nd')}
									<div class="step step-2"></div>
								</div>
								<div class="column first">
									${this.podiumCell(p[1] ?? p[0], '1st')}
									<div class="step step-1"></div>
								</div>
								<div class="column third">
									${this.podiumCell(p[2], '3rd')}
									<div class="step step-3"></div>
								</div>
							</div>
						</section>
					`}

				<aa-season-overview .stats=${this.overviewStats}></aa-season-overview>
				<aa-season-hit-chart .hits=${this.aggregatedHitCounts}></aa-season-hit-chart>
				<aa-season-spotlights
					.spotlights=${this.spotlightCards}
					@season-spotlight-action=${this.handleSpotlightAction}
				></aa-season-spotlights>
				${this.renderLeaderboard()}
			</section>
		`;
	}

	static override styles = [ sharedStyles, faIcons, unsafeCSS(seasonPageStyles) ];
}