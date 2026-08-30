import '../aa-tabs/aa-tabs.js';
import '../achievement-category-manager/achievement-category-manager.js';
import '../../ui/button/aa-button.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import {
	AchievementParameterDraft,
	AchievementProgressionDraft,
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementTemplatePreview,
	AchievementValueDraft,
	AchievementValueSource,
	createAchievementBuilderId,
	createDefaultAchievementRule,
	createEmptyAchievementTemplate,
} from '../../models/achievementBuilder.js';
import { AchievementTier } from '../../models/enums.js';
import type { AchievementCategoryResponse } from '../../models/achievementBuilderApi.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import type { AaTabItem } from '../aa-tabs/aa-tabs.js';
import type {
	AchievementCategoriesUpdatedDetail,
	AchievementCategoryActions,
} from '../achievement-category-manager/achievement-category-manager.js';
import achievementBuilderStyles from './achievement-builder.css?inline';
import {
	formatAchievementRule,
	formatSequenceTarget,
} from './achievement-rule-presentation.js';

export const achievementBuilderSaveEventName = 'achievement-builder-save';

export type AchievementBuilderSaveEvent = CustomEvent<AchievementTemplateDraft>;

const tabs: AaTabItem[] = [
	{ id: 'details', label: 'Details' },
	{ id: 'parameters', label: 'Parameters' },
	{ id: 'logic', label: 'Logic blocks' },
];

const ruleTypes: { value: AchievementRuleDraft['type']; label: string; }[] = [
	{ value: 'all', label: 'All conditions' },
	{ value: 'any', label: 'Any condition' },
	{ value: 'not', label: 'Not' },
	{ value: 'round', label: 'Round matches' },
	{ value: 'throw', label: 'Throw matches' },
	{ value: 'compare', label: 'Compare values' },
	{ value: 'sequence', label: 'Ordered sequence' },
];

const valueSources: { value: AchievementValueSource; label: string; }[] = [
	{ value: 'constant', label: 'Constant' },
	{ value: 'parameter', label: 'Parameter' },
	{ value: 'board.leftNeighbor', label: 'Left dartboard neighbor of parameter' },
	{ value: 'board.rightNeighbor', label: 'Right dartboard neighbor of parameter' },
	{ value: 'round.throwCount', label: 'Round throw count' },
	{ value: 'round.finalPoints', label: 'Round final-points sum' },
	{ value: 'round.rawPointsDistinctCount', label: 'Distinct raw-point values' },
	{ value: 'round.minimumRawPoints', label: 'Minimum raw points' },
	{ value: 'round.singleCount', label: 'Singles in round' },
	{ value: 'round.doubleCount', label: 'Doubles in round' },
	{ value: 'round.tripleCount', label: 'Triples in round' },
	{ value: 'game.roundsPlayed', label: 'Rounds played' },
	{ value: 'game.placement', label: 'Final placement' },
	{ value: 'game.overshootCount', label: 'Overshoot rounds' },
	{ value: 'game.rimCount', label: 'Rim hits' },
	{ value: 'game.missCount', label: 'Misses' },
];

type BuilderScope = 'root' | 'round';
type ValueEditorRole = 'comparison-left' | 'comparison-right' | 'hit-location';
type TemplateField = 'nameTemplate' | 'descriptionTemplate';
interface CanvasDragState {
	pointerId: number;
	startX: number;
	startY: number;
	originX: number;
	originY: number;
}

@customElement('aa-achievement-builder')
export class AaAchievementBuilder extends LitElement {

	@property({ type: String }) seasonId = '';
	@property({ attribute: false }) initialDraft?: AchievementTemplateDraft;
	@property({ attribute: false }) categories: AchievementCategoryResponse[] = [];
	@property({ attribute: false }) categoryActions?: AchievementCategoryActions;
	@property({ type: Number }) maximumGeneratedInstances = 500;

	@state() private selectedTab = 'details';
	@state() private draft: AchievementTemplateDraft = createEmptyAchievementTemplate('');
	@state() private errors: string[] = [];
	@state() private logicCanvasScale = 1;
	@state() private logicCanvasX = 24;
	@state() private logicCanvasY = 24;
	@state() private logicCanvasDragging = false;
	@state() private openAddControlId = '';
	@state() private expandedRuleId = '';
	@state() private expandedSequenceTargetId = '';
	@state() private showCategoryManager = false;
	@state() private activeTemplateField: TemplateField = 'nameTemplate';

	private logicCanvasDrag?: CanvasDragState;

	override firstUpdated(): void {
		this.resetDraft();
	}

	private resetDraft(): void {
		const draft = structuredClone(
			this.initialDraft ?? createEmptyAchievementTemplate(this.seasonId),
		);
		if (!draft.categoryId)
			draft.categoryId = this.getPreferredCategoryId('Custom');
		this.draft = draft;
		this.selectedTab = 'details';
		this.errors = [];
		this.openAddControlId = '';
		this.expandedRuleId = '';
		this.expandedSequenceTargetId = '';
		this.showCategoryManager = false;
		this.activeTemplateField = 'nameTemplate';
		this.resetLogicCanvas();
	}

	public loadDraft(draft?: AchievementTemplateDraft): void {
		this.initialDraft = draft;
		this.resetDraft();
	}

	private updateDraft(patch: Partial<AchievementTemplateDraft>): void {
		this.draft = { ...this.draft, ...patch };
		this.errors = [];
	}

	private getPreferredCategoryId(preferredName: string): string {
		const active = this.categories
			.filter(category => !category.isArchived)
			.sort((left, right) => left.sortOrder - right.sortOrder);
		return active.find(category =>
			category.name.localeCompare(preferredName, undefined, {
				sensitivity: 'accent',
			}) === 0)?.id
			?? active.find(category =>
				category.name.localeCompare('Custom', undefined, {
					sensitivity: 'accent',
				}) === 0)?.id
			?? active[0]?.id
			?? '';
	}

