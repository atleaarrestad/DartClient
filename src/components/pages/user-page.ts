import type { RouterLocation } from '@vaadin/router';
import { css, html, TemplateResult } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { UserQueryOptions } from '../../api/users.requests.js';
import { getRankDisplayValue, getRankIcon } from '../../models/rank.js';
import {
	AchievementDefinitionsResponse,
	ProgressionAchievementDefinition,
	Season,
	SeasonStatistics,
	SessionsAchievementDefinition,
	User,
} from '../../models/schemas.js';
import { DialogService } from '../../services/dialogService.js';
import { SeasonService } from '../../services/seasonService.js';
import { UserService } from '../../services/userService.js';
import { sharedStyles } from '../../styles.js';
import { achievementService } from '../../services/achievementService.js';
import {
	AchievementTier,
	ProgressAchievement,
	SessionAchievement,
} from '../../models/enums.js';
import {
	getAchievementTierIcon,
	getAchievementTypeLabel,
} from '../../helpers/achievementHelper.js';
import type {
	AaAchievementBrowser,
	AchievementGrouping,
} from '../aa-achievement-browser.js';
import '../aa-achievement-browser.js';
import '../aa-dartboard-heatmap.js';
import '../aa-loading-state.js';

@customElement('user-page')
export class UserPage extends LitElement {

	@property({ type: Array }) users: User[] = [];

	@state() private userId!: string;
	@state() private currentSeason?: Season;
	@state() private seasons?: Season[];
	@state() private selectedSeason?: Season;
	@state() private achievementDefinitions?: AchievementDefinitionsResponse;
	@state() private isLoadingSeasonStats = false;
	@state() private hitDistributionView: 'bars' | 'board' = 'bars';

