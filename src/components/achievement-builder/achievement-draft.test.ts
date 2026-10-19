import { describe, expect, it } from 'vitest';

import {
	AchievementParameterDraft,
	AchievementRuleDraft,
	AchievementTemplateDraft,
	createEmptyAchievementTemplate,
} from '../../models/achievementBuilder.js';
import type {
	AchievementCategoryResponse,
	AchievementParameterDefinition,
} from '../../models/achievementBuilderApi.js';
import {
	appendChildRule,
	countDefinitionInstances,
	countGeneratedInstances,
	createRule,
	findRule,
	getAddableRuleTypes,
	getAvailableValueSources,
	getDefaultCategoryId,
	getParameterValues,
	getPreviews,
	getThrowTypePatch,
	replaceRule,
	updateRule,
	validateDraft,
} from './achievement-draft.js';

const category = (
	id: string,
	name: string,
	overrides: Partial<AchievementCategoryResponse> = {},
): AchievementCategoryResponse => ({
	id,
	seasonId:   'season',
	name,
	sortOrder:  0,
	isArchived: false,
	usageCount: 0,
	...overrides,
});

const parameter = (
	key: string,
	overrides: Partial<AchievementParameterDraft> = {},
): AchievementParameterDraft => ({
	id:            key,
	key,
	valueType:     'integer',
	generatorType: 'range',
	minimum:       1,
	maximum:       3,
	step:          1,
	values:        [],
	...overrides,
});

const categories = [ category('custom', 'Custom') ];

const validDraft = (overrides: Partial<AchievementTemplateDraft> = {}): AchievementTemplateDraft => ({
	...createEmptyAchievementTemplate('season'),
	nameTemplate:        'Hit {n}',
	descriptionTemplate: 'Hit {n} in a round.',
	categoryId:          'custom',
	parameters:          [ parameter('n') ],
	rule:                {
		id:       'root',
		type:     'all',
		children: [
			{
				id:         'round',
				type:       'round',
				quantifier: 'any',
				statuses:   [ 'valid' ],
				condition:  {
					id:          'throw',
					type:        'throw',
					quantifier:  'any',
					scope:       'currentRound',
					hitLocation: { source: 'parameter', value: 'n' },
					throwType:   'any',
				},
			},
		],
	},
	...overrides,
});

const validate = (draft: AchievementTemplateDraft, maximumGeneratedInstances = 1000) =>
	validateDraft(draft, { categories, maximumGeneratedInstances });

describe('rule tree helpers', () => {
	const tree = (): AchievementRuleDraft => ({
		id:       'root',
		type:     'all',
		children: [
			{ id: 'not', type: 'not', child: { id: 'inner', type: 'all', children: [] } },
			{
				id:       'compare',
				type:     'compare',
				left:     { source: 'game.roundsPlayed', value: '' },
				operator: 'equal',
				right:    { source: 'constant', value: '1' },
			},
		],
	});

	it('finds nested rules', () => {
		expect(findRule(tree(), 'inner')?.type).toBe('all');
		expect(findRule(tree(), 'missing')).toBeUndefined();
	});

	it('removes group children and resets removed single children', () => {
		const withoutCompare = replaceRule(tree(), 'compare');
		expect(withoutCompare.type === 'all' && withoutCompare.children.map(child => child.id))
			.toEqual([ 'not' ]);

		const withoutInner = replaceRule(tree(), 'inner');
		const not = findRule(withoutInner, 'not');
		expect(not?.type === 'not' && not.child.type).toBe('all');
		expect(not?.type === 'not' && not.child.id).not.toBe('inner');
	});

	it('patches a rule without touching its siblings', () => {
		const updated = updateRule(tree(), 'compare', { operator: 'greaterThan' });
		const compare = findRule(updated, 'compare');
		expect(compare?.type === 'compare' && compare.operator).toBe('greaterThan');
		expect(findRule(updated, 'not')).toEqual(findRule(tree(), 'not'));
	});

	it('appends children to groups, rounds and empty NOT groups', () => {
		const child = createRule('compare');
		const appended = appendChildRule(tree(), 'not', child);
		const not = findRule(appended, 'not');
		expect(not?.type === 'not' && not.child.type === 'all' && not.child.children[0]?.id)
			.toBe(child.id);

		const round = createRule('round');
		const throwRule = createRule('throw', 'round');
		const withRound = appendChildRule(appendChildRule(tree(), 'root', round), round.id, throwRule);
		expect(findRule(withRound, throwRule.id)).toBeDefined();
	});
});

describe('throw type changes', () => {
	it('drops the hit location for rim and miss', () => {
		expect(getThrowTypePatch('rim', { source: 'constant', value: '5' }))
			.toEqual({ throwType: 'rim', hitLocation: undefined });
	});

	it('restores a hit location when clearing a rim or miss filter', () => {
		expect(getThrowTypePatch('any', undefined).hitLocation).toBeDefined();
	});

	it('keeps an existing hit location', () => {
		const hitLocation = { source: 'constant' as const, value: '5' };
		expect(getThrowTypePatch('double', hitLocation).hitLocation).toBe(hitLocation);
	});
});

