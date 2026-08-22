import '../aa-loading-state.js';

import { css, html, LitElement, nothing, TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import {
	AchievementTier,
	ScoreModifier,
	WinCondition,
} from '../../models/enums.js';
import {
	getRankDisplayValue,
	getRankIcon,
	Rank,
} from '../../models/rank.js';
import {
	AchievementTierReward,
	RankThreshold,
	RuleDefinitionsResponse,
	Season,
} from '../../models/schemas.js';
import { DialogService } from '../../services/dialogService.js';
import { NotificationService } from '../../services/notificationService.js';
import { RuleService } from '../../services/ruleService.js';
import {
	SeasonConfigurationInput,
	SeasonService,
} from '../../services/seasonService.js';
import { sharedStyles } from '../../styles.js';

interface SeasonDraft extends SeasonConfigurationInput {
	id?: string;
}

const managementKeyStorage = 'season-management-key';
const rankValues = Object.values(Rank)
	.filter((rank): rank is Rank => typeof rank === 'number')
	.sort((left, right) => left - right);
const defaultRankMinimums = [
	0,
	1250,
	1500,
	1750,
	2000,
	2250,
	2500,
	2750,
	3000,
	3250,
	3500,
	3750,
	4000,
	4250,
	4500,
	4750,
	5000,
	5250,
	5500,
	5750,
	6000,
	6250,
	6500,
	6750,
	7000,
	7250,
	7500,
	7750,
	8000,
];
const achievementTiers = [
	AchievementTier.bronze,
	AchievementTier.silver,
	AchievementTier.gold,
	AchievementTier.platinum,
	AchievementTier.diamond,
];
const defaultAchievementRewards: Record<AchievementTier, number> = {
	[AchievementTier.bronze]:   5,
	[AchievementTier.silver]:   10,
	[AchievementTier.gold]:     15,
	[AchievementTier.platinum]: 20,
	[AchievementTier.diamond]:  30,
};

@customElement('seasons-page')
export class SeasonsPage extends LitElement {

	private seasonService = container.resolve(SeasonService);
	private ruleService = container.resolve(RuleService);
	private dialogService = container.resolve(DialogService);
	private notificationService = container.resolve(NotificationService);

	@state() private seasons:          Season[] = [];
	@state() private definitions?:     RuleDefinitionsResponse;
	@state() private draft?:           SeasonDraft;
	@state() private originalDraft = '';
	@state() private adminKey = '';
	@state() private accessGranted = false;
	@state() private loading = true;
	@state() private saving = false;
	@state() private accessError = '';
	@state() private validationErrors: string[] = [];

	override connectedCallback(): void {
		super.connectedCallback();
		window.addEventListener('beforeunload', this.handleBeforeUnload);
		void this.initialize();
	}

	override disconnectedCallback(): void {
		window.removeEventListener('beforeunload', this.handleBeforeUnload);
		super.disconnectedCallback();
	}

	private async initialize(): Promise<void> {
		const storedKey = sessionStorage.getItem(managementKeyStorage);
		if (!storedKey) {
			this.loading = false;

			return;
		}

		this.adminKey = storedKey;
		await this.unlock();
	}

	private async handleAccessSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await this.unlock();
	}

	private async unlock(): Promise<void> {
		this.loading = true;
		this.accessError = '';

		try {
			await this.seasonService.verifyManagementAccess(this.adminKey);
		}
		catch (error) {
			this.accessGranted = false;
			sessionStorage.removeItem(managementKeyStorage);
			this.accessError = error instanceof Error ? error.message : 'Unable to unlock season management.';
			this.loading = false;

			return;
		}

		sessionStorage.setItem(managementKeyStorage, this.adminKey);
		try {
			await this.loadConfiguration();
			this.accessGranted = true;
		}
		catch (error) {
			this.accessGranted = false;
			this.accessError = error instanceof Error ? error.message : 'Unable to load season configuration.';
		}
		finally {
			this.loading = false;
		}
	}

	private lock(): void {
		if (this.isDirty && !window.confirm('Discard unsaved season changes and lock this page?'))
			return;

		sessionStorage.removeItem(managementKeyStorage);
		this.adminKey = '';
		this.accessGranted = false;
		this.draft = undefined;
		this.originalDraft = '';
	}

	private async loadConfiguration(): Promise<void> {
		const [ seasons, definitions ] = await Promise.all([
			this.seasonService.getAll(true),
			this.ruleService.GetDefinitions(),
		]);

		this.seasons = this.sortSeasons(seasons);
		this.definitions = definitions;

		const current = this.seasons.find(season =>
			season.startDate <= new Date() && season.endDate > new Date()) ?? this.seasons[0];

		if (current)
			this.selectSeason(current);
		else
			this.createDraft();
	}

	private sortSeasons(seasons: Season[]): Season[] {
		return [ ...seasons ].sort(
			(left, right) => right.startDate.getTime() - left.startDate.getTime(),
		);
	}

	private selectSeason(season: Season): void {
		if (this.saving)
			return;

		if (this.isDirty && !window.confirm('Discard unsaved changes and open another season?'))
			return;

		this.applySeason(season);
	}

	private applySeason(season: Season): void {
		const draft: SeasonDraft = {
			id:                     season.id,
			name:                   season.name,
			startDate:              new Date(season.startDate),
			endDate:                new Date(season.endDate),
			goal:                   season.goal,
			scoreModifierRules:     season.scoreModifierRules.map(rule => ({ ...rule })),
			winConditionRules:      season.winConditionRules.map(rule => ({ ...rule })),
			rankThresholds:         this.normalizeThresholds(season.rankThresholds),
			achievementTierRewards: this.normalizeAchievementRewards(season.achievementTierRewards),
		};

		this.setDraft(draft);
	}

	private createDraft(): void {
		if (this.saving)
			return;

		if (this.isDirty && !window.confirm('Discard unsaved changes and create a new season?'))
			return;

		this.applyNewDraft();
	}

	private applyNewDraft(): void {
		const latest = [ ...this.seasons ]
			.sort((left, right) => right.endDate.getTime() - left.endDate.getTime())[0];
		const startDate = latest ? new Date(latest.endDate) : new Date();
		const endDate = new Date(startDate);
		endDate.setUTCDate(endDate.getUTCDate() + 90);

		this.setDraft({
			name:                   '',
			startDate,
			endDate,
			goal:                   latest?.goal ?? 180,
			scoreModifierRules:     latest?.scoreModifierRules.map(rule => ({ ...rule })) ?? [],
			winConditionRules:      latest?.winConditionRules.map(rule => ({ ...rule })) ?? [],
			rankThresholds:         this.normalizeThresholds(latest?.rankThresholds),
			achievementTierRewards: this.normalizeAchievementRewards(latest?.achievementTierRewards),
		});
	}

	private setDraft(draft: SeasonDraft): void {
		this.draft = draft;
		this.originalDraft = this.serializeDraft(draft);
		this.validationErrors = [];
	}

	private normalizeThresholds(thresholds?: RankThreshold[]): RankThreshold[] {
		const byRank = new Map((thresholds ?? []).map(threshold => [ threshold.rank, threshold ]));

		return rankValues.map((rank, index) => ({
			rank,
			minimumMmr: byRank.get(rank)?.minimumMmr ?? defaultRankMinimums[index] ?? 0,
		}));
	}

	private normalizeAchievementRewards(
		rewards?: AchievementTierReward[],
	): AchievementTierReward[] {
		const byTier = new Map(
			(rewards ?? []).map(reward => [ reward.achievementTier, reward ]),
		);

		return achievementTiers.map(achievementTier => ({
			achievementTier,
			mmrReward: byTier.get(achievementTier)?.mmrReward
				?? defaultAchievementRewards[achievementTier],
		}));
	}

	private serializeDraft(draft: SeasonDraft): string {
		return JSON.stringify({
			...draft,
			startDate:          draft.startDate.toISOString(),
			endDate:            draft.endDate.toISOString(),
			scoreModifierRules: [ ...draft.scoreModifierRules ]
				.sort((left, right) => left.scoreModifier - right.scoreModifier),
			winConditionRules: [ ...draft.winConditionRules ]
				.sort((left, right) => left.winCondition - right.winCondition),
			rankThresholds: [ ...draft.rankThresholds ]
				.sort((left, right) => left.rank - right.rank),
			achievementTierRewards: [ ...draft.achievementTierRewards ]
				.sort((left, right) => left.achievementTier - right.achievementTier),
		});
	}

	private get isDirty(): boolean {
		return !!this.draft && this.serializeDraft(this.draft) !== this.originalDraft;
	}

	private handleBeforeUnload = (event: BeforeUnloadEvent): void => {
		if (!this.isDirty)
			return;

		event.preventDefault();
		event.returnValue = '';
	};

	private updateDraft(patch: Partial<SeasonDraft>): void {
		if (!this.draft)
			return;

		this.draft = { ...this.draft, ...patch };
		this.validationErrors = [];
	}

	private updateDate(field: 'startDate' | 'endDate', value: string): void {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime()))
			this.updateDraft({ [field]: date });
	}

	private toDateTimeLocal(date: Date): string {
		const offset = date.getTimezoneOffset() * 60_000;

		return new Date(date.getTime() - offset).toISOString().slice(0, 16);
	}

	private getStatus(season: Pick<Season, 'startDate' | 'endDate'>): 'Upcoming' | 'Active' | 'Finished' {
		const now = Date.now();
		if (season.startDate.getTime() > now)
			return 'Upcoming';
		if (season.endDate.getTime() <= now)
			return 'Finished';

		return 'Active';
	}

	private handleSeasonSelection(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const season = this.seasons.find(item => item.id === select.value);
		if (season)
			this.selectSeason(season);

		select.value = this.draft?.id ?? 'new';
	}

	private toggleScoreModifier(scoreModifier: ScoreModifier, checked: boolean): void {
		if (!this.draft)
			return;

		const rules = this.draft.scoreModifierRules.filter(
			rule => rule.scoreModifier !== scoreModifier,
		);

		if (checked) {
			const nextOrder = rules.length === 0
				? 0
				: Math.max(...rules.map(rule => rule.executionOrder)) + 1;
			rules.push({ scoreModifier, executionOrder: nextOrder });
		}

		this.updateDraft({ scoreModifierRules: rules });
	}

	private updateScoreModifierOrder(scoreModifier: ScoreModifier, executionOrder: number): void {
		if (!this.draft || !Number.isInteger(executionOrder))
			return;

		this.updateDraft({
			scoreModifierRules: this.draft.scoreModifierRules.map(rule =>
				rule.scoreModifier === scoreModifier
					? { ...rule, executionOrder }
					: rule),
		});
	}

	private toggleWinCondition(winCondition: WinCondition, checked: boolean): void {
		if (!this.draft)
			return;

		const rules = this.draft.winConditionRules.filter(
			rule => rule.winCondition !== winCondition,
		);
		if (checked)
			rules.push({ winCondition });

		this.updateDraft({ winConditionRules: rules });
	}

	private getThresholdErrors(thresholds: RankThreshold[]): string[] {
		const errors: string[] = [];
		const sortedThresholds = [ ...thresholds ]
			.sort((left, right) => left.rank - right.rank);
		if (sortedThresholds.some(
			threshold =>
				!Number.isFinite(threshold.minimumMmr)
				|| !Number.isInteger(threshold.minimumMmr)
				|| threshold.minimumMmr < 0,
		))
			errors.push('Rank thresholds must be non-negative whole numbers.');

		if (sortedThresholds.length !== rankValues.length)
			errors.push('Every rank must have exactly one threshold.');
		if (sortedThresholds[0]?.rank !== Rank.Bronze || sortedThresholds[0].minimumMmr !== 0)
			errors.push('Bronze must begin at 0 MMR.');

		for (let index = 1; index < sortedThresholds.length; index++) {
			const previous = sortedThresholds[index - 1];
			const current = sortedThresholds[index];
			if (!previous || !current || current.rank !== rankValues[index]) {
				errors.push('Rank thresholds are incomplete or out of order.');
				break;
			}
			if (current.minimumMmr <= previous.minimumMmr) {
				errors.push(
					`${ getRankDisplayValue(current.rank) } must start above ${ getRankDisplayValue(previous.rank) }.`,
				);
				break;
			}
		}

		return errors;
	}

	private async openRankThresholds(): Promise<void> {
		if (!this.draft)
			return;

		const thresholds = this.draft.rankThresholds
			.map(threshold => ({ ...threshold }))
			.sort((left, right) => left.rank - right.rank);

		try {
			await this.dialogService.open(
				html`
					<style>
						.rank-threshold-dialog {
							display: grid;
							grid-template-rows: auto minmax(0, 1fr);
							gap: 0.75rem;
							height: 100%;
							min-height: 0;
						}
						.rank-threshold-dialog > p {
							margin: 0;
							font-size: 0.82rem;
							opacity: 0.68;
						}
						.rank-threshold-dialog__list {
							display: grid;
							grid-template-columns: repeat(2, minmax(0, 1fr));
							align-content: start;
							gap: 0.55rem;
							min-height: 0;
							overflow-y: auto;
							padding: 0.15rem 0.35rem 0.35rem 0.15rem;
							scrollbar-width: thin;
						}
						.rank-threshold-dialog__row {
							display: grid;
							grid-template-columns: 36px minmax(110px, 1fr) minmax(90px, 0.65fr);
							align-items: center;
							gap: 0.55rem;
							padding: 0.55rem 0.65rem;
							background: #fff;
							border: 2px solid #000;
							border-radius: 10px;
						}
						.rank-threshold-dialog__row img {
							width: 34px;
							height: 34px;
							object-fit: contain;
						}
						.rank-threshold-dialog__row input {
							min-width: 0;
							padding: 0.5rem 0.6rem;
							background: #fff;
							border: 2px solid #000;
							border-radius: 8px;
							font: inherit;
						}
						.rank-threshold-dialog__row input:disabled {
							background: #ddd;
						}
						@media (max-width: 700px) {
							.rank-threshold-dialog__list {
								grid-template-columns: 1fr;
							}
						}
					</style>
					<button
						slot="footer"
						type="button"
						style="padding: 0.65rem 1.2rem; white-space: nowrap;"
						@click=${ (event: Event) =>
							(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
								new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
							) }
					>
						Cancel
					</button>
					<button
						slot="footer"
						type="button"
						style="padding: 0.65rem 1.2rem; background: #7df9ff; white-space: nowrap;"
						@click=${ (event: Event) => {
							const errors = this.getThresholdErrors(thresholds);
							if (errors.length > 0) {
								this.notificationService.addNotification({
									type:    'danger',
									message: errors[0],
								});

								return;
							}

							this.updateDraft({
								rankThresholds: thresholds.map(threshold => ({ ...threshold })),
							});
							(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
								new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
							);
						} }
					>
						Apply thresholds
					</button>
					<div class="rank-threshold-dialog">
						<p>
							Set the minimum MMR required for each rank. Values must increase in rank order.
						</p>
						<div class="rank-threshold-dialog__list">
							${ thresholds.map(threshold => html`
								<label class="rank-threshold-dialog__row">
									<img src=${ getRankIcon(threshold.rank) } alt="" />
									<strong>${ getRankDisplayValue(threshold.rank) }</strong>
									<input
										type="number"
										min="0"
										step="1"
										.value=${ String(threshold.minimumMmr) }
										?disabled=${ threshold.rank === Rank.Bronze }
										@input=${ (event: InputEvent) => {
											threshold.minimumMmr = Number(
												(event.currentTarget as HTMLInputElement).value,
											);
										} }
									/>
								</label>
							`) }
						</div>
					</div>
				`,
				{
					title:       'Rank thresholds',
					fixedHeight: true,
				},
			);
		}
		catch (error) {
			this.notificationService.addNotification({
				type:    'danger',
				message: error instanceof Error ? error.message : 'Unable to open rank thresholds.',
			});
		}
	}

	private getAchievementRewardErrors(rewards: AchievementTierReward[]): string[] {
		const errors: string[] = [];
		const tiers = rewards.map(reward => reward.achievementTier);
		if (
			rewards.length !== achievementTiers.length
			|| new Set(tiers).size !== achievementTiers.length
			|| achievementTiers.some(tier => !tiers.includes(tier))
		)
			errors.push('Every achievement tier must have exactly one MMR reward.');

		if (rewards.some(reward => !Number.isInteger(reward.mmrReward) || reward.mmrReward < 0))
			errors.push('Achievement MMR rewards must be non-negative whole numbers.');

		return errors;
	}

	private async openAchievementRewards(): Promise<void> {
		if (!this.draft)
			return;

		const rewards = this.draft.achievementTierRewards
			.map(reward => ({ ...reward }))
			.sort((left, right) => left.achievementTier - right.achievementTier);

		try {
			await this.dialogService.open(
				html`
					<style>
						.achievement-reward-dialog {
							display: grid;
							gap: 0.65rem;
						}
						.achievement-reward-dialog > p {
							margin: 0 0 0.15rem;
							font-size: 0.82rem;
							opacity: 0.68;
						}
						.achievement-reward-dialog__row {
							display: grid;
							grid-template-columns: 42px minmax(120px, 1fr) auto minmax(90px, 0.55fr);
							align-items: center;
							gap: 0.6rem;
							padding: 0.65rem 0.75rem;
							background: #fff;
							border: 2px solid #000;
							border-radius: 10px;
						}
						.achievement-reward-dialog__row img {
							width: 38px;
							height: 38px;
							object-fit: contain;
						}
						.achievement-reward-dialog__row span {
							font-size: 0.75rem;
							font-weight: 800;
							opacity: 0.65;
						}
						.achievement-reward-dialog__row input {
							min-width: 0;
							padding: 0.5rem 0.6rem;
							background: #fff;
							border: 2px solid #000;
							border-radius: 8px;
							font: inherit;
						}
						@media (max-width: 600px) {
							.achievement-reward-dialog__row {
								grid-template-columns: 38px 1fr;
							}
							.achievement-reward-dialog__row span,
							.achievement-reward-dialog__row input {
								grid-column: 2;
							}
						}
					</style>
					<button
						slot="footer"
						type="button"
						style="padding: 0.65rem 1.2rem; white-space: nowrap;"
						@click=${ (event: Event) =>
							(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
								new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
							) }
					>
						Cancel
					</button>
					<button
						slot="footer"
						type="button"
						style="padding: 0.65rem 1.2rem; background: #7df9ff; white-space: nowrap;"
						@click=${ (event: Event) => {
							const errors = this.getAchievementRewardErrors(rewards);
							if (errors.length > 0) {
								this.notificationService.addNotification({
									type:    'danger',
									message: errors[0],
								});

								return;
							}

							this.updateDraft({
								achievementTierRewards: rewards.map(reward => ({ ...reward })),
							});
							(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
								new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
							);
						} }
					>
						Apply rewards
					</button>
					<div class="achievement-reward-dialog">
						<p>Set the MMR granted when an achievement of each tier is unlocked.</p>
						${ rewards.map(reward => html`
							<label class="achievement-reward-dialog__row">
								<img
									src=${ getAchievementTierIcon(reward.achievementTier) }
									alt=""
								/>
								<strong>${ AchievementTier[reward.achievementTier] }</strong>
								<span>MMR reward</span>
								<input
									type="number"
									min="0"
									step="1"
									.value=${ String(reward.mmrReward) }
									@input=${ (event: InputEvent) => {
										reward.mmrReward = Number(
											(event.currentTarget as HTMLInputElement).value,
										);
									} }
								/>
							</label>
						`) }
					</div>
				`,
				{ title: 'Achievement MMR rewards' },
			);
		}
		catch (error) {
			this.notificationService.addNotification({
				type:    'danger',
				message: error instanceof Error ? error.message : 'Unable to open achievement rewards.',
			});
		}
	}

	private validateDraft(): string[] {
		if (!this.draft)
			return [ 'No season is selected.' ];

		const errors: string[] = [];
		if (!this.draft.name.trim())
			errors.push('Season name is required.');
		if (this.draft.startDate >= this.draft.endDate)
			errors.push('End date must be after the start date.');
		if (!Number.isInteger(this.draft.goal) || this.draft.goal <= 0)
			errors.push('Goal must be a positive whole number.');

		const overlappingSeason = this.seasons.find(season =>
			season.id !== this.draft?.id &&
			this.draft!.startDate < season.endDate &&
			this.draft!.endDate > season.startDate);
		if (overlappingSeason)
			errors.push(`Dates overlap ${ overlappingSeason.name }.`);

		errors.push(...this.getThresholdErrors(this.draft.rankThresholds));
		errors.push(...this.getAchievementRewardErrors(this.draft.achievementTierRewards));

		const executionOrders = this.draft.scoreModifierRules.map(rule => rule.executionOrder);
		if (executionOrders.some(order => order < 0))
			errors.push('Score-modifier execution orders cannot be negative.');
		if (new Set(executionOrders).size !== executionOrders.length)
			errors.push('Score-modifier execution orders must be unique.');

		return errors;
	}

	private discardChanges(): void {
		if (!this.draft)
			return;

		if (this.draft.id) {
			const season = this.seasons.find(item => item.id === this.draft?.id);
			if (season)
				this.selectSeasonWithoutConfirmation(season);
		}
		else {
			this.createDraftWithoutConfirmation();
		}
	}

	private selectSeasonWithoutConfirmation(season: Season): void {
		this.applySeason(season);
	}

	private createDraftWithoutConfirmation(): void {
		this.applyNewDraft();
	}

	private async save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!this.draft || this.saving)
			return;

		const errors = this.validateDraft();
		this.validationErrors = errors;
		if (errors.length > 0)
			return;

		const existingSeason = this.draft.id
			? this.seasons.find(season => season.id === this.draft?.id)
			: undefined;
		if (existingSeason && existingSeason.startDate <= new Date()) {
			const confirmed = window.confirm(
				'This season has already started. Saving can change live or historical configuration. Continue?',
			);
			if (!confirmed)
				return;
		}

		this.saving = true;
		try {
			const saved = this.draft.id
				? await this.seasonService.update(
					{ ...this.draft, id: this.draft.id },
					this.adminKey,
				)
				: await this.seasonService.create(this.draft, this.adminKey);

			const seasons = this.seasons.filter(season => season.id !== saved.id);
			seasons.push(saved);
			this.seasons = this.sortSeasons(seasons);
			this.selectSeasonWithoutConfirmation(saved);
			this.notificationService.addNotification({
				type:    'success',
				message: `Season ${ saved.name } saved.`,
			});
		}
		catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to save season.';
			this.validationErrors = [ message ];
			this.notificationService.addNotification({ type: 'danger', message });
		}
		finally {
			this.saving = false;
		}
	}

	private renderAccessGate(): TemplateResult {
		return html`
			<div class="access-shell">
				<form class="access-card" @submit=${ this.handleAccessSubmit }>
					<div class="access-icon"><i class="fa-solid fa-lock"></i></div>
					<h2>Season management</h2>
					<label>
						<span>Management key</span>
						<input
							type="password"
							autocomplete="current-password"
							.value=${ this.adminKey }
							@input=${ (event: InputEvent) => {
								this.adminKey = (event.currentTarget as HTMLInputElement).value;
								this.accessError = '';
							} }
							required
						/>
					</label>
					${ this.accessError ? html`<p class="form-error">${ this.accessError }</p>` : nothing }
					<button type="submit">Unlock editor</button>
				</form>
			</div>
		`;
	}

	private renderBasics(): TemplateResult {
		if (!this.draft)
			return html``;

		return html`
			<section class="editor-section">
				<div class="section-heading">
					<div>
						<span class="eyebrow">Schedule</span>
					</div>
					${ this.draft.id
						? html`
							<span class="status status--${ this.getStatus(this.draft).toLowerCase() }">
								${ this.getStatus(this.draft) }
							</span>
						`
						: html`<span class="status status--new">New</span>` }
				</div>

				<div class="field-grid">
					<label class="field">
						<span>Name</span>
						<input
							type="text"
							.value=${ this.draft.name }
							@input=${ (event: InputEvent) =>
								this.updateDraft({ name: (event.currentTarget as HTMLInputElement).value }) }
							required
						/>
					</label>

					<label class="field">
						<span>Starts</span>
						<input
							type="datetime-local"
							.value=${ this.toDateTimeLocal(this.draft.startDate) }
							@input=${ (event: InputEvent) =>
								this.updateDate('startDate', (event.currentTarget as HTMLInputElement).value) }
							required
						/>
					</label>

					<label class="field">
						<span>Ends</span>
						<input
							type="datetime-local"
							.value=${ this.toDateTimeLocal(this.draft.endDate) }
							@input=${ (event: InputEvent) =>
								this.updateDate('endDate', (event.currentTarget as HTMLInputElement).value) }
							required
						/>
					</label>

					<label class="field">
						<span>Game goal</span>
						<input
							type="number"
							min="1"
							step="1"
							.value=${ String(this.draft.goal) }
							@input=${ (event: InputEvent) =>
								this.updateDraft({ goal: Number((event.currentTarget as HTMLInputElement).value) }) }
							required
						/>
					</label>
				</div>
			</section>
		`;
	}

	private renderRules(): TemplateResult {
		if (!this.draft || !this.definitions)
			return html``;

		return html`
			<section class="editor-section">
				<div class="section-heading">
					<div>
						<span class="eyebrow">Gameplay</span>
						<h3>Season rules</h3>
					</div>
					<span class="section-count">
						${ this.draft.scoreModifierRules.length + this.draft.winConditionRules.length } selected
					</span>
				</div>

				<div class="rules-grid">
					<div class="rule-group">
						<h4>Score modifiers</h4>
						<p>Selected modifiers execute from the lowest order to the highest.</p>
						${ this.definitions.scoreModifiers.map(definition => {
							const scoreModifier = definition.value as ScoreModifier;
							const selected = this.draft?.scoreModifierRules.find(
								rule => rule.scoreModifier === scoreModifier,
							);

							return html`
								<article class="rule-card ${ selected ? 'selected' : '' }">
									<label class="rule-toggle">
										<input
											type="checkbox"
											.checked=${ !!selected }
											@change=${ (event: Event) =>
												this.toggleScoreModifier(
													scoreModifier,
													(event.currentTarget as HTMLInputElement).checked,
												) }
										/>
										<span>
											<strong>${ definition.name }</strong>
											<small>${ definition.description }</small>
										</span>
									</label>
									${ selected
										? html`
											<label class="order-field">
												<span>Order</span>
												<input
													type="number"
													min="0"
													step="1"
													.value=${ String(selected.executionOrder) }
													@input=${ (event: InputEvent) =>
														this.updateScoreModifierOrder(
															scoreModifier,
															Number((event.currentTarget as HTMLInputElement).value),
														) }
												/>
											</label>
										`
										: nothing }
								</article>
							`;
						}) }
					</div>

					<div class="rule-group">
						<h4>Win conditions</h4>
						<p>Every selected condition must be satisfied for a finish to count.</p>
						${ this.definitions.winConditions.map(definition => {
							const winCondition = definition.value as WinCondition;
							const selected = this.draft?.winConditionRules.some(
								rule => rule.winCondition === winCondition,
							);

							return html`
								<article class="rule-card ${ selected ? 'selected' : '' }">
									<label class="rule-toggle">
										<input
											type="checkbox"
											.checked=${ !!selected }
											@change=${ (event: Event) =>
												this.toggleWinCondition(
													winCondition,
													(event.currentTarget as HTMLInputElement).checked,
												) }
										/>
										<span>
											<strong>${ definition.name }</strong>
											<small>${ definition.description }</small>
										</span>
									</label>
								</article>
							`;
						}) }
					</div>
				</div>
			</section>
		`;
	}

	private renderRanks(): TemplateResult {
		if (!this.draft)
			return html``;

		return html`
			<section class="editor-section">
				<div class="section-heading">
					<div>
						<span class="eyebrow">Progression</span>
						<h3>Rank thresholds</h3>
					</div>
				</div>
				<div class="progression-settings">
					<div class="rank-summary">
						<div class="rank-summary__icons" aria-hidden="true">
							${ [ Rank.Bronze, Rank.Silver, Rank.Gold, Rank.Platinum, Rank.Diamond ]
								.map(rank => html`<img src=${ getRankIcon(rank) } alt="" />`) }
						</div>
						<div class="rank-summary__copy">
							<strong>Season rank ladder</strong>
						</div>
						<button type="button" class="secondary-button" @click=${ this.openRankThresholds }>
							Edit thresholds
						</button>
					</div>

					<div class="rank-summary">
						<div class="rank-summary__icons" aria-hidden="true">
							${ achievementTiers.map(tier =>
								html`<img src=${ getAchievementTierIcon(tier) } alt="" />`) }
						</div>
						<div class="rank-summary__copy">
							<strong>Achievement MMR rewards</strong>
						</div>
						<button type="button" class="secondary-button" @click=${ this.openAchievementRewards }>
							Edit rewards
						</button>
					</div>
				</div>
			</section>
		`;
	}

	private renderEditor(): TemplateResult {
		if (!this.draft)
			return html`<section class="empty-editor">Select or create a season.</section>`;

		return html`
			<form class="season-editor" @submit=${ this.save }>
				<header class="editor-header">
					<div class="season-selector">
						<span class="eyebrow">${ this.draft.id ? 'Editing season' : 'Creating season' }</span>
						<div class="season-selector__controls">
							<select
								aria-label="Select season"
								.value=${ this.draft.id ?? 'new' }
								?disabled=${ this.saving }
								@change=${ this.handleSeasonSelection }
							>
								${ !this.draft.id
									? html`<option value="new">New season</option>`
									: nothing }
								${ this.seasons.map(season => html`
									<option value=${ season.id }>${ season.name }</option>
								`) }
							</select>
							<button
								type="button"
								class="new-button icon-button"
								aria-label="Create new season"
								title="Create new season"
								?disabled=${ this.saving }
								@click=${ this.createDraft }
							>
								<span aria-hidden="true">+</span>
							</button>
						</div>
					</div>
					<div class="editor-header-actions">
						<button
							type="button"
							class="secondary-button"
							?disabled=${ this.saving }
							@click=${ this.lock }
						>
							<i class="fa-solid fa-lock"></i>
							Lock
						</button>
					</div>
				</header>

				${ this.renderBasics() }
				${ this.renderRules() }
				${ this.renderRanks() }

				<footer class="save-bar">
					<div>
						${ this.validationErrors.map(error => html`<p class="form-error">${ error }</p>`) }
						${ this.isDirty
							? html`<span class="dirty-indicator">Unsaved changes</span>`
							: html`<span class="saved-indicator">All changes saved</span>` }
					</div>
					<div class="save-actions">
						<button
							type="button"
							class="secondary-button"
							?disabled=${ !this.isDirty || this.saving }
							@click=${ this.discardChanges }
						>
							Discard
						</button>
						<button type="submit" ?disabled=${ !this.isDirty || this.saving }>
							${ this.saving ? 'Saving...' : 'Save season' }
						</button>
					</div>
				</footer>
			</form>
		`;
	}

	override render(): TemplateResult {
		if (this.loading) {
			return html`
				<aa-loading-state loading label="Loading season management"></aa-loading-state>
			`;
		}

		if (!this.accessGranted)
			return this.renderAccessGate();

		return html`
			<main class="management-shell">
				${ this.renderEditor() }
			</main>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
				min-height: 100%;
				background: #f5f3ff;
			}

			button,
			input {
				font: inherit;
			}

			button {
				border: 2px solid #000;
				border-radius: 10px;
				background: #7df9ff;
				box-shadow: 3px 3px 0 #000;
				padding: 0.55rem 0.8rem;
				font-weight: 900;
				cursor: pointer;
			}

			button:disabled {
				opacity: 0.45;
				cursor: not-allowed;
			}

			button:focus-visible,
			input:focus-visible {
				outline: 3px solid #ff8c00;
				outline-offset: 2px;
			}

			.access-shell {
				display: grid;
				min-height: calc(100dvh - 7rem);
				place-items: center;
				padding: 1rem;
			}

			.access-card {
				display: grid;
				width: min(430px, 100%);
				gap: 0.9rem;
				padding: 1.4rem;
				background: #fffaf3;
				border: 3px solid #000;
				border-radius: 20px;
				box-shadow: 8px 8px 0 #000;
			}

			.access-icon {
				display: grid;
				width: 52px;
				height: 52px;
				place-items: center;
				background: #ffd7e5;
				border: 3px solid #000;
				border-radius: 50%;
				font-size: 1.3rem;
			}

			.access-card h2,
			.access-card p {
				margin: 0;
			}

			.access-card label,
			.field {
				display: grid;
				gap: 0.35rem;
				font-weight: 900;
			}

			.access-card input,
			.field input,
			.order-field input {
				min-width: 0;
				padding: 0.55rem 0.65rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 9px;
			}

			.management-shell {
				width: min(1400px, 100%);
				margin: 0 auto;
				padding: 1rem;
			}

			.season-editor,
			.empty-editor {
				background: #fffaf3;
				border: 3px solid #000;
				border-radius: 18px;
				box-shadow: 6px 6px 0 #000;
			}

			.editor-header,
			.section-heading,
			.save-bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
			}

			.editor-header {
				padding: 0.85rem 1rem;
				border-bottom: 2px solid #000;
			}

			.section-heading h3,
			.rule-group h4 {
				margin: 0;
			}

			.eyebrow {
				display: block;
				margin-bottom: 0.12rem;
				font-size: 0.68rem;
				font-weight: 900;
				letter-spacing: 0.08em;
				opacity: 0.58;
				text-transform: uppercase;
			}

			.new-button,
			.secondary-button {
				background: #fff;
			}

			.season-selector {
				display: grid;
				gap: 0.2rem;
				min-width: min(420px, 65vw);
			}

			.season-selector__controls {
				display: grid;
				grid-template-columns: minmax(180px, 1fr) auto;
				gap: 0.55rem;
			}

			.season-selector select {
				min-width: 0;
				padding: 0.55rem 0.7rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 10px;
				box-shadow: 3px 3px 0 #000;
				font: inherit;
				font-weight: 900;
			}

			.icon-button {
				display: grid;
				width: 44px;
				place-items: center;
				font-size: 1.45rem;
				line-height: 1;
			}

			.status,
			.section-count {
				width: fit-content;
				padding: 0.12rem 0.48rem;
				border: 1.5px solid #000;
				border-radius: 999px;
				background: #fff;
				font-size: 0.68rem;
				font-weight: 900;
			}

			.status--active {
				background: #dff362;
			}

			.status--upcoming,
			.status--new {
				background: #7df9ff;
			}

			.status--finished {
				background: #ddd;
			}

			.season-editor {
				min-width: 0;
				overflow: hidden;
			}

			.editor-section {
				display: grid;
				gap: 0.8rem;
				padding: 1rem;
				border-bottom: 2px dashed rgba(0, 0, 0, 0.35);
			}

			.field-grid {
				display: grid;
				grid-template-columns: minmax(180px, 1.35fr) repeat(3, minmax(150px, 1fr));
				gap: 0.8rem;
			}

			.rules-grid {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.8rem;
			}

			.rule-group {
				display: grid;
				align-content: start;
				gap: 0.6rem;
				padding: 0.8rem;
				background: #f5f3ff;
				border: 2px solid #000;
				border-radius: 13px;
			}

			.rule-group > p,
			.section-intro {
				margin: 0;
				font-size: 0.8rem;
				opacity: 0.68;
			}

			.rule-card {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
				padding: 0.65rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 10px;
			}

			.rule-card.selected {
				background: #e5fbe7;
			}

			.rule-toggle {
				display: flex;
				align-items: flex-start;
				gap: 0.55rem;
				min-width: 0;
				cursor: pointer;
			}

			.rule-toggle input {
				width: 18px;
				height: 18px;
				margin-top: 0.1rem;
				accent-color: #000;
			}

			.rule-toggle span {
				display: grid;
				gap: 0.15rem;
			}

			.rule-toggle small {
				font-size: 0.75rem;
				opacity: 0.68;
			}

			.order-field {
				display: grid;
				gap: 0.2rem;
				flex: 0 0 72px;
				font-size: 0.68rem;
				font-weight: 900;
			}

			.progression-settings {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.7rem;
			}

			.rank-summary {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.55rem;
				padding: 0.7rem 0.8rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 12px;
			}

			.rank-summary__icons {
				display: flex;
				flex: 0 0 auto;
			}

			.rank-summary__icons img {
				width: 36px;
				height: 36px;
				margin-left: -8px;
				object-fit: contain;
			}

			.rank-summary__icons img:first-child {
				margin-left: 0;
			}

			.rank-summary__copy {
				display: grid;
				flex: 1 1 auto;
				gap: 0.15rem;
				min-width: 0;
			}

			.rank-summary__copy span {
				font-size: 0.78rem;
				opacity: 0.68;
			}

			.save-bar {
				position: sticky;
				bottom: 0;
				z-index: 2;
				padding: 0.85rem 1rem;
				background: #fff;
				border-top: 3px solid #000;
			}

			.save-actions {
				display: flex;
				gap: 0.6rem;
			}

			.form-error {
				margin: 0.15rem 0;
				color: #9b1c31;
				font-size: 0.78rem;
				font-weight: 900;
			}

			.dirty-indicator,
			.saved-indicator {
				font-size: 0.75rem;
				font-weight: 900;
			}

			.dirty-indicator {
				color: #9b4f00;
			}

			.saved-indicator {
				color: #367c2b;
			}

			.empty-editor {
				display: grid;
				min-height: 360px;
				place-items: center;
			}

			@media (max-width: 900px) {
				.field-grid {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}

				.progression-settings {
					grid-template-columns: 1fr;
				}
			}

			@media (max-width: 700px) {
				.management-shell {
					padding: 0.65rem;
				}

				.field-grid,
				.rules-grid {
					grid-template-columns: 1fr;
				}

				.rank-summary {
					align-items: stretch;
					flex-direction: column;
				}

				.save-bar,
				.editor-header {
					align-items: stretch;
					flex-direction: column;
				}

				.save-actions {
					display: grid;
					grid-template-columns: 1fr 1fr;
				}
			}
		`,
	];

}
