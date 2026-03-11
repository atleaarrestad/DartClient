import hljs from 'highlight.js/lib/core';
import { css, html, nothing } from 'lit';
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { container } from 'tsyringe';
import { faIcons } from '../../faIcons.js';

import { getRankDisplayValue, getRankIcon } from '../../models/rank.js';
import { RuleDefinition, Season, SeasonStatistics, User } from '../../models/schemas.js';
import { ThrowType } from '../../models/enums.js';
import { DialogService } from '../../services/dialogService.js';
import { RuleService } from '../../services/ruleService.js';
import { SeasonService } from '../../services/seasonService.js';
import { UserService } from '../../services/userService.js';
import { sharedStyles } from '../../styles.js';
import { seasonRuleDialogTemplate } from '../../templates/dialogTemplates.js';

@customElement('season-page')
export class SeasonPage extends LitElement {
	private ruleService: RuleService;
	private seasonService: SeasonService;
	private userService: UserService;
	private dialogService: DialogService;
	private winConditions: RuleDefinition[] = [];
	private scoreModifiers: RuleDefinition[] = [];
	private readonly minimumQualifiedThrows = 100;
	private readonly minimumQualifiedMatchesForGroupSize = 10;

	@state() private season?: Season;
	@state() private users: User[] = [];
	@state() private isLoading = true;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
		this.ruleService = container.resolve(RuleService);
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