describe('block availability', () => {
	it('limits round-only and game-only blocks to their scope', () => {
		const parent = createRule('all');
		const withChild = { ...parent, children: [ createRule('compare') ] };
		const rootTypes = getAddableRuleTypes('root', withChild).map(type => type.value);
		const roundTypes = getAddableRuleTypes('round', withChild).map(type => type.value);

		expect(rootTypes).toContain('winningThrow');
		expect(rootTypes).not.toContain('throw');
		expect(roundTypes).toContain('sequence');
		expect(roundTypes).not.toContain('round');
	});

	it('hides groups until a block has a child', () => {
		const types = getAddableRuleTypes('root', createRule('all')).map(type => type.value);
		expect(types).not.toContain('all');
		expect(types).not.toContain('any');
	});

	it('only allows the lowest raw score on the left of a comparison', () => {
		expect(getAvailableValueSources('round', 'comparison-left')).toContain('round.minimumRawPoints');
		expect(getAvailableValueSources('round', 'comparison-right')).not.toContain('round.minimumRawPoints');
		expect(getAvailableValueSources('root', 'hit-location')).not.toContain('game.roundsPlayed');
	});
});

describe('parameter expansion', () => {
	it('counts ranges and deduplicated sets', () => {
		expect(countGeneratedInstances([])).toBe(1);
		expect(countGeneratedInstances([
			parameter('n', { minimum: 1, maximum: 10, step: 3 }),
			parameter('m', { generatorType: 'set', values: [ '1', '1', '2' ] }),
		])).toBe(8);
	});

	it('counts API definitions the same way', () => {
		const definition = (overrides: Partial<AchievementParameterDefinition>): AchievementParameterDefinition => ({
			name:          'n',
			kind:          'IntegerSet',
			step:          1,
			integerValues: [],
			stringValues:  [],
			booleanValues: [],
			...overrides,
		});
		expect(countDefinitionInstances([
			definition({ kind: 'IntegerRange', minimum: 1, maximum: 10, step: 3 }),
			definition({ integerValues: [ 1, 1, 2 ] }),
		])).toBe(8);
	});

	it('expands typed set values', () => {
		expect(getParameterValues(parameter('b', {
			valueType:     'boolean',
			generatorType: 'set',
			values:        [ 'true', 'false', 'true' ],
		}))).toEqual([ true, false ]);
	});

	it('previews every generated achievement in order', () => {
		const previews = getPreviews(validDraft({
			parameters: [ parameter('n', { minimum: 1, maximum: 10, step: 4 }) ],
		}));
		expect(previews.map(preview => preview.name)).toEqual([ 'Hit 1', 'Hit 5', 'Hit 9' ]);
	});

	it('varies the last parameter fastest and stops at the limit', () => {
		const previews = getPreviews(validDraft({
			parameters: [
				parameter('a', { maximum: 2 }),
				parameter('b', { maximum: 3 }),
			],
		}), 4);
		expect(previews.map(preview => preview.bindings)).toEqual([
			{ a: 1, b: 1 },
			{ a: 1, b: 2 },
			{ a: 1, b: 3 },
			{ a: 2, b: 1 },
		]);
	});

	it('shows no preview while a parameter has no values', () => {
		expect(getPreviews(validDraft({
			parameters: [ parameter('n', { generatorType: 'set', values: [] }) ],
		}))).toEqual([]);
	});
});

describe('validateDraft', () => {
	it('accepts a complete draft', () => {
		expect(validate(validDraft())).toEqual([]);
	});

	it('routes each error to the tab that can fix it', () => {
		const errors = validate(validDraft({
			nameTemplate: '',
			parameters:   [ parameter('1bad') ],
			rule:         { id: 'root', type: 'all', children: [] },
		}));
		expect(errors.map(error => error.tab)).toEqual(expect.arrayContaining([
			'details',
			'parameters',
			'logic',
		]));
		expect(errors.find(error => error.message.startsWith('Logic'))?.tab).toBe('logic');
	});

	it('requires whole-number constants', () => {
		const errors = validate(validDraft({
			rule: {
				id:       'root',
				type:     'all',
				children: [
					{
						id:       'compare',
						type:     'compare',
						left:     { source: 'game.roundsPlayed', value: '' },
						operator: 'equal',
						right:    { source: 'constant', value: '' },
					},
				],
			},
		}));
		expect(errors).toEqual([
			{
				tab:     'logic',
				message: 'Logic 1 right value needs a whole-number constant.',
			},
		]);
	});

	it('rejects throw blocks without a location or type', () => {
		const draft = validDraft();
		const rule = updateRule(draft.rule, 'throw', { hitLocation: undefined });
		expect(validate({ ...draft, rule }).map(error => error.message))
			.toEqual([ 'Logic 1 round condition needs a hit location or a throw type.' ]);
	});

	it('requires multi-value parameters in the name so generated names are distinct', () => {
		expect(validate(validDraft({ nameTemplate: 'Hit it' }))).toEqual([
			{
				tab:     'details',
				message: 'Name must include {n} so every generated achievement has a distinct name.',
			},
		]);
	});

	it('enforces the generated instance limit', () => {
		expect(validate(validDraft(), 2).map(error => error.tab)).toEqual([ 'parameters' ]);
	});

	it('requires at least one progression target', () => {
		expect(validate(validDraft({
			achievementScope: 'progression',
			progression:      { statuses: [ 'valid' ], targets: [] },
		})).map(error => error.tab)).toEqual([ 'logic' ]);
	});
});

describe('getDefaultCategoryId', () => {
	it('prefers the active Custom category', () => {
		expect(getDefaultCategoryId([
			category('first', 'First'),
			category('custom', 'custom', { sortOrder: 2 }),
		])).toBe('custom');
		expect(getDefaultCategoryId([
			category('archived', 'Custom', { isArchived: true }),
			category('first', 'First'),
		])).toBe('first');
	});
});
