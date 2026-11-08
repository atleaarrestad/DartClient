import {
	formatTierLabel,
	isOrderingOperator,
	VariantSummary,
} from '../../../helpers/achievementVariantRules.js';
import {
	AchievementComparisonOperator,
	achievementComparisonOperators,
	AchievementParameterDraft,
	AchievementSkipRuleDraft,
	AchievementTierRuleDraft,
	AchievementVariantConditionDraft,
} from '../../../models/achievementBuilder.js';
import { AchievementTier, achievementTiersAscending } from '../../../models/enums.js';
import { getParameterValues } from '../achievement-draft.js';

/** How many of a parameter's values the value pickers offer. */
const valueChoiceLimit = 500;

const emptyValues: Record<AchievementParameterDraft['valueType'], AchievementVariantConditionDraft['value']> = {
	integer: 0,
	string:  '',
	boolean: true,
};

/** The values a condition on this parameter can pick from, in generation order. */
export const getConditionValues = (
	parameter: AchievementParameterDraft,
): readonly AchievementVariantConditionDraft['value'][] =>
	getParameterValues(parameter, valueChoiceLimit);

/** The comparisons a parameter allows: all six for numbers, = and != for text and yes/no. */
export const getConditionOperators = (
	parameter: AchievementParameterDraft | undefined,
): readonly AchievementComparisonOperator[] =>
	parameter?.valueType === 'integer' || !parameter
		? achievementComparisonOperators
		: achievementComparisonOperators.filter(operator => !isOrderingOperator(operator));

/**
 * A condition that matches some of the parameter's values: for a tier, numbers start at the
 * highest value (`>=`), so the rule picks out the top end; everything else checks the first value.
 */
export const createCondition = (
	parameter: AchievementParameterDraft,
	purpose: 'tier' | 'skip',
): AchievementVariantConditionDraft => {
	const values = getParameterValues(parameter);
	if (parameter.valueType === 'integer' && purpose === 'tier') {
		return {
			parameter: parameter.key,
			operator:  'greaterThanOrEqual',
			value:     values.at(-1) ?? emptyValues.integer,
		};
	}

	return { parameter: parameter.key, operator: 'equal', value: values[0] ?? emptyValues[parameter.valueType] };
};

/** A rule for the next tier up from the default, checking the first parameter. */
export const createTierRule = (
	parameters: readonly AchievementParameterDraft[],
	defaultTier: number,
): AchievementTierRuleDraft => ({
	tier: achievementTiersAscending.find(tier => tier > defaultTier) ?? AchievementTier.diamond,
	when: parameters[0] ? [ createCondition(parameters[0], 'tier') ] : [],
});

export const createSkipRule = (parameters: readonly AchievementParameterDraft[]): AchievementSkipRuleDraft => ({
	when: parameters[0] ? [ createCondition(parameters[0], 'skip') ] : [],
});

/** Points a condition at another parameter, keeping the comparison and value where they still fit. */
export const changeConditionParameter = (
	condition: AchievementVariantConditionDraft,
	parameter: AchievementParameterDraft,
): AchievementVariantConditionDraft => {
	const fresh = createCondition(parameter, 'skip');

	return {
		parameter: parameter.key,
		operator:  getConditionOperators(parameter).includes(condition.operator) ? condition.operator : 'equal',
		value:     typeof condition.value === typeof fresh.value ? condition.value : fresh.value,
	};
};

/** Reads a typed value back from a picker or input, by the parameter's type. */
export const parseConditionValue = (
	parameter: AchievementParameterDraft | undefined,
	text: string,
): AchievementVariantConditionDraft['value'] => {
	switch (parameter?.valueType) {
	case 'integer':
		return text.trim() === '' ? 0 : Number(text);
	case 'boolean':
		return text === 'true';
	default:
		return text;
	}
};

/** Moves an item one place; first-match tier rules depend on their order. */
export const moveItem = <T>(items: readonly T[], index: number, offset: -1 | 1): T[] => {
	const target = index + offset;
	if (target < 0 || target >= items.length)
		return [ ...items ];

	const moved = [ ...items ];
	[ moved[index], moved[target] ] = [ moved[target]!, moved[index]! ];

	return moved;
};

/** The tiers that are used, highest first, e.g. "1 Diamond · 3 Gold · 10 Bronze". */
export const formatTierCounts = (summary: VariantSummary): string =>
	[ ...achievementTiersAscending ]
		.reverse()
		.filter(tier => (summary.tierCounts.get(tier) ?? 0) > 0)
		.map(tier => `${ summary.tierCounts.get(tier) } ${ formatTierLabel(tier) }`)
		.join(' · ');

/** The lowest and highest tier a template's achievements get. */
export const getTierRange = (summary: VariantSummary): { lowest: number; highest: number; } | undefined => {
	const used = achievementTiersAscending.filter(tier => (summary.tierCounts.get(tier) ?? 0) > 0);
	const lowest = used[0];
	const highest = used.at(-1);

	return lowest === undefined || highest === undefined ? undefined : { lowest, highest };
};
