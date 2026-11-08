import {
	AchievementComparisonOperator,
	achievementComparisonOperators,
	AchievementSkipRuleDraft,
	AchievementTierRuleDraft,
	AchievementVariantConditionDraft,
} from '../models/achievementBuilder.js';
import { AchievementTier, achievementTiersAscending } from '../models/enums.js';

/**
 * Variant rules: which generated achievements (parameter combinations) are skipped, and which
 * tier each one gets. They are stored in a definition's `variants` property and evaluated the
 * same way as the server's AchievementVariantRules:
 * - a variant is skipped when any skip rule matches;
 * - its tier comes from the first tier rule that matches, else the template's tier;
 * - a rule matches when all of its conditions hold.
 */

export type VariantValue = string | number | boolean;
export type VariantBinding = Readonly<Record<string, VariantValue>>;

export interface AchievementVariantRules {
	tier:      number;
	tierRules: readonly AchievementTierRuleDraft[];
	skipRules: readonly AchievementSkipRuleDraft[];
}

/** Every combination of parameter values in generation order; the last parameter varies fastest. */
export type VariantValueLists = readonly (readonly [ key: string, values: readonly VariantValue[] ])[];

export const variantsPropertyName = 'variants';

/** Lowercase tier names, as stored in definitions and written in rule text. */
export const getTierName = (tier: number): string | undefined =>
	achievementTiersAscending.includes(tier) ? AchievementTier[tier] : undefined;

/** A tier as people read it: Bronze, Gold. */
export const formatTierLabel = (tier: number): string => {
	const name = getTierName(tier);

	return name ? `${ name[0]!.toUpperCase() }${ name.slice(1) }` : `Tier ${ tier }`;
};

export const findTierByName = (name: string): number | undefined =>
	achievementTiersAscending.find(tier => AchievementTier[tier] === name);

/** Ordering only makes sense for numbers; text and yes/no parameters compare with = and !=. */
export const isOrderingOperator = (operator: AchievementComparisonOperator): boolean =>
	operator !== 'equal' && operator !== 'notEqual';

const holds = (value: VariantValue | undefined, condition: AchievementVariantConditionDraft): boolean => {
	if (value === undefined)
		return false;

	if (typeof value === 'number' && typeof condition.value === 'number') {
		switch (condition.operator) {
		case 'equal':
			return value === condition.value;
		case 'notEqual':
			return value !== condition.value;
		case 'greaterThan':
			return value > condition.value;
		case 'greaterThanOrEqual':
			return value >= condition.value;
		case 'lessThan':
			return value < condition.value;
		case 'lessThanOrEqual':
			return value <= condition.value;
		}
	}

	const equal = value === condition.value;

	return condition.operator === 'notEqual' ? !equal : equal;
};

export const matchesConditions = (
	conditions: readonly AchievementVariantConditionDraft[],
	binding: VariantBinding,
): boolean => conditions.every(condition => holds(binding[condition.parameter], condition));

export const isVariantSkipped = (
	skipRules: readonly AchievementSkipRuleDraft[],
	binding: VariantBinding,
): boolean => skipRules.some(rule => matchesConditions(rule.when, binding));

/** The index of the tier rule that decides a variant's tier, or -1 when it keeps the default. */
export const findTierRuleIndex = (
	tierRules: readonly AchievementTierRuleDraft[],
	binding: VariantBinding,
): number => tierRules.findIndex(rule => matchesConditions(rule.when, binding));

export const getVariantTier = (
	rules: Pick<AchievementVariantRules, 'tier' | 'tierRules'>,
	binding: VariantBinding,
): number => rules.tierRules[findTierRuleIndex(rules.tierRules, binding)]?.tier ?? rules.tier;

/** Parameter combinations in generation order, stopping after `limit` of them. */
export function* enumerateBindings(
	lists: VariantValueLists,
	limit = Number.POSITIVE_INFINITY,
): Generator<Record<string, VariantValue>> {
	if (lists.some(([ , values ]) => values.length === 0))
		return;

	const positions = lists.map(() => 0);
	for (let produced = 0; produced < limit; produced++) {
		yield Object.fromEntries(lists.map(([ key, values ], index) => [ key, values[positions[index]!]! ]));

		// Advance like an odometer: the last parameter first.
		let index = lists.length - 1;
		while (index >= 0) {
			positions[index]!++;
			if (positions[index]! < lists[index]![1].length)
				break;

			positions[index] = 0;
			index--;
		}
		if (index < 0)
			return;
	}
}

