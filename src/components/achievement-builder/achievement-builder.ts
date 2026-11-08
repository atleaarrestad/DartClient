import '../achievement-category-manager/achievement-category-manager.js';
import '../../ui/badge/aa-badge.js';
import '../../ui/button/aa-button.js';
import '../../ui/empty-state/aa-empty-state.js';
import '../../ui/form-field/aa-form-field.js';
import '../../ui/segmented-control/aa-segmented-control.js';
import './rule-workspace/aa-rule-workspace.js';
import './achievement-template-library.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { live } from 'lit/directives/live.js';

import { faIcons } from '../../faIcons.js';
import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import { formatTierLabel } from '../../helpers/achievementVariantRules.js';
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
import { sharedStyles } from '../../styles/shared-styles.js';
import type {
	SegmentedControlChangeEvent,
	SegmentedControlItem,
} from '../../ui/segmented-control/aa-segmented-control.js';
import type {
	AchievementCategoriesUpdatedDetail,
	AchievementCategoryActions,
} from '../achievement-category-manager/achievement-category-manager.js';
import achievementBuilderStyles from './achievement-builder.css?inline';
import formStyles from './achievement-builder-form.css?inline';
import {
	AchievementDraftLimits,
	BuilderTab,
	countAchievements,
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
import type { AchievementTemplateOpenDetail } from './achievement-template-library.js';
import { duplicateDraft } from './duplicate-draft.js';
import type { AchievementLogicChangeDetail } from './rule-events.js';
import type { AaRuleWorkspace } from './rule-workspace/aa-rule-workspace.js';

export const achievementBuilderStateChangeEventName = 'achievement-builder-state-change';

/** Asks the host to disable or enable a template; that is a server action, not a draft edit. */
export const achievementTemplateDisabledChangeEventName = 'achievement-template-disabled-change';

export interface AchievementTemplateDisabledChangeDetail {
	templateId: string;
	disabled:   boolean;
}

export interface AchievementBuilderStateChangeDetail {
	/** Why saving is impossible for the shown version, or undefined when it is editable. */
	readOnlyReason: string | undefined;
	/** The open template and version; empty for a new, unsaved achievement. */
	templateId:     string;
	versionId:      string;
}

type TemplateField = 'nameTemplate' | 'descriptionTemplate';

/** The collapsible sections of the inspector on the right. */
type InspectorSection = 'status' | 'card' | 'type' | 'variants' | 'preview';

/** Where an error can be fixed: an inspector section or the logic canvas. */
type ErrorArea = InspectorSection | 'logic';

interface BuilderError {
	area?:   ErrorArea;
	message: string;
}

/** Wide shows every pane; narrow turns the library into a drawer; compact also stacks the inspector. */
type WorkbenchLayout = 'wide' | 'narrow' | 'compact';

/** Editing an older version while the template already has another draft. */
interface DraftConflict {
	version:       AchievementTemplateVersionResponse;
	existingDraft: AchievementTemplateVersionResponse;
}

const errorAreaByTab: Record<BuilderTab, ErrorArea> = {
	details:    'card',
	parameters: 'variants',
	logic:      'logic',
};

const inspectorSections: InspectorSection[] = [ 'status', 'card', 'type', 'variants', 'preview' ];

const narrowWidth = 1100;
const compactWidth = 760;

const libraryOpenStorageKey = 'aa-achievement-builder:library-open';
const collapsedSectionsStorageKey = 'aa-achievement-builder:collapsed-sections';

const readStorage = (key: string): string | null => {
	try {
		return localStorage.getItem(key);
	}
	catch {
		return null;
	}
};

const writeStorage = (key: string, value: string): void => {
	try {
		localStorage.setItem(key, value);
	}
	catch {
		// Remembering the layout is a convenience; without storage it resets next time.
	}
};

const readCollapsedSections = (): Set<InspectorSection> => {
	try {
		const stored: unknown = JSON.parse(readStorage(collapsedSectionsStorageKey) ?? '[]');

		return new Set(Array.isArray(stored)
			? inspectorSections.filter(section => stored.includes(section))
			: []);
	}
	catch {
		return new Set();
	}
};

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
	/** Browsing works, but nothing can be edited until the management code is entered. */
	@property({ type: Boolean }) locked = false;
	@property({ type: String }) initialTemplateId = '';
	@property({ type: String }) initialVersionId = '';

	@state() private draft:               AchievementTemplateDraft = createEmptyAchievementTemplate('');
	@state() private errors:              BuilderError[] = [];
	@state() private serverErrors:        string[] = [];
	@state() private categoryList:        AchievementCategoryResponse[] = [];
	@state() private showCategoryManager = false;
	@state() private activeTemplateField: TemplateField = 'nameTemplate';
	@state() private selectedTemplateId = '';
	@state() private selectedVersionId = '';
	@state() private readOnlyVersion = false;
	@state() private draftConflict?:      DraftConflict;
	@state() private layout:              WorkbenchLayout = 'wide';
	/** The library column on wide layouts, remembered between sessions. */
	@state() private libraryOpen = readStorage(libraryOpenStorageKey) !== 'false';
	/** The library drawer on narrow layouts; it always starts closed. */
	@state() private libraryDrawerOpen = false;
	@state() private collapsedSections = readCollapsedSections();

	private baselineDraft = '';
	/** The key a parameter had when its key field got focus, to rename its references on commit. */
	private parameterKeyAtFocus = '';
	/** Changes when another achievement is opened, so the logic canvas remounts and fits it. */
	private canvasKey = 0;
	private resizeObserver?: ResizeObserver;

	override connectedCallback(): void {
		super.connectedCallback();
		// Measured now as well, so the first paint already has the right panes.
		this.setLayoutForWidth(this.getBoundingClientRect().width);
		this.resizeObserver = new ResizeObserver(([ entry ]) =>
			this.setLayoutForWidth(entry?.contentRect.width ?? 0));
		this.resizeObserver.observe(this);
	}

	private setLayoutForWidth(width: number): void {
		if (width === 0)
			return;

		this.layout = width < compactWidth ? 'compact' : width < narrowWidth ? 'narrow' : 'wide';
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;
	}

	protected override willUpdate(changed: PropertyValues<this>): void {
		// The category manager reports its changes through events, which update this copy;
		// new categories from the host replace it.
		if (changed.has('categories'))
			this.categoryList = this.categories;
		// Locking or unlocking re-evaluates the open version, including on the first render.
		if (changed.has('locked') || changed.has('viewOnly'))
			this.readOnlyVersion = this.isReadOnly(this.selectedTemplate, this.selectedVersion);
	}

	protected override updated(changed: PropertyValues): void {
		if ([ 'readOnlyVersion', 'selectedTemplateId', 'selectedVersionId', 'viewOnly', 'locked' ]
			.some(key => changed.has(key)))
			this.dispatchStateChange();
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
		if (selectedTemplateId)
			this.loadTemplateVersion(selectedTemplateId, undefined, false);
	}

	/** Shows the server's validation errors for a draft that was saved but cannot be published. */
	showServerValidationErrors(errors: string[]): void {
		this.serverErrors = errors;
	}

	/** Opens a template version without asking about unsaved changes, e.g. from the URL. */
	openTemplate(templateId: string, versionId?: string): boolean {
		return this.loadTemplateVersion(templateId, versionId, false);
	}

	viewTemplateVersion(templateId: string, versionId?: string): boolean {
		if (!this.loadTemplateVersion(templateId, versionId, false))
			return false;

		this.readOnlyVersion = true;

		return true;
	}

	/**
	 * Validates the draft and returns a copy ready to compile, or undefined after
	 * showing the validation errors.
	 */
	getValidatedDraft(): AchievementTemplateDraft | undefined {
		const readOnlyReason = this.readOnlyReason;
		if (readOnlyReason) {
			this.errors = [ { message: readOnlyReason } ];

			return undefined;
		}

		const errors = validateDraft(this.draft, {
			categories: this.categoryList,
			limits:     this.limits,
		});
		this.errors = errors.map(error => ({ area: errorAreaByTab[error.tab], message: error.message }));
		const firstArea = this.errors[0]?.area;
		if (firstArea) {
			void this.revealErrorArea(firstArea, false);

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
			this.readOnlyVersion = this.isReadOnly(undefined, undefined);
			this.draftConflict = undefined;
			this.canvasKey++;
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

		// Reloading the version just saved keeps the canvas where the user left it.
		if (template.id !== this.selectedTemplateId || version.id !== this.selectedVersionId)
			this.canvasKey++;

		this.selectedTemplateId = template.id;
		this.selectedVersionId = version.id;
		this.readOnlyVersion = this.isReadOnly(template, version);
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

	/**
	 * Starts a new, unsaved achievement from a copy of the open one. This is how a built-in
	 * achievement is replaced: duplicate it, fix the copy, and disable the original.
	 */
	private duplicateAsNew(): void {
		if (this.hasUnsavedChanges && !window.confirm('Discard unsaved achievement changes?'))
			return;

		const copy = duplicateDraft(this.draft, this.categoryList);
		this.selectedTemplateId = '';
		this.selectedVersionId = '';
		this.draftConflict = undefined;
		this.readOnlyVersion = this.isReadOnly(undefined, undefined);
		this.canvasKey++;
		this.resetDraft(copy);
		// The copy only exists in the editor until it is saved.
		this.baselineDraft = '';
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

	private get selectedTemplate(): AchievementTemplateResponse | undefined {
		return this.templates.find(item => item.id === this.selectedTemplateId);
	}

	private get selectedVersion(): AchievementTemplateVersionResponse | undefined {
		return this.selectedTemplate?.versions.find(item => item.id === this.selectedVersionId);
	}

	/** Published and built-in versions are read-only, and so is everything while locked. */
	private isReadOnly(
		template: AchievementTemplateResponse | undefined,
		version: AchievementTemplateVersionResponse | undefined,
	): boolean {
		return this.viewOnly
			|| this.locked
			|| version?.status === 'Published'
			|| !!template?.isBuiltIn;
	}

	private get readOnlyReason(): string | undefined {
		if (!this.readOnlyVersion)
			return undefined;

		if (this.viewOnly)
			return 'Achievements are view-only here.';
		if (this.locked)
			return 'Unlock editing with the management code to change achievements.';
		if (this.selectedTemplate?.isBuiltIn)
			return 'Built-in achievements are read-only.';

		return 'Published versions are read-only. Use "Create editable draft" to change it.';
	}

	private dispatchStateChange(): void {
		this.dispatchEvent(new CustomEvent<AchievementBuilderStateChangeDetail>(
			achievementBuilderStateChangeEventName,
			{
				detail: {
					readOnlyReason: this.readOnlyReason,
					templateId:     this.selectedTemplateId,
					versionId:      this.selectedVersionId,
				},
				bubbles:  true,
				composed: true,
			},
		));
	}

	private handleTemplateOpen(event: CustomEvent<AchievementTemplateOpenDetail>): void {
		if (this.loadTemplateVersion(event.detail.templateId, event.detail.versionId))
			this.libraryDrawerOpen = false;
	}

	private handleCategoriesUpdated(event: CustomEvent<AchievementCategoriesUpdatedDetail>): void {
		this.categoryList = event.detail.categories;
		if (event.detail.selectedCategoryId)
			this.updateDraft({ categoryId: event.detail.selectedCategoryId });
		else if (!this.categoryList.some(category => category.id === this.draft.categoryId))
			this.updateDraft({ categoryId: getDefaultCategoryId(this.categoryList) });
	}

	// ── Layout state ────────────────────────────────────────────────────────

	private get showLibrary(): boolean {
		if (this.viewOnly)
			return false;

		return this.layout === 'wide' ? this.libraryOpen : this.libraryDrawerOpen;
	}

	private toggleLibrary(): void {
		if (this.layout !== 'wide') {
			this.libraryDrawerOpen = !this.libraryDrawerOpen;

			return;
		}

		this.libraryOpen = !this.libraryOpen;
		writeStorage(libraryOpenStorageKey, String(this.libraryOpen));
	}

	private setSectionCollapsed(section: InspectorSection, collapsed: boolean): void {
		const next = new Set(this.collapsedSections);
		if (collapsed)
			next.add(section);
		else
			next.delete(section);

		this.collapsedSections = next;
		writeStorage(collapsedSectionsStorageKey, JSON.stringify([ ...next ]));
	}

	/** Opens the place an error can be fixed and scrolls it into view. */
	private async revealErrorArea(area: ErrorArea, moveFocus: boolean): Promise<void> {
		if (area !== 'logic')
			this.setSectionCollapsed(area, false);

		await this.updateComplete;
		const target = area === 'logic'
			? this.shadowRoot?.querySelector<HTMLElement>('.canvas-pane')
			: this.shadowRoot?.querySelector<HTMLElement>(`[data-section="${ area }"]`);
		target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		if (moveFocus && area === 'logic')
			target?.querySelector<AaRuleWorkspace>('aa-rule-workspace')?.focusEditor();
		else if (moveFocus)
			target?.querySelector<HTMLElement>('.section__toggle')?.focus({ preventScroll: true });
	}

	private countErrors(area: ErrorArea): number {
		return this.errors.filter(error => error.area === area).length;
	}

	// ── Text templates ──────────────────────────────────────────────────────

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

	// ── Parameters ──────────────────────────────────────────────────────────

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

	// ── Shared rendering helpers ────────────────────────────────────────────

	private renderSegmented<T extends string>(
		items: SegmentedControlItem[],
		selected: T,
		label: string,
		onSelect: (value: T) => void,
		iconOnly = false,
	): TemplateResult {
		return html`
			<aa-segmented-control
				size="small"
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

	private renderSection(
		section: InspectorSection,
		title: string,
		summary: TemplateResult | string,
		body: () => TemplateResult,
		/** Sections that act on the template itself stay usable on read-only versions. */
		editsDraft = true,
	): TemplateResult {
		const collapsed = this.collapsedSections.has(section);
		const errorCount = this.countErrors(section);
		const bodyId = `section-${ section }`;

		return html`
			<section
				class="section ${ collapsed ? 'section--collapsed' : '' } ${ errorCount ? 'section--error' : '' }"
				data-section=${ section }
			>
				<h3 class="section__heading">
					<button
						type="button"
						class="section__toggle"
						aria-expanded=${ String(!collapsed) }
						aria-controls=${ bodyId }
						@click=${ () => this.setSectionCollapsed(section, !collapsed) }
					>
						<i class="fa-solid fa-chevron-${ collapsed ? 'right' : 'down' }" aria-hidden="true"></i>
						<span class="section__title">${ title }</span>
						${ errorCount
							? html`<aa-badge pill variant="danger">${ formatCount(errorCount, 'error') }</aa-badge>`
							: nothing }
						${ !errorCount && collapsed
							// An open section shows its contents, so the summary would only repeat them.
							? html`<span class="section__summary">${ summary }</span>`
							: nothing }
					</button>
				</h3>
				${ collapsed
					? nothing
					: html`
						<div class="section__body" id=${ bodyId } ?inert=${ editsDraft && this.readOnlyVersion }>
							${ body() }
						</div>
					` }
			</section>
		`;
	}

	// ── Card section ────────────────────────────────────────────────────────

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

	private renderCategoryField(): TemplateResult {
		const selectedCategory = this.categoryList.find(
			category => category.id === this.draft.categoryId,
		);
		const visibleCategories = sortCategories(this.categoryList.filter(category =>
			!category.isArchived || category.id === this.draft.categoryId));

		return this.renderField('Category', html`
			<div class="category-field">
				<select
					aria-label="Achievement category"
					@change=${ (event: Event) => this.updateDraft({
						categoryId: (event.currentTarget as HTMLSelectElement).value,
					}) }
				>
					${ selectedCategory
						? nothing
						: html`<option value="" selected disabled>Choose a category</option>` }
					${ visibleCategories.map(category => html`
						<option
							value=${ category.id }
							?selected=${ category.id === this.draft.categoryId }
						>
							${ category.name }${ category.isArchived ? ' (archived)' : '' }
						</option>
					`) }
				</select>
				${ this.categoryActions
					? html`
						<aa-button
							size="small"
							variant=${ this.showCategoryManager ? 'primary' : 'secondary' }
							aria-expanded=${ String(this.showCategoryManager) }
							@click=${ () => {
								this.showCategoryManager = !this.showCategoryManager;
							} }
						>
							<i class="fa-solid fa-gear" aria-hidden="true"></i>
							Manage
						</aa-button>
					`
					: nothing }
			</div>
		`, selectedCategory?.isArchived
			? 'This category is archived. Existing drafts may keep it.'
			: undefined);
	}

	private renderCardSection(): TemplateResult {
		const updateField = (field: TemplateField) => (event: InputEvent): void =>
			this.setTemplateField(
				field,
				(event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value,
			);
		const focusField = (field: TemplateField) => (): void => {
			this.activeTemplateField = field;
		};

		return html`
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
					rows="3"
					data-template-field="descriptionTemplate"
					aria-label="Description"
					.value=${ this.draft.descriptionTemplate }
					@focus=${ focusField('descriptionTemplate') }
					@input=${ updateField('descriptionTemplate') }
					placeholder="Hit {n}, D{n} and T{n} in the same round."
				></textarea>
			</aa-form-field>
			${ this.renderParameterInsert() }
			${ this.renderCategoryField() }
		`;
	}

	// ── Type section ────────────────────────────────────────────────────────

	/** Tiers live with the logic, in the workspace's tier panel and the rule text. */
	private renderTypeSection(): TemplateResult {
		return html`
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
			), this.draft.achievementScope === 'progression'
				? 'Collected across games. The canvas shows the target segments.'
				: 'Earned within one game.') }
		`;
	}

	// ── Variants section ────────────────────────────────────────────────────

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
					aria-label=${ `${ parameter.key } ${ label.toLowerCase() }` }
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
					aria-label=${ `${ parameter.key } values` }
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
							<button
								type="button"
								class="icon-button parameter-card__remove"
								aria-label=${ `Remove parameter ${ parameter.key }` }
								title="Remove parameter"
								@click=${ () => this.removeParameter(parameter.id) }
							>
								<i class="fa-solid fa-trash-can" aria-hidden="true"></i>
							</button>
						` }
				</header>
				<div class="parameter-card__body">
					${ this.renderSegmented(
						parameterValueTypeItems,
						parameter.valueType,
						'Parameter value type',
						valueType => this.setParameterValueType(parameter, valueType),
					) }
					${ parameter.valueType === 'integer'
						? this.renderSegmented(
							parameterGeneratorItems,
							parameter.generatorType,
							'Parameter value source',
							generatorType => this.updateParameter(parameter.id, { generatorType }),
						)
						: nothing }
					${ this.renderParameterValues(parameter) }
				</div>
			</article>
		`;
	}

	private renderVariantsSection(): TemplateResult {
		const parameters = this.draft.parameters;

		return html`
			<p class="section__intro">
				${ parameters.length === 0
					? html`This makes one achievement. Add a parameter such as <code>{n}</code> to make
						one per value, and use it in the name, description and logic.`
					: html`Every combination of values makes its own achievement. Give some of them another
						tier, or skip them, in the Tiers panel above the rule.` }
			</p>
			${ parameters.map((parameter, index) => this.renderParameter(parameter, index)) }
			${ this.readOnlyVersion
				? nothing
				: html`
					<button type="button" class="add-button" @click=${ this.addParameter }>
						<i class="fa-solid fa-plus" aria-hidden="true"></i>
						Add parameter
					</button>
				` }
		`;
	}

	// ── Preview section ─────────────────────────────────────────────────────

	private renderPreviewSection(): TemplateResult {
		const previews = getPreviews(this.draft, previewLimit);
		const count = countAchievements(this.draft);

		if (previews.length === 0) {
			return html`
				<aa-empty-state compact>
					Give every parameter at least one value to see a preview.
				</aa-empty-state>
			`;
		}

		return html`
			<ol class="preview-list">
				${ previews.map(preview => html`
					<li class="preview-card">
						<img
							src=${ getAchievementTierIcon(preview.tier) }
							alt=${ formatTierLabel(preview.tier) }
							title=${ formatTierLabel(preview.tier) }
						/>
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
				? html`<small class="field__help">Showing the first ${ previews.length } of ${ count }.</small>`
				: nothing }
		`;
	}

	// ── Panes ───────────────────────────────────────────────────────────────

	private renderInspector(): TemplateResult {
		const count = countAchievements(this.draft);
		const category = this.categoryList.find(item => item.id === this.draft.categoryId);
		const parameterKeys = this.draft.parameters.map(parameter => `{${ parameter.key }}`).join(' ');

		const template = this.selectedTemplate;

		return html`
			<aside class="inspector" aria-label="Achievement settings">
				${ this.renderSection(
					'status',
					'Status',
					[ ...this.statusNotes, ...template ? [ template.isDisabled ? 'Disabled' : 'Enabled' ] : [] ].join(' · '),
					() => this.renderStatusSection(),
					false,
				) }
				${ this.renderSection(
					'card',
					'Card',
					category?.name ?? 'No category',
					() => this.renderCardSection(),
				) }
				${ this.renderSection(
					'type',
					'Type',
					this.draft.achievementScope === 'progression' ? 'Progression' : 'Session',
					() => this.renderTypeSection(),
				) }
				${ this.renderSection(
					'variants',
					'Variants',
					parameterKeys || 'None',
					() => this.renderVariantsSection(),
				) }
				${ this.renderSection(
					'preview',
					'Preview',
					formatCount(count, 'achievement'),
					() => this.renderPreviewSection(),
				) }
			</aside>
		`;
	}

	/**
	 * What the editor is doing with the open version, as far as the library doesn't show it
	 * (it already shows the template, its versions and which one is open).
	 */
	private get statusNotes(): string[] {
		const template = this.selectedTemplate;
		const version = this.selectedVersion;
		if (!template || !version)
			return [ 'Not saved yet' ];

		return [
			...this.readOnlyVersion ? [ 'Read-only' ] : [],
			...version.status === 'Published' && !this.readOnlyVersion ? [ 'Saving creates a new draft' ] : [],
			...this.hasUnsavedChanges ? [ 'Unsaved changes' ] : [],
		];
	}

	/**
	 * The open version's state and what can be done with the template: enable or disable it,
	 * unlock a published version, duplicate it. These act on the saved template, not the
	 * draft, so the section works on read-only versions too.
	 */
	private renderStatusSection(): TemplateResult {
		const template = this.selectedTemplate;
		const disabled = !!template?.isDisabled;
		const canManage = !this.viewOnly && !this.locked && !!template;
		const notes = this.statusNotes;

		return html`
			${ template || notes.length > 0
				? html`
					<div class="status-line">
						<b>${ notes.join(' · ') }</b>
						${ template ? this.renderEnabledSwitch(template, disabled, canManage) : nothing }
					</div>
				`
				: nothing }
			${ disabled
				? html`
					<p class="section__intro">
						Not checked in games, and it doesn’t count toward statistics or MMR cap.
						Players keep what they unlocked, and it counts again when enabled.
					</p>
				`
				: nothing }
			${ canManage ? this.renderStatusActions(template!) : nothing }
		`;
	}

	/** One switch both shows and changes whether the template counts. */
	private renderEnabledSwitch(
		template: AchievementTemplateResponse,
		disabled: boolean,
		canManage: boolean,
	): TemplateResult {
		return html`
			<label class="switch" title=${ canManage ? '' : 'Unlock editing to enable or disable it' }>
				<input
					type="checkbox"
					role="switch"
					.checked=${ live(!disabled) }
					?disabled=${ !canManage }
					@change=${ (event: Event) => {
						const input = event.currentTarget as HTMLInputElement;
						// Cancelled: keep showing the saved state.
						if (!this.requestDisabledChange(template.id, !input.checked))
							input.checked = !disabled;
					} }
				/>
				<span class="switch__track" aria-hidden="true"></span>
				<span>${ disabled ? 'Disabled' : 'Enabled' }</span>
			</label>
		`;
	}

	private renderStatusActions(template: AchievementTemplateResponse): TemplateResult {
		return html`
			<div class="status-actions">
				${ this.readOnlyVersion && !template.isBuiltIn
					? html`
						<aa-button size="small" variant="primary" @click=${ () => this.createEditableDraft() }>
							<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
							Create editable draft
						</aa-button>
					`
					: nothing }
				<aa-button size="small" variant="secondary" @click=${ () => this.duplicateAsNew() }>
					<i class="fa-solid fa-copy" aria-hidden="true"></i>
					Duplicate as new
				</aa-button>
			</div>
		`;
	}

	/** Asks the page to enable or disable the template; false when the user cancels. */
	private requestDisabledChange(templateId: string, disabled: boolean): boolean {
		if (disabled && !window.confirm('Disable this achievement? It stops counting for every player until you enable it again.'))
			return false;

		this.dispatchEvent(new CustomEvent<AchievementTemplateDisabledChangeDetail>(
			achievementTemplateDisabledChangeEventName,
			{ detail: { templateId, disabled }, bubbles: true, composed: true },
		));

		return true;
	}

	private renderCanvasPane(): TemplateResult {
		const logicErrors = this.countErrors('logic');

		return html`
			<main
				class="canvas-pane ${ logicErrors ? 'canvas-pane--error' : '' }"
				aria-label="Unlock rule"
			>
				${ keyed(this.canvasKey, html`
					<aa-rule-workspace
						.rule=${ this.draft.rule }
						.progression=${ this.draft.progression }
						.parameters=${ this.draft.parameters }
						.previews=${ getPreviews(this.draft, previewLimit) }
						.achievementScope=${ this.draft.achievementScope }
						.tier=${ this.draft.tier }
						.tierRules=${ this.draft.tierRules }
						.skipRules=${ this.draft.skipRules }
						.readOnly=${ this.readOnlyVersion }
						@achievement-logic-change=${ (
							event: CustomEvent<AchievementLogicChangeDetail>,
						) => this.updateDraft(event.detail) }
					>${ this.renderLibraryToggle() }</aa-rule-workspace>
				`) }
				${ this.showCategoryManager && !this.readOnlyVersion
					? html`
						<div class="canvas-pane__overlay">
							<aa-achievement-category-manager
								.categories=${ this.categoryList }
								.actions=${ this.categoryActions }
								@achievement-categories-updated=${ this.handleCategoriesUpdated }
								@achievement-category-manager-close=${ () => {
									this.showCategoryManager = false;
								} }
							></aa-achievement-category-manager>
						</div>
					`
					: nothing }
			</main>
		`;
	}

	private renderLibrary(): TemplateResult | typeof nothing {
		if (!this.showLibrary)
			return nothing;

		return html`
			${ this.layout === 'wide'
				? nothing
				: html`
					<div
						class="library-scrim"
						aria-hidden="true"
						@click=${ () => {
							this.libraryDrawerOpen = false;
						} }
					></div>
				` }
			<aa-achievement-template-library
				id="achievement-library"
				class="library-pane"
				.templates=${ this.templates }
				.categories=${ this.categoryList }
				.selectedTemplateId=${ this.selectedTemplateId }
				.selectedVersionId=${ this.selectedVersionId }
				.dirty=${ this.hasUnsavedChanges }
				.newDraftName=${ this.draft.nameTemplate }
				.readOnly=${ this.viewOnly || this.locked }
				@achievement-template-open=${ this.handleTemplateOpen }
				@keydown=${ (event: KeyboardEvent) => {
					if (event.key === 'Escape' && this.layout !== 'wide')
						this.libraryDrawerOpen = false;
				} }
			></aa-achievement-template-library>
		`;
	}

	// ── Library toggle and errors ───────────────────────────────────────────

	private renderLibraryToggle(): TemplateResult | typeof nothing {
		if (this.viewOnly)
			return nothing;

		return html`
			<button
				slot="toolbar-start"
				type="button"
				class="icon-button library-toggle"
				aria-expanded=${ String(this.showLibrary) }
				aria-controls="achievement-library"
				aria-label=${ this.showLibrary ? 'Hide achievement library' : 'Show achievement library' }
				title=${ this.showLibrary ? 'Hide library' : 'Show library' }
				@click=${ this.toggleLibrary }
			>
				<i class="fa-solid fa-list" aria-hidden="true"></i>
			</button>
		`;
	}

	/** Shown over the workbench, so asking does not push the layout around. */
	private renderDraftConflict(): TemplateResult | typeof nothing {
		const conflict = this.draftConflict;
		if (!conflict)
			return nothing;

		return html`
			<div
				class="body-overlay"
				@keydown=${ (event: KeyboardEvent) => {
					if (event.key === 'Escape') {
						event.stopPropagation();
						this.resolveDraftConflict('cancel');
					}
				} }
			>
				<div
					class="conflict-card"
					role="group"
					aria-labelledby="draft-conflict-title"
					aria-describedby="draft-conflict-text"
				>
					<h3 id="draft-conflict-title">This achievement already has a draft</h3>
					<p id="draft-conflict-text">
						Version ${ conflict.existingDraft.versionNumber } is already a draft. Saving an edit of
						version ${ conflict.version.versionNumber } replaces everything in that draft.
					</p>
					<div class="conflict-card__actions">
						<aa-button
							type="button"
							size="small"
							variant="ghost"
							@click=${ () => this.resolveDraftConflict('cancel') }
						>
							Cancel
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
							variant="primary"
							data-draft-conflict-default
							@click=${ () => this.resolveDraftConflict('open') }
						>
							Open existing draft
						</aa-button>
					</div>
				</div>
			</div>
		`;
	}

	private renderErrors(): TemplateResult | typeof nothing {
		if (this.errors.length > 0) {
			return html`
				<div class="error-list" role="alert">
					<p class="error-list__title">Fix these before saving:</p>
					<ul>
						${ this.errors.map(error => html`
							<li>
								${ error.area
									? html`
										<button
											type="button"
											class="error-list__link"
											@click=${ () => void this.revealErrorArea(error.area!, true) }
										>${ error.message }</button>
									`
									: error.message }
							</li>
						`) }
					</ul>
				</div>
			`;
		}

		if (this.serverErrors.length > 0) {
			return html`
				<div class="error-list" role="alert">
					<p class="error-list__title">Saved as a draft, but it can't be published yet:</p>
					<ul>
						${ this.serverErrors.map(error => html`<li>${ error }</li>`) }
					</ul>
				</div>
			`;
		}

		return nothing;
	}

	override render(): TemplateResult {
		const classes = [
			'workbench',
			`workbench--${ this.layout }`,
			this.showLibrary ? 'workbench--library' : '',
			this.viewOnly ? 'workbench--view-only' : '',
		].filter(Boolean).join(' ');

		return html`
			<div class=${ classes }>
				${ this.renderErrors() }
				<div class="workbench__body">
					${ this.renderLibrary() }
					${ this.renderCanvasPane() }
					${ this.renderInspector() }
					${ this.renderDraftConflict() }
				</div>
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

	interface HTMLElementEventMap {
		[achievementBuilderStateChangeEventName]:     CustomEvent<AchievementBuilderStateChangeDetail>;
		[achievementTemplateDisabledChangeEventName]: CustomEvent<AchievementTemplateDisabledChangeDetail>;
	}
}
