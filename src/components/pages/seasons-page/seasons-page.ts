import '../../aa-loading-state/aa-loading-state.js';
import '../../rank-display/aa-rank-display.js';
import '../../season-basics-editor/season-basics-editor.js';
import '../../season-configuration-list/season-configuration-list.js';
import './seasons-page-dialogs.css';
import '../../../ui/button/aa-button.js';
import '../../../ui/error-state/aa-error-state.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAchievementTierIcon } from '../../../helpers/achievementHelper.js';
import {
	AchievementTier,
	ScoreModifier,
	WinCondition,
} from '../../../models/enums.js';
import {
	defaultMmrConfiguration,
	validateMmrConfiguration,
} from '../../../models/mmr.js';
import {
	getRankDisplayValue,
	getRankIcon,
	Rank,
} from '../../../models/rank.js';
import {
	AchievementTierReward,
	RankThreshold,
	RuleDefinitionsResponse,
	ScoreModifierRule,
	Season,
} from '../../../models/schemas.js';
import { DialogService } from '../../../services/dialogService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { RuleService } from '../../../services/ruleService.js';
import {
	SeasonConfigurationInput,
	SeasonService,
} from '../../../services/seasonService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import type { AaButton } from '../../../ui/button/aa-button.js';
import type { AaMmrConfigurationEditor } from '../../aa-mmr-configuration-editor/aa-mmr-configuration-editor.js';
import type {
	SeasonBasicsChangeEvent,
	SeasonBasicsValue,
} from '../../season-basics-editor/season-basics-editor.js';
import type {
	SeasonConfigurationItemActivateEvent,
	SeasonConfigurationListItem,
} from '../../season-configuration-list/season-configuration-list.js';
import seasonsPageStyles from './seasons-page.css?inline';

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
const defaultAchievementCapIncreases: Record<AchievementTier, number> = {
	[AchievementTier.bronze]:   1,
	[AchievementTier.silver]:   1,
	[AchievementTier.gold]:     1,
	[AchievementTier.platinum]: 2,
	[AchievementTier.diamond]:  2,
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
	@state() private loadError = '';
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
		this.loading = true;
		this.loadError = '';
		const storedKey = sessionStorage.getItem(managementKeyStorage);

		try {
			await this.loadConfiguration();
		}
		catch (error) {
			this.loadError = error instanceof Error
				? error.message
				: 'Unable to load season configuration.';
			this.loading = false;

			return;
		}

		if (storedKey) {
			this.adminKey = storedKey;
			try {
				await this.seasonService.verifyManagementAccess(storedKey);
				this.accessGranted = true;
			}
			catch {
				sessionStorage.removeItem(managementKeyStorage);
				this.adminKey = '';
				this.accessGranted = false;
			}
		}

		this.loading = false;
	}

	private lock(): void {
		sessionStorage.removeItem(managementKeyStorage);
		this.adminKey = '';
		this.accessGranted = false;
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
			mmrConfiguration:       { ...season.mmrConfiguration },
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
			mmrConfiguration:       {
				...(latest?.mmrConfiguration ?? defaultMmrConfiguration),
			},
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
			mmrCapIncrease: byTier.get(achievementTier)?.mmrCapIncrease
				?? defaultAchievementCapIncreases[achievementTier],
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

	private handleSeasonSelection(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const season = this.seasons.find(item => item.id === select.value);
		if (season)
			this.selectSeason(season);

		select.value = this.draft?.id ?? 'new';
	}

	private getRuleNames(
		values: number[],
		definitions: RuleDefinitionsResponse['scoreModifiers'],
	): string {
		const names = values
			.map(value => definitions.find(definition => definition.value === value)?.name)
			.filter((name): name is string => !!name);

		return names.length > 0 ? names.join(', ') : 'None selected';
	}

	private getScoreModifierErrors(rules: ScoreModifierRule[]): string[] {
		const executionOrders = rules.map(rule => rule.executionOrder);
		if (executionOrders.some(order => !Number.isInteger(order) || order < 0))
			return [ 'Score-modifier execution orders must be non-negative whole numbers.' ];
		if (new Set(executionOrders).size !== executionOrders.length)
			return [ 'Score-modifier execution orders must be unique.' ];

		return [];
	}

	private closeDialog(event: Event): void {
		(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
			new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
		);
	}

	private async openScoreModifiers(): Promise<void> {
		if (!this.draft || !this.definitions)
			return;

		const rules = this.draft.scoreModifierRules.map(rule => ({ ...rule }));

		try {
			await this.dialogService.open(
				html`
					<aa-button
						slot="footer-secondary"
						type="button"
						variant="secondary"
						@click=${ this.closeDialog }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
						@click=${ (event: Event) => {
							const errors = this.getScoreModifierErrors(rules);
							if (errors.length > 0) {
								this.notificationService.addNotification({
									type:    'danger',
									message: errors[0],
								});

								return;
							}

							this.updateDraft({
								scoreModifierRules: rules.map(rule => ({ ...rule })),
							});
							this.closeDialog(event);
						} }
					>
						Apply modifiers
					</aa-button>
					<div class="rule-dialog score-modifiers-dialog">
						<p>Selected modifiers execute from the lowest order to the highest.</p>
						${ this.definitions.scoreModifiers.map(definition => {
							const scoreModifier = definition.value as ScoreModifier;
							const selected = rules.find(rule => rule.scoreModifier === scoreModifier);

							return html`
								<article class="rule-dialog__card ${ selected ? 'selected' : '' }">
									<input
										type="checkbox"
										aria-label=${ `Select ${ definition.name }` }
										.checked=${ !!selected }
										@change=${ (event: Event) => {
											const checkbox = event.currentTarget as HTMLInputElement;
											const card = checkbox.closest('.rule-dialog__card');
											const orderInput = card?.querySelector<HTMLInputElement>(
												'.rule-dialog__order input',
											);
											const existingIndex = rules.findIndex(
												rule => rule.scoreModifier === scoreModifier,
											);

											if (checkbox.checked && existingIndex < 0) {
												const nextOrder = rules.length === 0
													? 0
													: Math.max(...rules.map(rule => rule.executionOrder)) + 1;
												rules.push({ scoreModifier, executionOrder: nextOrder });
												if (orderInput)
													orderInput.value = String(nextOrder);
											}
											else if (!checkbox.checked && existingIndex >= 0) {
												rules.splice(existingIndex, 1);
											}

											card?.classList.toggle('selected', checkbox.checked);
											if (orderInput)
												orderInput.disabled = !checkbox.checked;
										} }
									/>
									<span class="rule-dialog__copy">
										<strong>${ definition.name }</strong>
										<small>${ definition.description }</small>
									</span>
									<label class="rule-dialog__order">
										<span>Order</span>
										<input
											type="number"
											min="0"
											step="1"
											.value=${ String(selected?.executionOrder ?? 0) }
											?disabled=${ !selected }
											@input=${ (event: InputEvent) => {
												const rule = rules.find(
													item => item.scoreModifier === scoreModifier,
												);
												if (rule) {
rule.executionOrder = Number(
														(event.currentTarget as HTMLInputElement).value,
													);
}
											} }
										/>
									</label>
								</article>
							`;
						}) }
					</div>
				`,
				{ title: 'Score modifiers' },
			);
		}
		catch (error) {
			this.notificationService.addNotification({
				type:    'danger',
				message: error instanceof Error ? error.message : 'Unable to open score modifiers.',
			});
		}
	}

	private async openWinConditions(): Promise<void> {
		if (!this.draft || !this.definitions)
			return;

		const rules = this.draft.winConditionRules.map(rule => ({ ...rule }));

		try {
			await this.dialogService.open(
				html`
					<aa-button
						slot="footer-secondary"
						type="button"
						variant="secondary"
						@click=${ this.closeDialog }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
						@click=${ (event: Event) => {
							this.updateDraft({
								winConditionRules: rules.map(rule => ({ ...rule })),
							});
							this.closeDialog(event);
						} }
					>
						Apply conditions
					</aa-button>
					<div class="rule-dialog win-conditions-dialog">
						<p>Every selected condition must be satisfied for a finish to count.</p>
						${ this.definitions.winConditions.map(definition => {
							const winCondition = definition.value as WinCondition;
							const selected = rules.some(rule => rule.winCondition === winCondition);

							return html`
								<label class="rule-dialog__card ${ selected ? 'selected' : '' }">
									<input
										type="checkbox"
										.checked=${ selected }
										@change=${ (event: Event) => {
											const checkbox = event.currentTarget as HTMLInputElement;
											const existingIndex = rules.findIndex(
												rule => rule.winCondition === winCondition,
											);

											if (checkbox.checked && existingIndex < 0)
												rules.push({ winCondition });
											else if (!checkbox.checked && existingIndex >= 0)
												rules.splice(existingIndex, 1);

											checkbox.closest('.rule-dialog__card')?.classList.toggle(
												'selected',
												checkbox.checked,
											);
										} }
									/>
									<span class="rule-dialog__copy">
										<strong>${ definition.name }</strong>
										<small>${ definition.description }</small>
									</span>
								</label>
							`;
						}) }
					</div>
				`,
				{ title: 'Win conditions' },
			);
		}
		catch (error) {
			this.notificationService.addNotification({
				type:    'danger',
				message: error instanceof Error ? error.message : 'Unable to open win conditions.',
			});
		}
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
					<aa-button
						slot="footer-secondary"
						type="button"
						variant="secondary"
						@click=${ (event: Event) =>
							(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
								new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
							) }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
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
					</aa-button>
					<div class="rank-threshold-dialog">
						<p>
							Set the minimum MMR required for each rank. Values must increase in rank order.
						</p>
						<div class="rank-threshold-dialog__list">
							${ thresholds.map(threshold => html`
								<label class="rank-threshold-dialog__row">
									<aa-rank-display
										compact
										.rank=${ threshold.rank }
									></aa-rank-display>
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
		if (rewards.some(reward =>
			!Number.isInteger(reward.mmrCapIncrease)
			|| reward.mmrCapIncrease < 0
			|| reward.mmrCapIncrease > 100))
			errors.push('Achievement MMR cap increases must be whole numbers from 0 to 100.');

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
					<aa-button
						slot="footer-secondary"
						type="button"
						variant="secondary"
						@click=${ (event: Event) =>
							(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
								new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
							) }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
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
						Apply settings
					</aa-button>
					<div class="achievement-reward-dialog">
						<p>
							Set the immediate MMR reward and permanent gain-cap increase
							for each achievement tier.
						</p>
						${ rewards.map(reward => html`
							<div class="achievement-reward-dialog__row">
								<img
									src=${ getAchievementTierIcon(reward.achievementTier) }
									alt=""
								/>
								<strong>${ AchievementTier[reward.achievementTier] }</strong>
								<label class="achievement-reward-dialog__field">
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
								<label class="achievement-reward-dialog__field">
									<span>MMR cap increase</span>
									<input
										type="number"
										min="0"
										max="100"
										step="1"
										.value=${ String(reward.mmrCapIncrease) }
										@input=${ (event: InputEvent) => {
											reward.mmrCapIncrease = Number(
												(event.currentTarget as HTMLInputElement).value,
											);
										} }
									/>
								</label>
							</div>
						`) }
					</div>
				`,
				{ title: 'Achievement MMR settings' },
			);
		}
		catch (error) {
			this.notificationService.addNotification({
				type:    'danger',
				message: error instanceof Error ? error.message : 'Unable to open achievement rewards.',
			});
		}
	}

	private async openMmrConfiguration(): Promise<void> {
		if (!this.draft)
			return;

		try {
			await this.dialogService.open(
				html`
					<aa-button
						slot="footer-secondary"
						type="button"
						variant="secondary"
						@click=${ (event: Event) =>
							(event.currentTarget as HTMLElement).closest('aa-dialog')?.dispatchEvent(
								new CustomEvent('dialog-closed', { bubbles: true, composed: true }),
							) }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
						@click=${ (event: Event) => {
							const dialog = (event.currentTarget as HTMLElement).closest('aa-dialog');
							const editor = dialog?.querySelector(
								'aa-mmr-configuration-editor',
							) as AaMmrConfigurationEditor | null;
							const errors = editor?.getErrors() ?? [ 'MMR editor is unavailable.' ];
							if (errors.length > 0) {
								this.notificationService.addNotification({
									type:    'danger',
									message: errors[0],
								});

								return;
							}

							this.updateDraft({
								mmrConfiguration: editor!.getConfiguration(),
							});
							dialog?.dispatchEvent(new CustomEvent(
								'dialog-closed',
								{ bubbles: true, composed: true },
							));
						} }
					>
						Apply MMR settings
					</aa-button>
					<aa-mmr-configuration-editor
						.configuration=${ { ...this.draft.mmrConfiguration } }
						.goal=${ this.draft.goal }
						.rankThresholds=${ this.draft.rankThresholds.map(
							threshold => ({ ...threshold }),
						) }
					></aa-mmr-configuration-editor>
				`,
				{
					title:       'MMR calculation',
					fixedHeight: true,
					large:       true,
				},
			);
		}
		catch (error) {
			this.notificationService.addNotification({
				type:    'danger',
				message: error instanceof Error ? error.message : 'Unable to open MMR settings.',
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
		errors.push(...validateMmrConfiguration(this.draft.mmrConfiguration));

		errors.push(...this.getScoreModifierErrors(this.draft.scoreModifierRules));

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

	private async attemptSave(): Promise<void> {
		if (!this.draft || this.saving)
			return;

		const errors = this.validateDraft();
		this.validationErrors = errors;
		if (errors.length > 0)
			return;

		if (!this.accessGranted) {
			const unlocked = await this.openUnlockSavingDialog();
			if (!unlocked)
				return;
		}

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
			if (
				/admin key|access denied|X-Season-Admin-Key|SEASON_ADMIN_KEY|401|403|unauthorized|forbidden/i
					.test(message)
			)
				this.lock();
		}
		finally {
			this.saving = false;
		}
	}

	private async save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const basicsEditor = this.renderRoot.querySelector('aa-season-basics-editor');
		if (basicsEditor && !basicsEditor.reportValidity())
			return;

		await this.attemptSave();
	}

	private async openUnlockSavingDialog(): Promise<boolean> {
		const formId = 'season-unlock-saving-form';
		const result = await this.dialogService.open<boolean>(
			html`
				<aa-button
					slot="footer-secondary"
					type="button"
					variant="secondary"
					@click=${ this.closeDialog }
				>
					Cancel
				</aa-button>
				<aa-button
					slot="footer-primary"
					type="submit"
					variant="primary"
					form=${ formId }
				>
					Unlock & save
				</aa-button>
				<form
					id=${ formId }
					class="unlock-dialog"
					@submit=${ async (event: SubmitEvent) => {
						event.preventDefault();
						const form = event.currentTarget as HTMLFormElement;
						const dialog = form.closest('aa-dialog');
						const input = form.elements.namedItem('management-key') as HTMLInputElement;
						const errorElement = form.querySelector<HTMLElement>('.error');
						const submitButton = dialog?.querySelector<AaButton>(
							`aa-button[form="${ formId }"]`,
						);
						const key = input.value;

						input.disabled = true;
						if (submitButton) {
							submitButton.disabled = true;
							submitButton.loading = true;
						}
						if (errorElement)
							errorElement.textContent = '';

						try {
							await this.seasonService.verifyManagementAccess(key);
							if (!dialog?.isConnected)
								return;

							this.adminKey = key;
							this.accessGranted = true;
							sessionStorage.setItem(managementKeyStorage, key);
							dialog?.dispatchEvent(new CustomEvent('dialog-closed', {
								bubbles:  true,
								composed: true,
								detail:   { result: true },
							}));
						}
						catch (error) {
							this.accessGranted = false;
							sessionStorage.removeItem(managementKeyStorage);
							if (errorElement) {
								errorElement.textContent = error instanceof Error
									? error.message
									: 'Unable to unlock season saving.';
							}

							input.disabled = false;
							input.select();
							if (submitButton) {
								submitButton.disabled = false;
								submitButton.loading = false;
							}
						}
					} }
				>
					<p>Enter the management code to save these sandbox changes.</p>
					<p>Your draft stays unchanged if the code is incorrect.</p>
					<label>
						<span>Management code</span>
						<input
							name="management-key"
							type="password"
							autocomplete="current-password"
							.value=${ this.adminKey }
							data-autofocus
							required
						/>
					</label>
					<p class="error" aria-live="polite"></p>
				</form>
			`,
			{ title: 'Unlock saving' },
		);

		return result === true;
	}

	private handleBasicsChange(event: SeasonBasicsChangeEvent): void {
		const change = event.detail;
		switch (change.field) {
		case 'name':
			this.updateDraft({ name: change.value });
			break;
		case 'startDate':
			this.updateDraft({ startDate: change.value });
			break;
		case 'endDate':
			this.updateDraft({ endDate: change.value });
			break;
		case 'goal':
			this.updateDraft({ goal: change.value });
			break;
		}
	}

	private getConfigurationItems(): SeasonConfigurationListItem[] {
		if (!this.draft || !this.definitions)
			return [];

		const scoreModifierNames = this.getRuleNames(
			this.draft.scoreModifierRules.map(rule => rule.scoreModifier),
			this.definitions.scoreModifiers,
		);
		const winConditionNames = this.getRuleNames(
			this.draft.winConditionRules.map(rule => rule.winCondition),
			this.definitions.winConditions,
		);

		return [
			{
				id:    'score-modifiers',
				title: 'Score modifiers',
				summary:
					`${ this.draft.scoreModifierRules.length } selected · ${ scoreModifierNames }`,
				activateLabel: 'Configure score modifiers',
			},
			{
				id:    'win-conditions',
				title: 'Win conditions',
				summary:
					`${ this.draft.winConditionRules.length } selected · ${ winConditionNames }`,
				activateLabel: 'Configure win conditions',
			},
			{
				id:            'rank-thresholds',
				title:         'Season rank ladder',
				summary:       `${ this.draft.rankThresholds.length } rank thresholds`,
				activateLabel: 'Configure rank thresholds',
				previewImages: [
					Rank.Platinum,
					Rank.Diamond,
					Rank.Wizard,
					Rank.Mythic,
					Rank.Grandmaster,
				].map(rank => ({ src: getRankIcon(rank) })),
			},
			{
				id:            'achievement-rewards',
				title:         'Achievement MMR settings',
				summary:       `${ this.draft.achievementTierRewards.length } achievement tiers`,
				activateLabel: 'Configure achievement MMR settings',
				previewImages: achievementTiers.map(tier => ({
					src: getAchievementTierIcon(tier),
				})),
			},
			{
				id:            'mmr-calculation',
				title:         'MMR calculation',
				summary:       '',
				activateLabel: 'Configure MMR calculation',
			},
		];
	}

	private handleConfigurationItemActivate(
		event: SeasonConfigurationItemActivateEvent,
	): void {
		switch (event.detail) {
		case 'score-modifiers':
			void this.openScoreModifiers();
			break;
		case 'win-conditions':
			void this.openWinConditions();
			break;
		case 'rank-thresholds':
			void this.openRankThresholds();
			break;
		case 'achievement-rewards':
			void this.openAchievementRewards();
			break;
		case 'mmr-calculation':
			void this.openMmrConfiguration();
			break;
		}
	}

	private renderEditor(): TemplateResult {
		if (!this.draft)
			return html`<section class="empty-editor">Select or create a season.</section>`;

		return html`
			<form class="season-editor" @submit=${ this.save }>
				<div class="mode-banner ${ this.accessGranted ? 'mode-banner--unlocked' : '' }">
					<div class="mode-banner__status">
						<i class="fa-solid ${ this.accessGranted ? 'fa-lock-open' : 'fa-flask' }"></i>
						<div>
							<strong>${ this.accessGranted ? 'Saving unlocked' : 'Sandbox mode' }</strong>
							<span>
								${ this.accessGranted
									? 'Changes can be saved to the live season configuration.'
									: 'No changes will be saved.' }
							</span>
						</div>
					</div>
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
							<aa-button
								type="button"
								class="icon-button"
								variant="secondary"
								aria-label="Create new season"
								title="Create new season"
								?disabled=${ this.saving }
								@click=${ this.createDraft }
							>
								<span aria-hidden="true">+</span>
							</aa-button>
						</div>
					</div>
				</div>

				<aa-season-basics-editor
					.value=${ {
						name:      this.draft.name,
						startDate: this.draft.startDate,
						endDate:   this.draft.endDate,
						goal:      this.draft.goal,
					} satisfies SeasonBasicsValue }
					@season-basics-change=${ this.handleBasicsChange }
				></aa-season-basics-editor>
				<aa-season-configuration-list
					.items=${ this.getConfigurationItems() }
					@season-configuration-item-activate=${ this.handleConfigurationItemActivate }
				></aa-season-configuration-list>

				<footer class="save-bar">
					<div>
						${ this.validationErrors.map(error => html`<p class="form-error">${ error }</p>`) }
						${ this.isDirty
							? html`<span class="dirty-indicator">
								${ this.accessGranted ? 'Unsaved changes' : 'Unsaved sandbox changes' }
							</span>`
							: nothing }
					</div>
					<div class="save-actions">
						${ this.accessGranted
							? html`
								<aa-button
									type="button"
									variant="ghost"
									?disabled=${ this.saving }
									@click=${ this.lock }
								>
									<i class="fa-solid fa-lock"></i>
									Lock saving
								</aa-button>
							`
							: nothing }
						<aa-button
							type="button"
							variant="danger"
							?disabled=${ !this.isDirty || this.saving }
							@click=${ this.discardChanges }
						>
							Discard
						</aa-button>
						<aa-button type="submit" ?disabled=${ !this.isDirty || this.saving }>
							${ this.saving
								? 'Saving...'
								: this.accessGranted ? 'Save season' : 'Unlock & save' }
						</aa-button>
					</div>
				</footer>
			</form>
		`;
	}

	override render(): TemplateResult {
		if (this.loading) {
			return html`
				<aa-loading-state loading label="Loading season workshop"></aa-loading-state>
			`;
		}

		if (this.loadError) {
			return html`
				<div class="access-shell">
					<aa-error-state
						class="load-error"
						title="Unable to load seasons"
						message=${ this.loadError }
					>
						<i slot="icon" class="fa-solid fa-triangle-exclamation"></i>
						<aa-button
							slot="actions"
							type="button"
							variant="primary"
							@click=${ this.initialize }
						>
							Try again
						</aa-button>
					</aa-error-state>
				</div>
			`;
		}

		return html`
			<main class="management-shell">
				${ this.renderEditor() }
			</main>
		`;
	}

	static override styles = [ sharedStyles, unsafeCSS(seasonsPageStyles) ];

}
