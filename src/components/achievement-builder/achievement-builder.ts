import '../aa-tabs/aa-tabs.js';
import '../achievement-category-manager/achievement-category-manager.js';
import '../../ui/badge/aa-badge.js';
import '../../ui/button/aa-button.js';
import '../../ui/empty-state/aa-empty-state.js';
import '../../ui/form-field/aa-form-field.js';
import '../../ui/segmented-control/aa-segmented-control.js';
import './achievement-logic-editor.js';
import './achievement-template-library.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { faIcons } from '../../faIcons.js';
import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import {
	getEditableVersion,
	restoreAchievementTemplateDraft,
} from '../../helpers/compileAchievementTemplate.js';
import {
	AchievementParameterDraft,
	AchievementTemplateDraft,
	createAchievementBuilderId,
	createDefaultAchievementProgression,
	createEmptyAchievementTemplate,
} from '../../models/achievementBuilder.js';
import type {
	AchievementCategoryResponse,
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
} from '../../models/achievementBuilderApi.js';
import { AchievementTier, achievementTiersAscending } from '../../models/enums.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import type {
	SegmentedControlChangeEvent,
	SegmentedControlItem,
} from '../../ui/segmented-control/aa-segmented-control.js';
import type { AaTabItem } from '../aa-tabs/aa-tabs.js';
import type {
	AchievementCategoriesUpdatedDetail,
	AchievementCategoryActions,
} from '../achievement-category-manager/achievement-category-manager.js';
import achievementBuilderStyles from './achievement-builder.css?inline';
import formStyles from './achievement-builder-form.css?inline';
import {
	AchievementDraftLimits,
	BuilderTab,
	countGeneratedInstances,
	countParameterValues,
	defaultAchievementDraftLimits,
	getConflictingDraftVersion,
	getDefaultCategoryId,
	getPreviews,
	parameterKeyPattern,
	renameParameterReferences,
	sortCategories,
	validateDraft,
} from './achievement-draft.js';
import type { AchievementLogicChangeDetail } from './achievement-logic-editor.js';
import type { AchievementTemplateOpenDetail } from './achievement-template-library.js';

export const achievementBuilderWorkspaceChangeEventName = 'achievement-builder-workspace-change';

export type AchievementBuilderWorkspaceTab = 'browse' | 'editor';

export interface AchievementBuilderWorkspaceChangeDetail {
	tab:            AchievementBuilderWorkspaceTab;
	/** Why saving is impossible for the shown version, or undefined when it is editable. */
	readOnlyReason: string | undefined;
}

const tabs: AaTabItem[] = [
	{ id: 'details', label: 'Details' },
	{ id: 'parameters', label: 'Parameters' },
	{ id: 'logic', label: 'Logic blocks' },
];

const workspaceTabs: AaTabItem[] = [
	{ id: 'browse', label: 'Browse achievements' },
	{ id: 'editor', label: 'Achievement editor' },
];

type TemplateField = 'nameTemplate' | 'descriptionTemplate';

/** Editing an older version while the template already has another draft. */
interface DraftConflict {
	version:       AchievementTemplateVersionResponse;
	existingDraft: AchievementTemplateVersionResponse;
}

const achievementTierItems: SegmentedControlItem[] = achievementTiersAscending.map(tier => ({
	value: String(tier),
	label: AchievementTier[tier].replace(/^./, letter => letter.toUpperCase()),
	icon:  getAchievementTierIcon(tier),
}));
const achievementScopeItems: SegmentedControlItem[] = [
	{ value: 'session', label: 'Session' },
	{ value: 'progression', label: 'Progression' },
];
const parameterValueTypeItems: SegmentedControlItem[] = [
	{ value: 'integer', label: 'Number' },
	{ value: 'string', label: 'Text' },
	{ value: 'boolean', label: 'Yes / no' },
];
const parameterGeneratorItems: SegmentedControlItem[] = [
	{ value: 'range', label: 'Range' },
	{ value: 'set', label: 'List' },
];
const booleanParameterOptions = [
	[ 'true', 'Yes' ],
	[ 'false', 'No' ],
] as const;

const previewLimit = 200;

const formatCount = (count: number, noun: string): string =>
	`${ count } ${ noun }${ count === 1 ? '' : 's' }`;

