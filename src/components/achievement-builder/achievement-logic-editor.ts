import '../../ui/button/aa-button.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import {
	AchievementComparisonOperator,
	AchievementParameterDraft,
	AchievementProgressionDraft,
	AchievementRuleDraft,
	AchievementScope,
	AchievementTemplateDraft,
	AchievementThrowType,
	achievementThrowTypeNames,
	AchievementValueDraft,
	createAchievementBuilderId,
	createDefaultAchievementProgression,
	createDefaultAchievementRule,
	EditableAchievementRuleType,
	sequenceTargetCount,
	throwTypeHasHitLocation,
} from '../../models/achievementBuilder.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import formStyles from './achievement-builder-form.css?inline';
import {
	appendChildRule,
	BuilderScope,
	createDefaultHitLocation,
	createRule,
	getAddableRuleTypes,
	getRuleTypeLabel,
	getThrowTypePatch,
	isGroupRule,
	replaceRule,
	roundStatusOptions,
	updateRule,
	ValueEditorRole,
} from './achievement-draft.js';
import logicEditorStyles from './achievement-logic-editor.css?inline';
import {
	formatAchievementRule,
	formatSequenceTarget,
	operatorLabels,
} from './achievement-rule-presentation.js';
import { renderValueEditor } from './achievement-value-editor.js';
import { LogicCanvasController } from './logic-canvas-controller.js';

export type AchievementLogicChangeDetail = Partial<Pick<AchievementTemplateDraft, 'rule' | 'progression'>>;

export const achievementLogicChangeEventName = 'achievement-logic-change';

type Option<T extends string> = readonly [ value: T, label: string ];

const throwTypeOptions = Object.entries(achievementThrowTypeNames) as Option<AchievementThrowType>[];
const countedThrowTypeOptions: Option<'any' | AchievementThrowType>[] = [
	[ 'any', 'Any type' ],
	...throwTypeOptions,
];
const winningThrowTypeOptions: Option<'any' | 'single' | 'double' | 'triple'>[] = [
	[ 'any', 'Any scoring type' ],
	[ 'single', 'Single' ],
	[ 'double', 'Double or double bull' ],
	[ 'triple', 'Triple' ],
];
const sequenceThrowTypeOptions: Option<'anyScoring' | AchievementThrowType>[] = [
	[ 'anyScoring', 'Single, double, or triple' ],
	...throwTypeOptions,
];
const progressionThrowTypeOptions = throwTypeOptions.slice(0, 3) as Option<'single' | 'double' | 'triple'>[];
const operatorOptions = Object.entries(operatorLabels) as Option<AchievementComparisonOperator>[];

const renderOptions = <T extends string>(options: readonly Option<T>[]): TemplateResult[] =>
	options.map(([ value, label ]) => html`<option value=${ value }>${ label }</option>`);

const selectValue = <T extends string>(event: Event): T =>
	(event.currentTarget as HTMLSelectElement).value as T;

interface RuleChild {
	rule:  AchievementRuleDraft;
	scope: BuilderScope;
}

@customElement('aa-achievement-logic-editor')
export class AaAchievementLogicEditor extends LitElement {

	@property({ attribute: false }) rule:         AchievementRuleDraft = createDefaultAchievementRule();
	@property({ attribute: false }) progression?: AchievementProgressionDraft;
	@property({ attribute: false }) parameters:   AchievementParameterDraft[] = [];
	@property({ type: String }) achievementScope: AchievementScope = 'session';
	@property({ type: Boolean }) readOnly = false;

	@state() private openAddControlId = '';
	@state() private expandedRuleId = '';
	@state() private expandedSequenceTargetId = '';

	private canvas = new LogicCanvasController(this, () => ({
		viewport: this.renderRoot.querySelector<HTMLElement>('.logic-canvas__viewport') ?? undefined,
		graph:    this.renderRoot.querySelector<HTMLElement>('.logic-canvas__graph') ?? undefined,
	}));

	protected override firstUpdated(): void {
		void this.canvas.fit();
	}

