import '../../aa-loading-state/aa-loading-state.js';
import '../../rank-display/aa-rank-display.js';
import '../../season-basics-editor/season-basics-editor.js';
import '../../season-configuration-list/season-configuration-list.js';
import './seasons-page-dialogs.css';
import '../../../ui/button/aa-button.js';
import '../../../ui/error-state/aa-error-state.js';

import { Router } from '@vaadin/router';
import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { getAchievementTierIcon } from '../../../helpers/achievementHelper.js';
import { getErrorMessage } from '../../../helpers/getErrorMessage.js';
import {
	createDraftFromSeason,
	createNewSeasonDraft,
	findCurrentSeason,
	type GameConstraintRuleDraft,
	getAchievementRewardErrors,
	getGameConstraintErrors,
	getGameConstraintSummary,
	getRuleNames,
	getScoreModifierErrors,
	getThresholdErrors,
	isManagementAccessError,
	type SeasonDraft,
	serializeDraft,
	sortSeasons,
	validateSeasonDraft,
} from '../../../helpers/seasonDraft.js';
import {
	AchievementTier,
	achievementTiersAscending,
	GameConstraint,
	ScoreModifier,
	WinCondition,
} from '../../../models/enums.js';
import {
	getRankIcon,
	Rank,
} from '../../../models/rank.js';
import {
	RuleDefinitionsResponse,
	Season,
} from '../../../models/schemas.js';
import { DialogService } from '../../../services/dialogService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { RuleService } from '../../../services/ruleService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import type { AaDialog } from '../../aa-dialog/aa-dialog.js';
import type { AaMmrConfigurationEditor } from '../../aa-mmr-configuration-editor/aa-mmr-configuration-editor.js';
import {
	clearStoredManagementKey,
	openManagementUnlockDialog,
	restoreManagementAccess,
} from '../../management-access/management-access.js';
import type {
	SeasonBasicsChangeEvent,
	SeasonBasicsValue,
} from '../../season-basics-editor/season-basics-editor.js';
import type {
	SeasonConfigurationItemActivateEvent,
	SeasonConfigurationListItem,
} from '../../season-configuration-list/season-configuration-list.js';
import seasonsPageStyles from './seasons-page.css?inline';


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

		try {
			await this.loadConfiguration();
		}
		catch (error) {
			this.loadError = getErrorMessage(error, 'Unable to load season configuration.');
			this.loading = false;

			return;
		}

		this.adminKey = await restoreManagementAccess(key => this.seasonService.verifyManagementAccess(key));
		this.accessGranted = !!this.adminKey;
		this.loading = false;
	}

	private lock(): void {
		clearStoredManagementKey();
		this.adminKey = '';
		this.accessGranted = false;
	}

	private async loadConfiguration(): Promise<void> {
		const [ seasons, definitions ] = await Promise.all([
			this.seasonService.getAll(true),
			this.ruleService.GetDefinitions(),
		]);

		this.seasons = sortSeasons(seasons);
		this.definitions = definitions;

		const current = findCurrentSeason(this.seasons);

		if (current)
			this.selectSeason(current);
		else
			this.createDraft();
	}

	private selectSeason(season: Season): void {
		if (this.saving)
			return;

		if (this.isDirty && !window.confirm('Discard unsaved changes and open another season?'))
			return;

		this.applySeason(season);
	}

	private applySeason(season: Season): void {
		this.setDraft(createDraftFromSeason(season));
	}

	private createDraft(): void {
		if (this.saving)
			return;

		if (this.isDirty && !window.confirm('Discard unsaved changes and create a new season?'))
			return;

		this.applyNewDraft();
	}

	private applyNewDraft(): void {
		this.setDraft(createNewSeasonDraft(this.seasons));
	}

	private setDraft(draft: SeasonDraft): void {
		this.draft = draft;
		this.originalDraft = serializeDraft(draft);
		this.validationErrors = [];
	}

	private get isDirty(): boolean {
		return !!this.draft && serializeDraft(this.draft) !== this.originalDraft;
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

	private closeDialog(event: Event): void {
		(event.currentTarget as HTMLElement).closest<AaDialog>('aa-dialog')?.close();
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
							const errors = getScoreModifierErrors(rules);
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
				message: getErrorMessage(error, 'Unable to open score modifiers.'),
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
				message: getErrorMessage(error, 'Unable to open win conditions.'),
			});
		}
	}

	private async openGameConstraints(): Promise<void> {
		if (!this.draft || !this.definitions)
			return;

		const rules: GameConstraintRuleDraft[] = this.draft.gameConstraintRules.map(rule => ({ ...rule }));

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
							const errors = getGameConstraintErrors(
								rules,
								this.definitions?.gameConstraints ?? [],
							);
							if (errors.length > 0) {
								this.notificationService.addNotification({
									type:    'danger',
									message: errors[0],
								});

								return;
							}

							this.updateDraft({
								gameConstraintRules: rules.map(rule => ({
									gameConstraint: rule.gameConstraint,
									value:          rule.value,
								})),
							});
							this.closeDialog(event);
						} }
					>
						Apply constraints
					</aa-button>
					<div class="rule-dialog game-constraints-dialog">
						${ this.definitions.gameConstraints.map(definition => {
							const gameConstraint = definition.value as GameConstraint;
							const selected = rules.find(rule => rule.gameConstraint === gameConstraint);
							const hasNumericParameter = !!definition.label;
							const inputId = `game-constraint-${ definition.value }`;
							const initialValue = selected
								? (selected.value === null ? '' : selected.value)
								: definition.defaultValue ?? '';

							return html`
								<article class="rule-dialog__card ${ selected ? 'selected' : '' }">
									<input
										type="checkbox"
										aria-label=${ `Select ${ definition.name }` }
										.checked=${ !!selected }
										@change=${ (event: Event) => {
											const checkbox = event.currentTarget as HTMLInputElement;
											const card = checkbox.closest('.rule-dialog__card');
											const valueField = card?.querySelector<HTMLElement>('[data-game-constraint-value]');
											const valueInput = card?.querySelector<HTMLInputElement>('[data-game-constraint-input]');
											const existingIndex = rules.findIndex(
												rule => rule.gameConstraint === gameConstraint,
											);

											if (checkbox.checked && existingIndex < 0) {
												rules.push({
													gameConstraint,
													value: definition.defaultValue ?? null,
												});
											}
											else if (!checkbox.checked && existingIndex >= 0) {
												rules.splice(existingIndex, 1);
											}

											card?.classList.toggle(
												'selected',
												checkbox.checked,
											);
											if (valueField)
												valueField.hidden = !checkbox.checked || !hasNumericParameter;
											if (valueInput) {
												valueInput.disabled = !checkbox.checked || !hasNumericParameter;
												if (checkbox.checked && existingIndex < 0)
													valueInput.value = initialValue === '' ? '' : String(initialValue);
											}
										} }
									/>
									<span class="rule-dialog__copy">
										<strong>${ definition.name }</strong>
										<small>${ definition.description }</small>
									</span>
									${ hasNumericParameter ? html`
										<label
											class="rule-dialog__value"
											data-game-constraint-value
											?hidden=${ !selected }
										>
											<span>${ definition.label }</span>
											<input
												id=${ inputId }
												data-game-constraint-input
												type="number"
												min=${ String(definition.min) }
												max=${ String(definition.max) }
												step="1"
												.value=${ initialValue === '' ? '' : String(initialValue) }
												?required=${ definition.required }
												?disabled=${ !selected }
												@input=${ (event: InputEvent) => {
													const input = event.currentTarget as HTMLInputElement;
													const rule = rules.find(item => item.gameConstraint === gameConstraint);

													if (rule) {
														rule.value = input.value.trim() === ''
															? null
															: Number(input.value);
													}
												} }
											/>
											<small>
												${ definition.required ? 'Required' : 'Optional' } ·
												${ definition.min } to ${ definition.max }
											</small>
										</label>
									` : null }
								</article>
							`;
						}) }
					</div>
				`,
				{ title: 'Game constraints' },
			);
		}
		catch (error) {
			this.notificationService.addNotification({
				type:    'danger',
				message: getErrorMessage(error, 'Unable to open game constraints.'),
			});
		}
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
						@click=${ this.closeDialog }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
						@click=${ (event: Event) => {
							const errors = getThresholdErrors(thresholds);
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
							this.closeDialog(event);
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
				message: getErrorMessage(error, 'Unable to open rank thresholds.'),
			});
		}
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
						@click=${ this.closeDialog }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
						@click=${ (event: Event) => {
							const errors = getAchievementRewardErrors(rewards);
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
							this.closeDialog(event);
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
				message: getErrorMessage(error, 'Unable to open achievement rewards.'),
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
						@click=${ this.closeDialog }
					>
						Cancel
					</aa-button>
					<aa-button
						slot="footer-primary"
						type="button"
						variant="primary"
						@click=${ (event: Event) => {
							const dialog = (event.currentTarget as HTMLElement).closest<AaDialog>('aa-dialog');
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
							dialog?.close();
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
				message: getErrorMessage(error, 'Unable to open MMR settings.'),
			});
		}
	}

	/** The builder has its own page; unsaved season changes would be lost on the way. */
	private openAchievementBuilder(): void {
		const seasonId = this.draft?.id;
		if (!seasonId) {
			this.notificationService.addNotification({
				type:    'info',
				message: 'Save the season before creating its achievement templates.',
			});

			return;
		}

		if (this.isDirty && !window.confirm('Leave without saving your season changes?'))
			return;

		Router.go(`${ getAbsoluteBase() }seasons/${ encodeURIComponent(seasonId) }/achievements`);
	}

	private validateDraft(): string[] {
		if (!this.draft)
			return [ 'No season is selected.' ];

		return validateSeasonDraft(this.draft, this.seasons, this.definitions?.gameConstraints ?? []);
	}

	private discardChanges(): void {
		if (!this.draft)
			return;

		if (this.draft.id) {
			const season = this.seasons.find(item => item.id === this.draft?.id);
			if (season)
				this.applySeason(season);
		}
		else {
			this.applyNewDraft();
		}
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
			this.seasons = sortSeasons(seasons);
			this.applySeason(saved);
			this.notificationService.addNotification({
				type:    'success',
				message: `Season ${ saved.name } saved.`,
			});
		}
		catch (error) {
			const message = getErrorMessage(error, 'Unable to save season.');
			this.validationErrors = [ message ];
			this.notificationService.addNotification({ type: 'danger', message });
			if (isManagementAccessError(message))
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
		const key = await openManagementUnlockDialog({
			dialogService: this.dialogService,
			verify:        key => this.seasonService.verifyManagementAccess(key),
			description:   'Enter the management code to save these sandbox changes. Your draft stays unchanged if the code is incorrect.',
			submitLabel:   'Unlock & save',
			initialKey:    this.adminKey,
		}).catch((error: unknown) => {
			// Saving stays locked; tell the user why nothing opened.
			this.notificationService.addNotification({
				type:    'danger',
				message: getErrorMessage(error, 'Unable to open the unlock dialog.'),
			});

			return undefined;
		});
		if (!key)
			return false;

		this.adminKey = key;
		this.accessGranted = true;

		return true;
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

		const scoreModifierNames = getRuleNames(
			this.draft.scoreModifierRules.map(rule => rule.scoreModifier),
			this.definitions.scoreModifiers,
		);
		const winConditionNames = getRuleNames(
			this.draft.winConditionRules.map(rule => rule.winCondition),
			this.definitions.winConditions,
		);
		const gameConstraintSummary = getGameConstraintSummary(
			this.draft.gameConstraintRules,
			this.definitions.gameConstraints,
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
				id:    'game-constraints',
				title: 'Game constraints',
				summary:
					`${ this.draft.gameConstraintRules.length } configured · ${ gameConstraintSummary }`,
				activateLabel: 'Configure game constraints',
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
				previewImages: achievementTiersAscending.map(tier => ({
					src: getAchievementTierIcon(tier),
				})),
			},
			{
				id:            'mmr-calculation',
				title:         'MMR calculation',
				summary:       '',
				activateLabel: 'Configure MMR calculation',
			},
			{
				id:            'achievement-builder',
				title:         'Achievement builder',
				summary:       'Achievements for this season, on their own page',
				activateLabel: 'Open the achievement builder',
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
		case 'game-constraints':
			void this.openGameConstraints();
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
		case 'achievement-builder':
			this.openAchievementBuilder();
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
						heading="Unable to load seasons"
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