@customElement('aa-achievement-builder')
export class AaAchievementBuilder extends LitElement {

	@property({ type: String }) seasonId = '';
	@property({ attribute: false }) categories:       AchievementCategoryResponse[] = [];
	@property({ attribute: false }) templates:        AchievementTemplateResponse[] = [];
	@property({ attribute: false }) categoryActions?: AchievementCategoryActions;
	@property({ attribute: false }) limits:           AchievementDraftLimits = defaultAchievementDraftLimits;
	@property({ type: Boolean }) viewOnly = false;
	@property({ type: String }) initialTemplateId = '';
	@property({ type: String }) initialVersionId = '';

	@state() private selectedWorkspaceTab: AchievementBuilderWorkspaceTab = 'editor';
	@state() private selectedTab:          BuilderTab = 'details';
	@state() private draft:                AchievementTemplateDraft = createEmptyAchievementTemplate('');
	@state() private errors:               string[] = [];
	@state() private serverErrors:         string[] = [];
	@state() private categoryList:         AchievementCategoryResponse[] = [];
	@state() private showCategoryManager = false;
	@state() private activeTemplateField:  TemplateField = 'nameTemplate';
	@state() private selectedTemplateId = '';
	@state() private selectedVersionId = '';
	@state() private readOnlyVersion = false;
	@state() private draftConflict?: DraftConflict;

	private baselineDraft = '';
	/** The key a parameter had when its key field got focus, to rename its references on commit. */
	private parameterKeyAtFocus = '';

	protected override willUpdate(changed: PropertyValues<this>): void {
		// The category manager reports its changes through events, which update this copy;
		// new categories from the host replace it.
		if (changed.has('categories'))
			this.categoryList = this.categories;
	}

	protected override updated(changed: PropertyValues): void {
		if ([ 'selectedWorkspaceTab', 'readOnlyVersion', 'selectedTemplateId' ].some(key => changed.has(key)))
			this.dispatchWorkspaceChange();
	}

	override firstUpdated(): void {
		if (
			!this.initialTemplateId
			|| !this.viewTemplateVersion(this.initialTemplateId, this.initialVersionId || undefined)
		)
			this.resetDraft();
	}

	/** True when the editor holds changes that have not been saved. */
	get hasUnsavedChanges(): boolean {
		return !this.readOnlyVersion && JSON.stringify(this.draft) !== this.baselineDraft;
	}

	setTemplates(
		templates: AchievementTemplateResponse[],
		selectedTemplateId?: string,
	): void {
		this.templates = templates;
		if (!selectedTemplateId)
			return;

		// Reloading the template just saved keeps the user on the tab they were editing.
		const selectedTab = this.selectedTab;
		const isSameTemplate = !this.selectedTemplateId || selectedTemplateId === this.selectedTemplateId;
		if (this.loadTemplateVersion(selectedTemplateId, undefined, false) && isSameTemplate)
			this.selectedTab = selectedTab;
	}

	/** Shows the server's validation errors for a draft that was saved but cannot be published. */
	showServerValidationErrors(errors: string[]): void {
		this.serverErrors = errors;
	}

	viewTemplateVersion(templateId: string, versionId?: string): boolean {
		if (!this.loadTemplateVersion(templateId, versionId, false))
			return false;

		this.readOnlyVersion = true;
		this.setWorkspaceTab('editor');

		return true;
	}

	/**
	 * Validates the draft and returns a copy ready to compile, or undefined after
	 * showing the validation errors.
	 */
	getValidatedDraft(): AchievementTemplateDraft | undefined {
		const readOnlyReason = this.readOnlyReason;
		if (readOnlyReason) {
			this.errors = [ readOnlyReason ];

			return undefined;
		}

		const errors = validateDraft(this.draft, {
			categories: this.categoryList,
			limits:     this.limits,
		});
		this.errors = errors.map(error => error.message);
		if (errors.length > 0) {
			this.selectedTab = errors[0]!.tab;

			return undefined;
		}

		return structuredClone(this.draft);
	}

