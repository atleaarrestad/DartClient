import '../../../ui/segmented-control/aa-segmented-control.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { faIcons } from '../../../faIcons.js';
import { getAchievementTierIcon } from '../../../helpers/achievementHelper.js';
import { formatTierLabel, VariantSummary } from '../../../helpers/achievementVariantRules.js';
import {
	AchievementComparisonOperator,
	AchievementParameterDraft,
	AchievementSkipRuleDraft,
	AchievementTierRuleDraft,
	AchievementVariantConditionDraft,
} from '../../../models/achievementBuilder.js';
import { achievementTiersAscending } from '../../../models/enums.js';
import type { SegmentedControlChangeEvent, SegmentedControlItem } from '../../../ui/segmented-control/aa-segmented-control.js';
import { getVariantSummary } from '../achievement-draft.js';
import { AchievementLogicChangeDetail, ruleChangeEventName } from '../rule-events.js';
import variantRulesEditorStyles from './aa-variant-rules-editor.css?inline';
import {
	changeConditionParameter,
	createCondition,
	createSkipRule,
	createTierRule,
	formatTierCounts,
	getConditionOperators,
	getConditionValues,
	moveItem,
	parseConditionValue,
} from './variant-rule-edits.js';

const operatorLabels: Readonly<Record<AchievementComparisonOperator, string>> = {
	equal:              '=',
	notEqual:           '≠',
	greaterThan:        '>',
	greaterThanOrEqual: '≥',
	lessThan:           '<',
	lessThanOrEqual:    '≤',
};

const tierItems: SegmentedControlItem[] = achievementTiersAscending.map(tier => ({
	value: String(tier),
	label: formatTierLabel(tier),
	icon:  getAchievementTierIcon(tier),
}));

const openStorageKey = 'aa-variant-rules-editor:open';

const readOpen = (): boolean => {
	try {
		return localStorage.getItem(openStorageKey) !== 'false';
	}
	catch {
		return true;
	}
};

const writeOpen = (open: boolean): void => {
	try {
		localStorage.setItem(openStorageKey, String(open));
	}
	catch {
		// Remembering the fold is a convenience; without storage it opens next time.
	}
};

type RuleList = 'tierRules' | 'skipRules';

/**
 * The tiers of the generated achievements and which ones are skipped, as rows that mirror the
 * `skip` and `tier` lines of the rule text: skip rules, tier rules checked top to bottom, and
 * the tier everything else gets. Each row shows how many achievements it decides.
 */
@customElement('aa-variant-rules-editor')
export class AaVariantRulesEditor extends LitElement {

	@property({ type: Number }) tier = 1;
	@property({ attribute: false }) tierRules:  readonly AchievementTierRuleDraft[] = [];
	@property({ attribute: false }) skipRules:  readonly AchievementSkipRuleDraft[] = [];
	@property({ attribute: false }) parameters: readonly AchievementParameterDraft[] = [];
	@property({ type: Boolean }) readOnly = false;

	@state() private open = readOpen();

	private summary?: VariantSummary;

	protected override willUpdate(changed: PropertyValues<this>): void {
		const inputs = [ 'tier', 'tierRules', 'skipRules', 'parameters' ] as const;
		if (inputs.some(key => changed.has(key))) {
			this.summary = getVariantSummary({
				tier:       this.tier,
				tierRules:  [ ...this.tierRules ],
				skipRules:  [ ...this.skipRules ],
				parameters: [ ...this.parameters ],
			});
		}
	}

	private get hasRules(): boolean {
		return this.tierRules.length > 0 || this.skipRules.length > 0;
	}

	private emit(detail: AchievementLogicChangeDetail): void {
		this.dispatchEvent(new CustomEvent(ruleChangeEventName, { detail, bubbles: true, composed: true }));
	}

	private toggleOpen(): void {
		this.open = !this.open;
		writeOpen(this.open);
	}

	// ── Edits ───────────────────────────────────────────────────────────