	protected override updated(changed: PropertyValues<this>): void {
		// Editable graphs show "+" and remove buttons, so unlocking a version changes its size.
		if (changed.has('readOnly') && changed.get('readOnly') !== undefined)
			void this.canvas.fit();
	}

	private emitChange(detail: AchievementLogicChangeDetail): void {
		this.dispatchEvent(new CustomEvent<AchievementLogicChangeDetail>(
			achievementLogicChangeEventName,
			{ detail, bubbles: true, composed: true },
		));
	}

	private updateRule(id: string, patch: Partial<AchievementRuleDraft>): void {
		this.emitChange({ rule: updateRule(this.rule, id, patch) });
	}

	private addChildRule(
		parentId: string,
		type: EditableAchievementRuleType,
		scope: BuilderScope,
	): void {
		const child = createRule(type, scope);
		this.emitChange({ rule: appendChildRule(this.rule, parentId, child) });
		this.expandedRuleId = child.id;
		this.expandedSequenceTargetId = '';
	}

	private removeRule(id: string): void {
		if (this.expandedRuleId === id)
			this.expandedRuleId = '';

		this.emitChange({ rule: replaceRule(this.rule, id) });
	}

	private get currentProgression(): AchievementProgressionDraft {
		return this.progression ?? createDefaultAchievementProgression();
	}

	private updateProgressionTargets(
		update: (targets: AchievementProgressionDraft['targets']) => AchievementProgressionDraft['targets'],
	): void {
		const progression = this.currentProgression;
		this.emitChange({ progression: { ...progression, targets: update(progression.targets) } });
	}

	private renderValue(
		value: AchievementValueDraft,
		onChange: (value: AchievementValueDraft) => void,
		scope: BuilderScope,
		role?: ValueEditorRole,
		numericOnly = true,
	): TemplateResult {
		return renderValueEditor({ value, onChange, scope, role, numericOnly, parameters: this.parameters });
	}

	private getRenderedRule(ruleId: string): HTMLElement | undefined {
		return [ ...this.renderRoot.querySelectorAll<HTMLElement>('[data-rule-id]') ]
			.find(element => element.dataset['ruleId'] === ruleId);
	}

	/** Expands or collapses a block while keeping it at the same place on screen. */
	private async setExpandedRule(ruleId: string, expandedRuleId = ruleId): Promise<void> {
		const previousBounds = this.getRenderedRule(ruleId)?.getBoundingClientRect();
		this.expandedRuleId = expandedRuleId;
		this.expandedSequenceTargetId = '';
		await this.updateComplete;

		const updatedBounds = this.getRenderedRule(ruleId)?.getBoundingClientRect();
		if (previousBounds && updatedBounds) {
			this.canvas.panBy(
				previousBounds.left - updatedBounds.left,
				previousBounds.top - updatedBounds.top,
			);
		}
	}

	private handleCanvasPointerDown(event: PointerEvent): void {
		if (event.button !== 0)
			return;

		const eventPath = event.composedPath()
			.filter((item): item is Element => item instanceof Element);
		if (
			this.openAddControlId
			&& !eventPath.some(item => item.classList.contains('logic-add-control'))
		)
			this.openAddControlId = '';

		if (!eventPath.some(item => item.matches('button, input, select, textarea, .logic-node')))
			this.canvas.startDrag(event);
	}

	private renderRemoveButton(
		ruleId: string,
		label: string,
		className = 'logic-node__compact-remove',
	): TemplateResult {
		return html`
			<button
				type="button"
				class=${ className }
				aria-label=${ label }
				@click=${ () => this.removeRule(ruleId) }
			>&times;</button>
		`;
	}

	private renderToggleGroup<T extends string>(
		options: readonly Option<T>[],
		isActive: (value: T) => boolean,
		onSelect: (value: T) => void,
		className: string,
		label: string,
	): TemplateResult {
		return html`
			<div class=${ className } role="group" aria-label=${ label }>
				${ options.map(([ value, optionLabel ]) => html`
					<button
						type="button"
						class=${ isActive(value) ? `${ className }__active` : '' }
						aria-pressed=${ isActive(value) }
						@click=${ () => onSelect(value) }
					>${ optionLabel }</button>
				`) }
			</div>
		`;
	}

