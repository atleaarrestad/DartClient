import '../../aa-loading-state/aa-loading-state.js';
import '../../rank-display/aa-rank-display.js';
import '../../season-hit-chart/season-hit-chart.js';
import '../../season-leaderboard/season-leaderboard.js';
import '../../season-overview/season-overview.js';
import '../../season-spotlights/season-spotlights.js';
import '../../../ui/button/aa-button.js';
import '../../../ui/error-state/aa-error-state.js';

import { Router, type RouterLocation } from '@vaadin/router';
import { html, PropertyValues, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { faIcons } from '../../../faIcons.js';
import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { getErrorMessage } from '../../../helpers/getErrorMessage.js';
import {
	aggregateHitCounts,
	formatDecimal,
	getSeasonOverview,
	getSeasonPodium,
	getSeasonRows,
	type SeasonPodium,
	type SeasonRow,
} from '../../../helpers/seasonStatistics.js';
import { getRankDisplayValue } from '../../../models/rank.js';
import { HitCount, Season, User } from '../../../models/schemas.js';
import { DialogService } from '../../../services/dialogService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import { seasonSpotlightDialogTemplate } from '../../../templates/dialogTemplates.js';
import type {
	SeasonLeaderboardRow,
	SeasonLeaderboardUserSelectedEvent,
} from '../../season-leaderboard/season-leaderboard.js';
import type { SeasonOverviewStat } from '../../season-overview/season-overview.js';
import {
	getSeasonSpotlightCards,
	getSeasonSpotlightDefinition,
	getSeasonSpotlightTop10,
} from '../../season-spotlights/season-spotlight-definitions.js';
import type {
	SeasonSpotlightActionEvent,
	SeasonSpotlightCard,
} from '../../season-spotlights/season-spotlights.js';
import seasonPageStyles from './season-page.css?inline';

const base = getAbsoluteBase();

type Placement = '1st' | '2nd' | '3rd';

const placementIconClasses: Record<Placement, string> = {
	'1st': 'fas fa-trophy',
	'2nd': 'fas fa-medal',
	'3rd': 'fas fa-award',
};

@customElement('season-page')
export class SeasonPage extends LitElement {
	private seasonService:  SeasonService;
	private userService:    UserService;
	private dialogService:  DialogService;

	@state() private season?: Season;
	@state() private users: User[] = [];
	@state() private isLoading = true;
	@state() private loadError = '';

	/** The `/season/:id` parameter; the current season is shown when it is missing or unknown. */
	private requestedSeasonId?: string;
	private loadGeneration = 0;

	// Derived from `users` and `season` in willUpdate, once per change instead of per render call.
	private seasonRows:     SeasonRow[] = [];
	private podium:         SeasonPodium = {};
	private overviewStats:  SeasonOverviewStat[] = [];
	private spotlightCards: SeasonSpotlightCard[] = [];
	private hitCounts:      HitCount[] = [];

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
	}

	onBeforeEnter(location: RouterLocation): void {
		const id = location.params['id'];
		const seasonId = typeof id === 'string' && id.length > 0 ? id : undefined;
		if (this.loadGeneration > 0 && seasonId === this.requestedSeasonId)
			return;

		this.requestedSeasonId = seasonId;
		void this.load();
	}

	override connectedCallback(): void {
		super.connectedCallback();

		// The router loads in onBeforeEnter; this covers the page being used outside a route.
		if (this.loadGeneration === 0)
			void this.load();
	}

	private async load(): Promise<void> {
		const generation = ++this.loadGeneration;
		this.isLoading = true;
		this.loadError = '';

		try {
			const season = await this.resolveSeason();
			if (generation !== this.loadGeneration)
				return;

			const users = await this.userService.getAllUsers({
				forceRefresh: true,
				query:        {
					includeFinishCounts:     true,
					includeHitCounts:        true,
					includeMatchSnapshots:   true,
					includeSeasonStatistics: true,
					limitToSeasonId:         season.id,
				},
			});
			if (generation !== this.loadGeneration)
				return;

			this.season = season;
			this.users = users;
		}
		catch (error) {
			if (generation === this.loadGeneration)
				this.loadError = getErrorMessage(error, 'Unable to load season stats.');
		}
		finally {
			if (generation === this.loadGeneration)
				this.isLoading = false;
		}
	}

	private async resolveSeason(): Promise<Season> {
		if (this.requestedSeasonId) {
			const seasons = await this.seasonService.getAll();
			const requested = seasons.find(season => season.id === this.requestedSeasonId);
			if (requested)
				return requested;
		}

		const current = await this.seasonService.getCurrentSeason() as Season | undefined;
		if (!current)
			throw new Error('There is no current season.');

		return current;
	}

	override willUpdate(changedProperties: PropertyValues): void {
		super.willUpdate(changedProperties);

		if (!changedProperties.has('users') && !changedProperties.has('season'))
			return;

		this.seasonRows = getSeasonRows(this.users, this.season?.id ?? '');
		this.podium = getSeasonPodium(this.seasonRows);
		this.overviewStats = getSeasonOverview(this.seasonRows);
		this.spotlightCards = getSeasonSpotlightCards(this.seasonRows);
		this.hitCounts = aggregateHitCounts(this.seasonRows);
	}

	private async handleSpotlightAction(event: SeasonSpotlightActionEvent): Promise<void> {
		const definition = getSeasonSpotlightDefinition(event.detail);
		if (!definition)
			return;

		try {
			await this.dialogService.open(
				seasonSpotlightDialogTemplate({
					title:       definition.title,
					description: definition.description,
					valueLabel:  definition.valueLabel,
					rows:        getSeasonSpotlightTop10(definition, this.seasonRows),
				}),
				{ title: definition.title },
			);
		}
		catch {
			// Another dialog is already open; it keeps the focus.
		}
	}

	private podiumCell(entry: SeasonRow | undefined, placement: Placement) {
		if (!entry) return html``;

		const highestLabel = entry.highestRank !== undefined ? getRankDisplayValue(entry.highestRank) : '—';

		return html`
			<div class="player player-card">
				<div class="placement">
					<i class=${placementIconClasses[placement]} aria-hidden="true"></i>
					<span>${placement}</span>
				</div>
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
					<div><span>Avg finish rnd</span><strong>${formatDecimal(entry.averageFinishRound)}</strong></div>
				</div>
			</div>
		`;
	}

	private renderLeaderboard() {
		if (!this.seasonRows.length) return html``;

		const rows: SeasonLeaderboardRow[] = this.seasonRows.map((row) => ({
			userId:                 row.user.id,
			alias:                  row.alias,
			rank:                   row.rank,
			rankLabel:              getRankDisplayValue(row.rank),
			mmr:                    row.mmr,
			rimPercent:             row.rimPercent,
			totalAchievements:      row.totalAchievements,
			averagePlayersPerMatch: row.averagePlayersPerMatch,
			averageFinishRound:     row.averageFinishRound,
		}));

		return html`
			<aa-season-leaderboard
				.rows=${rows}
				@season-leaderboard-user-selected=${this.handleLeaderboardUserSelected}
			></aa-season-leaderboard>
		`;
	}

	private handleLeaderboardUserSelected(event: SeasonLeaderboardUserSelectedEvent): void {
		Router.go(`${base}user/${event.detail}`);
	}

	override render(): unknown {
		if (this.loadError && !this.isLoading) {
			return html`
				<section class="wrap">
					<aa-error-state
						class="load-error"
						heading="Unable to load season stats"
						message=${this.loadError}
					>
						<i slot="icon" class="fa-solid fa-triangle-exclamation"></i>
						<aa-button
							slot="actions"
							type="button"
							variant="primary"
							@click=${() => void this.load()}
						>
							Try again
						</aa-button>
					</aa-error-state>
				</section>
			`;
		}

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
		const { first, second, third } = this.podium;

		return html`
			<section class="wrap">
				${!first
					? html`<div class="empty">No players found for this season.</div>`
					: html`
						<section class="podium-stage">
							<div class="podium">
								<div class="column second">
									${this.podiumCell(second, '2nd')}
									<div class="step step-2" aria-hidden="true"></div>
								</div>
								<div class="column first">
									${this.podiumCell(first, '1st')}
									<div class="step step-1" aria-hidden="true"></div>
								</div>
								<div class="column third">
									${this.podiumCell(third, '3rd')}
									<div class="step step-3" aria-hidden="true"></div>
								</div>
							</div>
						</section>
					`}

				<section class="season-stats-panel" aria-labelledby="season-stats-title">
					<header class="season-stats-panel__header">
						<i class="fa-solid fa-chart-simple" aria-hidden="true"></i>
						<h2 id="season-stats-title">Season stats</h2>
					</header>
					<aa-season-overview
						embedded
						.stats=${this.overviewStats}
					></aa-season-overview>
					<aa-season-spotlights
						embedded
						.spotlights=${this.spotlightCards}
						@season-spotlight-action=${this.handleSpotlightAction}
					></aa-season-spotlights>
				</section>
				<aa-season-hit-chart .hits=${this.hitCounts}></aa-season-hit-chart>
				${this.renderLeaderboard()}
			</section>
		`;
	}

	static override styles = [ sharedStyles, faIcons, unsafeCSS(seasonPageStyles) ];
}