	private seasonService: SeasonService;
	private userService: UserService;
	private user?: User;
	private achievementService: achievementService;
	private dialogService: DialogService;
	private seasonStatsRequestId = 0;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
		this.achievementService = container.resolve(achievementService);
		this.dialogService = container.resolve(DialogService);
	}

	onBeforeEnter(location: RouterLocation): void {
		this.userId = location.params['id'] as string;
	}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();

		const [currentSeason, seasons, achievementDefinitions] = await Promise.all([
			this.seasonService.getCurrentSeason(),
			this.seasonService.getAll(),
			this.achievementService.getAchievementDefinitions(),
		]);

		this.currentSeason = currentSeason;
		this.seasons = seasons;
		this.selectedSeason = this.seasons.find(s => s.id === this.currentSeason?.id) || this.seasons[0];
		this.achievementDefinitions = achievementDefinitions;

		if (this.selectedSeason) {
			await this.loadUserForSeason(this.selectedSeason.id);
		}
	}

	private async handleSeasonChange(e: Event): Promise<void> {
		const select = e.target as HTMLSelectElement;
		const seasonId = select.value;
		const selectedSeason = this.seasons?.find(s => s.id === seasonId);

		if (!selectedSeason || selectedSeason.id === this.selectedSeason?.id) {
			return;
		}

		this.selectedSeason = selectedSeason;
		await this.loadUserForSeason(seasonId);
	}

	private getSeasonScopedUserQueryOptions(seasonId: string): UserQueryOptions {
		return {
			includeSeasonStatistics: true,
			includeHitCounts: true,
			includeMatchSnapshots: true,
			includeFinishCounts: true,
			limitToSeasonId: seasonId,
		};
	}

	private async loadUserForSeason(seasonId: string): Promise<void> {
		const requestId = ++this.seasonStatsRequestId;
		this.isLoadingSeasonStats = true;

		try {
			const options = this.getSeasonScopedUserQueryOptions(seasonId);
			const user = await this.userService.getUserById(this.userId, options) ?? undefined;

			if (requestId !== this.seasonStatsRequestId) {
				return;
			}

			this.user = user;
		}
		finally {
			if (requestId === this.seasonStatsRequestId) {
				this.isLoadingSeasonStats = false;
			}
		}
	}

	private getStatsForSeason(season: Season): SeasonStatistics {
		const defaultStats: SeasonStatistics = {
			id: 0,
			userId: this.user?.id ?? '',
			seasonId: season.id,
			currentRank: 0,
			highestAchievedRank: 0,
			mmr: 0,
			matchSnapshots: [],
			hitCounts: [],
			highestRoundScore: 0,
			highestRoundScoreNoSeasonRules: 0,
			highestRoundScoreForVictory: 0,
			finishCount: [],
			unlockedProgressAchievements: [],
			unlockedSessionAchievements: [],
		};

		if (!this.user?.seasonStatistics?.length) {
			return defaultStats;
		}

		const match = this.user.seasonStatistics.find(ss => ss.seasonId === season.id);
		return match || defaultStats;
	}

	private renderHero(stats: SeasonStatistics): TemplateResult {
		const highestMmr = Math.max(stats.mmr, ...stats.matchSnapshots.map(snapshot => snapshot.mmr));
		const totalFinishes = stats.finishCount.reduce((total, finish) => total + finish.count, 0);

		return html`
			<section class="panel hero-panel">
				<div class="hero-row">
					<div class="identity-line">
						<h2>${this.user?.name}</h2>
						<span class="alias">@${this.user?.alias}</span>
					</div>

					<label class="season-picker">
						<span>Season</span>
						<select @change=${this.handleSeasonChange} ?disabled=${this.isLoadingSeasonStats}>
							${this.seasons?.map(
								s => html`
									<option
										value=${s.id}
										?selected=${s.id === this.selectedSeason?.id}
									>
										${s.name}
									</option>
								`,
							)}
						</select>
					</label>
				</div>

				<div class="summary-board">
					<div class="summary-cell summary-cell--rank">
						<img
							class="summary-rank-icon"
							src=${getRankIcon(stats.currentRank)}
							alt=${getRankDisplayValue(stats.currentRank)}
						/>
						<div class="summary-copy">
							<span class="summary-label">Current rank</span>
							<strong class="summary-value">${getRankDisplayValue(stats.currentRank)}</strong>
						</div>
					</div>

					<div class="summary-cell summary-cell--rank">
						<img
							class="summary-rank-icon"
							src=${getRankIcon(stats.highestAchievedRank)}
							alt=${getRankDisplayValue(stats.highestAchievedRank)}
						/>
						<div class="summary-copy">
							<span class="summary-label">Highest rank</span>
							<strong class="summary-value">${getRankDisplayValue(stats.highestAchievedRank)}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Current MMR</span>
							<strong class="summary-value">${stats.mmr}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest MMR</span>
							<strong class="summary-value">${highestMmr}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest round score</span>
							<strong class="summary-value">${stats.highestRoundScore}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest raw round score</span>
							<strong class="summary-value">${stats.highestRoundScoreNoSeasonRules}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest finishing score</span>
							<strong class="summary-value">${stats.highestRoundScoreForVictory}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Finishes</span>
							<strong class="summary-value">${totalFinishes}</strong>
						</div>
					</div>
				</div>
			</section>
		`;
	}

	private renderCharts(stats: SeasonStatistics): TemplateResult {
		const trackedHits = stats.hitCounts.reduce((total, hit) => total + hit.count, 0);
		const totalFinishes = stats.finishCount.reduce((total, finish) => total + finish.count, 0);

		return html`
			<section class="stats-grid">
				<div class="panel chart-panel">
					<div class="panel-header">
						<h3>MMR History</h3>
						<p>${stats.matchSnapshots.length} rated matches tracked this season.</p>
					</div>
					<div class="chart-slot">
						<aa-match-snapshot-chart .snapshots=${stats.matchSnapshots}></aa-match-snapshot-chart>
					</div>
				</div>

				<div class="panel chart-panel chart-panel-wide">
					<div class="panel-header chart-panel-header">
						<div>
							<h3>Hit Distribution</h3>
							<p>${trackedHits.toLocaleString()} recorded hits this season.</p>
						</div>
						<div class="chart-view-toggle" aria-label="Hit distribution view">
							<button
								type="button"
								aria-pressed=${ this.hitDistributionView === 'bars' }
								@click=${ () => { this.hitDistributionView = 'bars'; } }
							>
								Bars
							</button>
							<button
								type="button"
								aria-pressed=${ this.hitDistributionView === 'board' }
								@click=${ () => { this.hitDistributionView = 'board'; } }
							>
								Board
							</button>
						</div>
					</div>
					<div class="chart-slot">
						${ this.hitDistributionView === 'bars'
							? html`<aa-hit-count-chart .hits=${ stats.hitCounts }></aa-hit-count-chart>`
							: html`
								<aa-dartboard-heatmap .hits=${ stats.hitCounts }></aa-dartboard-heatmap>
							` }
					</div>
				</div>

				<div class="panel chart-panel">
					<div class="panel-header">
						<h3>Finishes by Round</h3>
						<p>${totalFinishes} finishes across the tracked round buckets.</p>
					</div>
					<div class="chart-slot">
						<aa-finish-count-chart .finishCounts=${stats.finishCount}></aa-finish-count-chart>
					</div>
				</div>
			</section>
		`;
	}

	private renderAchievements(stats: SeasonStatistics): TemplateResult {
		const defs: AchievementDefinitionsResponse | undefined = this.achievementDefinitions;
		if (!defs) return html``;

		const unlockedSession = new Set(
			stats.unlockedSessionAchievements.filter(
				(x): x is SessionAchievement => x !== 'unknown',
			),
		);

		const unlockedProgress = new Set(
			stats.unlockedProgressAchievements.filter(
				(x): x is ProgressAchievement => x !== 'unknown',
			),
		);

		type AnyAchievementDefinition =
			| SessionsAchievementDefinition
			| ProgressionAchievementDefinition;

		type Bucket = {
			kind: 'session' | 'progress';
			id: SessionAchievement | ProgressAchievement;
			def: AnyAchievementDefinition;
			unlocked: boolean;
		};

		const all: Bucket[] = [];

		for (const [id, def] of defs.sessionAchievementDefinitions.entries()) {
			all.push({
				kind: 'session',
				id,
				def,
				unlocked: unlockedSession.has(id),
			});
		}

		for (const [id, def] of defs.progressionAchievementDefinitions.entries()) {
			all.push({
				kind: 'progress',
				id,
				def,
				unlocked: unlockedProgress.has(id),
			});
		}

		const byType = new Map<number, Map<AchievementTier, {
			earned: number;
			total: number;
			earnedItems: AnyAchievementDefinition[];
			missingItems: AnyAchievementDefinition[];
		}>>();

		const ensure = (type: number, tier: AchievementTier) => {
			const t = byType.get(type) ?? new Map();
			const entry = t.get(tier) ?? {
				earned: 0,
				total: 0,
				earnedItems: [] as AnyAchievementDefinition[],
				missingItems: [] as AnyAchievementDefinition[],
			};
			t.set(tier, entry);
			byType.set(type, t);
			return entry;
		};

		for (const a of all) {
			const type = a.def.achievementType;
			const tier = a.def.achievementTier as AchievementTier;

			const entry = ensure(type, tier);
			entry.total += 1;

			if (a.unlocked) {
				entry.earned += 1;
				entry.earnedItems.push(a.def);
			}
			else {
				entry.missingItems.push(a.def);
			}
		}

		const tierOrder: AchievementTier[] = [
			AchievementTier.bronze,
			AchievementTier.silver,
			AchievementTier.gold,
			AchievementTier.platinum,
			AchievementTier.diamond,
		];

		const typesSorted = [...byType.entries()].sort(([a], [b]) => a - b);

		const totalAll = all.length;
		const earnedAll = all.reduce((sum, a) => sum + (a.unlocked ? 1 : 0), 0);
		const hasUnknown =
			stats.unlockedSessionAchievements.includes('unknown') ||
			stats.unlockedProgressAchievements.includes('unknown');

		return html`
			<section class="ach-section">
				<div class="ach-header">
					<h3>Achievements</h3>
					<span class="ach-overall">${earnedAll}/${totalAll}</span>
				</div>

				<div class="ach-types ach-scroll">
					${typesSorted.map(([type, tiers]) => {
						const typeTotal = tierOrder.reduce((s, t) => s + (tiers.get(t)?.total ?? 0), 0);
						const typeEarned = tierOrder.reduce((s, t) => s + (tiers.get(t)?.earned ?? 0), 0);
						if (typeTotal === 0) return html``;

						return html`
							<details class="ach-type-card">
								<summary class="ach-type-summary" title="Click to expand" @click=${this.scrollDetailsIntoView}>
									<span class="ach-type-title">
										${getAchievementTypeLabel(type)}
										<span class="ach-hint">(click)</span>
									</span>
									<span class="ach-type-total">${typeEarned}/${typeTotal}</span>
								</summary>

								<div class="ach-tier-grid">
									${tierOrder.map(tier => {
										const t = tiers.get(tier);
										if (!t || t.total === 0) return html``;

										const earnedItems = [...t.earnedItems].sort((a, b) => a.name.localeCompare(b.name));
										const missingItems = [...t.missingItems].sort((a, b) => a.name.localeCompare(b.name));

										return html`
											<details class="ach-tier-card">
												<summary class="ach-tier-row" title="Click to expand tier" @click=${this.scrollDetailsIntoView}>
													<div class="ach-tier-left">
														<img class="ach-icon" src="${getAchievementTierIcon(tier)}" alt="${AchievementTier[tier]}" />
														<span class="ach-tier-name">${AchievementTier[tier]}</span>
													</div>

													<div class="ach-tier-right">
														<span class="ach-fraction">${t.earned}/${t.total}</span>
														<span class="ach-missing">(${t.total - t.earned} missing)</span>
													</div>
												</summary>

												<div class="ach-tier-details">
													${earnedItems.length
														? html`
															<div class="ach-subtitle">Unlocked</div>
															<ul class="ach-list">
																${earnedItems.map(i => html`
																	<li class="ach-item">
																		<strong>${i.name}</strong>
																		<span class="muted"> — ${i.description}</span>
																	</li>
																`)}
															</ul>
														`
														: html``}

													${missingItems.length
														? html`
															<div class="ach-subtitle">Missing</div>
															<ul class="ach-list">
																${missingItems.map(i => html`
																	<li class="ach-item">
																		<strong>${i.name}</strong>
																		<span class="muted"> — ${i.description}</span>
																	</li>
																`)}
															</ul>
														`
														: html``}
												</div>
											</details>
										`;
									})}
								</div>
							</details>
						`;
					})}
				</div>

				${hasUnknown
					? html`<div class="ach-unknown">Some achievements were unknown to this client version and were ignored.</div>`
					: ''}
			</section>
		`;
	}

	private getAchievementProgress(stats: SeasonStatistics): { earned: number; total: number } {
		if (!this.achievementDefinitions)
			return { earned: 0, total: 0 };

		const unlockedSession = new Set(
			stats.unlockedSessionAchievements.filter(achievement => achievement !== 'unknown'),
		);
		const unlockedProgress = new Set(
			stats.unlockedProgressAchievements.filter(achievement => achievement !== 'unknown'),
		);
		const sessionDefinitions = this.achievementDefinitions.sessionAchievementDefinitions;
		const progressionDefinitions = this.achievementDefinitions.progressionAchievementDefinitions;
		const earnedSession = [...sessionDefinitions.keys()]
			.filter(achievement => unlockedSession.has(achievement))
			.length;
		const earnedProgress = [...progressionDefinitions.keys()]
			.filter(achievement => unlockedProgress.has(achievement))
			.length;

		return {
			earned: earnedSession + earnedProgress,
			total: sessionDefinitions.size + progressionDefinitions.size,
		};
	}

	private async openAchievements(stats: SeasonStatistics): Promise<void> {
		if (!this.achievementDefinitions)
			return;

		try {
			await this.dialogService.open(
				html`
					<button
						slot="actions"
						type="button"
						data-achievement-grouping
						aria-label="Group achievements by type"
						aria-pressed="true"
						@click=${ (event: Event) =>
							this.setAchievementGrouping(event, 'type') }
					>
						Type
					</button>
					<button
						slot="actions"
						type="button"
						data-achievement-grouping
						aria-label="Group achievements by tier"
						aria-pressed="false"
						@click=${ (event: Event) =>
							this.setAchievementGrouping(event, 'tier') }
					>
						Tier
					</button>
					<aa-achievement-browser
						.stats=${stats}
						.definitions=${this.achievementDefinitions}
					></aa-achievement-browser>
				`,
				{
					title: `${this.user?.name ?? 'Player'} achievements`,
					fixedHeight: true,
				},
			);
		}
		catch (error) {
			console.error('Unable to open achievements dialog.', error);
		}
	}

	private setAchievementGrouping(
		event: Event,
		grouping: AchievementGrouping,
	): void {
		const button = event.currentTarget as HTMLButtonElement;
		const dialog = button.closest('aa-dialog');
		const browser = dialog?.querySelector<AaAchievementBrowser>('aa-achievement-browser');

		browser?.setGrouping(grouping);
		dialog
			?.querySelectorAll<HTMLButtonElement>('[data-achievement-grouping]')
			.forEach(groupingButton => {
				groupingButton.setAttribute(
					'aria-pressed',
					groupingButton === button ? 'true' : 'false',
				);
			});
	}

	private renderAchievementSummary(stats: SeasonStatistics): TemplateResult {
		const { earned, total } = this.getAchievementProgress(stats);
		const percentage = total > 0 ? Math.round((earned / total) * 100) : 0;

		return html`
			<section class="panel achievement-summary">
				<div class="achievement-summary__copy">
					<h3>Achievements</h3>
					<p>Season collection progress</p>
				</div>

				<div class="achievement-progress">
					<div
						class="achievement-progress__track"
						role="progressbar"
						aria-label="Achievement completion"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow=${percentage}
						style="--achievement-progress: ${percentage}%"
					>
						<span></span>
					</div>
					<strong>${percentage}%</strong>
				</div>

				<div class="achievement-summary__actions">
					<span class="achievement-count">${earned}/${total} unlocked</span>
					<button type="button" @click=${() => this.openAchievements(stats)}>
						View achievements
					</button>
				</div>
			</section>
		`;
	}

	override render(): unknown {
		const isLoading =
			this.isLoadingSeasonStats ||
			!this.user ||
			!this.seasons?.length ||
			!this.selectedSeason;

		return html`
			<aa-loading-state
				?loading=${isLoading}
				label="Loading player stats"
			>
				${isLoading ? null : this.renderContent()}
			</aa-loading-state>
		`;
	}

	private renderContent(): unknown {
		const stats = this.getStatsForSeason(this.selectedSeason!);

		return html`
			<div class="page-shell">
				${this.renderHero(stats)}
				${this.renderCharts(stats)}
				${this.renderAchievementSummary(stats)}
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
				height: 100%;
				min-height: 0;
				overflow: hidden;
			}

			aa-loading-state {
				--aa-loading-height: 100%;
				--aa-loading-min-height: 100%;
			}

			.page-shell {
				display: grid;
				grid-template-rows: auto minmax(0, 1fr) auto;
				gap: 1rem;
				height: 100%;
				min-height: 0;
				overflow: hidden;
				padding: 1rem;
			}

			.panel {
				background: #fffaf3;
				border: 3px solid #000;
				border-radius: 18px;
				box-shadow: 6px 6px 0 #000;
				padding: 1rem;
			}

			.hero-panel,
			.chart-panel,
			.chart-panel-wide,
			.achievement-summary {
				background: #fffaf3;
			}

			.hero-panel {
				padding: 0.75rem 1rem;
			}

			.hero-row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
				flex-wrap: wrap;
			}

			.identity-line {
				display: flex;
				align-items: baseline;
				gap: 0.6rem;
				flex-wrap: wrap;
				min-width: 0;
			}

			.identity-line h2 {
				margin: 0;
				font-size: 1.9rem;
				line-height: 1;
			}

			.alias {
				font-weight: 700;
				opacity: 0.7;
				font-size: 1rem;
			}

			.season-picker {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				font-weight: 800;
				flex-wrap: wrap;
			}

			.season-picker select {
				border: 3px solid #000;
				border-radius: 12px;
				padding: 0.4rem 0.65rem;
				background: #fffefb;
				font: inherit;
				box-shadow: 3px 3px 0 #000;
			}

			.summary-board {
				display: grid;
				grid-template-columns: repeat(8, minmax(0, 1fr));
				margin-top: 0.75rem;
				overflow: hidden;
				background: #fffefb;
				border: 3px solid #000;
				border-radius: 14px;
			}

			.summary-cell {
				display: flex;
				align-items: center;
				min-width: 0;
				min-height: 68px;
				padding: 0.55rem 0.8rem;
			}

			.summary-cell + .summary-cell {
				border-left: 3px solid #000;
			}

			.summary-cell:nth-child(1) {
				background: #e8f0ff;
			}

			.summary-cell:nth-child(2) {
				background: #f0edff;
			}

			.summary-cell:nth-child(3) {
				background: #eaf8ec;
			}

			.summary-cell:nth-child(4) {
				background: #e1f4e7;
			}

			.summary-cell:nth-child(5) {
				background: #fff8d9;
			}

			.summary-cell:nth-child(6) {
				background: #fff3cf;
			}

			.summary-cell:nth-child(7) {
				background: #ffefd2;
			}

			.summary-cell:nth-child(8) {
				background: #ffead0;
			}

			.summary-cell--rank {
				display: grid;
				grid-template-columns: 42px minmax(0, 1fr);
				gap: 0.65rem;
			}

			.summary-rank-icon {
				display: block;
				width: 40px;
				height: 40px;
				object-fit: contain;
			}

			.summary-copy {
				display: grid;
				gap: 0.15rem;
				min-width: 0;
				width: 100%;
			}

			.summary-label {
				font-size: 0.72rem;
				font-weight: 800;
				line-height: 1.1;
				opacity: 0.62;
			}

			.summary-value {
				overflow: hidden;
				font-size: 1.05rem;
				font-weight: 900;
				line-height: 1.1;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.stats-grid {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				grid-template-rows: repeat(2, minmax(0, 1fr));
				gap: 1rem;
				align-items: stretch;
				min-height: 0;
			}

			.stats-grid > .chart-panel:first-child {
				grid-column: 1 / -1;
			}

			.chart-panel {
				display: grid;
				grid-template-rows: auto minmax(0, 1fr);
				min-width: 0;
				min-height: 0;
				overflow: hidden;
			}

			.panel-header h3 {
				margin: 0;
				font-size: 1.1rem;
			}

			.panel-header p {
				margin: 0.25rem 0 0;
				opacity: 0.7;
				font-size: 0.92rem;
				font-weight: 600;
			}

			.chart-panel-header {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
			}

			.chart-view-toggle {
				display: inline-grid;
				grid-template-columns: repeat(2, auto);
				flex: 0 0 auto;
				overflow: hidden;
				background: #fffefb;
				border: 2px solid #000;
				border-radius: 10px;
				box-shadow: 2px 2px 0 #000;
			}

			.chart-view-toggle button {
				padding: 0.35rem 0.6rem;
				background: transparent;
				border: 0;
				color: #000;
				font: inherit;
				font-size: 0.75rem;
				font-weight: 900;
				cursor: pointer;
			}

			.chart-view-toggle button + button {
				border-left: 2px solid #000;
			}

			.chart-view-toggle button[aria-pressed='true'] {
				background: #7df9ff;
			}

			.chart-view-toggle button:focus-visible {
				position: relative;
				z-index: 1;
				outline: 3px solid #ff8c00;
				outline-offset: -3px;
			}

			.chart-slot {
				min-height: 0;
				overflow: hidden;
				margin-top: 0.75rem;
				border: 2px dashed rgba(0,0,0,0.25);
				border-radius: 14px;
				padding: 0.5rem;
				background: rgba(255,255,255,0.6);
			}

			.achievement-summary {
				display: grid;
				grid-template-columns: auto minmax(220px, 1fr) auto;
				align-items: center;
				gap: 1.25rem;
				padding: 0.75rem 1rem;
			}

			.achievement-summary__copy h3 {
				margin: 0;
				font-size: 1.1rem;
			}

			.achievement-summary__copy p {
				margin: 0.15rem 0 0;
				font-size: 0.8rem;
				font-weight: 700;
				opacity: 0.62;
			}

			.achievement-progress {
				display: grid;
				grid-template-columns: minmax(120px, 1fr) auto;
				align-items: center;
				gap: 0.65rem;
			}

			.achievement-progress__track {
				height: 18px;
				overflow: hidden;
				background: #fffefb;
				border: 2px solid #000;
				border-radius: 999px;
			}

			.achievement-progress__track span {
				display: block;
				width: var(--achievement-progress);
				height: 100%;
				background: #dff362;
				border-right: 2px solid #000;
				transition: width 220ms ease-out;
			}

			.achievement-progress strong {
				min-width: 3ch;
				font-size: 0.9rem;
			}

			.achievement-summary__actions {
				display: flex;
				align-items: center;
				justify-content: flex-end;
				gap: 0.75rem;
			}

			.achievement-count {
				font-size: 0.82rem;
				font-weight: 900;
				white-space: nowrap;
			}

			.achievement-summary button {
				padding: 0.45rem 0.7rem;
				background: #7df9ff;
				border: 2px solid #000;
				border-radius: 12px;
				box-shadow: 3px 3px 0 #000;
				color: #000;
				font: inherit;
				font-size: 0.82rem;
				font-weight: 900;
				white-space: nowrap;
				cursor: pointer;
			}

			.achievement-summary button:active {
				transform: translate(2px, 2px);
				box-shadow: 1px 1px 0 #000;
			}

			.achievements-panel {
				padding: 0;
				overflow: hidden;
			}

			.ach-section {
				padding: 1rem;
				border: none;
			}

			.ach-header {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 1rem;
			}

			.ach-header h3 {
				margin: 0;
				font-size: 1.2rem;
			}

			.ach-overall,
			.ach-type-total {
				border: 2px solid #000;
				border-radius: 999px;
				padding: 0.15rem 0.65rem;
				font-weight: 900;
				background: #fffefb;
				box-shadow: 2px 2px 0 #000;
			}

			.ach-types {
				display: grid;
				gap: 0.75rem;
				margin-top: 0.9rem;
			}

			.ach-type-card {
				border: 2px solid #000;
				border-radius: 14px;
				background: #fffefb;
				padding: 0.35rem 0.6rem;
			}

			.ach-type-card > summary,
			.ach-tier-card > summary {
				list-style: none;
				cursor: pointer;
				user-select: none;
			}

			.ach-type-card > summary::-webkit-details-marker,
			.ach-tier-card > summary::-webkit-details-marker {
				display: none;
			}

			.ach-type-summary {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 1rem;
				font-weight: 900;
			}

			.ach-type-title {
				display: inline-flex;
				gap: 0.5rem;
				flex-wrap: wrap;
			}

			.ach-hint {
				opacity: 0.55;
				font-weight: 800;
				font-size: 0.9em;
			}

			.ach-tier-grid {
				margin-top: 0.5rem;
				display: grid;
				gap: 0.35rem;
			}

			.ach-tier-card {
				border-top: 2px dashed rgba(0,0,0,0.25);
				padding-top: 0.25rem;
			}

			.ach-tier-row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
				padding: 0.35rem 0.4rem;
				margin: 0;
			}

			.ach-tier-left {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				font-weight: 800;
			}

			.ach-icon {
				width: 18px;
				height: 18px;
			}

			.ach-tier-name {
				opacity: 0.85;
				text-transform: capitalize;
			}

			.ach-tier-right {
				display: inline-flex;
				align-items: baseline;
				gap: 0.5rem;
				font-weight: 900;
			}

			.ach-missing {
				opacity: 0.65;
				font-weight: 800;
			}

			.ach-tier-details {
				padding: 0.35rem 0.4rem 0.5rem 0.4rem;
			}

			.ach-subtitle {
				font-weight: 900;
				opacity: 0.75;
				margin-top: 0.35rem;
			}

			.ach-list {
				margin: 0.25rem 0 0 1.1rem;
				padding: 0;
				display: grid;
				gap: 0.25rem;
			}

			.ach-item strong {
				font-weight: 900;
			}

			.ach-scroll {
				max-height: 34vh;
				overflow-y: auto;
				padding-right: 0.35rem;
				padding-bottom: 1rem;
				box-sizing: border-box;
				scrollbar-width: thin;
				scrollbar-color: rgba(0,0,0,0.25) transparent;
			}

			.ach-scroll::-webkit-scrollbar {
				width: 6px;
			}

			.ach-scroll::-webkit-scrollbar-track {
				background: transparent;
			}

			.ach-scroll::-webkit-scrollbar-thumb {
				background-color: rgba(0,0,0,0.25);
				border-radius: 999px;
			}

			.ach-scroll::-webkit-scrollbar-thumb:hover {
				background-color: rgba(0,0,0,0.45);
			}

			.ach-unknown {
				margin-top: 0.5rem;
				font-size: 0.9rem;
				opacity: 0.7;
			}

			@media (max-width: 1400px) {
				.summary-board {
					grid-template-columns: repeat(4, minmax(0, 1fr));
				}

				.summary-cell + .summary-cell {
					border-left: none;
				}

				.summary-cell:not(:nth-child(4n + 1)) {
					border-left: 3px solid #000;
				}

				.summary-cell:nth-child(n + 5) {
					border-top: 3px solid #000;
				}
			}

			@media (max-width: 1100px) {
				:host {
					height: auto;
					min-height: 100%;
					overflow: visible;
				}

				aa-loading-state {
					--aa-loading-height: auto;
					--aa-loading-min-height: 100%;
				}

				.page-shell {
					grid-template-rows: auto;
					height: auto;
					overflow: visible;
				}

				.stats-grid {
					grid-template-columns: 1fr;
					grid-template-rows: none;
				}

				.stats-grid > .chart-panel:first-child {
					grid-column: auto;
				}

				.chart-panel {
					min-height: 300px;
				}

				.achievement-summary {
					grid-template-columns: auto minmax(180px, 1fr);
				}

				.achievement-summary__actions {
					grid-column: 1 / -1;
					justify-content: space-between;
				}
			}

			@media (max-width: 700px) {
				.summary-board {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}

				.summary-cell:not(:nth-child(4n + 1)) {
					border-left: none;
				}

				.summary-cell:nth-child(n + 5) {
					border-top: none;
				}

				.summary-cell:nth-child(even) {
					border-left: 3px solid #000;
				}

				.summary-cell:nth-child(n + 3) {
					border-top: 3px solid #000;
				}

				.hero-row {
					align-items: flex-start;
				}

				.identity-line {
					flex-direction: column;
					align-items: flex-start;
					gap: 0.2rem;
				}

				.season-picker {
					width: 100%;
				}

				.achievement-summary {
					grid-template-columns: 1fr;
					gap: 0.65rem;
				}

				.achievement-summary__actions {
					grid-column: auto;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.achievement-progress__track span {
					transition: none;
				}
			}
		`,
	];
}