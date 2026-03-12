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
import { SeasonService } from '../../services/seasonService.js';
import { UserService } from '../../services/userService.js';
import { sharedStyles } from '../../styles.js';
import { achievementService } from '../../services/achievementService.js';
import {
	AchievementTier,
	AchievementType,
	ProgressAchievement,
	SessionAchievement,
} from '../../models/enums.js';
import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';

@customElement('user-page')
export class UserPage extends LitElement {

	@property({ type: Array }) users: User[] = [];

	@state() private userId!: string;
	@state() private currentSeason?: Season;
	@state() private seasons?: Season[];
	@state() private selectedSeason?: Season;
	@state() private achievementDefinitions?: AchievementDefinitionsResponse;

	private seasonService: SeasonService;
	private userService: UserService;
	private user?: User;
	private achievementService: achievementService;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
		this.achievementService = container.resolve(achievementService);
	}

	onBeforeEnter(location: RouterLocation): void {
		this.userId = location.params['id'] as string;
	}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();

		const options: UserQueryOptions = {
			includeSeasonStatistics: true,
			includeHitCounts: true,
			includeMatchSnapshots: true,
			includeFinishCounts: true,
		};

		this.user = await this.userService.getUserById(this.userId, options) ?? undefined;
		this.currentSeason = await this.seasonService.getCurrentSeason();
		this.seasons = await this.seasonService.getAll();
		this.selectedSeason = this.seasons.find(s => s.id === this.currentSeason?.id) || this.seasons[0];
		this.achievementDefinitions = await this.achievementService.getAchievementDefinitions();
	}

	private handleSeasonChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		const seasonId = select.value;
		this.selectedSeason = this.seasons?.find(s => s.id === seasonId);
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

	private scrollDetailsIntoView(e: Event) {
		const details = (e.currentTarget as HTMLElement)?.closest('details');
		const container = this.renderRoot.querySelector('.ach-scroll') as HTMLElement | null;

		if (!details || !container) return;

		requestAnimationFrame(() => {
			const containerRect = container.getBoundingClientRect();
			const detailsRect = details.getBoundingClientRect();

			const currentScroll = container.scrollTop;
			const offsetTop = detailsRect.top - containerRect.top + currentScroll;
			const offsetBottom = detailsRect.bottom - containerRect.bottom + currentScroll;

			if (detailsRect.top < containerRect.top) {
				container.scrollTo({
					top: offsetTop - 8,
					behavior: 'smooth',
				});
			}
			else if (detailsRect.bottom > containerRect.bottom) {
				container.scrollTo({
					top: offsetBottom + 8,
					behavior: 'smooth',
				});
			}
		});
	}

	private renderHero(stats: SeasonStatistics): TemplateResult {
		const highestRoundScoreDisplay =
			`${stats.highestRoundScore} (${stats.highestRoundScoreNoSeasonRules})`;

		return html`
			<section class="panel hero-panel">
				<div class="hero-row">
					<div class="identity-line">
						<h2>${this.user?.name}</h2>
						<span class="alias">@${this.user?.alias}</span>
					</div>

					<label class="season-picker">
						<span>Season</span>
						<select @change=${this.handleSeasonChange}>
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

				<div class="summary-grid">
					<aa-info-card
						label="Current Rank"
						value=${getRankDisplayValue(stats.currentRank)}
						imageSrc=${getRankIcon(stats.currentRank)}
						imageAlt=${getRankDisplayValue(stats.currentRank)}
						.rank=${stats.currentRank}
					></aa-info-card>

					<aa-info-card
						label="Highest Rank"
						value=${getRankDisplayValue(stats.highestAchievedRank)}
						imageSrc=${getRankIcon(stats.highestAchievedRank)}
						imageAlt=${getRankDisplayValue(stats.highestAchievedRank)}
						.rank=${stats.highestAchievedRank}
					></aa-info-card>

					<aa-info-card
						label="Highest round score"
						value=${highestRoundScoreDisplay}
					></aa-info-card>

					<aa-info-card
						label="Highest finishing score"
						value=${stats.highestRoundScoreForVictory}
					></aa-info-card>
				</div>
			</section>
		`;
	}

	private renderCharts(stats: SeasonStatistics): TemplateResult {
		return html`
			<section class="stats-grid">
				<div class="panel chart-panel">
					<div class="panel-header">
						<h3>MMR History</h3>
						<p>How rating changed over time this season.</p>
					</div>
					<div class="chart-slot">
						<aa-match-snapshot-chart .snapshots=${stats.matchSnapshots}></aa-match-snapshot-chart>
					</div>
				</div>

				<div class="panel chart-panel chart-panel-wide">
					<div class="panel-header">
						<h3>Hit Distribution</h3>
						<p>All tracked hits for the selected season.</p>
					</div>
					<div class="chart-slot">
						<aa-hit-count-chart .hits=${stats.hitCounts}></aa-hit-count-chart>
					</div>
				</div>

				<div class="panel chart-panel">
					<div class="panel-header">
						<h3>Finishes by Round</h3>
						<p>How often the player finished in each round bucket.</p>
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
										${AchievementType[type] ?? `Type ${type}`}
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

	override render(): unknown {
		if (!this.user || !this.seasons?.length || !this.selectedSeason) {
			return html`<p>Loading data…</p>`;
		}

		const stats = this.getStatsForSeason(this.selectedSeason);

		return html`
			<div class="page-shell">
				${this.renderHero(stats)}
				${this.renderCharts(stats)}

				<section class="panel achievements-panel">
					${this.renderAchievements(stats)}
				</section>
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
			}

			.page-shell {
				display: grid;
				gap: 1rem;
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
			.achievements-panel {
				background: #fffaf3;
			}

			.hero-row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
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
				padding: 0.5rem 0.75rem;
				background: #fffefb;
				font: inherit;
				box-shadow: 3px 3px 0 #000;
			}

			.summary-grid {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1rem;
				margin-top: 1rem;
			}

			.stats-grid {
				display: grid;
				grid-template-columns: 1fr 1.35fr 1fr;
				gap: 1rem;
				align-items: stretch;
			}

			.chart-panel {
				display: grid;
				grid-template-rows: auto 1fr;
				min-height: 340px;
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

			.chart-slot {
				min-height: 250px;
				margin-top: 0.75rem;
				border: 2px dashed rgba(0,0,0,0.25);
				border-radius: 14px;
				padding: 0.5rem;
				background: rgba(255,255,255,0.6);
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

			@media (max-width: 1100px) {
				.summary-grid {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}

				.stats-grid {
					grid-template-columns: 1fr;
				}

				.chart-panel {
					min-height: 300px;
				}
			}

			@media (max-width: 700px) {
				.summary-grid {
					grid-template-columns: 1fr;
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
			}
		`,
	];
}