			const ruleDefinitions = await this.ruleService.GetDefinitions();
			this.winConditions = ruleDefinitions.winConditions;
			this.scoreModifiers = ruleDefinitions.scoreModifiers;
		} finally {
			this.isLoading = false;
			this.requestUpdate();
		}
	}

	private renderRuleCode(code: string) {
		const highlighted = hljs.highlight(code, { language: 'csharp' }).value;

		return html`
			<pre class="hljs rule-code"><code class="language-csharp">${unsafeHTML(highlighted)}</code></pre>
		`;
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

	private get overviewStats() {
		const rows = this.seasonRows;
		const totalPlayers = rows.length;
		const totalNonZeroHits = rows.reduce((sum, row) => sum + row.nonZeroHitCount, 0);
		const totalFinishes = rows.reduce((sum, row) => sum + row.finishEvents, 0);
		const totalAchievements = rows.reduce((sum, row) => sum + row.totalAchievements, 0);
		const avgMmr = totalPlayers ? Math.round(rows.reduce((sum, row) => sum + row.mmr, 0) / totalPlayers) : 0;
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
			{ label: 'Avg MMR', value: avgMmr },
			{ label: 'Board Hits', value: totalNonZeroHits },
			{ label: 'Individual Finishes', value: totalFinishes },
			{ label: 'Achievements', value: totalAchievements },
			{ label: 'Avg Players / Match', value: avgPlayersPerMatch },
		];
	}

	private get seasonScoreModifierItems() {
		return (this.season?.scoreModifierRules ?? []).map((r) => ({
			value: r.scoreModifier,
			execOrder: r.executionOrder,
		}));
	}

	private get seasonWinConditionItems() {
		return (this.season?.winConditionRules ?? []).map((r) => ({
			value: r.winCondition,
		}));
	}

	private getRulePreviewNames(
		items: { value: number; execOrder?: number }[],
		definitions: RuleDefinition[],
		max = 3,
	): string[] {
		return items
			.map((item) => definitions.find((def) => def.value === item.value)?.name)
			.filter((name): name is string => !!name)
			.slice(0, max);
	}

	private async openRulesDialog(
		title: string,
		description: string,
		items: { value: number; execOrder?: number }[],
		definitions: RuleDefinition[],
	): Promise<void> {
		if (!items.length) return;

		await this.dialogService.open(
			seasonRuleDialogTemplate({
				title,
				description,
				items,
				definitions,
				renderRuleCode: (code) => this.renderRuleCode(code),
			}),
			{ title },
		);
	}

	private podiumCell(entry?: (typeof this.seasonRows)[number], placement?: string) {
		if (!entry) return html``;

		const icon = getRankIcon(entry.rank);
		const label = getRankDisplayValue(entry.rank);
		const highestLabel = entry.highestRank ? getRankDisplayValue(entry.highestRank) : '—';
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
				<img class="rank-icon" src=${icon} alt=${label} />
				<div class="rank-label">${label}</div>
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

	private renderOverview() {
		return html`
			<section class="overview-section">
				<div class="overview-grid">
					<h3 class="section-title">Season overview</h3>
					${this.overviewStats.map(
						(stat) => html`
							<article class="stat-chip">
								<div class="stat-value">${stat.value}</div>
								<div class="stat-label">${stat.label}</div>
							</article>
						`,
					)}
				</div>
			</section>
		`;
	}

	private renderSpotlightCard(
		title: string,
		iconClass: string,
		entry: (typeof this.seasonRows)[number] | undefined,
		value: string | number,
		subtext: string,
	) {
		if (!entry) return html``;

		return html`
			<article class="spotlight-card">
				<div class="spotlight-header">
					<span class="spotlight-icon" aria-hidden="true">
						<i class=${iconClass}></i>
					</span>
					<div>
						<h3>${title}</h3>
						<p>${entry.alias}</p>
					</div>
				</div>
				<div class="spotlight-value">${value}</div>
				<div class="spotlight-sub">${subtext}</div>
			</article>
		`;
	}

	private renderSpotlights() {
		return html`
			<section class="spotlights">
				${this.renderSpotlightCard(
					'Biggest grinder',
					this.getSpotlightIconClass('grinder'),
					this.biggestGrinder,
					this.biggestGrinder?.matchCount ?? 0,
					'Most games played this season',
				)}
				${this.renderSpotlightCard(
					'Biggest group player',
					this.getSpotlightIconClass('bigGroup'),
					this.biggestGroupPlayer,
					this.biggestGroupPlayer ? this.biggestGroupPlayer.averagePlayersPerMatch.toFixed(1) : '-',
					'Highest average players per match among players with at least 10 games',
				)}
				${this.renderSpotlightCard(
					'Smallest group player',
					this.getSpotlightIconClass('smallGroup'),
					this.smallestGroupPlayer,
					this.smallestGroupPlayer ? this.smallestGroupPlayer.averagePlayersPerMatch.toFixed(1) : '-',
					'Lowest average players per match among players with at least 10 games',
				)}
				${this.renderSpotlightCard(
					'Master of 20',
					this.getSpotlightIconClass('twenty'),
					this.twentyMaster,
					this.formatPercent(this.twentyMaster?.twentyHitPercent),
					'Percent of throws landing in 20 (excludes misses)',
				)}
				${this.renderSpotlightCard(
					'Master of 19',
					this.getSpotlightIconClass('nineteen'),
					this.nineteenMaster,
					this.formatPercent(this.nineteenMaster?.nineteenHitPercent),
					'Percent of throws landing in 19 (excludes misses)',
				)}
				${this.renderSpotlightCard(
					'Master of 16',
					this.getSpotlightIconClass('sixteen'),
					this.sixteenMaster,
					this.formatPercent(this.sixteenMaster?.sixteenHitPercent),
					'Percent of throws landing in 16 (excludes misses)',
				)}
				${this.renderSpotlightCard(
					'Master of 14',
					this.getSpotlightIconClass('fourteen'),
					this.fourteenMaster,
					this.formatPercent(this.fourteenMaster?.fourteenHitPercent),
					'Percent of throws landing in 14 (excludes misses)',
				)}
				${this.renderSpotlightCard(
					'Closer',
					this.getSpotlightIconClass('finisher'),
					this.finisher,
					this.finisher?.finishEvents ?? 0,
					'Most finishes secured.',
				)}
				${this.renderSpotlightCard(
					'Achievement hunter',
					this.getSpotlightIconClass('achievements'),
					this.achievementHunter,
					this.achievementHunter?.totalAchievements ?? 0,
					'Progress + session achievements unlocked.',
				)}
				${this.renderSpotlightCard(
					'Assisted skill',
					this.getSpotlightIconClass('assistedSkill'),
					this.powerPlayer,
					this.powerPlayer?.highestRoundScore ?? 0,
					'Highest single-round score with season modifiers.',
				)}
				${this.renderSpotlightCard(
					'Pure skill',
					this.getSpotlightIconClass('pureSkill'),
					this.cleanPowerPlayer,
					this.cleanPowerPlayer?.highestRoundScoreNoSeasonRules ?? 0,
					'Highest single-round score without season modifiers.',
				)}
				${this.renderSpotlightCard(
					'Range king',
					this.getSpotlightIconClass('rangeKing'),
					this.rangeKing,
					this.rangeKing?.highestRoundScoreForVictory ?? 0,
					'Highest round score leading to victory',
				)}
				${this.renderSpotlightCard(
					'Rim magnet',
					this.getSpotlightIconClass('rim'),
					this.rimKing,
					this.formatPercent(this.rimKing?.rimPercent),
					'Highest percentage of throws landing in the rim',
				)}
				${this.renderSpotlightCard(
					'Cleanest thrower',
					this.getSpotlightIconClass('miss'),
					this.cleanestThrower,
					this.formatPercent(this.cleanestThrower?.missPercent),
					'Lowest miss percentage',
				)}
				${this.renderSpotlightCard(
					'Earliest finisher',
					this.getSpotlightIconClass('finishRound'),
					this.earliestFinisher,
					this.formatNumber(this.earliestFinisher?.averageFinishRound),
					'Lowest average round number for finish',
				)}
			</section>
		`;
	}

	private renderLeaderboard() {
		const rows = this.seasonRows.slice(0, 10);
		if (!rows.length) return html``;

		return html`
			<section class="leaderboard-section">
				<div class="leaderboard-card">
					<h3 class="section-title">Leaderboard top 10</h3>
					<div class="leaderboard-header leaderboard-row">
						<span>#</span>
						<span>Player</span>
						<span>Rank</span>
						<span>MMR</span>
						<span>20%</span>
						<span>Miss%</span>
						<span>Avg players</span>
						<span>Avg finish rnd</span>
					</div>
					${rows.map(
						(row, index) => html`
							<div class="leaderboard-row">
								<span>${index + 1}</span>
								<span class="leaderboard-player">
									<img
										class="leaderboard-rank-icon"
										src=${getRankIcon(row.rank)}
										alt=${getRankDisplayValue(row.rank)}
									/>
									${row.alias}
								</span>
								<span>${getRankDisplayValue(row.rank)}</span>
								<span>${row.mmr}</span>
								<span>${this.formatPercent(row.twentyHitPercent)}</span>
								<span>${this.formatPercent(row.missPercent)}</span>
								<span>${row.averagePlayersPerMatch.toFixed(1)}</span>
								<span>${this.formatNumber(row.averageFinishRound)}</span>
							</div>
						`,
					)}
				</div>
			</section>
		`;
	}

	private renderRulesSummaryCard(
		title: string,
		buttonLabel: string,
		items: { value: number; execOrder?: number }[],
		definitions: RuleDefinition[],
		dialogDescription: string,
	) {
		if (!items.length) return html``;

		const previewNames = this.getRulePreviewNames(items, definitions, 4);
		const extraCount = Math.max(items.length - previewNames.length, 0);

		return html`
			<article class="rules-summary-card">
				<div class="rules-summary-top">
					<h3 class="rules-summary-title">${title}</h3>
					<div class="rules-summary-count">${items.length}</div>
				</div>

				<div class="rules-summary-preview">
					${previewNames.map((name) => html`<span class="rules-summary-chip">${name}</span>`)}
					${extraCount > 0 ? html`<span class="rules-summary-chip muted">+${extraCount} more</span>` : nothing}
				</div>

				<div class="rules-summary-actions">
					<button
						class="rules-summary-button"
						@click=${() => this.openRulesDialog(title, dialogDescription, items, definitions)}
					>
						${buttonLabel}
					</button>
				</div>
			</article>
		`;
	}

	private renderSeasonRulesArea() {
		const modifierItems = this.seasonScoreModifierItems;
		const winConditionItems = this.seasonWinConditionItems;

		if (!modifierItems.length && !winConditionItems.length) {
			return html``;
		}

		return html`
			<section class="season-rules-overview-section">
				<div class="section-heading-row">
					<div>
						<h3 class="section-title">Season rules</h3>
					</div>
				</div>

				<div class="season-rules-summary-grid">
					${this.renderRulesSummaryCard(
						'Score modifiers',
						'View score modifiers',
						modifierItems,
						this.scoreModifiers,
						'',
					)}

					${this.renderRulesSummaryCard(
						'Win conditions',
						'View win conditions',
						winConditionItems,
						this.winConditions,
						'',
					)}
				</div>
			</section>
		`;
	}

	private renderLoading() {
		return html`
			<section class="wrap">
				<div class="loading-card" role="status" aria-live="polite">
					<div class="loading-spinner">
						<i class="fas fa-spinner fa-spin"></i>
					</div>
					<div class="loading-title">Loading season stats</div>
					<div class="loading-subtitle">Fetching players, rankings, achievements, and rules...</div>
				</div>
			</section>
		`;
	}

	override render(): unknown {
		if (this.isLoading) {
			return this.renderLoading();
		}

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

				${this.renderOverview()}
				${this.renderSpotlights()}
				${this.renderLeaderboard()}
				${this.renderSeasonRulesArea()}
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		faIcons,
		css`
			:host {
				display: block;
				height: auto !important;
				min-height: unset !important;
			}

			* {
				box-sizing: border-box;
			}

			.wrap {
				padding: 1rem;
				max-width: 1400px;
				margin: 0 auto;
			}

			.loading-card {
				min-height: 340px;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
				gap: 0.65rem;
				background: #fffdf8;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 18px;
				box-shadow: 6px 7px 0 0 black;
				padding: 2rem 1rem;
			}

			.loading-spinner {
				font-size: 2.5rem;
				line-height: 1;
			}

			.loading-title {
				font-size: 1.15rem;
				font-weight: 900;
			}

			.loading-subtitle {
				font-size: 0.9rem;
				opacity: 0.72;
				max-width: 420px;
			}

			.overview-section {
				margin: 1rem 0 1.25rem;
			}

			.overview-grid,
			.leaderboard-card,
			.spotlight-card,
			.empty,
			.rules-summary-card {
				background: #fffdf8;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 18px;
				box-shadow: 6px 7px 0 0 black;
			}

			.overview-grid {
				padding: 0.7rem;
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
				gap: 0.55rem;
			}

			.stat-chip {
				background: white;
				border: 2px solid black;
				border-right-width: 3px;
				border-bottom-width: 3px;
				border-radius: 12px;
				padding: 0.55rem 0.45rem;
				text-align: center;
				min-width: 0;
			}

			.stat-value {
				font-size: 1.1rem;
				font-weight: 900;
				line-height: 1;
			}

			.stat-label {
				font-size: 0.72rem;
				opacity: 0.75;
				margin-top: 0.15rem;
			}

			.podium-stage {
				position: relative;
				margin: 1rem 0 0.5rem;
				padding: 0.25rem 0 0;
			}

			.podium {
				display: grid;
				grid-template-columns: 1fr 1fr 1fr;
				align-items: end;
				gap: 0.8rem;
				max-width: 1000px;
				margin: 0 auto 1rem auto;
			}

			.column {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: flex-end;
				min-width: 0;
			}

			.player-card {
				width: min(100%, 320px);
				padding: 0.75rem;
				background: #fff;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 18px;
				box-shadow: 6px 7px 0 0 black;
				margin-bottom: 0.45rem;
				max-height: min(52vh, 430px);
				overflow: auto;
			}

			.placement {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 0.35rem;
				padding: 0.14rem 0.48rem;
				margin-bottom: 0.45rem;
				border: 2px solid black;
				border-right-width: 3px;
				border-bottom-width: 3px;
				border-radius: 999px;
				background: #f8e16a;
				font-size: 0.74rem;
				font-weight: 900;
			}

			.player {
				display: flex;
				flex-direction: column;
				align-items: center;
				text-align: center;
				min-width: 0;
			}

			.alias {
				font-weight: 900;
				font-size: 1.08rem;
				max-width: 100%;
				overflow-wrap: anywhere;
			}

			.rank-icon {
				width: clamp(64px, 10vw, 104px);
				height: clamp(64px, 10vw, 104px);
				object-fit: contain;
				image-rendering: -webkit-optimize-contrast;
			}

			.rank-label {
				font-size: 0.92rem;
				font-weight: 700;
				opacity: 0.92;
			}

			.mmr {
				font-size: 0.86rem;
				font-family:
					ui-monospace,
					SFMono-Regular,
					Menlo,
					Monaco,
					Consolas,
					'Liberation Mono',
					'Courier New',
					monospace;
				color: #444;
				margin-top: 0.2rem;
				opacity: 0.85;
			}

			.player-meta-grid {
				margin-top: 0.6rem;
				width: 100%;
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 0.45rem;
			}

			.player-meta-grid > div {
				background: #f8f8f8;
				border: 2px solid black;
				border-right-width: 3px;
				border-bottom-width: 3px;
				border-radius: 10px;
				padding: 0.38rem;
				min-width: 0;
			}

			.player-meta-grid span {
				display: block;
				font-size: 0.68rem;
				opacity: 0.75;
			}

			.player-meta-grid strong {
				display: block;
				font-size: 0.84rem;
				margin-top: 0.1rem;
				overflow-wrap: anywhere;
			}

			.step {
				width: 100%;
				max-width: 260px;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 16px 16px 8px 8px;
				box-shadow: 6px 7px 0 0 black;
			}

			.step-1 {
				height: 170px;
				background: #f2d14e;
			}

			.step-2 {
				height: 125px;
				background: #d9d9d9;
			}

			.step-3 {
				height: 100px;
				background: #d59a60;
			}

			.spotlights {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 0.75rem;
				margin: 1rem 0 1.25rem;
				align-items: stretch;
			}

			.spotlight-card {
				padding: 0.75rem;
				text-align: left;
				min-width: 0;
				overflow: hidden;
			}

			.spotlight-header {
				display: flex;
				gap: 0.75rem;
				align-items: center;
			}

			.spotlight-header h3 {
				margin: 0;
				font-size: 0.92rem;
				line-height: 1.15;
			}

			.spotlight-header p {
				margin: 0.08rem 0 0 0;
				font-size: 0.82rem;
				opacity: 0.75;
				overflow-wrap: anywhere;
			}

			.spotlight-icon {
				width: 42px;
				height: 42px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				border: 2px solid black;
				border-right-width: 3px;
				border-bottom-width: 3px;
				border-radius: 12px;
				background: white;
				font-size: 1.1rem;
				flex: 0 0 auto;
			}

			.spotlight-value {
				font-size: 1.25rem;
				font-weight: 900;
				margin-top: 0.65rem;
				overflow-wrap: anywhere;
			}

			.spotlight-sub {
				margin-top: 0.2rem;
				font-size: 0.8rem;
				opacity: 0.75;
				line-height: 1.28;
				overflow-wrap: anywhere;
			}

			.leaderboard-section,
			.season-rules-overview-section {
				margin-top: 1.5rem;
			}

			.section-heading-row {
				display: flex;
				justify-content: space-between;
				align-items: end;
				gap: 1rem;
				margin-bottom: 0.75rem;
			}

			.section-title {
				font-size: 1.3rem;
				font-weight: 900;
				margin: 0;
			}

			.section-subtitle {
				font-size: 0.9rem;
				opacity: 0.7;
			}

			.leaderboard-card {
				overflow: auto;
				padding: 0.4rem;
			}

			.leaderboard-row {
				display: grid;
				grid-template-columns: 50px minmax(180px, 1.6fr) minmax(120px, 1fr) 90px 90px 90px 110px 120px;
				gap: 0.75rem;
				align-items: center;
				padding: 0.8rem 0.7rem;
				border-radius: 12px;
			}

			.leaderboard-row:not(.leaderboard-header):nth-child(even) {
				background: rgba(0, 0, 0, 0.035);
			}

			.leaderboard-header {
				font-weight: 900;
				font-size: 0.85rem;
				text-transform: uppercase;
				letter-spacing: 0.03em;
				opacity: 0.7;
			}

			.leaderboard-player {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				min-width: 0;
				font-weight: 700;
			}

			.leaderboard-rank-icon {
				width: 28px;
				height: 28px;
				object-fit: contain;
				flex: 0 0 auto;
			}

			.season-rules-overview-section {
				margin-bottom: 1rem;
			}

			.season-rules-summary-grid {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.75rem;
			}

			.rules-summary-card {
				padding: 0.9rem;
				display: grid;
				gap: 0.8rem;
				min-width: 0;
			}

			.rules-summary-top {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
			}

			.rules-summary-title {
				margin: 0;
				font-size: 1rem;
				font-weight: 900;
				line-height: 1.15;
			}

			.rules-summary-count {
				min-width: 42px;
				height: 42px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				border: 2px solid black;
				border-right-width: 3px;
				border-bottom-width: 3px;
				border-radius: 12px;
				background: white;
				font-size: 1rem;
				font-weight: 900;
				flex: 0 0 auto;
			}

			.rules-summary-preview {
				display: flex;
				flex-wrap: wrap;
				gap: 0.45rem;
			}

			.rules-summary-chip {
				display: inline-flex;
				align-items: center;
				padding: 0.22rem 0.58rem;
				border: 2px solid black;
				border-right-width: 3px;
				border-bottom-width: 3px;
				border-radius: 999px;
				background: #eef6ff;
				font-size: 0.78rem;
				font-weight: 800;
				line-height: 1.2;
				max-width: 100%;
				overflow-wrap: anywhere;
			}

			.rules-summary-chip.muted {
				background: #e4e4e4;
			}

			.rules-summary-actions {
				display: flex;
				justify-content: flex-start;
			}

			.rules-summary-button {
				appearance: none;
				background: #fff;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 14px;
				padding: 0.5rem 0.85rem;
				font-weight: 800;
				cursor: pointer;
				box-shadow: 4px 4px 0 0 black;
			}

			.rules-summary-button:active {
				transform: translate(2px, 2px);
				box-shadow: 2px 2px 0 0 black;
			}

			.empty {
				padding: 1rem;
				color: #666;
				text-align: center;
			}

			@media (max-width: 1100px) {
				.overview-grid {
					grid-template-columns: repeat(3, minmax(90px, 1fr));
				}

				.spotlights {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
			}

			@media (max-width: 820px) {
				.season-rules-summary-grid {
					grid-template-columns: 1fr;
				}

				.podium {
					grid-template-columns: 1fr;
					gap: 1rem;
				}

				.column.first {
					order: -1;
				}

				.step-1,
				.step-2,
				.step-3 {
					height: 96px;
				}

				.player-card {
					max-height: none;
					overflow: visible;
				}

				.overview-grid {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
			}

			@media (max-width: 640px) {
				.wrap {
					padding: 0.7rem;
				}

				.spotlights,
				.overview-grid {
					grid-template-columns: 1fr;
				}

				.section-heading-row {
					flex-direction: column;
					align-items: start;
				}

				.leaderboard-row {
					grid-template-columns: 42px minmax(140px, 1.2fr) minmax(100px, 1fr) 70px 75px 75px 95px 105px;
					font-size: 0.9rem;
				}
			}
		`,
	];
}