	private resetDraft(baseDraft?: AchievementTemplateDraft): void {
		const draft = structuredClone(baseDraft ?? createEmptyAchievementTemplate(this.seasonId));
		if (!draft.categoryId)
			draft.categoryId = getDefaultCategoryId(this.categoryList);

		this.draft = draft;
		this.baselineDraft = JSON.stringify(draft);
		this.selectedTab = 'details';
		this.errors = [];
		this.serverErrors = [];
		this.showCategoryManager = false;
		this.activeTemplateField = 'nameTemplate';
	}

	private loadTemplateVersion(
		templateId: string,
		versionId?: string,
		confirmDiscard = true,
	): boolean {
		if (
			confirmDiscard
			&& this.hasUnsavedChanges
			&& !window.confirm('Discard unsaved achievement changes?')
		)
			return false;

		if (!templateId) {
			this.selectedTemplateId = '';
			this.selectedVersionId = '';
			this.readOnlyVersion = false;
			this.resetDraft();

			return true;
		}

		const template = this.templates.find(item => item.id === templateId);
		const version = template && getEditableVersion(template, versionId);
		const restored = template && version
			? restoreAchievementTemplateDraft(template, version.id)
			: undefined;
		if (!template || !version || !restored)
			return false;

		this.selectedTemplateId = template.id;
		this.selectedVersionId = version.id;
		this.readOnlyVersion = this.viewOnly || version.status === 'Published' || !!template.isBuiltIn;
		this.draftConflict = undefined;
		this.resetDraft(restored);

		return true;
	}

	/**
	 * Unlocks the shown version for editing. Saving writes into the template's single
	 * Draft, so when another draft exists the user first picks between opening it and
	 * replacing it with this version. The builder already is a dialog, so that choice is
	 * shown inline rather than in another dialog.
	 */
	private createEditableDraft(): void {
		const template = this.templates.find(item => item.id === this.selectedTemplateId);
		const version = template?.versions.find(item => item.id === this.selectedVersionId);
		const existingDraft = template && getConflictingDraftVersion(template, this.selectedVersionId);
		if (!template || !version || !existingDraft) {
			this.readOnlyVersion = false;

			return;
		}

		this.draftConflict = { version, existingDraft };
		void this.updateComplete.then(() =>
			this.shadowRoot?.querySelector<HTMLElement>('[data-draft-conflict-default]')?.focus());
	}

	private resolveDraftConflict(choice: 'open' | 'replace' | 'cancel'): void {
		const conflict = this.draftConflict;
		this.draftConflict = undefined;
		if (!conflict)
			return;

		if (choice === 'open')
			this.loadTemplateVersion(this.selectedTemplateId, conflict.existingDraft.id, false);
		else if (choice === 'replace')
			this.readOnlyVersion = false;
	}

	private updateDraft(patch: Partial<AchievementTemplateDraft>): void {
		this.draft = { ...this.draft, ...patch };
		this.errors = [];
		this.serverErrors = [];
	}

	private get readOnlyReason(): string | undefined {
		if (!this.readOnlyVersion)
			return undefined;

		const template = this.templates.find(item => item.id === this.selectedTemplateId);
		if (this.viewOnly)
			return 'Achievements are view-only here.';
		if (template?.isBuiltIn)
			return 'Built-in achievements are read-only.';

		return 'Published versions are read-only. Use "Create editable draft" to change it.';
	}

	private setWorkspaceTab(tab: AchievementBuilderWorkspaceTab): void {
		this.selectedWorkspaceTab = tab;
	}

	private dispatchWorkspaceChange(): void {
		this.dispatchEvent(new CustomEvent<AchievementBuilderWorkspaceChangeDetail>(
			achievementBuilderWorkspaceChangeEventName,
			{
				detail:   { tab: this.selectedWorkspaceTab, readOnlyReason: this.readOnlyReason },
				bubbles:  true,
				composed: true,
			},
		));
	}

	private handleTemplateOpen(event: CustomEvent<AchievementTemplateOpenDetail>): void {
		if (this.loadTemplateVersion(event.detail.templateId, event.detail.versionId))
			this.setWorkspaceTab('editor');
	}

	private handleCategoriesUpdated(event: CustomEvent<AchievementCategoriesUpdatedDetail>): void {
		this.categoryList = event.detail.categories;
		if (event.detail.selectedCategoryId)
			this.updateDraft({ categoryId: event.detail.selectedCategoryId });
		else if (!this.categoryList.some(category => category.id === this.draft.categoryId))
			this.updateDraft({ categoryId: getDefaultCategoryId(this.categoryList) });
	}

