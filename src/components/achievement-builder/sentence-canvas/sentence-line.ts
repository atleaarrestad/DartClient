import '../hit-target/aa-hit-target-chip.js';

import { html, nothing, TemplateResult } from 'lit';

import {
	AchievementComparisonOperator,
	AchievementParameterDraft,
	createAchievementBuilderId,
	sequenceTargetCount,
} from '../../../models/achievementBuilder.js';
import type { BuilderScope, ParameterBinding } from '../achievement-draft.js';
import { formatAchievementRule } from '../achievement-rule-presentation.js';
import type { HitTarget, HitTargetContextId } from '../hit-target/hit-target.js';
import { operatorWords } from '../rule-text/rule-text-vocabulary.js';
import type { LeafRule } from './rule-graph.js';
import { renderValueChip } from './value-chip.js';

export interface SentenceContext {
	parameters: readonly AchievementParameterDraft[];
	binding?:   ParameterBinding;
	scope:      BuilderScope;
	readOnly:   boolean;
	/** Replaces the rule with an edited copy. */
	update:     (rule: LeafRule) => void;
}

const operators = Object.keys(operatorWords) as AchievementComparisonOperator[];

/** How count comparisons read: "at least 3 times". */
const countWords: Record<AchievementComparisonOperator, string> = {
	equal:              'exactly',
	notEqual:           'other than',
	greaterThan:        'more than',
	greaterThanOrEqual: 'at least',
	lessThan:           'fewer than',
	lessThanOrEqual:    'at most',
};

const renderOperator = (
	operator: AchievementComparisonOperator,
	words: Record<AchievementComparisonOperator, string>,
	onChange: (operator: AchievementComparisonOperator) => void,
): TemplateResult => html`
	<select
		class="chip-select"
		aria-label="Comparison"
		@change=${ (event: Event) => onChange((event.currentTarget as HTMLSelectElement).value as AchievementComparisonOperator) }
	>
		${ operators.map(item => html`<option value=${ item } ?selected=${ item === operator }>${ words[item] }</option>`) }
	</select>
`;

const renderTarget = (
	target: HitTarget,
	contextId: HitTargetContextId,
	context: SentenceContext,
	onChange: (target: HitTarget) => void,
	onRemove?: () => void,
): TemplateResult => html`
	<aa-hit-target-chip
		.target=${ target }
		.context=${ contextId }
		.parameters=${ context.parameters }
		.binding=${ context.binding }
		?readOnly=${ context.readOnly }
		?removable=${ !!onRemove }
		@hit-target-change=${ (event: CustomEvent<HitTarget>) => {
			event.stopPropagation();
			onChange(event.detail);
		} }
		@hit-target-remove=${ (event: Event) => {
			event.stopPropagation();
			onRemove?.();
		} }
	></aa-hit-target-chip>
`;

const pickTarget = (rule: { throwType: HitTarget['throwType']; hitLocation?: HitTarget['hitLocation']; }): HitTarget =>
	({ throwType: rule.throwType, hitLocation: rule.hitLocation });

/** The editable sentence for one condition line. */
export const renderSentence = (rule: LeafRule, context: SentenceContext): TemplateResult => {
	const { update } = context;

	switch (rule.type) {
	case 'throw':
		return html`
			<select
				class="chip-select"
				aria-label="Which darts"
				@change=${ (event: Event) => update({
					...rule,
					quantifier: (event.currentTarget as HTMLSelectElement).value as 'any' | 'all',
				}) }
			>
				<option value="any" ?selected=${ rule.quantifier === 'any' }>a dart</option>
				<option value="all" ?selected=${ rule.quantifier === 'all' }>every dart</option>
			</select>
			hits
			${ renderTarget(pickTarget(rule), 'throw', context, target => update({
				...rule,
				throwType:   target.throwType as typeof rule.throwType,
				hitLocation: target.hitLocation,
			})) }
		`;
	case 'throwCount':
		return html`
			darts on
			${ renderTarget(pickTarget(rule), 'throwCount', context, target => update({
				...rule,
				throwType:   target.throwType as typeof rule.throwType,
				hitLocation: target.hitLocation,
			})) }
			${ renderOperator(rule.operator, countWords, operator => update({ ...rule, operator })) }
			${ renderValueChip({
				value:      rule.count,
				parameters: context.parameters,
				scope:      context.scope,
				role:       'comparison-right',
				label:      'Count',
				onChange:   count => update({ ...rule, count }),
			}) }
			times
		`;
	case 'winningThrow':
		return html`
			the winning dart is
			${ renderTarget(pickTarget(rule), 'winningThrow', context, target => update({
				...rule,
				throwType:   target.throwType as typeof rule.throwType,
				hitLocation: target.hitLocation,
			})) }
		`;
	case 'compare':
		return html`
			${ renderValueChip({
				value:       rule.left,
				parameters:  context.parameters,
				scope:       context.scope,
				role:        'comparison-left',
				label:       'Value',
				numericOnly: false,
				onChange:    left => update({ ...rule, left }),
			}) }
			${ renderOperator(rule.operator, operatorWords, operator => update({ ...rule, operator })) }
			${ renderValueChip({
				value:       rule.right,
				parameters:  context.parameters,
				scope:       context.scope,
				role:        'comparison-right',
				label:       'Compared with',
				numericOnly: false,
				onChange:    right => update({ ...rule, right }),
			}) }
		`;
	case 'sequence':
		return html`
			in order:
			${ rule.targets.map((target, index) => html`
				${ index > 0 ? html`<span aria-hidden="true">→</span>` : nothing }
				${ renderTarget(
					pickTarget(target),
					'sequence',
					context,
					changed => update({
						...rule,
						targets: rule.targets.map(item => item.id === target.id
							? {
								...item,
								throwType:   changed.throwType as typeof item.throwType,
								hitLocation: changed.hitLocation ?? item.hitLocation,
							}
							: item),
					}),
					() => update({ ...rule, targets: rule.targets.filter(item => item.id !== target.id) }),
				) }
			`) }
			${ !context.readOnly && rule.targets.length < sequenceTargetCount
				? html`
					<button
						type="button"
						class="chip-add"
						@click=${ () => update({
							...rule,
							targets: [
								...rule.targets,
								{
									id:          createAchievementBuilderId(),
									throwType:   'anyScoring',
									hitLocation: { source: 'constant', value: '20' },
								},
							],
						}) }
					>+ step</button>
				`
				: nothing }
		`;
	case 'raw':
		return html`<code class="raw">${ formatAchievementRule(rule) }</code><span class="muted">read-only</span>`;
	}
};
