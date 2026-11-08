import { describe, expect, it } from 'vitest';

import type { AchievementParameterDraft, AchievementTemplateDraft } from '../../models/achievementBuilder.js';
import type { AchievementCategoryResponse } from '../../models/achievementBuilderApi.js';
import { duplicateDraft } from './duplicate-draft.js';
import { isSameStructure } from './rule-text/rule-structure.js';

const category = (id: string, name: string, isArchived = false): AchievementCategoryResponse => ({
	id,
	seasonId:   'season',
	name,
	sortOrder:  name === 'Custom' ? 0 : 1,
	isArchived,
	usageCount: 0,
});

const numberParameter: AchievementParameterDraft = {
	id:            'p1',
	key:           'n',
	valueType:     'integer',
	generatorType: 'range',
	minimum:       1,
	maximum:       20,
	step:          1,
	values:        [],
};

const draft = (): AchievementTemplateDraft => ({
	id:                  'template-1',
	seasonId:            'season',
	nameTemplate:        'Shanghai {n}',
	descriptionTemplate: 'Hit {n}, D{n} and T{n}.',
	categoryId:          'shanghai',
	tier:                3,
	tierRules:           [ { tier: 5, when: [ { parameter: 'n', operator: 'equal', value: 20 } ] } ],
	skipRules:           [ { when: [ { parameter: 'n', operator: 'equal', value: 13 } ] } ],
	achievementScope:    'session',
	parameters:          [ numberParameter ],
	rule:                {
		id:       'root',
		type:     'all',
		children: [
			{
				id:         'round',
				type:       'round',
				quantifier: 'any',
				statuses:   [ 'valid' ],
				condition:  { id: 'inner', type: 'all', children: [] },
			},
		],
	},
	progression: undefined,
});

describe('duplicateDraft', () => {
	it('copies everything as a new, unsaved achievement', () => {
		const copy = duplicateDraft(draft(), [ category('shanghai', 'Shanghai') ]);

		expect(copy.id).toBeUndefined();
		expect(copy.nameTemplate).toBe('Shanghai {n} (copy)');
		expect(copy.categoryId).toBe('shanghai');
		expect(copy.tier).toBe(3);
		expect(copy.tierRules).toEqual(draft().tierRules);
		expect(copy.skipRules).toEqual(draft().skipRules);
		expect(isSameStructure(copy.rule, draft().rule)).toBe(true);
		expect(isSameStructure(copy.parameters, draft().parameters)).toBe(true);
	});

	it('gives every rule and parameter a new id', () => {
		const copy = duplicateDraft(draft(), [ category('shanghai', 'Shanghai') ]);

		expect(copy.rule.id).not.toBe('root');
		expect(copy.rule.type === 'all' && copy.rule.children[0]!.id).not.toBe('round');
		expect(copy.parameters[0]!.id).not.toBe('p1');
	});

	it('moves out of an archived category', () => {
		const copy = duplicateDraft(draft(), [ category('shanghai', 'Shanghai', true), category('custom', 'Custom') ]);

		expect(copy.categoryId).toBe('custom');
	});
});