	private setRules(list: RuleList, rules: readonly (AchievementTierRuleDraft | AchievementSkipRuleDraft)[]): void {
		this.emit(list === 'tierRules'
			? { tierRules: rules as AchievementTierRuleDraft[] }
			: { skipRules: rules as AchievementSkipRuleDraft[] });
	}

	private updateRule<T extends AchievementTierRuleDraft | AchievementSkipRuleDraft>(
		list: RuleList,
		index: number,
		patch: Partial<T>,
	): void {
		const rules = this[list] as readonly T[];
		this.setRules(list, rules.map((rule, position) => position === index ? { ...rule, ...patch } : rule));
	}

	private updateCondition(
		list: RuleList,
		ruleIndex: number,
		conditionIndex: number,
		condition: AchievementVariantConditionDraft | undefined,
	): void {
		const rule = this[list][ruleIndex];
		if (!rule)
			return;

		const when = condition
			? rule.when.map((item, index) => index === conditionIndex ? condition : item)
			: rule.when.filter((_, index) => index !== conditionIndex);
		this.updateRule(list, ruleIndex, { when });
	}

	private addCondition(list: RuleList, ruleIndex: number): void {
		const rule = this[list][ruleIndex];
		// A second condition usually checks another parameter, e.g. {mode} after {n}.
		const used = new Set(rule?.when.map(condition => condition.parameter));
		const parameter = this.parameters.find(item => !used.has(item.key)) ?? this.parameters[0];
		if (!rule || !parameter)
			return;

		const condition = createCondition(parameter, list === 'tierRules' ? 'tier' : 'skip');
		this.updateRule(list, ruleIndex, { when: [ ...rule.when, condition ] });
	}

	// ── Rendering ───────────────────────────────────────────────────────

	private renderValue(
		parameter: AchievementParameterDraft | undefined,
		condition: AchievementVariantConditionDraft,
		onChange: (value: AchievementVariantConditionDraft['value']) => void,
	): TemplateResult {
		const change = (event: Event): void =>
			onChange(parseConditionValue(parameter, (event.currentTarget as HTMLInputElement | HTMLSelectElement).value));

		if (parameter?.valueType === 'integer') {
			return html`
				<input
					class="value"
					type="number"
					step=${ parameter.generatorType === 'range' ? parameter.step ?? 1 : 1 }
					aria-label=${ `Value of {${ parameter.key }}` }
					.value=${ String(condition.value) }
					@change=${ change }
				/>
			`;
		}

		const values = parameter ? getConditionValues(parameter) : [];
		const choices = values.includes(condition.value) ? values : [ condition.value, ...values ];

		return html`
			<select class="value" aria-label=${ `Value of {${ condition.parameter }}` } @change=${ change }>
				${ choices.map(value => html`
					<option value=${ String(value) } ?selected=${ value === condition.value }>
						${ typeof value === 'boolean' ? value ? 'yes' : 'no' : value }
					</option>
				`) }
			</select>
		`;
	}

