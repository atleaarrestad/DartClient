import {
	AchievementComparisonOperator,
	AchievementProgressionTargetDraft,
	AchievementRoundStatus,
	achievementRoundStatusLabels,
	AchievementRuleDraft,
	AchievementValueDraft,
	achievementValueSourceLabels,
} from '../../../models/achievementBuilder.js';
import type { ParameterBinding } from '../achievement-draft.js';
import { formatAchievementRule } from '../achievement-rule-presentation.js';
import { describeTarget, HitTarget, resolveValueNumber } from '../hit-target/hit-target.js';
import { allRoundStatuses, operatorWords } from '../rule-text/rule-text-vocabulary.js';

export interface ReadoutItem {
	/** The rule the phrase describes; hovering it highlights that rule. */
	ruleId:   string;
	text:     string;
	children: ReadoutItem[];
}

export interface Readout {
	intro: string;
	items: ReadoutItem[];
}

const countWords: Record<AchievementComparisonOperator, string> = {
	equal:              'exactly',
	notEqual:           'other than',
	greaterThan:        'more than',
	greaterThanOrEqual: 'at least',
	lessThan:           'fewer than',
	lessThanOrEqual:    'at most',
};

/** A value as a phrase: a number, the preview value of a parameter, or a field label. */
export const describeValue = (value: AchievementValueDraft, binding?: ParameterBinding): string => {
	switch (value.source) {
	case 'constant':
		return value.value;
	case 'parameter': {
		const bound = binding?.[value.value];

		return bound === undefined ? `{${ value.value }}` : String(bound);
	}
	case 'parameter.offset':
	case 'board.leftNeighbor':
	case 'board.rightNeighbor': {
		const resolved = resolveValueNumber(value, binding);
		if (resolved !== undefined)
			return String(resolved);
		if (value.source === 'parameter.offset') {
			const offset = value.offset ?? 0;

			return `{${ value.value }${ offset < 0 ? '-' : '+' }${ Math.abs(offset) }}`;
		}

		return `{${ value.source === 'board.leftNeighbor' ? 'left' : 'right' } ${ value.value }}`;
	}
	default:
		return achievementValueSourceLabels[value.source].toLowerCase();
	}
};

const describeStatuses = (statuses: readonly AchievementRoundStatus[]): string =>
	allRoundStatuses.every(status => statuses.includes(status))
		? ''
		: `${ statuses.map(status => achievementRoundStatusLabels[status].toLowerCase()).join(' or ') } `;

/** "you hit T7", "you miss", "you hit the rim", "you throw a dart". */
const describeHit = (target: HitTarget, binding?: ParameterBinding): string => {
	if (target.throwType === 'miss')
		return 'you miss';
	if (target.throwType === 'rim')
		return 'you hit the rim';
	if (target.throwType === 'any' && !target.hitLocation)
		return 'you throw a dart';

	return `you hit ${ describeTarget(target, binding) }`;
};

const describeEveryDart = (target: HitTarget, binding?: ParameterBinding): string => {
	if (target.throwType === 'miss')
		return 'every dart misses';
	if (target.throwType === 'rim')
		return 'every dart hits the rim';

	return target.hitLocation
		? `every dart hits ${ describeTarget(target, binding) }`
		: `every dart is ${ describeTarget(target, binding) }`;
};

const describeWinningThrow = (target: HitTarget, binding?: ParameterBinding): string => {
	if (target.hitLocation)
		return `you win on ${ describeTarget(target, binding) }`;

	return target.throwType === 'any' ? 'you win the game' : `you win with ${ describeTarget(target, binding) }`;
};

