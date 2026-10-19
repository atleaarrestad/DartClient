import type { RouterLocation } from '@vaadin/router';
import { html, unsafeCSS, TemplateResult } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { UserQueryOptions } from '../../../api/users.requests.js';
import type { AchievementInstanceResponse } from '../../../models/achievementBuilderApi.js';
import { Season, SeasonStatistics, User } from '../../../models/schemas.js';
import { DialogService } from '../../../services/dialogService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import userPageStyles from './user-page.css?inline';
import { AchievementBuilderService } from '../../../services/achievementBuilderService.js';
import type {
	AaAchievementBrowser,
	AchievementGrouping,
	AchievementTemplateViewDetail,
} from '../../aa-achievement-browser/aa-achievement-browser.js';
import type { AaDialog } from '../../aa-dialog/aa-dialog.js';
import type { UserSeasonChangedEvent } from '../../user-season-summary/aa-user-season-summary.js';
import type {
	HitDistributionView,
	HitDistributionViewChangedEvent,
} from '../../user-statistics-charts/aa-user-statistics-charts.js';
import '../../user-season-summary/aa-user-season-summary.js';
import '../../user-statistics-charts/aa-user-statistics-charts.js';
import '../../aa-achievement-browser/aa-achievement-browser.js';
import '../../achievement-builder/achievement-builder.js';
import '../../aa-loading-state/aa-loading-state.js';
import '../../../ui/button/aa-button.js';

interface AchievementProgress {
	earned:            number;
	total:             number;
	earnedCapIncrease: number;
	totalCapIncrease:  number;
}

@customElement('user-page')
export class UserPage extends LitElement {

	@property({ type: Array }) users: User[] = [];

	@state() private userId!: string;
	@state() private currentSeason?: Season;
	@state() private seasons?: Season[];
	@state() private selectedSeason?: Season;
	@state() private v2AchievementInstances: AchievementInstanceResponse[] = [];
	@state() private isLoadingSeasonStats = false;
	@state() private hitDistributionView: HitDistributionView = 'bars';

	private seasonService: SeasonService;
	private userService: UserService;
	private user?: User;
	private achievementBuilderService: AchievementBuilderService;
	private dialogService: DialogService;
	private seasonStatsRequestId = 0;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
		this.achievementBuilderService = container.resolve(AchievementBuilderService);
		this.dialogService = container.resolve(DialogService);
	}

	onBeforeEnter(location: RouterLocation): void {
		this.userId = location.params['id'] as string;
	}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();

		const [currentSeason, seasons] = await Promise.all([
			this.seasonService.getCurrentSeason(),
			this.seasonService.getAll(),
		]);

		this.currentSeason = currentSeason;
		this.seasons = seasons;
		this.selectedSeason = this.seasons.find(s => s.id === this.currentSeason?.id) || this.seasons[0];
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
			const [ user, v2AchievementInstances ] = await Promise.all([
				this.userService.getUserById(this.userId, options),
				this.achievementBuilderService.getInstances(seasonId),
			]);

			if (requestId !== this.seasonStatsRequestId) {
				return;
			}

			this.user = user ?? undefined;
			this.v2AchievementInstances = v2AchievementInstances;
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
			unlockedV2Achievements: [],
			progressionAchievementProgress: [],
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

	private getAchievementProgress(
		stats: SeasonStatistics,
		season: Season,
	): AchievementProgress {
		const capIncreaseByTier = new Map(
			season.achievementTierRewards.map(reward => [
				reward.achievementTier,
				reward.mmrCapIncrease,
			]),
		);
		const latestVersionByTemplate = new Map<string, number>();
		this.v2AchievementInstances.forEach(instance => latestVersionByTemplate.set(
			instance.templateId,
			Math.max(
				latestVersionByTemplate.get(instance.templateId) ?? 0,
				instance.versionNumber,
			),
		));
		const v2Achievements = new Map(
			this.v2AchievementInstances
				.filter(instance =>
					instance.versionNumber === latestVersionByTemplate.get(instance.templateId))
				.map(instance => [ instance.id, instance ]),
		);
		stats.unlockedV2Achievements.forEach(instance =>
			v2Achievements.set(instance.id, instance));
		const unlockedV2Ids = new Set(
			stats.unlockedV2Achievements.map(instance => instance.id),
		);
		const earnedV2 = [ ...v2Achievements.values() ].filter(instance =>
			unlockedV2Ids.has(instance.id));
		const getCapIncrease = (achievementTier: number): number =>
			capIncreaseByTier.get(achievementTier) ?? 0;

		return {
			earned:            earnedV2.length,
			total:             v2Achievements.size,
			earnedCapIncrease: earnedV2.reduce((sum, definition) =>
				sum + getCapIncrease(definition.achievementTier), 0),
			totalCapIncrease:  [ ...v2Achievements.values() ].reduce((sum, definition) =>
				sum + getCapIncrease(definition.achievementTier), 0),
		};
	}

	private async openAchievements(stats: SeasonStatistics): Promise<void> {
		let templateToView: AchievementTemplateViewDetail | undefined;

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
						.achievementInstances=${this.v2AchievementInstances}
						@achievement-template-view=${(
							event: CustomEvent<AchievementTemplateViewDetail>,
						) => {
							templateToView = event.detail;
							((event.currentTarget as HTMLElement)
								.closest('aa-dialog') as AaDialog | null)
								?.close();
						}}
					></aa-achievement-browser>
				`,
				{
					title: `${this.user?.name ?? 'Player'} achievements`,
					fixedHeight: true,
				},
			);

			if (templateToView)
				await this.openAchievementTemplate(templateToView);
		}
		catch (error) {
			console.error('Unable to open achievements dialog.', error);
		}
	}

	private async openAchievementTemplate(
		detail: AchievementTemplateViewDetail,
	): Promise<void> {
		const seasonId = this.selectedSeason?.id;
		if (!seasonId)
			return;

		const [ templates, categories ] = await Promise.all([
			this.achievementBuilderService.getTemplates(seasonId),
			this.achievementBuilderService.getCategories(seasonId),
		]);
		const template = templates.find(candidate => candidate.id === detail.templateId);
		const version = template?.versions.find(
			candidate => candidate.id === detail.templateVersionId,
		);
		if (!template || !version)
			throw new Error('The source achievement template version is no longer available.');

		await this.dialogService.open(
			html`
				<aa-achievement-builder
					.viewOnly=${true}
					.seasonId=${seasonId}
					.initialTemplateId=${detail.templateId}
					.initialVersionId=${detail.templateVersionId}
					.categories=${categories}
					.templates=${templates}
				></aa-achievement-builder>
			`,
			{
				title:       `Achievement template: ${detail.achievementName} (Read only)`,
				large:       true,
				fixedHeight: true,
			},
		);
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
		const {
			earned,
			total,
			earnedCapIncrease,
			totalCapIncrease,
		} = this.getAchievementProgress(stats, this.selectedSeason!);
		const percentage = total > 0 ? Math.round((earned / total) * 100) : 0;

		return html`
			<section class="achievement-summary">
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
					<div class="achievement-summary__totals">
						<span class="achievement-count">${ earned }/${ total } unlocked</span>
						<span class="achievement-cap">
							MMR cap increase ${ earnedCapIncrease }/${ totalCapIncrease }
						</span>
					</div>
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
				<section class="statistics-layout">
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
				</section>
			</div>
		`;
	}

	static override styles = [ sharedStyles, unsafeCSS(userPageStyles) ];
}