	private get templateParameterKeys(): string[] {
		return [
			...new Set(
				this.draft.parameters
					.map(parameter => parameter.key)
					.filter(key => parameterKeyPattern.test(key)),
			),
		];
	}

	private getTemplateFieldControl(
		field: TemplateField,
	): HTMLInputElement | HTMLTextAreaElement | null | undefined {
		return this.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
			`[data-template-field="${ field }"]`,
		);
	}

	private setTemplateField(field: TemplateField, value: string): void {
		this.updateDraft(field === 'nameTemplate'
			? { nameTemplate: value }
			: { descriptionTemplate: value });
	}

	private insertTemplateParameter(parameterKey: string): void {
		const field = this.activeTemplateField;
		const control = this.getTemplateFieldControl(field);
		const value = this.draft[field];
		const start = control?.selectionStart ?? value.length;
		const end = control?.selectionEnd ?? start;
		const token = `{${ parameterKey }}`;
		const caret = start + token.length;

		this.setTemplateField(field, `${ value.slice(0, start) }${ token }${ value.slice(end) }`);
		void this.updateComplete.then(() => {
			const updatedControl = this.getTemplateFieldControl(field);
			updatedControl?.focus();
			updatedControl?.setSelectionRange(caret, caret);
		});
	}

	private addParameter(): void {
		const parameter: AchievementParameterDraft = {
			id:            createAchievementBuilderId(),
			key:           `parameter${ this.draft.parameters.length + 1 }`,
			valueType:     'integer',
			generatorType: 'range',
			minimum:       1,
			maximum:       20,
			step:          1,
			values:        [],
		};
		this.updateDraft({ parameters: [ ...this.draft.parameters, parameter ] });
	}

	private updateParameter(id: string, patch: Partial<AchievementParameterDraft>): void {
		this.updateDraft({
			parameters: this.draft.parameters.map(parameter =>
				parameter.id === id ? { ...parameter, ...patch } : parameter),
		});
	}

	/** Once a key edit is committed, the logic and text follow the renamed parameter. */
	private commitParameterKey(parameter: AchievementParameterDraft): void {
		const draft = renameParameterReferences(this.draft, this.parameterKeyAtFocus, parameter.key);
		this.parameterKeyAtFocus = parameter.key;
		if (draft !== this.draft)
			this.updateDraft(draft);
	}

	private setParameterValueType(
		parameter: AchievementParameterDraft,
		valueType: AchievementParameterDraft['valueType'],
	): void {
		this.updateParameter(parameter.id, {
			valueType,
			generatorType: valueType === 'integer' ? parameter.generatorType : 'set',
			values:        valueType === 'boolean'
				? parameter.values.filter(value => value === 'true' || value === 'false')
				: parameter.values,
		});
	}

	private toggleBooleanParameterValue(
		parameter: AchievementParameterDraft,
		value: 'true' | 'false',
	): void {
		this.updateParameter(parameter.id, {
			values: parameter.values.includes(value)
				? parameter.values.filter(item => item !== value)
				: [ ...parameter.values, value ],
		});
	}

	private removeParameter(id: string): void {
		this.updateDraft({
			parameters: this.draft.parameters.filter(parameter => parameter.id !== id),
		});
	}

	private renderSegmented<T extends string>(
		items: SegmentedControlItem[],
		selected: T,
		label: string,
		onSelect: (value: T) => void,
		iconOnly = false,
	): TemplateResult {
		return html`
			<aa-segmented-control
				size="medium"
				stretch
				?icon-only=${ iconOnly }
				.items=${ items }
				.selected=${ selected }
				label=${ label }
				@segmented-control-change=${ (event: SegmentedControlChangeEvent) => {
					event.stopPropagation();
					onSelect(event.detail as T);
				} }
			></aa-segmented-control>
		`;
	}

	private renderField(
		label: string,
		control: TemplateResult,
		help?: string,
	): TemplateResult {
		return html`
			<div class="field">
				<span class="field__label">${ label }</span>
				${ control }
				${ help ? html`<small class="field__help">${ help }</small>` : nothing }
			</div>
		`;
	}

	private renderParameterInsert(): TemplateResult | typeof nothing {
		const keys = this.templateParameterKeys;
		if (keys.length === 0)
			return nothing;

		const target = this.activeTemplateField === 'nameTemplate' ? 'name' : 'description';

		return html`
			<div class="token-insert" role="group" aria-label=${ `Insert parameter into ${ target }` }>
				<span>Insert into ${ target }</span>
				${ keys.map(key => html`
					<button
						type="button"
						class="token"
						@mousedown=${ (event: MouseEvent) => event.preventDefault() }
						@click=${ () => this.insertTemplateParameter(key) }
					>{${ key }}</button>
				`) }
			</div>
		`;
	}

	private renderIdentity(): TemplateResult {
		const updateField = (field: TemplateField) => (event: InputEvent): void =>
			this.setTemplateField(
				field,
				(event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value,
			);
		const focusField = (field: TemplateField) => (): void => {
			this.activeTemplateField = field;
		};

		return html`
			<section class="form-section">
				<aa-form-field label="Name">
					<input
						type="text"
						data-template-field="nameTemplate"
						aria-label="Name"
						.value=${ this.draft.nameTemplate }
						@focus=${ focusField('nameTemplate') }
						@input=${ updateField('nameTemplate') }
						placeholder="Shanghai {n}"
					/>
				</aa-form-field>
				<aa-form-field label="Description">
					<textarea
						rows="2"
						data-template-field="descriptionTemplate"
						aria-label="Description"
						.value=${ this.draft.descriptionTemplate }
						@focus=${ focusField('descriptionTemplate') }
						@input=${ updateField('descriptionTemplate') }
						placeholder="Hit {n}, D{n} and T{n} in the same round."
					></textarea>
				</aa-form-field>
				${ this.renderParameterInsert() }
			</section>
		`;
	}

	private renderCategoryChoice(): TemplateResult {
		const selectedCategory = this.categoryList.find(
			category => category.id === this.draft.categoryId,
		);
		const visibleCategories = sortCategories(this.categoryList.filter(category =>
			!category.isArchived || category.id === this.draft.categoryId));

		return this.renderField('Category', html`
			<div class="chip-group" role="group" aria-label="Achievement category">
				${ visibleCategories.map(category => html`
					<button
						type="button"
						class="chip"
						aria-pressed=${ category.id === this.draft.categoryId }
						@click=${ () => this.updateDraft({ categoryId: category.id }) }
					>
						${ category.name }${ category.isArchived ? ' (archived)' : '' }
					</button>
				`) }
				<aa-button
					size="small"
					variant=${ this.showCategoryManager ? 'primary' : 'ghost' }
					aria-expanded=${ String(this.showCategoryManager) }
					@click=${ () => {
						this.showCategoryManager = !this.showCategoryManager;
					} }
				>
					<i class="fa-solid fa-gear" aria-hidden="true"></i>
					Manage
				</aa-button>
			</div>
		`, selectedCategory?.isArchived
			? 'This category is archived. Existing drafts may keep it.'
			: undefined);
	}

	private renderClassification(): TemplateResult {
		return html`
			<section class="form-section form-section--divided">
				${ this.renderCategoryChoice() }
				${ this.showCategoryManager
					? html`
						<aa-achievement-category-manager
							.categories=${ this.categoryList }
							.actions=${ this.categoryActions }
							@achievement-categories-updated=${ this.handleCategoriesUpdated }
							@achievement-category-manager-close=${ () => {
								this.showCategoryManager = false;
							} }
						></aa-achievement-category-manager>
					`
					: nothing }
				<div class="classification-row">
					${ this.renderField('Tier', this.renderSegmented(
						achievementTierItems,
						String(this.draft.tier),
						'Achievement tier',
						tier => this.updateDraft({ tier: Number(tier) }),
						true,
					), 'The tier also sets the MMR reward and the MMR cap increase this achievement gives.') }
					${ this.renderField('Type', this.renderSegmented(
						achievementScopeItems,
						this.draft.achievementScope,
						'Achievement type',
						achievementScope => this.updateDraft({
							achievementScope,
							progression: achievementScope === 'progression'
								? this.draft.progression ?? createDefaultAchievementProgression()
								: this.draft.progression,
						}),
					)) }
				</div>
			</section>
		`;
	}

	private renderDetailsPreview(): TemplateResult {
		const previews = getPreviews(this.draft, previewLimit);
		const count = countGeneratedInstances(this.draft.parameters);
		const tierIcon = getAchievementTierIcon(this.draft.tier);

		return html`
			<aside class="details-preview" aria-label="Preview">
				<header class="form-section__header">
					<h3>Preview</h3>
					<aa-badge pill>${ formatCount(count, 'achievement') }</aa-badge>
				</header>
				${ previews.length > 0
					? html`
						<ol class="preview-list">
							${ previews.map(preview => html`
								<li class="preview-card">
									<img src=${ tierIcon } alt="" />
									<div>
										<strong>${ preview.name || 'Untitled achievement' }</strong>
										<p>${ preview.description || 'No description' }</p>
										${ Object.keys(preview.bindings).length
											? html`
												<div class="binding-list">
													${ Object.entries(preview.bindings).map(([ key, value ]) => html`
														<code>${ key } = ${ String(value) }</code>
													`) }
												</div>
											`
											: nothing }
									</div>
								</li>
							`) }
						</ol>
						${ count > previews.length
							? html`
								<small class="details-preview__more">
									Showing the first ${ previews.length } of ${ count }.
								</small>
							`
							: nothing }
					`
					: html`
						<aa-empty-state compact>
							Give every parameter at least one value to see a preview.
						</aa-empty-state>
					` }
			</aside>
		`;
	}

	private renderDetails(): TemplateResult {
		return html`
			<section class="builder-panel details-panel">
				<div class="details-form">
					${ this.renderIdentity() }
					${ this.renderClassification() }
				</div>
				${ this.renderDetailsPreview() }
			</section>
		`;
	}

	private renderNumberInput(
		parameter: AchievementParameterDraft,
		field: 'minimum' | 'maximum' | 'step',
		label: string,
	): TemplateResult {
		return html`
			<aa-form-field label=${ label }>
				<input
					type="number"
					step="1"
					min=${ field === 'step' ? '1' : nothing }
					aria-label=${ label }
					.value=${ String(parameter[field] ?? '') }
					@input=${ (event: InputEvent) => {
						const value = (event.currentTarget as HTMLInputElement).value;
						const patch: Partial<AchievementParameterDraft> = {};
						patch[field] = value === '' ? undefined : Number(value);
						this.updateParameter(parameter.id, patch);
					} }
				/>
			</aa-form-field>
		`;
	}

	private renderParameterValues(parameter: AchievementParameterDraft): TemplateResult {
		if (parameter.generatorType === 'range') {
			return html`
				<div class="parameter-range">
					${ this.renderNumberInput(parameter, 'minimum', 'From') }
					${ this.renderNumberInput(parameter, 'maximum', 'To') }
					${ this.renderNumberInput(parameter, 'step', 'Step') }
				</div>
			`;
		}

		if (parameter.valueType === 'boolean') {
			return this.renderField('Allowed values', html`
				<div class="chip-group" role="group" aria-label="Allowed yes or no values">
					${ booleanParameterOptions.map(([ value, label ]) => html`
						<button
							type="button"
							class="chip"
							aria-pressed=${ parameter.values.includes(value) }
							@click=${ () => this.toggleBooleanParameterValue(parameter, value) }
						>${ label }</button>
					`) }
				</div>
			`);
		}

		return html`
			<aa-form-field label="Values" help="One value per line.">
				<textarea
					rows="4"
					aria-label="Values"
					.value=${ parameter.values.join('\n') }
					@input=${ (event: InputEvent) => this.updateParameter(parameter.id, {
						values: (event.currentTarget as HTMLTextAreaElement).value
							.split('\n')
							.map(value => value.trim())
							.filter(Boolean),
					}) }
				></textarea>
			</aa-form-field>
		`;
	}

	private renderParameter(parameter: AchievementParameterDraft, index: number): TemplateResult {
		const valueCount = countParameterValues(parameter);

		return html`
			<article class="parameter-card">
				<header class="parameter-card__header">
					<label class="parameter-key">
						<span aria-hidden="true">{</span>
						<input
							type="text"
							spellcheck="false"
							aria-label=${ `Parameter ${ index + 1 } key` }
							.value=${ parameter.key }
							@focus=${ () => {
								this.parameterKeyAtFocus = parameter.key;
							} }
							@input=${ (event: InputEvent) => this.updateParameter(parameter.id, {
								key: (event.currentTarget as HTMLInputElement).value.trim(),
							}) }
							@change=${ () => {
								const current = this.draft.parameters.find(item => item.id === parameter.id);
								if (current)
									this.commitParameterKey(current);
							} }
							placeholder="key"
						/>
						<span aria-hidden="true">}</span>
					</label>
					<aa-badge pill variant=${ valueCount === 0 ? 'danger' : 'neutral' }>
						${ formatCount(valueCount, 'value') }
					</aa-badge>
					${ this.readOnlyVersion
						? nothing
						: html`
							<aa-button
								class="parameter-card__remove"
								size="small"
								variant="ghost"
								aria-label=${ `Remove parameter ${ parameter.key }` }
								@click=${ () => this.removeParameter(parameter.id) }
							>
								<i class="fa-solid fa-trash-can" aria-hidden="true"></i>
								Remove
							</aa-button>
						` }
				</header>
				<div class="parameter-card__body">
					<div class="parameter-card__settings">
						${ this.renderField('Type', this.renderSegmented(
							parameterValueTypeItems,
							parameter.valueType,
							'Parameter value type',
							valueType => this.setParameterValueType(parameter, valueType),
						)) }
						${ parameter.valueType === 'integer'
							? this.renderField('Generate from', this.renderSegmented(
								parameterGeneratorItems,
								parameter.generatorType,
								'Parameter value source',
								generatorType => this.updateParameter(parameter.id, { generatorType }),
							))
							: nothing }
					</div>
					<div class="parameter-card__values">
						${ this.renderParameterValues(parameter) }
					</div>
				</div>
			</article>
		`;
	}

	private renderAddParameterButton(slot?: string): TemplateResult | typeof nothing {
		if (this.readOnlyVersion)
			return nothing;

		return html`
			<aa-button slot=${ slot ?? nothing } size="small" @click=${ this.addParameter }>
				<i class="fa-solid fa-plus" aria-hidden="true"></i>
				Add parameter
			</aa-button>
		`;
	}

	private renderParameters(): TemplateResult {
		const hasParameters = this.draft.parameters.length > 0;

		return html`
			<section class="builder-panel parameters-panel">
				<header class="parameters-header">
					<div>
						<h3>Parameters</h3>
						<p>
							Every combination of values generates its own achievement.
							Use a parameter as <code>{key}</code> in the text and logic.
						</p>
					</div>
					${ hasParameters
						? html`
							<div class="parameters-header__actions">
								<aa-badge pill>
									${ formatCount(countGeneratedInstances(this.draft.parameters), 'achievement') }
								</aa-badge>
								${ this.renderAddParameterButton() }
							</div>
						`
						: nothing }
				</header>
				${ hasParameters
					? this.draft.parameters.map((parameter, index) =>
						this.renderParameter(parameter, index))
					: html`
						<aa-empty-state>
							<span slot="title">No parameters</span>
							This template generates a single achievement.
							${ this.renderAddParameterButton('actions') }
						</aa-empty-state>
					` }
			</section>
		`;
	}

	private renderLogic(): TemplateResult {
		return html`
			<aa-achievement-logic-editor
				.rule=${ this.draft.rule }
				.progression=${ this.draft.progression }
				.parameters=${ this.draft.parameters }
				.achievementScope=${ this.draft.achievementScope }
				.readOnly=${ this.readOnlyVersion }
				@achievement-logic-change=${ (
					event: CustomEvent<AchievementLogicChangeDetail>,
				) => this.updateDraft(event.detail) }
			></aa-achievement-logic-editor>
		`;
	}

	private renderPublishedVersionNotice(): TemplateResult | typeof nothing {
		if (!this.readOnlyVersion || this.viewOnly)
			return nothing;

		const template = this.templates.find(item => item.id === this.selectedTemplateId);
		if (template?.isBuiltIn) {
			return html`
				<div class="published-notice">
					<span>Built-in achievements are read-only.</span>
				</div>
			`;
		}

		const versionNumber = template?.versions
			.find(version => version.id === this.selectedVersionId)
			?.versionNumber;
		const conflict = this.draftConflict;
		if (conflict) {
			return html`
				<div
					class="published-notice published-notice--conflict"
					role="group"
					aria-label="This achievement already has a draft"
				>
					<span>
						Version ${ conflict.existingDraft.versionNumber } is already a draft. Saving an edit of
						version ${ conflict.version.versionNumber } replaces everything in that draft.
					</span>
					<div class="published-notice__actions">
						<aa-button
							type="button"
							size="small"
							variant="primary"
							data-draft-conflict-default
							@click=${ () => this.resolveDraftConflict('open') }
						>
							Open existing draft
						</aa-button>
						<aa-button
							type="button"
							size="small"
							variant="danger"
							@click=${ () => this.resolveDraftConflict('replace') }
						>
							Replace draft with v${ conflict.version.versionNumber }
						</aa-button>
						<aa-button
							type="button"
							size="small"
							variant="ghost"
							@click=${ () => this.resolveDraftConflict('cancel') }
						>
							Cancel
						</aa-button>
					</div>
				</div>
			`;
		}

		return html`
			<div class="published-notice">
				<span>Published version ${ versionNumber } is read-only.</span>
				<aa-button
					type="button"
					size="small"
					variant="secondary"
					@click=${ () => this.createEditableDraft() }
				>
					Create editable draft
				</aa-button>
			</div>
		`;
	}

	private renderEditor(): TemplateResult {
		const panels: Record<BuilderTab, () => TemplateResult> = {
			details:    () => this.renderDetails(),
			parameters: () => this.renderParameters(),
			logic:      () => this.renderLogic(),
		};

		return html`
			<div class="workspace-content editor-workspace">
				<div class="editor-workspace__header">
					<aa-tabs
						.items=${ tabs }
						.selected=${ this.selectedTab }
						label="Achievement editor sections"
						@tab-change=${ (event: CustomEvent<{ id: BuilderTab; }>) => {
							this.selectedTab = event.detail.id;
						} }
					></aa-tabs>
					${ this.renderPublishedVersionNotice() }
					${ this.errors.length > 0
						? html`
							<div class="error-list" role="alert">
								${ this.errors.map(error => html`<p>${ error }</p>`) }
							</div>
						`
						: nothing }
					${ this.errors.length === 0 && this.serverErrors.length > 0
						? html`
							<div class="error-list" role="alert">
								<p>Saved as a draft, but it can't be published yet:</p>
								${ this.serverErrors.map(error => html`<p>${ error }</p>`) }
							</div>
						`
						: nothing }
				</div>
				<div
					class="builder-content"
					?inert=${ this.readOnlyVersion && this.selectedTab !== 'logic' }
				>
					${ panels[this.selectedTab]() }
				</div>
			</div>
		`;
	}

	override render(): TemplateResult {
		return html`
			<div class="achievement-builder ${ this.viewOnly ? 'achievement-builder--view-only' : '' }">
				${ this.viewOnly
					? nothing
					: html`
						<aa-tabs
							.items=${ workspaceTabs }
							.selected=${ this.selectedWorkspaceTab }
							label="Achievement builder workspace"
							@tab-change=${ (event: CustomEvent<{ id: AchievementBuilderWorkspaceTab; }>) =>
								this.setWorkspaceTab(event.detail.id) }
						></aa-tabs>
					` }
				${ this.selectedWorkspaceTab === 'browse'
					? html`
						<div class="workspace-content browse-workspace">
							<aa-achievement-template-library
								.templates=${ this.templates }
								.selectedTemplateId=${ this.selectedTemplateId }
								.selectedVersionId=${ this.selectedVersionId }
								.dirty=${ this.hasUnsavedChanges }
								.readOnly=${ this.viewOnly }
								@achievement-template-open=${ this.handleTemplateOpen }
							></aa-achievement-template-library>
						</div>
					`
					: this.renderEditor() }
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		faIcons,
		unsafeCSS(formStyles),
		unsafeCSS(achievementBuilderStyles),
	];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-achievement-builder': AaAchievementBuilder;
	}
}
