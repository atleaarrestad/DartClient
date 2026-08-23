import type { RouterLocation } from '@vaadin/router';
import { html, unsafeCSS, TemplateResult } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { UserQueryOptions } from '../../../api/users.requests.js';
import {
	AchievementDefinitionsResponse,
	Season,
	SeasonStatistics,
	User,
} from '../../../models/schemas.js';
import { DialogService } from '../../../services/dialogService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import userPageStyles from './user-page.css?inline';
import { achievementService } from '../../../services/achievementService.js';
import type {
	AaAchievementBrowser,
	AchievementGrouping,
} from '../../aa-achievement-browser/aa-achievement-browser.js';
import type { UserSeasonChangedEvent } from '../../user-season-summary/aa-user-season-summary.js';
import type {
	HitDistributionView,
	HitDistributionViewChangedEvent,
} from '../../user-statistics-charts/aa-user-statistics-charts.js';
import '../../user-season-summary/aa-user-season-summary.js';
import '../../user-statistics-charts/aa-user-statistics-charts.js';
import '../../aa-achievement-browser/aa-achievement-browser.js';
import '../../aa-loading-state/aa-loading-state.js';
import '../../../ui/button/aa-button.js';

@customElement('user-page')
export class UserPage extends LitElement {

	@property({ type: Array }) users: User[] = [];

	@state() private userId!: string;
	@state() private currentSeason?: Season;
	@state() private seasons?: Season[];
	@state() private selectedSeason?: Season;
	@state() private achievementDefinitions?: AchievementDefinitionsResponse;
	@state() private isLoadingSeasonStats = false;
	@state() private hitDistributionView: HitDistributionView = 'bars';

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

	private async handleSeasonChange(event: UserSeasonChangedEvent): Promise<void> {
		const selectedSeason = event.detail;
		if (selectedSeason.id === this.selectedSeason?.id)
			return;

		this.selectedSeason = selectedSeason;
		await this.loadUserForSeason(selectedSeason.id);
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
			progressAchievementProgress: [],
		};

		if (!this.user?.seasonStatistics?.length) {
			return defaultStats;
		}

		const match = this.user.seasonStatistics.find(ss => ss.seasonId === season.id);
		return match || defaultStats;
	}

	private handleHitDistributionViewChange(
		event: HitDistributionViewChangedEvent,
	): void {
		this.hitDistributionView = event.detail;
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
					<aa-button
						type="button"
						variant="primary"
						size="small"
						@click=${() => this.openAchievements(stats)}
					>
						View achievements
					</aa-button>
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
				<aa-user-season-summary
					.user=${this.user}
					.seasons=${this.seasons}
					.selectedSeason=${this.selectedSeason}
					.statistics=${stats}
					.loading=${this.isLoadingSeasonStats}
					@user-season-changed=${this.handleSeasonChange}
				></aa-user-season-summary>
				<aa-user-statistics-charts
					.statistics=${stats}
					.hitDistributionView=${this.hitDistributionView}
					@hit-distribution-view-changed=${this.handleHitDistributionViewChange}
				></aa-user-statistics-charts>
				${this.renderAchievementSummary(stats)}
			</div>
		`;
	}

	static override styles = [ sharedStyles, unsafeCSS(userPageStyles) ];
}