import { describe, expect, it } from 'vitest';

import type { AchievementTierRuleDraft, AchievementVariantConditionDraft } from '../models/achievementBuilder.js';
import { AchievementTier } from '../models/enums.js';
import {
	compileVariantRules,
	enumerateBindings,
	getVariantTier,
	isVariantSkipped,
	restoreVariantRules,
	summarizeVariants,
} from './achievementVariantRules.js';

const when = (
	parameter: string,
	operator: AchievementVariantConditionDraft['operator'],
	value: AchievementVariantConditionDraft['value'],
): AchievementVariantConditionDraft => ({ parameter, operator, value });

const tierRule = (tier: AchievementTier, ...conditions: AchievementVariantConditionDraft[]): AchievementTierRuleDraft =>
	({ tier, when: conditions });

describe('variant rule evaluation', () => {
	it('gives a variant the tier of the first rule that matches, else the default', () => {
		const rules = {
			tier:      AchievementTier.bronze,
			tierRules: [
				tierRule(AchievementTier.platinum, when('n', 'equal', 20)),
				tierRule(AchievementTier.gold, when('n', 'greaterThanOrEqual', 19)),
			],
		};

		expect(getVariantTier(rules, { n: 18 })).toBe(AchievementTier.bronze);
		expect(getVariantTier(rules, { n: 19 })).toBe(AchievementTier.gold);
		expect(getVariantTier(rules, { n: 20 })).toBe(AchievementTier.platinum);
	});

	it('needs every condition of a rule to hold', () => {
		const rules = { tier: 1, tierRules: [ tierRule(5, when('n', 'equal', 20), when('mode', 'equal', 'hard')) ] };

		expect(getVariantTier(rules, { n: 20, mode: 'hard' })).toBe(5);
		expect(getVariantTier(rules, { n: 20, mode: 'easy' })).toBe(1);
	});

	it('compares text and yes/no by equality, and never matches a missing parameter', () => {
		const skip = [ { when: [ when('mode', 'notEqual', 'easy') ] }, { when: [ when('double', 'equal', true) ] } ];

		expect(isVariantSkipped(skip, { mode: 'hard', double: false })).toBe(true);
		expect(isVariantSkipped(skip, { mode: 'easy', double: true })).toBe(true);
		expect(isVariantSkipped(skip, { mode: 'easy', double: false })).toBe(false);
		expect(isVariantSkipped(skip, {})).toBe(false);
	});
});

describe('binding enumeration', () => {
	it('varies the last parameter fastest and stops at the limit', () => {
		const lists = [ [ 'a', [ 1, 2 ] ], [ 'b', [ 'x', 'y' ] ] ] as const;

		expect([ ...enumerateBindings(lists) ]).toEqual([
			{ a: 1, b: 'x' },
			{ a: 1, b: 'y' },
			{ a: 2, b: 'x' },
			{ a: 2, b: 'y' },
		]);
		expect([ ...enumerateBindings(lists, 3) ]).toHaveLength(3);
	});

	it('makes one binding without parameters and none while a parameter has no values', () => {
		expect([ ...enumerateBindings([]) ]).toEqual([ {} ]);
		expect([ ...enumerateBindings([ [ 'a', [] ] ]) ]).toEqual([]);
	});
});

describe('variant summaries', () => {
	it('counts tiers, skips and what each rule decides', () => {
		const summary = summarizeVariants([ [ 'n', [ 1, 2, 3, 4, 5 ] ] ], {
			tier:      AchievementTier.bronze,
			tierRules: [
				tierRule(AchievementTier.gold, when('n', 'greaterThanOrEqual', 4)),
				tierRule(AchievementTier.silver, when('n', 'equal', 9)),
			],
			skipRules: [ { when: [ when('n', 'equal', 5) ] } ],
		});

		expect(summary.count).toBe(4);
		expect(summary.skipped).toBe(1);
		expect(summary.tierCounts.get(AchievementTier.bronze)).toBe(3);
		expect(summary.tierCounts.get(AchievementTier.gold)).toBe(1);
		expect(summary.tierRuleCounts).toEqual([ 1, 0 ]);
		expect(summary.skipRuleCounts).toEqual([ 1 ]);
		expect(summary.defaultCount).toBe(3);
	});
});

describe('stored variant rules', () => {
	const rules = {
		tierRules: [ tierRule(AchievementTier.diamond, when('n', 'greaterThanOrEqual', 150)) ],
		skipRules: [ { when: [ when('mode', 'equal', 'easy') ] } ],
	};

	it('stores tiers by name and leaves the property out without rules', () => {
		expect(compileVariantRules(rules)).toEqual({
			skip:  [ { when: [ { parameter: 'mode', operator: 'equal', value: 'easy' } ] } ],
			tiers: [ { tier: 'diamond', when: [ { parameter: 'n', operator: 'greaterThanOrEqual', value: 150 } ] } ],
		});
		expect(compileVariantRules({ tierRules: [], skipRules: [] })).toBeUndefined();
	});

	it('reads back what it stores', () => {
		expect(restoreVariantRules(compileVariantRules(rules))).toEqual(rules);
	});

	it('leaves out what it cannot read', () => {
		expect(restoreVariantRules({
			tiers: [ { tier: 'golden', when: [] }, { tier: 'gold', when: [ { parameter: 'n', operator: 'about', value: 1 } ] } ],
			skip:  'nope',
		})).toEqual({ tierRules: [ { tier: AchievementTier.gold, when: [] } ], skipRules: [] });
		expect(restoreVariantRules(undefined)).toEqual({ tierRules: [], skipRules: [] });
	});
});