export interface VariantSummary {
	/** Achievements generated after skipping. */
	count:          number;
	skipped:        number;
	/** How many achievements get each tier. */
	tierCounts:     ReadonlyMap<number, number>;
	/** How many achievements each tier rule decides; earlier rules and skips come first. */
	tierRuleCounts: readonly number[];
	/** How many achievements each skip rule matches. */
	skipRuleCounts: readonly number[];
	/** Achievements the default tier applies to. */
	defaultCount:   number;
}

export const summarizeVariants = (
	lists: VariantValueLists,
	rules: AchievementVariantRules,
): VariantSummary => {
	const tierCounts: Map<number, number> = new Map();
	const tierRuleCounts = rules.tierRules.map(() => 0);
	const skipRuleCounts = rules.skipRules.map(() => 0);
	let count = 0;
	let skipped = 0;
	let defaultCount = 0;

	for (const binding of enumerateBindings(lists)) {
		let isSkipped = false;
		rules.skipRules.forEach((rule, index) => {
			if (matchesConditions(rule.when, binding)) {
				skipRuleCounts[index]!++;
				isSkipped = true;
			}
		});
		if (isSkipped) {
			skipped++;
			continue;
		}

		count++;
		const ruleIndex = findTierRuleIndex(rules.tierRules, binding);
		const tier = rules.tierRules[ruleIndex]?.tier ?? rules.tier;
		if (ruleIndex >= 0)
			tierRuleCounts[ruleIndex]!++;
		else
			defaultCount++;

		tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
	}

	return { count, skipped, tierCounts, tierRuleCounts, skipRuleCounts, defaultCount };
};

// ── Stored form ─────────────────────────────────────────────────────────────

const compileConditions = (when: readonly AchievementVariantConditionDraft[]): Record<string, unknown>[] =>
	when.map(({ parameter, operator, value }) => ({ parameter, operator, value }));

/** The definition's `variants` property, or undefined when there are no rules. */
export const compileVariantRules = (
	rules: Pick<AchievementVariantRules, 'tierRules' | 'skipRules'>,
): Record<string, unknown> | undefined => {
	if (rules.tierRules.length === 0 && rules.skipRules.length === 0)
		return undefined;

	return {
		...rules.skipRules.length > 0
			? { skip: rules.skipRules.map(rule => ({ when: compileConditions(rule.when) })) }
			: {},
		...rules.tierRules.length > 0
			? {
				tiers: rules.tierRules.map(rule => ({
					tier: getTierName(rule.tier) ?? String(rule.tier),
					when: compileConditions(rule.when),
				})),
			}
			: {},
	};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

const restoreConditions = (value: unknown): AchievementVariantConditionDraft[] =>
	(Array.isArray(value) ? value : []).flatMap(item => {
		if (!isRecord(item))
			return [];

		const { parameter, operator, value: compared } = item;
		const isOperator = achievementComparisonOperators.includes(operator as AchievementComparisonOperator);
		const isValue = typeof compared === 'string' || typeof compared === 'number' || typeof compared === 'boolean';

		return typeof parameter === 'string' && isOperator && isValue
			? [ { parameter, operator: operator as AchievementComparisonOperator, value: compared } ]
			: [];
	});

/** Reads stored rules. The server validated them on save, so anything unreadable is left out. */
export const restoreVariantRules = (
	value: unknown,
): { tierRules: AchievementTierRuleDraft[]; skipRules: AchievementSkipRuleDraft[]; } => {
	if (!isRecord(value))
		return { tierRules: [], skipRules: [] };

	const list = (items: unknown): Record<string, unknown>[] =>
		(Array.isArray(items) ? items : []).filter(isRecord);

	return {
		skipRules: list(value['skip']).map(rule => ({ when: restoreConditions(rule['when']) })),
		tierRules: list(value['tiers']).flatMap(rule => {
			const tier = typeof rule['tier'] === 'string' ? findTierByName(rule['tier']) : undefined;

			return tier === undefined ? [] : [ { tier, when: restoreConditions(rule['when']) } ];
		}),
	};
};