	private get templateParameterKeys(): string[] {
		return [ ...new Set(
			this.draft.parameters
				.map(parameter => parameter.key.trim())
				.filter(key => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)),
		) ];
	}

	private insertTemplateParameter(parameterKey: string): void {
		const field = this.activeTemplateField;
		const control = this.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
			`[data-template-field="${ field }"]`,
		);
		const value = this.draft[field];
		const start = control?.selectionStart ?? value.length;
		const end = control?.selectionEnd ?? start;
		const token = `{${ parameterKey }}`;
		const nextValue = `${ value.slice(0, start) }${ token }${ value.slice(end) }`;
		const caret = start + token.length;

		this.updateDraft(field === 'nameTemplate'
			? { nameTemplate: nextValue }
			: { descriptionTemplate: nextValue });
		void this.updateComplete.then(() => {
			const updatedControl =
				this.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
					`[data-template-field="${ field }"]`,
				);
			updatedControl?.focus();
			updatedControl?.setSelectionRange(caret, caret);
		});
	}

	private handleTabChange(event: CustomEvent<{ id: string; }>): void {
		this.selectedTab = event.detail.id;
		if (this.selectedTab === 'logic')
			void this.fitLogicCanvas();
	}

	private resetLogicCanvas(): void {
		this.logicCanvasScale = 1;
		this.logicCanvasX = 24;
		this.logicCanvasY = 24;
	}

	private setLogicCanvasZoom(
		scale: number,
		focusX?: number,
		focusY?: number,
	): void {
		const nextScale = Math.min(1.5, Math.max(0.35, scale));
		const viewport = this.shadowRoot?.querySelector<HTMLElement>('.logic-canvas__viewport');
		const x = focusX ?? (viewport?.clientWidth ?? 0) / 2;
		const y = focusY ?? (viewport?.clientHeight ?? 0) / 2;
		const worldX = (x - this.logicCanvasX) / this.logicCanvasScale;
		const worldY = (y - this.logicCanvasY) / this.logicCanvasScale;

		this.logicCanvasX = x - worldX * nextScale;
		this.logicCanvasY = y - worldY * nextScale;
		this.logicCanvasScale = nextScale;
	}

	private handleLogicCanvasWheel(event: WheelEvent): void {
		event.preventDefault();
		const viewport = event.currentTarget as HTMLElement;
		const bounds = viewport.getBoundingClientRect();
		const factor = Math.exp(-event.deltaY * 0.0015);
		this.setLogicCanvasZoom(
			this.logicCanvasScale * factor,
			event.clientX - bounds.left,
			event.clientY - bounds.top,
		);
	}

	private handleLogicCanvasPointerDown(event: PointerEvent): void {
		if (event.button !== 0)
			return;

		const eventPath = event.composedPath();
		const clickedAddControl = eventPath.some(item =>
			item instanceof Element && item.classList.contains('logic-add-control'));
		if (this.openAddControlId && !clickedAddControl)
			this.openAddControlId = '';

		const isInteractive = eventPath.some(item =>
			item instanceof Element
			&& item.matches('button, input, select, textarea, .logic-node'));
		if (isInteractive)
			return;

		const viewport = event.currentTarget as HTMLElement;
		viewport.setPointerCapture(event.pointerId);
		this.logicCanvasDrag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: this.logicCanvasX,
			originY: this.logicCanvasY,
		};
		this.logicCanvasDragging = true;
	}

	private handleLogicCanvasPointerMove(event: PointerEvent): void {
		if (!this.logicCanvasDrag || this.logicCanvasDrag.pointerId !== event.pointerId)
			return;

		this.logicCanvasX = this.logicCanvasDrag.originX + event.clientX - this.logicCanvasDrag.startX;
		this.logicCanvasY = this.logicCanvasDrag.originY + event.clientY - this.logicCanvasDrag.startY;
	}

	private handleLogicCanvasPointerUp(event: PointerEvent): void {
		if (!this.logicCanvasDrag || this.logicCanvasDrag.pointerId !== event.pointerId)
			return;

		const viewport = event.currentTarget as HTMLElement;
		if (viewport.hasPointerCapture(event.pointerId))
			viewport.releasePointerCapture(event.pointerId);

		this.logicCanvasDrag = undefined;
		this.logicCanvasDragging = false;
	}

	private async fitLogicCanvas(): Promise<void> {
		await this.updateComplete;
		const viewport = this.shadowRoot?.querySelector<HTMLElement>('.logic-canvas__viewport');
		const graph = this.shadowRoot?.querySelector<HTMLElement>('.logic-canvas__graph');
		if (!viewport || !graph)
			return;

		const padding = 48;
		const scale = Math.min(
			1,
			(viewport.clientWidth - padding) / graph.offsetWidth,
			(viewport.clientHeight - padding) / graph.offsetHeight,
		);
		this.logicCanvasScale = Math.max(0.35, scale);
		this.logicCanvasX = Math.max(24, (viewport.clientWidth - graph.offsetWidth * this.logicCanvasScale) / 2);
		this.logicCanvasY = Math.max(24, (viewport.clientHeight - graph.offsetHeight * this.logicCanvasScale) / 2);
	}

	private validate(): string[] {
		const errors: string[] = [];
		if (!this.draft.nameTemplate.trim())
			errors.push('Name is required.');
		if (!this.draft.descriptionTemplate.trim())
			errors.push('Description is required.');
		const selectedCategory = this.categories.find(
			category => category.id === this.draft.categoryId,
		);
		if (!selectedCategory)
			errors.push('Choose a valid category.');
		else if (selectedCategory.isArchived && !this.draft.id)
			errors.push('Choose an active category for a new achievement.');
		if (!Object.values(AchievementTier).includes(this.draft.tier))
			errors.push('Choose a valid achievement tier.');

		const keys = this.draft.parameters.map(parameter => parameter.key.trim());
		if (keys.some(key => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)))
			errors.push('Parameter keys must start with a letter and contain only letters, numbers, and _.');
		if (new Set(keys).size !== keys.length)
			errors.push('Parameter keys must be unique.');

		for (const parameter of this.draft.parameters) {
			if (parameter.generatorType === 'range') {
				if (
					parameter.minimum === undefined
					|| parameter.maximum === undefined
					|| parameter.step === undefined
				)
					errors.push(`Parameter ${ parameter.key || '(unnamed)' } needs a complete range.`);
				else if (parameter.minimum > parameter.maximum || parameter.step <= 0)
					errors.push(`Parameter ${ parameter.key || '(unnamed)' } has an invalid range.`);
			}
			else if (parameter.values.length === 0) {
				errors.push(`Parameter ${ parameter.key || '(unnamed)' } needs at least one value.`);
			}
		}

		if (this.getGeneratedCount() > this.maximumGeneratedInstances) {
			errors.push(
				`This template generates more than ${ this.maximumGeneratedInstances } achievements.`,
			);
		}

		if (this.draft.achievementScope === 'progression') {
			if (!this.draft.progression || this.draft.progression.targets.length === 0)
				errors.push('Progression achievements need at least one target segment.');
		}
		else {
			errors.push(...this.getRuleErrors(this.draft.rule, 'Logic', 'root'));
		}

		return errors;
	}

	private getRuleErrors(
		rule: AchievementRuleDraft,
		path: string,
		scope: BuilderScope,
	): string[] {
		const errors: string[] = [];
		const validateValue = (
			value: AchievementValueDraft,
			valuePath: string,
			role: ValueEditorRole,
		): void => {
			if (!this.getAvailableValueSources(scope, role).includes(value.source))
				errors.push(`${ valuePath } is not available in this block scope.`);
			if (
				value.source === 'parameter'
				|| value.source === 'board.leftNeighbor'
				|| value.source === 'board.rightNeighbor'
			) {
				const parameter = this.draft.parameters.find(item => item.key === value.value);
				if (!parameter)
					errors.push(`${ valuePath } references a missing parameter.`);
				else if (
					value.source !== 'parameter'
					&& parameter.valueType !== 'integer'
				)
					errors.push(`${ valuePath } needs an integer parameter.`);
			}
			else if (value.source === 'constant' && !Number.isFinite(Number(value.value))) {
				errors.push(`${ valuePath } needs a numeric constant.`);
			}
		};

		switch (rule.type) {
		case 'all':
		case 'any':
			if (rule.children.length === 0)
				errors.push(`${ path } needs at least one child block.`);
			rule.children.forEach((child, index) =>
				errors.push(...this.getRuleErrors(child, `${ path } ${ index + 1 }`, scope)));
			break;
		case 'not':
			errors.push(...this.getRuleErrors(rule.child, `${ path } not`, scope));
			break;
		case 'round':
			if (rule.statuses.length === 0)
				errors.push(`${ path } must include at least one round status.`);
			errors.push(...this.getRuleErrors(rule.condition, `${ path } round condition`, 'round'));
			break;
		case 'throw':
			validateValue(rule.hitLocation, `${ path } hit location`, 'hit-location');
			break;
		case 'compare':
			validateValue(rule.left, `${ path } left value`, 'comparison-left');
			validateValue(rule.right, `${ path } right value`, 'comparison-right');
			break;
		case 'sequence':
			if (rule.targets.length !== 3)
				errors.push(`${ path } needs exactly three sequence targets.`);
			rule.targets.forEach((target, index) =>
				validateValue(
					target.hitLocation,
					`${ path } target ${ index + 1 }`,
					'hit-location',
				));
			break;
		}

		return errors;
	}

	public submit(): boolean {
		const errors = this.validate();
		this.errors = errors;
		if (errors.length > 0) {
			this.selectedTab = errors.some(error => error.includes('Parameter'))
				? 'parameters'
				: errors.some(error => error.includes('logic') || error.includes('placement'))
					? 'logic'
					: 'details';
			return false;
		}

		this.dispatchEvent(new CustomEvent<AchievementTemplateDraft>(
			achievementBuilderSaveEventName,
			{
				detail: structuredClone(this.draft),
				bubbles: true,
				composed: true,
			},
		));
		return true;
	}

	private addParameter(): void {
		const parameter: AchievementParameterDraft = {
			id: createAchievementBuilderId(),
			key: `parameter${ this.draft.parameters.length + 1 }`,
			valueType: 'integer',
			generatorType: 'range',
			minimum: 1,
			maximum: 20,
			step: 1,
			values: [],
		};
		this.updateDraft({ parameters: [ ...this.draft.parameters, parameter ] });
	}

	private updateParameter(id: string, patch: Partial<AchievementParameterDraft>): void {
		this.updateDraft({
			parameters: this.draft.parameters.map(parameter =>
				parameter.id === id ? { ...parameter, ...patch } : parameter),
		});
	}

	private setParameterValueType(
		parameter: AchievementParameterDraft,
		valueType: AchievementParameterDraft['valueType'],
	): void {
		this.updateParameter(parameter.id, {
			valueType,
			generatorType: valueType === 'integer' ? parameter.generatorType : 'set',
			values: valueType === 'boolean'
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

	private createRule(
		type: AchievementRuleDraft['type'],
		scope: BuilderScope = 'root',
	): AchievementRuleDraft {
		const id = createAchievementBuilderId();
		const constant = (): AchievementValueDraft => ({ source: 'constant', value: '0' });

		switch (type) {
		case 'all':
		case 'any':
			return { id, type, children: [] };
		case 'not':
			return { id, type, child: { id: createAchievementBuilderId(), type: 'all', children: [] } };
		case 'round':
			return {
				id,
				type,
				quantifier: 'any',
				statuses: [ 'valid', 'victory' ],
				condition: { id: createAchievementBuilderId(), type: 'all', children: [] },
			};
		case 'throw':
			return {
				id,
				type,
				quantifier: 'any',
				scope: 'currentRound',
				hitLocation: constant(),
				throwType: 'any',
			};
		case 'compare':
			return {
				id,
				type,
				left: {
					source: scope === 'round' ? 'round.throwCount' : 'game.roundsPlayed',
					value: '',
				},
				operator: 'equal',
				right: constant(),
			};
		case 'sequence':
			return {
				id,
				type,
				scope: 'sameRound',
				targets: [],
			};
		}
	}

	private replaceRule(
		current: AchievementRuleDraft,
		id: string,
		replacement?: AchievementRuleDraft,
	): AchievementRuleDraft {
		if (current.id === id)
			return replacement ?? createDefaultAchievementRule();

		switch (current.type) {
		case 'all':
		case 'any':
			return {
				...current,
				children: replacement
					? current.children.map(child => this.replaceRule(child, id, replacement))
					: current.children
						.filter(child => child.id !== id)
						.map(child => this.replaceRule(child, id)),
			};
		case 'not':
			return { ...current, child: this.replaceRule(current.child, id, replacement) };
		case 'round':
			return { ...current, condition: this.replaceRule(current.condition, id, replacement) };
		default:
			return current;
		}
	}

	private updateRule(id: string, patch: Partial<AchievementRuleDraft>): void {
		const find = (rule: AchievementRuleDraft): AchievementRuleDraft | undefined => {
			if (rule.id === id)
				return rule;
			if (rule.type === 'all' || rule.type === 'any')
				return rule.children.map(find).find(Boolean);
			if (rule.type === 'not')
				return find(rule.child);
			if (rule.type === 'round')
				return find(rule.condition);
			return undefined;
		};
		const current = find(this.draft.rule);
		if (!current)
			return;

		this.updateDraft({
			rule: this.replaceRule(
				this.draft.rule,
				id,
				{ ...current, ...patch } as AchievementRuleDraft,
			),
		});
	}

	private addChildRule(
		parentId: string,
		type: AchievementRuleDraft['type'],
		scope: BuilderScope,
	): void {
		const find = (rule: AchievementRuleDraft): AchievementRuleDraft | undefined => {
			if (rule.id === parentId)
				return rule;
			if (rule.type === 'all' || rule.type === 'any')
				return rule.children.map(find).find(Boolean);
			if (rule.type === 'not')
				return find(rule.child);
			if (rule.type === 'round')
				return find(rule.condition);
			return undefined;
		};
		const parent = find(this.draft.rule);
		if (!parent)
			return;

		const child = this.createRule(type, scope);
		if (parent.type === 'all' || parent.type === 'any') {
			this.updateRule(parent.id, {
				children: [ ...parent.children, child ],
			});
		}
		else if (parent.type === 'round') {
			const condition = parent.condition.type === 'all'
				? parent.condition
				: { ...createDefaultAchievementRule(), children: [ parent.condition ] };
			this.updateRule(parent.id, {
				condition: {
					...condition,
					children: [ ...condition.children, child ],
				},
			});
		}
		else if (
			parent.type === 'not'
			&& (parent.child.type === 'all' || parent.child.type === 'any')
		) {
			this.updateRule(parent.id, {
				child: {
					...parent.child,
					children: [ ...parent.child.children, child ],
				},
			});
		}
		this.expandedRuleId = child.id;
		this.expandedSequenceTargetId = '';
	}

	private removeRule(id: string): void {
		if (this.expandedRuleId === id)
			this.expandedRuleId = '';
		this.updateDraft({ rule: this.replaceRule(this.draft.rule, id) });
	}

	private getValueEditorChoice(value: AchievementValueDraft): string {
		if (
			value.source === 'parameter'
			|| value.source === 'board.leftNeighbor'
			|| value.source === 'board.rightNeighbor'
		)
			return `${ value.source }:${ value.value }`;
		return value.source;
	}

	private parseValueEditorChoice(
		choice: string,
		current: AchievementValueDraft,
	): AchievementValueDraft {
		const separator = choice.indexOf(':');
		if (separator >= 0) {
			return {
				source: choice.slice(0, separator) as AchievementValueSource,
				value: choice.slice(separator + 1),
			};
		}
		return {
			source: choice as AchievementValueSource,
			value: choice === 'constant' ? current.value || '0' : '',
		};
	}

	private renderValueEditor(
		value: AchievementValueDraft,
		onChange: (value: AchievementValueDraft) => void,
		scope: BuilderScope,
		role: ValueEditorRole = 'hit-location',
	): TemplateResult {
		const sourceNames = this.getAvailableValueSources(scope, role);
		const availableSources = valueSources.filter(source => sourceNames.includes(source.value));
		return html`
			<div class="value-editor">
				<select
					aria-label="Value"
					.value=${ this.getValueEditorChoice(value) }
					@change=${ (event: Event) => onChange(this.parseValueEditorChoice(
						(event.currentTarget as HTMLSelectElement).value,
						value,
					)) }
				>
					${ availableSources
						.filter(source =>
							source.value !== 'parameter'
							&& source.value !== 'board.leftNeighbor'
							&& source.value !== 'board.rightNeighbor')
						.map(source => html`
							<option value=${ source.value }>
								${ source.value === 'constant' ? 'Number' : source.label }
							</option>
						`) }
					${ this.draft.parameters.length > 0
						? html`
							<optgroup label="Achievement values">
								${ this.draft.parameters.map(parameter => html`
									<option value=${ `parameter:${ parameter.key }` }>
										${ parameter.key }
									</option>
								`) }
							</optgroup>
							<optgroup label="Dartboard neighbors">
								${ this.draft.parameters
									.filter(parameter => parameter.valueType === 'integer')
									.flatMap(parameter => [
										html`
											<option value=${ `board.leftNeighbor:${ parameter.key }` }>
												Left of ${ parameter.key }
											</option>
										`,
										html`
											<option value=${ `board.rightNeighbor:${ parameter.key }` }>
												Right of ${ parameter.key }
											</option>
										`,
									]) }
							</optgroup>
						`
						: nothing }
				</select>
				${ value.source === 'constant'
					? html`
						<input
							type="number"
							aria-label="Number"
							.value=${ value.value }
							@input=${ (event: InputEvent) => onChange({
								...value,
								value: (event.currentTarget as HTMLInputElement).value,
							}) }
						/>
					`
					: nothing }
			</div>
		`;
	}

	private getAvailableValueSources(
		scope: BuilderScope,
		role: ValueEditorRole,
	): AchievementValueSource[] {
		const common: AchievementValueSource[] = [
			'constant',
			'parameter',
			'board.leftNeighbor',
			'board.rightNeighbor',
		];
		if (role === 'hit-location')
			return common;

		const scoped = valueSources
			.map(source => source.value)
			.filter(source => scope === 'round'
				? source.startsWith('round.')
				: source.startsWith('game.'));
		return [
			...common,
			...scoped.filter(source =>
				role === 'comparison-left' || source !== 'round.minimumRawPoints'),
		];
	}

	private updateProgression(patch: Partial<AchievementProgressionDraft>): void {
		const progression = this.draft.progression ?? {
			statuses: [ 'valid', 'victory' ],
			targets: [],
		};
		this.updateDraft({ progression: { ...progression, ...patch } });
	}

	private renderProgressionLogic(): TemplateResult {
		const progression = this.draft.progression ?? {
			statuses: [ 'valid', 'victory' ],
			targets: [],
		};
		return html`
			<section class="builder-panel">
				<div class="panel-intro panel-intro--actions">
					<div>
						<h3>Progression target set</h3>
						<p>
							Collect matching dartboard segments across completed games. This can
							express all current board-coverage progression achievements.
						</p>
					</div>
					<aa-button
						type="button"
						size="small"
						@click=${ () => this.updateProgression({
							targets: [
								...progression.targets,
								{
									id: createAchievementBuilderId(),
									hitLocation: { source: 'constant', value: '1' },
									throwType: 'single',
								},
							],
						}) }
					>
						Add target
					</aa-button>
				</div>
				<div class="sequence-targets">
					${ progression.targets.map((target, index) => html`
						<div class="sequence-target">
							<strong>#${ index + 1 }</strong>
							${ this.renderValueEditor(target.hitLocation, value =>
								this.updateProgression({
									targets: progression.targets.map(item =>
										item.id === target.id
											? { ...item, hitLocation: value }
											: item),
								}), 'root') }
							<select
								.value=${ target.throwType }
								@change=${ (event: Event) => this.updateProgression({
									targets: progression.targets.map(item =>
										item.id === target.id
											? {
												...item,
												throwType: (event.currentTarget as HTMLSelectElement)
													.value as typeof target.throwType,
											}
											: item),
								}) }
							>
								<option value="single">Single</option>
								<option value="double">Double</option>
								<option value="triple">Triple</option>
							</select>
							<button
								type="button"
								class="remove-button"
								aria-label="Remove progression target"
								@click=${ () => this.updateProgression({
									targets: progression.targets.filter(item => item.id !== target.id),
								}) }
							>&times;</button>
						</div>
					`) }
				</div>
				${ progression.targets.length === 0
					? html`
						<div class="empty-panel">
							Add the segments a player must collect across games.
						</div>
					`
					: nothing }
			</section>
		`;
	}

	private renderRule(
		rule: AchievementRuleDraft,
		depth = 0,
		scope: BuilderScope = 'root',
	): TemplateResult {
		const canRemove = depth > 0;
		if (rule.type === 'not') {
			return html`
				<article class="logic-node logic-node--not logic-node--compact">
					<strong>NOT</strong>
					${ canRemove
						? html`
							<button
								type="button"
								class="logic-node__compact-remove"
								aria-label="Remove NOT block"
								@click=${ () => this.removeRule(rule.id) }
							>&times;</button>
						`
						: nothing }
				</article>
			`;
		}

		if (rule.type === 'all' || rule.type === 'any') {
			return html`
				<article class="logic-node logic-node--group">
					<div class="logic-node--group__header">
						${ depth === 0
							? html`<span class="logic-node__scope">Start</span>`
							: scope === 'round'
								? html`<span class="logic-node__scope">Round</span>`
								: nothing }
						${ canRemove
							? html`
								<button
									type="button"
									class="logic-node__compact-remove"
									aria-label="Remove condition group"
									@click=${ () => this.removeRule(rule.id) }
								>&times;</button>
							`
							: nothing }
					</div>
					${ rule.children.length > 1
						? html`
							<div class="logic-group-mode" role="group" aria-label="Condition match mode">
								<button
									type="button"
									class=${ rule.type === 'all' ? 'logic-group-mode__active' : '' }
									aria-pressed=${ rule.type === 'all' }
									@click=${ () => this.updateRule(rule.id, { type: 'all' }) }
								>ALL</button>
								<button
									type="button"
									class=${ rule.type === 'any' ? 'logic-group-mode__active' : '' }
									aria-pressed=${ rule.type === 'any' }
									@click=${ () => this.updateRule(rule.id, { type: 'any' }) }
								>ANY</button>
							</div>
						`
						: html`
							<strong class="logic-group-single">
								${ rule.children.length === 0 ? 'Add a condition' : '1 condition' }
							</strong>
						` }
					<small>
						${ rule.children.length } condition${ rule.children.length === 1 ? '' : 's' }
					</small>
				</article>
			`;
		}

		const canCollapse = rule.type !== 'round';
		const isExpanded = !canCollapse || this.expandedRuleId === rule.id;
		if (!isExpanded) {
			return html`
				<article class="logic-node logic-node--${ rule.type } logic-node--summary">
					<button
						type="button"
						class="logic-node__summary-button"
						aria-label=${ `Edit ${ formatAchievementRule(rule) }` }
						@click=${ () => {
							this.expandedRuleId = rule.id;
							this.expandedSequenceTargetId = '';
						} }
					>
						<strong class="logic-node__type">
							${ ruleTypes.find(item => item.value === rule.type)?.label }
						</strong>
						<span>${ formatAchievementRule(rule) }</span>
					</button>
					${ canRemove
						? html`
							<button
								type="button"
								class="logic-node__compact-remove"
								aria-label="Remove logic block"
								@click=${ () => this.removeRule(rule.id) }
							>&times;</button>
						`
						: nothing }
				</article>
			`;
		}

		return html`
			<article class="logic-node logic-node--${ rule.type } logic-node--expanded">
				<header>
					<div class="logic-node__heading">
						${ depth === 0
							? html`<span class="logic-node__scope">Start</span>`
							: nothing }
						<strong class="logic-node__type">
							${ ruleTypes.find(item => item.value === rule.type)?.label }
						</strong>
						${ rule.type === 'round' || rule.type === 'compare'
							? nothing
							: html`<small>${ this.getRuleDescription(rule) }</small>` }
					</div>
					<div class="logic-node__actions">
						${ canCollapse
							? html`
								<button
									type="button"
									class="logic-node__collapse"
									aria-label="Collapse logic block"
									@click=${ () => {
										this.expandedRuleId = '';
										this.expandedSequenceTargetId = '';
									} }
								>-</button>
							`
							: nothing }
						${ canRemove
							? html`
							<button
								type="button"
								class="remove-button"
								aria-label="Remove logic block"
								@click=${ () => this.removeRule(rule.id) }
							>&times;</button>
							`
							: nothing }
					</div>
				</header>
				<div class="logic-node__body">
					${ this.renderRuleBody(rule, scope) }
				</div>
			</article>
		`;
	}

	private getRuleDescription(rule: AchievementRuleDraft): string {
		switch (rule.type) {
		case 'all':
			return `${ rule.children.length } connected condition${ rule.children.length === 1 ? '' : 's' } must match`;
		case 'any':
			return `${ rule.children.length } connected condition${ rule.children.length === 1 ? '' : 's' }; one must match`;
		case 'not':
			return 'Inverts the connected condition';
		case 'round':
			return 'Finds matching rounds, then checks their condition';
		case 'throw':
			return 'Checks throws inside the connected round';
		case 'compare':
			return 'Compares two values';
		case 'sequence':
			return 'Matches an ordered three-throw pattern';
		}
	}

	private getRuleChildren(
		rule: AchievementRuleDraft,
		scope: BuilderScope,
	): { rule: AchievementRuleDraft; scope: BuilderScope; }[] {
		const unwrapStructuralGroup = (
			child: AchievementRuleDraft,
			childScope: BuilderScope,
		): { rule: AchievementRuleDraft; scope: BuilderScope; }[] => {
			if (
				(child.type === 'all' || child.type === 'any')
				&& child.children.length <= 1
			) {
				return child.children.map(item => ({
					rule: item,
					scope: childScope,
				}));
			}
			return [ { rule: child, scope: childScope } ];
		};

		switch (rule.type) {
		case 'all':
		case 'any':
			return rule.children.map(child => ({ rule: child, scope }));
		case 'not':
			return unwrapStructuralGroup(rule.child, scope);
		case 'round':
			return unwrapStructuralGroup(rule.condition, 'round');
		default:
			return [];
		}
	}

	private canAddRuleChildren(rule: AchievementRuleDraft): boolean {
		if (rule.type === 'all' || rule.type === 'any' || rule.type === 'round')
			return true;
		return rule.type === 'not'
			&& (rule.child.type === 'all' || rule.child.type === 'any')
			&& rule.child.children.length === 0;
	}

	private getDirectChildCount(rule: AchievementRuleDraft): number {
		switch (rule.type) {
		case 'all':
		case 'any':
			return rule.children.length;
		case 'round':
			return rule.condition.type === 'all' || rule.condition.type === 'any'
				? rule.condition.children.length
				: 1;
		case 'not':
			return rule.child.type === 'all' || rule.child.type === 'any'
				? rule.child.children.length
				: 1;
		default:
			return 0;
		}
	}

	private renderRuleAddControl(
		rule: AchievementRuleDraft,
		scope: BuilderScope,
	): TemplateResult {
		return html`
			<div
				class="logic-add-control ${ this.openAddControlId === rule.id
					? 'logic-add-control--open'
					: '' }"
				@keydown=${ (event: KeyboardEvent) => {
					if (event.key === 'Escape')
						this.openAddControlId = '';
				} }
			>
				<button
					type="button"
					class="logic-add-control__trigger"
					aria-label="Add connected condition"
					aria-haspopup="true"
					aria-expanded=${ this.openAddControlId === rule.id }
					@click=${ (event: MouseEvent) => {
						event.stopPropagation();
						this.openAddControlId = this.openAddControlId === rule.id
							? ''
							: rule.id;
					} }
				>+</button>
				<div class="logic-add-control__popover">
					<strong>Add connected condition</strong>
					<span>
						${ rule.type === 'round'
							? 'This condition runs inside each matching round.'
							: 'Choose the next condition type.' }
					</span>
					${ this.renderAddBlock(
						rule,
						rule.type === 'round' ? 'round' : scope,
					) }
				</div>
			</div>
		`;
	}

	private renderRuleBranch(
		rule: AchievementRuleDraft,
		depth = 0,
		scope: BuilderScope = 'root',
	): TemplateResult {
		const children = this.getRuleChildren(rule, scope);
		const canAddChildren = this.canAddRuleChildren(rule);
		if (
			depth > 0
			&& (rule.type === 'all' || rule.type === 'any')
			&& children.length === 1
		) {
			const child = children[0];
			const childIsTransparentGroup = (
				child.rule.type === 'all' || child.rule.type === 'any'
			) && child.rule.children.length === 1;
			return html`
				<div class="logic-branch logic-branch--transparent-single ${
					this.openAddControlId === rule.id ? 'logic-branch--menu-open' : ''
				}">
					${ this.renderRuleBranch(child.rule, depth, child.scope) }
					${ childIsTransparentGroup
						? nothing
						: this.renderRuleAddControl(rule, scope) }
				</div>
			`;
		}

		const childLayout = children.length === 0
			? 'empty'
			: children.length === 1
				? 'single'
				: 'multiple';
		const showJunctionAdd = childLayout === 'multiple' && canAddChildren;
		return html`
			<div class="logic-branch ${ children.length > 0 || canAddChildren
				? 'logic-branch--has-children'
				: '' } ${ this.openAddControlId === rule.id
					? 'logic-branch--menu-open'
					: '' }">
				<div class="logic-branch__node">
					${ this.renderRule(rule, depth, scope) }
					${ showJunctionAdd
						? this.renderRuleAddControl(rule, scope)
						: nothing }
				</div>
				${ children.length > 0 || canAddChildren
					? html`
						<div class="logic-branch__children logic-branch__children--${ childLayout }">
							${ children.map(child =>
								this.renderRuleBranch(child.rule, depth + 1, child.scope)) }
							${ canAddChildren && !showJunctionAdd
								? this.renderRuleAddControl(rule, scope)
								: nothing }
						</div>
					`
					: nothing }
			</div>
		`;
	}

	private getRuleTypes(
		scope: BuilderScope,
		parent: AchievementRuleDraft,
	): typeof ruleTypes {
		const directChildCount = this.getDirectChildCount(parent);
		return ruleTypes.filter(ruleType => {
			if (
				directChildCount === 0
				&& (ruleType.value === 'all' || ruleType.value === 'any')
			)
				return false;
			if (parent.type === 'not' && ruleType.value === 'not')
				return false;
			return (
				scope === 'round'
					? ruleType.value !== 'round'
					: ruleType.value !== 'throw' && ruleType.value !== 'sequence'
			);
		});
	}

	private renderAddBlock(parent: AchievementRuleDraft, scope: BuilderScope): TemplateResult {
		return html`
			<div class="add-block-row">
				${ this.getRuleTypes(scope, parent).map(ruleType => html`
					<button
						type="button"
						@click=${ (event: MouseEvent) => {
							this.openAddControlId = '';
							this.addChildRule(parent.id, ruleType.value, scope);
							(event.currentTarget as HTMLButtonElement).blur();
						} }
					>
						+ ${ ruleType.label }
					</button>
				`) }
			</div>
		`;
	}

	private renderRuleBody(
		rule: AchievementRuleDraft,
		scope: BuilderScope,
	): TemplateResult {
		switch (rule.type) {
		case 'all':
		case 'any':
			return html`
				<label>
					<span>Match mode</span>
					<select
						.value=${ rule.type }
						@change=${ (event: Event) => this.updateRule(rule.id, {
							type: (event.currentTarget as HTMLSelectElement).value as 'all' | 'any',
						}) }
					>
						<option value="all">All child blocks must match</option>
						<option value="any">At least one child block must match</option>
					</select>
				</label>
			`;
		case 'not':
			return html`
				<p class="logic-node__summary">
					The connected condition must <strong>not</strong> match.
				</p>
			`;
		case 'round':
			return html`
				<div class="round-editor">
					<div>
						<span class="logic-field-label">Match rounds</span>
						<div class="logic-round-mode" role="group" aria-label="Round match mode">
							<button
								type="button"
								class=${ rule.quantifier === 'any' ? 'logic-round-mode__active' : '' }
								aria-pressed=${ rule.quantifier === 'any' }
								@click=${ () => this.updateRule(rule.id, { quantifier: 'any' }) }
							>ANY</button>
							<button
								type="button"
								class=${ rule.quantifier === 'all' ? 'logic-round-mode__active' : '' }
								aria-pressed=${ rule.quantifier === 'all' }
								@click=${ () => this.updateRule(rule.id, { quantifier: 'all' }) }
							>EVERY</button>
						</div>
					</div>
					<div>
						<span class="logic-field-label">Allowed status</span>
						<div class="round-statuses">
							${ [
								[ 'valid', 'Valid' ],
								[ 'victory', 'Victory' ],
								[ 'overshoot', 'Overshoot' ],
								[ 'failedWinCondition', 'Failed win' ],
							].map(([ status, label ]) => {
								const selected = rule.statuses.includes(status as never);
								return html`
									<button
										type="button"
										class=${ selected ? 'round-statuses__active' : '' }
										aria-pressed=${ selected }
										@click=${ () => this.updateRule(rule.id, {
											statuses: selected
												? rule.statuses.filter(item => item !== status)
												: [ ...rule.statuses, status ] as typeof rule.statuses,
										}) }
									>${ label }</button>
								`;
							}) }
						</div>
					</div>
				</div>
			`;
		case 'throw':
			return html`
				<div class="throw-editor">
					<div class="throw-editor__sentence">
						<select
							aria-label="Throw match mode"
							.value=${ rule.quantifier }
							@change=${ (event: Event) => this.updateRule(rule.id, {
								quantifier: (event.currentTarget as HTMLSelectElement).value as 'any' | 'all',
							}) }
						>
							<option value="any">Any throw</option>
							<option value="all">Every throw</option>
						</select>
						<span>hits</span>
						${ this.renderValueEditor(
							rule.hitLocation,
							value => this.updateRule(rule.id, { hitLocation: value }),
							'round',
						) }
					</div>
					${ rule.throwType === 'any'
						? html`
							<button
								type="button"
								class="logic-secondary-action"
								@click=${ () => this.updateRule(rule.id, { throwType: 'single' }) }
							>+ Add type filter</button>
						`
						: html`
							<div class="throw-editor__filter">
								<span class="logic-field-label">Throw type</span>
								<div class="throw-editor__filter-controls">
									<select
										aria-label="Throw type"
										.value=${ rule.throwType }
										@change=${ (event: Event) => this.updateRule(rule.id, {
											throwType: (event.currentTarget as HTMLSelectElement)
												.value as typeof rule.throwType,
										}) }
									>
										${ [ 'single', 'double', 'triple', 'rim', 'miss' ].map(type => html`
											<option value=${ type }>${ type }</option>
										`) }
									</select>
									<button
										type="button"
										class="logic-secondary-action"
										@click=${ () => this.updateRule(rule.id, { throwType: 'any' }) }
									>Clear</button>
								</div>
							</div>
						` }
				</div>
			`;
		case 'compare':
			return html`
				<div class="comparison-editor">
					${ this.renderValueEditor(
						rule.left,
						value => this.updateRule(rule.id, { left: value }),
						scope,
						'comparison-left',
					) }
					<select
						aria-label="Comparison operator"
						.value=${ rule.operator }
						@change=${ (event: Event) => this.updateRule(rule.id, {
							operator: (event.currentTarget as HTMLSelectElement).value as typeof rule.operator,
						}) }
					>
						<option value="equal">=</option>
						<option value="notEqual">!=</option>
						<option value="greaterThan">&gt;</option>
						<option value="greaterThanOrEqual">&gt;=</option>
						<option value="lessThan">&lt;</option>
						<option value="lessThanOrEqual">&lt;=</option>
					</select>
					${ this.renderValueEditor(
						rule.right,
						value => this.updateRule(rule.id, { right: value }),
						scope,
						'comparison-right',
					) }
				</div>
			`;
		case 'sequence':
			return html`
				<div class="sequence-progress">${ rule.targets.length } of 3 steps</div>
				<div class="sequence-targets">
					${ rule.targets.map((target, index) => {
						const expanded = this.expandedSequenceTargetId === target.id;
						return html`
							<div class="sequence-target ${ expanded ? 'sequence-target--expanded' : '' }">
								<div class="sequence-target__header">
									<button
										type="button"
										class="sequence-target__summary"
										aria-expanded=${ expanded }
										@click=${ () => {
											this.expandedSequenceTargetId = expanded ? '' : target.id;
										} }
									>
										<strong>${ index + 1 }.</strong>
										<span>${ formatSequenceTarget(target) }</span>
									</button>
									<button
										type="button"
										class="remove-button"
										aria-label=${ `Remove sequence step ${ index + 1 }` }
										@click=${ () => {
											if (this.expandedSequenceTargetId === target.id)
												this.expandedSequenceTargetId = '';
											this.updateRule(rule.id, {
												targets: rule.targets.filter(item => item.id !== target.id),
											});
										} }
									>&times;</button>
								</div>
								${ expanded
									? html`
										<div class="sequence-target__editor">
											${ this.renderValueEditor(
												target.hitLocation,
												value => this.updateRule(rule.id, {
													targets: rule.targets.map(item =>
														item.id === target.id
															? { ...item, hitLocation: value }
															: item),
												}),
												'round',
											) }
											<select
												aria-label=${ `Sequence step ${ index + 1 } throw type` }
												.value=${ target.throwType }
												@change=${ (event: Event) => this.updateRule(rule.id, {
													targets: rule.targets.map(item =>
														item.id === target.id
															? {
																...item,
																throwType: (event.currentTarget as HTMLSelectElement)
																	.value as typeof target.throwType,
															}
															: item),
												}) }
											>
												${ [
													[ 'anyScoring', 'Any scoring' ],
													[ 'single', 'Single' ],
													[ 'double', 'Double' ],
													[ 'triple', 'Triple' ],
													[ 'rim', 'Rim' ],
													[ 'miss', 'Miss' ],
												].map(([ type, label ]) => html`
													<option value=${ type }>${ label }</option>
												`) }
											</select>
										</div>
									`
									: nothing }
							</div>
						`;
					}) }
					${ rule.targets.length < 3
						? html`
							<button
								type="button"
								class="add-target"
								@click=${ () => {
									const target = {
										id: createAchievementBuilderId(),
										hitLocation: { source: 'constant' as const, value: '1' },
										throwType: 'anyScoring' as const,
									};
									this.expandedSequenceTargetId = target.id;
									this.updateRule(rule.id, {
										targets: [ ...rule.targets, target ],
									});
								} }
							>
								+ Add step
							</button>
						`
						: nothing }
				</div>
			`;
		}
	}

	private renderDetails(): TemplateResult {
		return html`
			<section class="builder-panel details-panel">
				<div class="details-card details-card--unified">
					<section class="details-section">
						<div class="identity-fields">
							<label class=${ this.activeTemplateField === 'nameTemplate'
								? 'identity-field identity-field--active'
								: 'identity-field' }>
								<span>Name</span>
								<input
									type="text"
									data-template-field="nameTemplate"
									.value=${ this.draft.nameTemplate }
									@focus=${ () => {
										this.activeTemplateField = 'nameTemplate';
									} }
									@input=${ (event: InputEvent) => this.updateDraft({
										nameTemplate: (event.currentTarget as HTMLInputElement).value,
									}) }
									placeholder="Shanghai {n}"
								/>
							</label>
							<label class=${ this.activeTemplateField === 'descriptionTemplate'
								? 'identity-field identity-field--active'
								: 'identity-field' }>
								<span>Description</span>
								<textarea
									rows="2"
									data-template-field="descriptionTemplate"
									.value=${ this.draft.descriptionTemplate }
									@focus=${ () => {
										this.activeTemplateField = 'descriptionTemplate';
									} }
									@input=${ (event: InputEvent) => this.updateDraft({
										descriptionTemplate:
											(event.currentTarget as HTMLTextAreaElement).value,
									}) }
									placeholder="Hit {n}, D{n} and T{n} in the same round."
								></textarea>
							</label>
						</div>
						<div class="identity-parameter-tools">
							${ this.templateParameterKeys.length > 0
								? html`
									<div class="identity-parameter-list">
										${ this.templateParameterKeys.map(key => html`
											<button
												type="button"
												title=${ `Insert {${ key }} into ${
													this.activeTemplateField === 'nameTemplate'
														? 'name'
														: 'description'
												}` }
												@click=${ () => this.insertTemplateParameter(key) }
											>
												{${ key }}
											</button>
										`) }
									</div>
								`
								: html`
									<button
										type="button"
										class="identity-parameters__add"
										title="Add reusable values for names, descriptions, and logic"
										@click=${ () => {
											this.selectedTab = 'parameters';
										} }
									>
										+ Parameter
									</button>
								` }
						</div>
					</section>
					<section class="details-section details-classification">
					<div class="details-metadata">
						<div class="details-category">
							<span class="details-choice__label">Category</span>
							<div
								class="details-category-options"
								role="group"
								aria-label="Achievement category"
							>
								${ this.categories
									.filter(category =>
										!category.isArchived
										|| category.id === this.draft.categoryId)
									.sort((left, right) => left.sortOrder - right.sortOrder)
									.map(category => html`
										<button
											type="button"
											class=${ category.id === this.draft.categoryId
												? 'details-choice__active'
												: '' }
											aria-pressed=${ category.id === this.draft.categoryId }
											@click=${ () => this.updateDraft({
												categoryId: category.id,
											}) }
										>
											${ category.name }${ category.isArchived ? ' (archived)' : '' }
										</button>
									`) }
								<button
									type="button"
									class=${ this.showCategoryManager
										? 'details-category-options__manage details-category-options__manage--open'
										: 'details-category-options__manage' }
									title="Manage categories"
									aria-label="Manage categories"
									aria-expanded=${ this.showCategoryManager }
									@click=${ () => {
										this.showCategoryManager = !this.showCategoryManager;
									} }
								>
									<svg aria-hidden="true" viewBox="0 0 24 24">
										<path
											d="
												M19.14 12.94a7.4 7.4 0 0 0 .05-.94 7.4 7.4 0 0 0-.05-.94l2.03-1.58
												-1.92-3.32-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.87 3h-3.84l-.36 3.18
												c-.58.24-1.12.56-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58a7.4 7.4 0 0 0-.05.94
												c0 .32.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.38 1.05.7 1.63.94
												l.36 3.18h3.84l.36-3.18c.58-.24 1.12-.56 1.63-.94l2.39.96 1.92-3.32
												-2.03-1.58ZM12.95 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z
											"
										></path>
									</svg>
								</button>
							</div>
							${ this.categories.find(category =>
								category.id === this.draft.categoryId)?.isArchived
								? html`
									<small class="details-category__warning">
										This category is archived. Existing drafts may retain it.
									</small>
								`
								: nothing }
						</div>
						<div class="details-classification-controls">
							<div class="details-choice">
								<span class="details-choice__label">Tier</span>
								<div
									class="details-tier-options"
									role="group"
									aria-label="Achievement tier"
								>
									${ Object.values(AchievementTier)
										.filter((tier): tier is number => typeof tier === 'number')
										.map(tier => html`
											<button
												type="button"
												class=${ tier === this.draft.tier
													? 'details-choice__active'
													: '' }
												title=${ AchievementTier[tier] }
												aria-label=${ AchievementTier[tier] }
												aria-pressed=${ tier === this.draft.tier }
												@click=${ () => this.updateDraft({ tier }) }
											>
												<img
													src=${ getAchievementTierIcon(tier) }
													alt=""
												/>
											</button>
										`) }
								</div>
							</div>
							<div class="details-choice">
								<span class="details-choice__label">Achievement type</span>
								<div
									class="details-type-options"
									role="group"
									aria-label="Achievement type"
								>
									${ [
										[ 'session', 'Session' ],
										[ 'progression', 'Progression' ],
									].map(([ value, label ]) => html`
										<button
											type="button"
											class=${ this.draft.achievementScope === value
												? 'details-choice__active'
												: '' }
											aria-pressed=${ this.draft.achievementScope === value }
											@click=${ () => this.updateDraft({
												achievementScope:
													value as AchievementTemplateDraft['achievementScope'],
												progression:
													value === 'progression'
														? this.draft.progression ?? {
															statuses: [ 'valid', 'victory' ],
															targets: [],
														}
														: this.draft.progression,
											}) }
										>${ label }</button>
									`) }
								</div>
							</div>
						</div>
					</div>
					${ this.showCategoryManager
						? html`
							<aa-achievement-category-manager
								.categories=${ this.categories }
								.actions=${ this.categoryActions }
								@achievement-categories-updated=${ (
									event: CustomEvent<AchievementCategoriesUpdatedDetail>,
								) => {
									this.categories = event.detail.categories;
									if (event.detail.selectedCategoryId) {
										this.updateDraft({
											categoryId: event.detail.selectedCategoryId,
										});
									}
									else if (!this.categories.some(category =>
										category.id === this.draft.categoryId)) {
										this.updateDraft({
											categoryId: this.getPreferredCategoryId('Custom'),
										});
									}
								} }
								@achievement-category-manager-close=${ () => {
									this.showCategoryManager = false;
								} }
							></aa-achievement-category-manager>
						`
						: nothing }
					</section>
					${ this.renderDetailsPreview() }
				</div>
			</section>
		`;
	}

	private renderParameters(): TemplateResult {
		return html`
			<section class="builder-panel parameters-panel">
				<div class="parameters-card">
					<div class="parameters-toolbar">
						<span>Each value combination creates another achievement.</span>
						<aa-button type="button" size="small" @click=${ this.addParameter }>
							+ Parameter
						</aa-button>
					</div>
				${ this.draft.parameters.length === 0
					? html`
						<div class="parameters-empty">
							<strong>No parameters</strong>
							<span>This template creates one achievement.</span>
						</div>
					`
					: html`
						<div class="parameter-list">
							${ this.draft.parameters.map((parameter, index) => html`
								<article class="parameter-card">
									<div class="parameter-card__top">
										<label>
											<span>Parameter ${ index + 1 }</span>
											<input
												type="text"
												.value=${ parameter.key }
												@input=${ (event: InputEvent) => this.updateParameter(
													parameter.id,
													{ key: (event.currentTarget as HTMLInputElement).value },
												) }
												placeholder="name"
											/>
										</label>
										<button
											type="button"
											class="remove-button"
											aria-label="Remove parameter"
											@click=${ () => this.removeParameter(parameter.id) }
										>&times;</button>
									</div>
									<div class="parameter-configuration">
										<div class="details-choice">
											<span class="details-choice__label">Value type</span>
											<div class="parameter-options" role="group" aria-label="Parameter value type">
												${ [
													[ 'integer', 'Number' ],
													[ 'string', 'Text' ],
													[ 'boolean', 'Yes / no' ],
												].map(([ value, label ]) => html`
													<button
														type="button"
														class=${ parameter.valueType === value
															? 'parameter-options__active'
															: '' }
														aria-pressed=${ parameter.valueType === value }
														@click=${ () => this.setParameterValueType(
															parameter,
															value as AchievementParameterDraft['valueType'],
														) }
													>${ label }</button>
												`) }
											</div>
										</div>
										${ parameter.valueType === 'integer'
											? html`
												<div class="details-choice">
													<span class="details-choice__label">Values</span>
													<div
														class="parameter-options"
														role="group"
														aria-label="Parameter value source"
													>
														${ [
															[ 'range', 'Range' ],
															[ 'set', 'List' ],
														].map(([ value, label ]) => html`
															<button
																type="button"
																class=${ parameter.generatorType === value
																	? 'parameter-options__active'
																	: '' }
																aria-pressed=${ parameter.generatorType === value }
																@click=${ () => this.updateParameter(parameter.id, {
																	generatorType:
																		value as AchievementParameterDraft['generatorType'],
																}) }
															>${ label }</button>
														`) }
													</div>
												</div>
											`
											: nothing }
									</div>
									${ parameter.generatorType === 'range'
										? html`
											<div class="parameter-range">
												<label>
													<span>From</span>
													<input
														type="number"
														.value=${ String(parameter.minimum ?? '') }
														@input=${ (event: InputEvent) => this.updateParameter(
															parameter.id,
															{ minimum: Number((event.currentTarget as HTMLInputElement).value) },
														) }
													/>
												</label>
												<label>
													<span>To</span>
													<input
														type="number"
														.value=${ String(parameter.maximum ?? '') }
														@input=${ (event: InputEvent) => this.updateParameter(
															parameter.id,
															{ maximum: Number((event.currentTarget as HTMLInputElement).value) },
														) }
													/>
												</label>
												<label>
													<span>By</span>
													<input
														type="number"
														min="1"
														.value=${ String(parameter.step ?? 1) }
														@input=${ (event: InputEvent) => this.updateParameter(
															parameter.id,
															{ step: Number((event.currentTarget as HTMLInputElement).value) },
														) }
													/>
												</label>
											</div>
										`
										: parameter.valueType === 'boolean'
											? html`
												<div class="details-choice">
													<span class="details-choice__label">Allowed values</span>
													<div
														class="parameter-boolean-options"
														role="group"
														aria-label="Allowed yes or no values"
													>
														${ [
															[ 'true', 'Yes' ],
															[ 'false', 'No' ],
														].map(([ value, label ]) => {
															const selected = parameter.values.includes(value);
															return html`
																<button
																	type="button"
																	class=${ selected
																		? 'parameter-options__active'
																		: '' }
																	aria-pressed=${ selected }
																	@click=${ () => this.toggleBooleanParameterValue(
																		parameter,
																		value as 'true' | 'false',
																	) }
																>
																	<span class="parameter-boolean-options__check">
																		${ selected ? html`&check;` : nothing }
																	</span>
																	${ label }
																</button>
															`;
														}) }
													</div>
												</div>
											`
											: html`
											<label>
												<span>Values - one per line</span>
												<textarea
													rows="3"
													.value=${ parameter.values.join('\n') }
													@input=${ (event: InputEvent) => this.updateParameter(
														parameter.id,
														{
															values: (event.currentTarget as HTMLTextAreaElement)
																.value.split('\n')
																.map(value => value.trim())
																.filter(Boolean),
														},
													) }
												></textarea>
											</label>
											` }
								</article>
							`) }
						</div>
					` }
				</div>
			</section>
		`;
	}

	private renderLogic(): TemplateResult {
		if (this.draft.achievementScope === 'progression')
			return this.renderProgressionLogic();

		return html`
			<section class="builder-panel logic-builder">
				<div class="logic-builder__header">
					<div class="logic-canvas__controls" aria-label="Canvas controls">
						<button
							type="button"
							aria-label="Zoom out"
							@click=${ () => this.setLogicCanvasZoom(this.logicCanvasScale - 0.1) }
						>&minus;</button>
						<output>${ Math.round(this.logicCanvasScale * 100) }%</output>
						<button
							type="button"
							aria-label="Zoom in"
							@click=${ () => this.setLogicCanvasZoom(this.logicCanvasScale + 0.1) }
						>+</button>
						<button type="button" @click=${ () => void this.fitLogicCanvas() }>Fit</button>
					</div>
				</div>
				<div
					class="logic-canvas__viewport ${ this.logicCanvasDragging
						? 'logic-canvas__viewport--dragging'
						: '' }"
					tabindex="0"
					aria-label="Achievement logic canvas"
					@wheel=${ this.handleLogicCanvasWheel }
					@pointerdown=${ this.handleLogicCanvasPointerDown }
					@pointermove=${ this.handleLogicCanvasPointerMove }
					@pointerup=${ this.handleLogicCanvasPointerUp }
					@pointercancel=${ this.handleLogicCanvasPointerUp }
					@lostpointercapture=${ this.handleLogicCanvasPointerUp }
				>
					<div
						class="logic-canvas__stage"
						style="transform: translate(${ this.logicCanvasX }px, ${ this.logicCanvasY }px)
							scale(${ this.logicCanvasScale });"
					>
						<div class="logic-canvas__graph">
							${ this.renderRuleBranch(this.draft.rule) }
						</div>
					</div>
				</div>
			</section>
		`;
	}

	private getParameterValues(
		parameter: AchievementParameterDraft,
		limit = 250,
	): (string | number | boolean)[] {
		if (parameter.generatorType === 'range') {
			const values: number[] = [];
			const minimum = parameter.minimum ?? 0;
			const maximum = parameter.maximum ?? minimum;
			const step = Math.max(parameter.step ?? 1, 1);
			for (let value = minimum; value <= maximum && values.length < limit; value += step)
				values.push(value);
			return values;
		}

		switch (parameter.valueType) {
		case 'integer':
			return parameter.values.map(Number).filter(Number.isFinite);
		case 'boolean':
			return parameter.values.map(value => value.toLowerCase() === 'true');
		default:
			return parameter.values;
		}
	}

	private getPreviews(limit = 24): AchievementTemplatePreview[] {
		const bindings: Record<string, string | number | boolean>[] = [ {} ];
		for (const parameter of this.draft.parameters) {
			const values = this.getParameterValues(parameter);
			const expanded: Record<string, string | number | boolean>[] = [];
			for (const binding of bindings) {
				for (const value of values) {
					expanded.push({ ...binding, [parameter.key]: value });
					if (expanded.length >= limit)
						break;
				}
				if (expanded.length >= limit)
					break;
			}
			bindings.splice(0, bindings.length, ...expanded);
		}

		const renderText = (
			template: string,
			binding: Record<string, string | number | boolean>,
		): string => Object.entries(binding).reduce(
			(result, [ key, value ]) =>
				result.replaceAll(`{${ key }}`, String(value)),
			template,
		);

		return bindings.map(binding => ({
			bindings: binding,
			name: renderText(this.draft.nameTemplate, binding),
			description: renderText(this.draft.descriptionTemplate, binding),
		}));
	}

	private getGeneratedCount(): number {
		if (this.draft.parameters.length === 0)
			return 1;

		return this.draft.parameters.reduce(
			(count, parameter) => {
				if (parameter.generatorType === 'range') {
					const minimum = parameter.minimum ?? 0;
					const maximum = parameter.maximum ?? minimum;
					const step = Math.max(parameter.step ?? 1, 1);
					return count * Math.max(0, Math.floor((maximum - minimum) / step) + 1);
				}

				return count * parameter.values.length;
			},
			1,
		);
	}

	private renderDetailsPreview(): TemplateResult {
		const previews = this.getPreviews(2);
		const count = this.getGeneratedCount();
		return html`
			<section class="details-section details-preview">
				<div class="details-section__heading">
					<strong>Live preview</strong>
				</div>
				${ previews.length > 0
					? html`
						<div class="preview-list preview-list--details">
							${ previews.map(preview => html`
								<article class="preview-card">
									<strong>${ preview.name || 'Untitled achievement' }</strong>
									<p>${ preview.description || 'No description' }</p>
									${ Object.keys(preview.bindings).length
										? html`
											<div class="binding-list">
												${ Object.entries(preview.bindings).map(([ key, value ]) => html`
													<span>${ `${ key }=${ String(value) }` }</span>
												`) }
											</div>
										`
										: html`<small>Single achievement - no parameters</small>` }
								</article>
							`) }
						</div>
						${ count > previews.length
							? html`
								<small class="details-preview__more">
									Showing the first ${ previews.length } of ${ count }.
								</small>
							`
							: nothing }
					`
					: html`
						<div class="empty-panel">
							Add values to every parameter to generate a preview.
						</div>
					` }
			</section>
		`;
	}

	override render(): TemplateResult {
		return html`
			<div class="achievement-builder">
				<aa-tabs
					.items=${ tabs }
					.selected=${ this.selectedTab }
					label="Achievement builder sections"
					@tab-change=${ this.handleTabChange }
				></aa-tabs>
				${ this.errors.length > 0
					? html`
						<div class="error-list" role="alert">
							${ this.errors.map(error => html`<p>${ error }</p>`) }
						</div>
					`
					: nothing }
				<div class="builder-content">
					${ this.selectedTab === 'details'
						? this.renderDetails()
						: this.selectedTab === 'parameters'
							? this.renderParameters()
							: this.renderLogic() }
				</div>
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(achievementBuilderStyles),
	];
}

declare global {
	interface HTMLElementTagNameMap {
		'aa-achievement-builder': AaAchievementBuilder;
	}

	interface HTMLElementEventMap {
		[achievementBuilderSaveEventName]: AchievementBuilderSaveEvent;
	}
}
