import { describe, expect, it } from 'vitest';

import { summarizeVariants } from '../../../helpers/achievementVariantRules.js';
import { restoreAchievementTemplateDraft } from '../../../helpers/compileAchievementTemplate.js';
import { AchievementTier } from '../../../models/enums.js';
import { parameter, template, templateVersion } from '../../../test/achievementFixtures.js';
import { getVariantSummary, getVersionVariantSummary } from '../achievement-draft.js';
import { printVariantLines } from '../rule-text/rule-text-printer.js';
import {
	changeConditionParameter,
	createSkipRule,
	createTierRule,
	formatTierCounts,
	getConditionOperators,
	getTierRange,
	moveItem,
	parseConditionValue,
} from './variant-rule-edits.js';

const threshold = parameter('threshold', { generatorType: 'set', values: [ '50', '100', '150' ] });
const mode = parameter('mode', { valueType: 'string', generatorType: 'set', values: [ 'easy', 'hard' ] });

describe('new variant rules', () => {
	it('starts a tier rule one tier up, at the top value of a number', () => {
		expect(createTierRule([ threshold ], AchievementTier.bronze)).toEqual({
			tier: AchievementTier.silver,
			when: [ { parameter: 'threshold', operator: 'greaterThanOrEqual', value: 150 } ],
		});
		expect(createTierRule([ threshold ], AchievementTier.diamond).tier).toBe(AchievementTier.diamond);
	});

	it('starts a skip rule at the first value', () => {
		expect(createSkipRule([ mode ])).toEqual({ when: [ { parameter: 'mode', operator: 'equal', value: 'easy' } ] });
	});
});

describe('condition edits', () => {
	it('keeps the comparison and value when the new parameter has the same type', () => {
		const other = parameter('n');

		expect(changeConditionParameter({ parameter: 'threshold', operator: 'lessThan', value: 70 }, other))
			.toEqual({ parameter: 'n', operator: 'lessThan', value: 70 });
	});

	it('falls back to = and a valid value for a parameter of another type', () => {
		expect(changeConditionParameter({ parameter: 'threshold', operator: 'lessThan', value: 70 }, mode))
			.toEqual({ parameter: 'mode', operator: 'equal', value: 'easy' });
	});

	it('only offers = and != for text', () => {
		expect(getConditionOperators(mode)).toEqual([ 'equal', 'notEqual' ]);
		expect(getConditionOperators(threshold)).toHaveLength(6);
	});

	it('reads picker values by the parameter type', () => {
		expect(parseConditionValue(threshold, '120')).toBe(120);
		expect(parseConditionValue(mode, 'hard')).toBe('hard');
		expect(parseConditionValue(parameter('flag', { valueType: 'boolean' }), 'false')).toBe(false);
	});

	it('moves a rule one place and ignores moves past the ends', () => {
		expect(moveItem([ 'a', 'b', 'c' ], 2, -1)).toEqual([ 'a', 'c', 'b' ]);
		expect(moveItem([ 'a', 'b' ], 0, -1)).toEqual([ 'a', 'b' ]);
	});
});

describe('tier summaries', () => {
	const summary = summarizeVariants([ [ 'threshold', [ 50, 100, 150 ] ] ], {
		tier:      AchievementTier.bronze,
		tierRules: [
			{
				tier: AchievementTier.diamond,
				when: [ { parameter: 'threshold', operator: 'greaterThanOrEqual', value: 150 } ],
			},
		],
		skipRules: [],
	});

	it('lists the used tiers highest first', () => {
		expect(formatTierCounts(summary)).toBe('1 Diamond · 2 Bronze');
	});

	it('finds the lowest and highest tier', () => {
		expect(getTierRange(summary)).toEqual({ lowest: AchievementTier.bronze, highest: AchievementTier.diamond });
	});
});

describe('the merged built-in RangeKing family', () => {
	// As the seed migration stores it (Postgres jsonb reorders the keys).
	const version = templateVersion(1, {
		achievementTier: AchievementTier.bronze,
		nameTemplate:    'RangeKing {threshold}',
		parameters:      [
			{
				kind:          'IntegerSet',
				name:          'threshold',
				step:          1,
				maximum:       null,
				minimum:       null,
				stringValues:  [],
				booleanValues: [],
				integerValues: [ 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180 ],
			},
		],
		definition: {
			version:  1,
			root:     { kind: 'constant', valueType: 'boolean', value: true },
			variants: {
				tiers: [
					{ tier: 'diamond', when: [ { value: 150, operator: 'greaterThanOrEqual', parameter: 'threshold' } ] },
					{ tier: 'platinum', when: [ { value: 130, operator: 'greaterThanOrEqual', parameter: 'threshold' } ] },
					{ tier: 'gold', when: [ { value: 100, operator: 'greaterThanOrEqual', parameter: 'threshold' } ] },
					{ tier: 'silver', when: [ { value: 80, operator: 'greaterThanOrEqual', parameter: 'threshold' } ] },
				],
			},
		},
	});
	const expectedTiers = new Map([ [ 1, 3 ], [ 2, 2 ], [ 3, 3 ], [ 4, 2 ], [ 5, 4 ] ]);

	it('opens with its tier rules, written as tier lines', () => {
		const draft = restoreAchievementTemplateDraft(template(version))!;

		expect(printVariantLines(draft)).toBe([
			'tier diamond if {threshold} >= 150',
			'tier platinum if {threshold} >= 130',
			'tier gold if {threshold} >= 100',
			'tier silver if {threshold} >= 80',
			'tier bronze otherwise',
		].join('\n'));
		expect(getVariantSummary(draft)?.tierCounts).toEqual(expectedTiers);
	});

	it('shows the tiers the server generated in the library', () => {
		expect(getVersionVariantSummary(version)?.tierCounts).toEqual(expectedTiers);
	});
});