	private renderCondition(
		list: RuleList,
		ruleIndex: number,
		condition: AchievementVariantConditionDraft,
		index: number,
	): TemplateResult {
		const rule = this[list][ruleIndex]!;
		const parameter = this.parameters.find(item => item.key === condition.parameter);
		const update = (patch: Partial<AchievementVariantConditionDraft>): void =>
			this.updateCondition(list, ruleIndex, index, { ...condition, ...patch });
		const knownParameter = !!parameter;

		return html`
			${ index > 0 ? html`<span class="word">and</span>` : nothing }
			<span class="condition ${ knownParameter ? '' : 'condition--broken' }">
				${ this.parameters.length === 1 && knownParameter
					? html`<code class="parameter">{${ condition.parameter }}</code>`
					: html`
						<select
							class="parameter"
							aria-label="Parameter"
							@change=${ (event: Event) => {
								const key = (event.currentTarget as HTMLSelectElement).value;
								const next = this.parameters.find(item => item.key === key);
								if (next)
									this.updateCondition(list, ruleIndex, index, changeConditionParameter(condition, next));
							} }
						>
							${ knownParameter ? nothing : html`<option selected disabled>{${ condition.parameter }}</option>` }
							${ this.parameters.map(item => html`
								<option value=${ item.key } ?selected=${ item.key === condition.parameter }>{${ item.key }}</option>
							`) }
						</select>
					` }
				<select
					class="operator"
					aria-label="Comparison"
					@change=${ (event: Event) => update({
						operator: (event.currentTarget as HTMLSelectElement).value as AchievementComparisonOperator,
					}) }
				>
					${ getConditionOperators(parameter).map(operator => html`
						<option value=${ operator } ?selected=${ operator === condition.operator }>
							${ operatorLabels[operator] }
						</option>
					`) }
				</select>
				${ this.renderValue(parameter, condition, value => update({ value })) }
				${ rule.when.length > 1 && !this.readOnly
					? html`
						<button
							type="button"
							class="icon"
							title="Remove this condition"
							aria-label="Remove this condition"
							@click=${ () => this.updateCondition(list, ruleIndex, index, undefined) }
						><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
					`
					: nothing }
			</span>
		`;
	}

	private renderConditions(list: RuleList, ruleIndex: number): TemplateResult {
		const rule = this[list][ruleIndex]!;

		return html`
			<span class="word">if</span>
			${ rule.when.map((condition, index) => this.renderCondition(list, ruleIndex, condition, index)) }
			${ this.readOnly
				? nothing
				: html`
					<button
						type="button"
						class="add-and"
						title="Add a condition that also has to hold"
						@click=${ () => this.addCondition(list, ruleIndex) }
					>+ and</button>
				` }
		`;
	}

	private renderCount(count: number | undefined, noun: string): TemplateResult | typeof nothing {
		if (count === undefined)
			return nothing;

		const title = count === 0
			? `No achievement ${ noun }`
			: `${ count } ${ count === 1 ? 'achievement' : 'achievements' } ${ noun }`;

		return html`<span class="count ${ count === 0 ? 'count--none' : '' }" title=${ title }>${ count }</span>`;
	}

	private renderRowActions(list: RuleList, index: number): TemplateResult | typeof nothing {
		if (this.readOnly)
			return nothing;

		const rules = this[list];

		return html`
			${ list === 'tierRules' && rules.length > 1
				? html`
					<button
						type="button"
						class="icon"
						title="Check this rule earlier"
						aria-label="Move up"
						?disabled=${ index === 0 }
						@click=${ () => this.setRules(list, moveItem(rules, index, -1)) }
					><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
				`
				: nothing }
			<button
				type="button"
				class="icon"
				title="Remove this rule"
				aria-label="Remove this rule"
				@click=${ () => this.setRules(list, rules.filter((_, position) => position !== index)) }
			><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
		`;
	}

	private renderSkipRule(index: number): TemplateResult {
		return html`
			<div class="rule rule--skip">
				<span class="lead">Skip</span>
				${ this.renderConditions('skipRules', index) }
				<span class="sp"></span>
				${ this.renderCount(this.summary?.skipRuleCounts[index], 'skipped') }
				${ this.renderRowActions('skipRules', index) }
			</div>
		`;
	}

	private renderTierRule(rule: AchievementTierRuleDraft, index: number): TemplateResult {
		return html`
			<div class="rule">
				<label class="lead tier-pick">
					<img src=${ getAchievementTierIcon(rule.tier) } alt="" />
					<select
						aria-label="Tier"
						@change=${ (event: Event) => this.updateRule<AchievementTierRuleDraft>('tierRules', index, {
							tier: Number((event.currentTarget as HTMLSelectElement).value),
						}) }
					>
						${ achievementTiersAscending.map(tier => html`
							<option value=${ tier } ?selected=${ tier === rule.tier }>${ formatTierLabel(tier) }</option>
						`) }
					</select>
				</label>
				${ this.renderConditions('tierRules', index) }
				<span class="sp"></span>
				${ this.renderCount(this.summary?.tierRuleCounts[index], 'get this tier') }
				${ this.renderRowActions('tierRules', index) }
			</div>
		`;
	}