/** The readout phrase for one condition that is shown as a line. */
export const describeLeaf = (rule: AchievementRuleDraft, binding?: ParameterBinding): string => {
	switch (rule.type) {
	case 'throw':
		return rule.quantifier === 'all' ? describeEveryDart(rule, binding) : describeHit(rule, binding);
	case 'throwCount': {
		const count = describeValue(rule.count, binding);
		const times = count === '1' ? 'time' : 'times';

		return `${ describeHit(rule, binding) } ${ countWords[rule.operator] } ${ count } ${ times }`;
	}
	case 'winningThrow':
		return describeWinningThrow(rule, binding);
	case 'compare':
		return `${ describeValue(rule.left, binding) } ${ operatorWords[rule.operator] } ${ describeValue(rule.right, binding) }`;
	case 'sequence':
		return rule.targets.length > 0
			? `you hit ${ rule.targets.map(target => describeTarget(target, binding)).join(', then ') }`
			: 'an ordered sequence without steps';
	default:
		return formatAchievementRule(rule);
	}
};

const describeRule = (rule: AchievementRuleDraft, binding?: ParameterBinding): ReadoutItem => {
	switch (rule.type) {
	case 'not':
		return describeNegation(rule, binding);
	case 'all':
	case 'any':
		return {
			ruleId:   rule.id,
			text:     rule.type === 'all' ? 'all of these:' : 'any of these:',
			children: rule.children.map(child => describeRule(child, binding)),
		};
	case 'round': {
		const header = `in ${ rule.quantifier === 'all' ? 'every' : 'one' } ${ describeStatuses(rule.statuses) }round`;
		const condition = rule.condition;
		if (condition.type === 'all' || condition.type === 'any') {
			return {
				ruleId:   rule.id,
				text:     condition.type === 'any' ? `${ header }, any of these:` : `${ header }:`,
				children: condition.children.map(child => describeRule(child, binding)),
			};
		}

		return { ruleId: rule.id, text: `${ header }:`, children: [ describeRule(condition, binding) ] };
	}
	default:
		return { ruleId: rule.id, text: describeLeaf(rule, binding), children: [] };
	}
};

/**
 * A Not reads as the opposite of what it wraps: "in no round:", "none of these:",
 * "not all of these:"; anything else is prefixed with "not:".
 */
const describeNegation = (
	rule: Extract<AchievementRuleDraft, { type: 'not'; }>,
	binding?: ParameterBinding,
): ReadoutItem => {
	const child = rule.child;
	const inner = describeRule(child, binding);
	const withText = (text: string): ReadoutItem => ({ ruleId: rule.id, text, children: inner.children });

	if (child.type === 'any')
		return withText('none of these:');
	if (child.type === 'all')
		return withText(child.children.length === 1 ? 'not:' : 'not all of these:');
	if (child.type === 'round') {
		const statuses = describeStatuses(child.statuses);
		const anyOf = child.condition.type === 'any' ? ', any of these' : '';

		return withText(child.quantifier === 'all'
			? `not in every ${ statuses }round${ anyOf }:`
			: `in no ${ statuses }round${ anyOf }:`);
	}

	return withText(`not: ${ inner.text }`);
};

/** The whole rule in plain language, resolved for one set of parameter values. */
export const buildRuleReadout = (rule: AchievementRuleDraft, binding?: ParameterBinding): Readout => {
	if (rule.type === 'all') {
		return {
			intro: rule.children.length === 1 ? 'when' : 'when all of these are true:',
			items: rule.children.map(child => describeRule(child, binding)),
		};
	}
	if (rule.type === 'any')
		return { intro: 'when any of these is true:', items: rule.children.map(child => describeRule(child, binding)) };

	return { intro: 'when', items: [ describeRule(rule, binding) ] };
};

/** The readout of a progression achievement: the targets to collect across games. */
export const buildProgressionReadout = (
	statuses: readonly ('valid' | 'victory')[],
	targets: readonly AchievementProgressionTargetDraft[],
	binding?: ParameterBinding,
): Readout => ({
	intro: `when you have hit all of these in ${ statuses.join(' or ') || 'no' } rounds, across games:`,
	items: [
		{
			ruleId: '',
			text:   targets.length > 0
				? targets.map(target => describeTarget(target, binding)).join(', ')
				: 'no targets yet',
			children: [],
		},
	],
});