	private renderRule(
		rule: AchievementRuleDraft,
		depth: number,
		scope: BuilderScope,
	): TemplateResult {
		const canRemove = depth > 0 && !this.readOnly;
		if (rule.type === 'not') {
			return html`
				<article class="logic-node logic-node--not logic-node--compact">
					<strong>NOT</strong>
					${ canRemove ? this.renderRemoveButton(rule.id, 'Remove NOT block') : nothing }
				</article>
			`;
		}

		if (isGroupRule(rule)) {
			const childCount = rule.children.length;

			return html`
				<article class="logic-node logic-node--group">
					<div class="logic-node--group__header">
						${ depth === 0
							? html`<span class="logic-node__scope">Start</span>`
							: scope === 'round'
								? html`<span class="logic-node__scope">Round</span>`
								: nothing }
						${ canRemove ? this.renderRemoveButton(rule.id, 'Remove condition group') : nothing }
					</div>
					${ childCount > 1
						? this.renderToggleGroup(
							[ [ 'all', 'ALL' ], [ 'any', 'ANY' ] ] as const,
							value => rule.type === value,
							type => this.updateRule(rule.id, { type }),
							'logic-group-mode',
							'Condition match mode',
						)
						: html`
							<strong class="logic-group-single">
								${ childCount === 0 ? 'Add a condition' : '1 condition' }
							</strong>
						` }
					<small>${ childCount } condition${ childCount === 1 ? '' : 's' }</small>
				</article>
			`;
		}

		const canCollapse = rule.type !== 'round';
		if (canCollapse && this.expandedRuleId !== rule.id) {
			return html`
				<article
					class="logic-node logic-node--${ rule.type } logic-node--summary"
					data-rule-id=${ rule.id }
				>
					<button
						type="button"
						class="logic-node__summary-button"
						aria-label=${ `${ this.readOnly ? 'View' : 'Edit' } ${ formatAchievementRule(rule) }` }
						@click=${ () => void this.setExpandedRule(rule.id) }
					>
						<strong class="logic-node__type">${ getRuleTypeLabel(rule) }</strong>
						${ rule.type === 'sequence'
							? html`
								<ol class="logic-sequence-summary">
									${ rule.targets.map((target, index) => html`
										<li>
											<span>${ index + 1 }</span>
											<strong>${ formatSequenceTarget(target) }</strong>
										</li>
									`) }
								</ol>
							`
							: rule.type === 'raw'
								? html`<code class="logic-expression">${ formatAchievementRule(rule) }</code>`
								: html`<span>${ formatAchievementRule(rule) }</span>` }
					</button>
					${ canRemove ? this.renderRemoveButton(rule.id, 'Remove logic block') : nothing }
				</article>
			`;
		}

		const description = this.getRuleDescription(rule);

		return html`
			<article
				class="logic-node logic-node--${ rule.type } logic-node--expanded"
				data-rule-id=${ rule.id }
			>
				<header>
					<div class="logic-node__heading">
						${ depth === 0 ? html`<span class="logic-node__scope">Start</span>` : nothing }
						<strong class="logic-node__type">${ getRuleTypeLabel(rule) }</strong>
						${ description ? html`<small>${ description }</small>` : nothing }
					</div>
					<div class="logic-node__actions">
						${ canCollapse
							? html`
								<button
									type="button"
									class="logic-node__collapse"
									aria-label="Collapse logic block"
									@click=${ () => void this.setExpandedRule(rule.id, '') }
								>-</button>
							`
							: nothing }
						${ canRemove
							? this.renderRemoveButton(rule.id, 'Remove logic block', 'remove-button')
							: nothing }
					</div>
				</header>
				<div class="logic-node__body" ?inert=${ this.readOnly }>
					${ this.renderRuleBody(rule, scope) }
				</div>
			</article>
		`;
	}