	private renderDefaultTier(): TemplateResult {
		return html`
			<div class="rule rule--default">
				<span class="lead">${ this.tierRules.length > 0 ? 'Otherwise' : 'Tier' }</span>
				<aa-segmented-control
					size="small"
					icon-only
					.items=${ tierItems }
					.selected=${ String(this.tier) }
					label="Tier"
					@segmented-control-change=${ (event: SegmentedControlChangeEvent) => {
						event.stopPropagation();
						this.emit({ tier: Number(event.detail) });
					} }
				></aa-segmented-control>
				<b class="tier-name">${ formatTierLabel(this.tier) }</b>
				<span class="sp"></span>
				${ this.tierRules.length > 0 ? this.renderCount(this.summary?.defaultCount, 'get this tier') : nothing }
			</div>
		`;
	}

	private renderFoldedSummary(): TemplateResult {
		const summary = this.summary;
		const text = summary && this.hasRules
			? [ formatTierCounts(summary), ...summary.skipped > 0 ? [ `${ summary.skipped } skipped` ] : [] ].join(' · ')
			: formatTierLabel(this.tier);

		return html`
			<span class="folded">
				${ this.tierRules.length === 0 ? html`<img src=${ getAchievementTierIcon(this.tier) } alt="" />` : nothing }
				${ text }
			</span>
		`;
	}

	private renderTotals(): TemplateResult | typeof nothing {
		const summary = this.summary;
		if (!summary || !this.hasRules)
			return nothing;

		const parts = [
			`${ summary.count } ${ summary.count === 1 ? 'achievement' : 'achievements' }`,
			formatTierCounts(summary),
			...summary.skipped > 0 ? [ `${ summary.skipped } skipped` ] : [],
		].filter(Boolean);

		return html`<p class="totals">${ parts.join(' · ') }</p>`;
	}

	private renderAddButtons(): TemplateResult | typeof nothing {
		if (this.readOnly)
			return nothing;

		const disabled = this.parameters.length === 0;
		const reason = 'Add a parameter under Variants first';

		return html`
			<button
				type="button"
				class="add"
				?disabled=${ disabled }
				title=${ disabled ? reason : 'Give some achievements another tier' }
				@click=${ () => this.setRules('tierRules', [ ...this.tierRules, createTierRule(this.parameters, this.tier) ]) }
			>+ Tier rule</button>
			<button
				type="button"
				class="add"
				?disabled=${ disabled }
				title=${ disabled ? reason : 'Leave some combinations out' }
				@click=${ () => this.setRules('skipRules', [ ...this.skipRules, createSkipRule(this.parameters) ]) }
			>+ Skip</button>
		`;
	}

	override render(): TemplateResult {
		return html`
			<section class="panel" aria-label="Tiers">
				<header>
					<button
						type="button"
						class="fold"
						aria-expanded=${ String(this.open) }
						title="The tier sets the MMR reward and the MMR cap increase"
						@click=${ this.toggleOpen }
					>
						<i class="fa-solid fa-chevron-${ this.open ? 'down' : 'right' }" aria-hidden="true"></i>
						Tiers
					</button>
					${ this.open ? nothing : this.renderFoldedSummary() }
					<span class="sp"></span>
					${ this.open ? this.renderAddButtons() : nothing }
				</header>
				${ this.open
					? html`
						<div class="rules" ?inert=${ this.readOnly }>
							${ this.skipRules.map((_, index) => this.renderSkipRule(index)) }
							${ this.tierRules.map((rule, index) => this.renderTierRule(rule, index)) }
							${ this.renderDefaultTier() }
						</div>
						${ this.renderTotals() }
					`
					: nothing }
			</section>
		`;
	}

	static override styles = [ faIcons, unsafeCSS(variantRulesEditorStyles) ];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-variant-rules-editor': AaVariantRulesEditor;
	}
}