	private getRuleDescription(rule: AchievementRuleDraft): string {
		switch (rule.type) {
		case 'throw':
			return 'Checks throws inside the connected round';
		case 'throwCount':
			return 'Counts throws matching a location and type';
		case 'winningThrow':
			return 'Checks the throw that completed the game';
		case 'sequence':
			return `Matches an ordered ${ sequenceTargetCount }-throw pattern`;
		case 'raw':
			return 'Not editable as blocks';
		default:
			return '';
		}
	}

	/** Children as drawn on the canvas: single-child structural groups are unwrapped. */
	private getRuleChildren(rule: AchievementRuleDraft, scope: BuilderScope): RuleChild[] {
		const unwrapStructuralGroup = (
			child: AchievementRuleDraft,
			childScope: BuilderScope,
		): RuleChild[] => isGroupRule(child) && child.children.length <= 1
			? child.children.map(item => ({ rule: item, scope: childScope }))
			: [ { rule: child, scope: childScope } ];

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
		if (this.readOnly)
			return false;
		if (isGroupRule(rule) || rule.type === 'round')
			return true;

		return rule.type === 'not'
			&& isGroupRule(rule.child)
			&& rule.child.children.length === 0;
	}

	private renderRuleAddControl(rule: AchievementRuleDraft, scope: BuilderScope): TemplateResult {
		const open = this.openAddControlId === rule.id;
		const childScope = rule.type === 'round' ? 'round' : scope;

		return html`
			<div
				class="logic-add-control ${ open ? 'logic-add-control--open' : '' }"
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
					aria-expanded=${ open }
					@click=${ (event: MouseEvent) => {
						event.stopPropagation();
						this.openAddControlId = open ? '' : rule.id;
					} }
				>+</button>
				<div class="logic-add-control__popover">
					<strong>Add connected condition</strong>
					<span>
						${ rule.type === 'round'
							? 'This condition runs inside each matching round.'
							: 'Choose the next condition type.' }
					</span>
					<div class="add-block-row">
						${ getAddableRuleTypes(childScope, rule).map(ruleType => html`
							<button
								type="button"
								@click=${ (event: MouseEvent) => {
									this.openAddControlId = '';
									this.addChildRule(rule.id, ruleType.value, childScope);
									(event.currentTarget as HTMLButtonElement).blur();
								} }
							>
								+ ${ ruleType.label }
							</button>
						`) }
					</div>
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
		const menuOpenClass = this.openAddControlId === rule.id ? 'logic-branch--menu-open' : '';
		if (isGroupRule(rule) && children.length === 1 && (depth > 0 || this.readOnly)) {
			const child = children[0]!;
			if (depth === 0)
				return this.renderRuleBranch(child.rule, 1, child.scope);

			const childIsTransparentGroup = isGroupRule(child.rule) && child.rule.children.length === 1;

			return html`
				<div class="logic-branch logic-branch--transparent-single ${ menuOpenClass }">
					${ this.renderRuleBranch(child.rule, depth, child.scope) }
					${ childIsTransparentGroup ? nothing : this.renderRuleAddControl(rule, scope) }
				</div>
			`;
		}

		const canAddChildren = this.canAddRuleChildren(rule);
		const childLayout = children.length === 0
			? 'empty'
			: children.length === 1 ? 'single' : 'multiple';
		const childGroupOwnsAddControl = rule.type === 'round'
			&& children.length === 1
			&& isGroupRule(children[0]!.rule);
		const showAddControl = canAddChildren && !childGroupOwnsAddControl;
		const showJunctionAdd = childLayout === 'multiple' && showAddControl;
		const hasChildren = children.length > 0 || canAddChildren;

		return html`
			<div class="logic-branch ${ hasChildren ? 'logic-branch--has-children' : '' } ${ menuOpenClass }">
				<div class="logic-branch__node">
					${ this.renderRule(rule, depth, scope) }
					${ showJunctionAdd ? this.renderRuleAddControl(rule, scope) : nothing }
				</div>
				${ hasChildren
					? html`
						<div class="logic-branch__children logic-branch__children--${ childLayout }">
							${ children.map(child =>
								this.renderRuleBranch(child.rule, depth + 1, child.scope)) }
							${ showAddControl && !showJunctionAdd
								? this.renderRuleAddControl(rule, scope)
								: nothing }
						</div>
					`
					: nothing }
			</div>
		`;
	}

	private renderOperatorSelect(
		rule: Extract<AchievementRuleDraft, { operator: AchievementComparisonOperator; }>,
		label: string,
	): TemplateResult {
		return html`
			<select
				aria-label=${ label }
				.value=${ rule.operator }
				@change=${ (event: Event) => this.updateRule(rule.id, {
					operator: selectValue<AchievementComparisonOperator>(event),
				}) }
			>
				${ renderOptions(operatorOptions) }
			</select>
		`;
	}

	private renderRuleBody(rule: AchievementRuleDraft, scope: BuilderScope): TemplateResult | typeof nothing {
		switch (rule.type) {
		case 'round':
			return html`
				<div class="round-editor">
					<div>
						<span class="logic-field-label">Match rounds</span>
						${ this.renderToggleGroup(
							[ [ 'any', 'ANY' ], [ 'all', 'EVERY' ] ] as const,
							value => rule.quantifier === value,
							quantifier => this.updateRule(rule.id, { quantifier }),
							'logic-round-mode',
							'Round match mode',
						) }
					</div>
					<div>
						<span class="logic-field-label">Allowed status</span>
						${ this.renderToggleGroup(
							roundStatusOptions.map(option => [ option.value, option.label ] as const),
							status => rule.statuses.includes(status),
							status => this.updateRule(rule.id, {
								statuses: rule.statuses.includes(status)
									? rule.statuses.filter(item => item !== status)
									: [ ...rule.statuses, status ],
							}),
							'round-statuses',
							'Allowed round statuses',
						) }
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
								quantifier: selectValue<'any' | 'all'>(event),
							}) }
						>
							<option value="any">Any throw</option>
							<option value="all">Every throw</option>
						</select>
						${ rule.hitLocation
							? html`
								<span>hits</span>
								${ this.renderValue(
									rule.hitLocation,
									hitLocation => this.updateRule(rule.id, { hitLocation }),
									'round',
								) }
							`
							: html`<span>matches the selected type</span>` }
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
										@change=${ (event: Event) => this.updateRule(rule.id, getThrowTypePatch(
											selectValue<typeof rule.throwType>(event),
											rule.hitLocation,
										)) }
									>
										${ renderOptions(throwTypeOptions) }
									</select>
									<button
										type="button"
										class="logic-secondary-action"
										@click=${ () => this.updateRule(
											rule.id,
											getThrowTypePatch('any', rule.hitLocation),
										) }
									>Clear</button>
								</div>
							</div>
						` }
				</div>
			`;
		case 'throwCount':
			return html`
				<div class="comparison-editor">
					<div class="value-editor">
						<select
							aria-label="Counted throw type"
							.value=${ rule.throwType }
							@change=${ (event: Event) => this.updateRule(rule.id, getThrowTypePatch(
								selectValue<typeof rule.throwType>(event),
								rule.hitLocation,
							)) }
						>
							${ renderOptions(countedThrowTypeOptions) }
						</select>
						${ rule.hitLocation
							? this.renderValue(
								rule.hitLocation,
								hitLocation => this.updateRule(rule.id, { hitLocation }),
								'round',
							)
							: nothing }
					</div>
					${ this.renderOperatorSelect(rule, 'Count comparison operator') }
					${ this.renderValue(
						rule.count,
						count => this.updateRule(rule.id, { count }),
						'round',
						'comparison-right',
					) }
				</div>
			`;
		case 'winningThrow':
			return html`
				<div class="throw-editor">
					<div class="throw-editor__sentence">
						<span>Winning throw</span>
						${ rule.hitLocation
							? html`
								<span>hits</span>
								${ this.renderValue(
									rule.hitLocation,
									hitLocation => this.updateRule(rule.id, { hitLocation }),
									'round',
								) }
							`
							: html`<span>matches the selected type</span>` }
					</div>
					<select
						aria-label="Winning throw type"
						.value=${ rule.throwType }
						@change=${ (event: Event) => this.updateRule(rule.id, {
							throwType: selectValue<typeof rule.throwType>(event),
						}) }
					>
						${ renderOptions(winningThrowTypeOptions) }
					</select>
					<button
						type="button"
						class="logic-secondary-action"
						@click=${ () => this.updateRule(rule.id, {
							hitLocation: rule.hitLocation ? undefined : createDefaultHitLocation(),
						}) }
					>${ rule.hitLocation ? 'Clear target' : '+ Add target' }</button>
				</div>
			`;
		case 'compare':
			return html`
				<div class="comparison-editor">
					${ this.renderValue(
						rule.left,
						left => this.updateRule(rule.id, { left }),
						scope,
						'comparison-left',
						false,
					) }
					${ this.renderOperatorSelect(rule, 'Comparison operator') }
					${ this.renderValue(
						rule.right,
						right => this.updateRule(rule.id, { right }),
						scope,
						'comparison-right',
						false,
					) }
				</div>
			`;
		case 'sequence':
			return this.renderSequenceBody(rule);
		case 'raw':
			return html`
				<div class="raw-rule">
					<code class="logic-expression">${ formatAchievementRule(rule) }</code>
					<details>
						<summary>View condition definition</summary>
						<pre>${ JSON.stringify(rule.ast, null, 2) }</pre>
					</details>
				</div>
			`;
		default:
			return nothing;
		}
	}

	private renderSequenceBody(
		rule: Extract<AchievementRuleDraft, { type: 'sequence'; }>,
	): TemplateResult {
		const updateTarget = (
			targetId: string,
			patch: Partial<(typeof rule.targets)[number]>,
		): void => this.updateRule(rule.id, {
			targets: rule.targets.map(item => item.id === targetId ? { ...item, ...patch } : item),
		});

		return html`
			<div class="sequence-progress">${ rule.targets.length } of ${ sequenceTargetCount } steps</div>
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
										if (expanded)
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
										${ throwTypeHasHitLocation(target.throwType)
											? this.renderValue(
												target.hitLocation,
												hitLocation => updateTarget(target.id, { hitLocation }),
												'round',
											)
											: nothing }
										<select
											aria-label=${ `Sequence step ${ index + 1 } throw type` }
											.value=${ target.throwType }
											@change=${ (event: Event) => updateTarget(target.id, {
												throwType: selectValue<typeof target.throwType>(event),
											}) }
										>
											${ renderOptions(sequenceThrowTypeOptions) }
										</select>
									</div>
								`
								: nothing }
						</div>
					`;
				}) }
				${ rule.targets.length < sequenceTargetCount
					? html`
						<button
							type="button"
							class="add-target"
							@click=${ () => {
								const target = {
									id:          createAchievementBuilderId(),
									hitLocation: createDefaultHitLocation(),
									throwType:   'anyScoring' as const,
								};
								this.expandedSequenceTargetId = target.id;
								this.updateRule(rule.id, { targets: [ ...rule.targets, target ] });
							} }
						>
							+ Add step
						</button>
					`
					: nothing }
			</div>
		`;
	}

	private renderRawProgressionLogic(raw: NonNullable<AchievementProgressionDraft['raw']>): TemplateResult {
		return html`
			<section class="builder-panel">
				<div class="panel-intro panel-intro--actions">
					<div>
						<h3>Progression logic</h3>
						<p>
							This progression logic can't be shown as a target set. Saving keeps it
							unchanged.
						</p>
					</div>
					${ this.readOnly
						? nothing
						: html`
							<aa-button
								type="button"
								size="small"
								variant="danger"
								@click=${ () => {
									if (window.confirm('Replace the stored progression logic with an empty target set?'))
										this.emitChange({ progression: createDefaultAchievementProgression() });
								} }
							>
								Replace with target set
							</aa-button>
						` }
				</div>
				<div class="raw-rule">
					<details>
						<summary>View progression definition</summary>
						<pre>${ JSON.stringify(raw, null, 2) }</pre>
					</details>
				</div>
			</section>
		`;
	}

	private renderProgressionLogic(): TemplateResult {
		const { targets, raw } = this.currentProgression;
		if (raw)
			return this.renderRawProgressionLogic(raw);

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
					${ this.readOnly
						? nothing
						: html`
							<aa-button
								type="button"
								size="small"
								@click=${ () => this.updateProgressionTargets(items => [
									...items,
									{
										id:          createAchievementBuilderId(),
										hitLocation: createDefaultHitLocation(),
										throwType:   'single',
									},
								]) }
							>
								Add target
							</aa-button>
						` }
				</div>
				<div class="sequence-targets" ?inert=${ this.readOnly }>
					${ targets.map((target, index) => html`
						<div class="sequence-target">
							<strong>#${ index + 1 }</strong>
							${ this.renderValue(
								target.hitLocation,
								hitLocation => this.updateProgressionTargets(items => items.map(item =>
									item.id === target.id ? { ...item, hitLocation } : item)),
								'root',
							) }
							<select
								aria-label=${ `Progression target ${ index + 1 } throw type` }
								.value=${ target.throwType }
								@change=${ (event: Event) => {
									const throwType = selectValue<typeof target.throwType>(event);
									this.updateProgressionTargets(items => items.map(item =>
										item.id === target.id ? { ...item, throwType } : item));
								} }
							>
								${ renderOptions(progressionThrowTypeOptions) }
							</select>
							${ this.readOnly
								? nothing
								: html`
									<button
										type="button"
										class="remove-button"
										aria-label="Remove progression target"
										@click=${ () => this.updateProgressionTargets(items =>
											items.filter(item => item.id !== target.id)) }
									>&times;</button>
								` }
						</div>
					`) }
				</div>
				${ targets.length === 0
					? html`
						<div class="empty-panel">
							Add the segments a player must collect across games.
						</div>
					`
					: nothing }
			</section>
		`;
	}

	override render(): TemplateResult {
		if (this.achievementScope === 'progression')
			return this.renderProgressionLogic();

		return html`
			<section class="builder-panel logic-builder">
				<div class="logic-builder__header">
					<slot name="toolbar-start"></slot>
					<div class="logic-canvas__controls" aria-label="Canvas controls">
						<button
							type="button"
							aria-label="Zoom out"
							@click=${ () => this.canvas.zoomBy(-0.1) }
						>&minus;</button>
						<output>${ Math.round(this.canvas.scale * 100) }%</output>
						<button
							type="button"
							aria-label="Zoom in"
							@click=${ () => this.canvas.zoomBy(0.1) }
						>+</button>
						<button type="button" @click=${ () => void this.canvas.fit() }>Fit</button>
					</div>
				</div>
				<div
					class="logic-canvas__viewport ${ this.canvas.dragging
						? 'logic-canvas__viewport--dragging'
						: '' }"
					tabindex="0"
					aria-label="Achievement logic canvas"
					@wheel=${ this.canvas.handleWheel }
					@pointerdown=${ this.handleCanvasPointerDown }
					@pointermove=${ this.canvas.handlePointerMove }
					@pointerup=${ this.canvas.handlePointerUp }
					@pointercancel=${ this.canvas.handlePointerUp }
					@lostpointercapture=${ this.canvas.handlePointerUp }
				>
					<div class="logic-canvas__stage" style="transform: ${ this.canvas.transform };">
						<div class="logic-canvas__graph">
							${ this.renderRuleBranch(this.rule) }
						</div>
					</div>
				</div>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(formStyles),
		unsafeCSS(logicEditorStyles),
	];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-achievement-logic-editor': AaAchievementLogicEditor;
	}
}
