import { describe, expect, it } from 'vitest';

import {
	AchievementComparisonOperator,
	AchievementParameterDraft,
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementValueDraft,
	createEmptyAchievementTemplate,
} from '../../models/achievementBuilder.js';
import type { AchievementParameterDefinition } from '../../models/achievementBuilderApi.js';
import {
	category,
	collectRules,
	parameter,
	template,
	templateVersion,
} from '../../test/achievementFixtures.js';
import {
	appendChildRule,
	canUseParameterAs,
	countAchievements,
	countDefinitionInstances,
	countGeneratedInstances,
	createRule,
	defaultAchievementDraftLimits,
	findRule,
	getAddableRuleTypes,
	getAvailableValueSources,
	getConflictingDraftVersion,
	getDefaultCategoryId,
	getParameterValues,
	getPreviews,
	getThrowTypePatch,
	getVariantSummary,
	renameParameterReferences,
	replaceRule,
	updateRule,
	validateDraft,
} from './achievement-draft.js';

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

const validate = (
	draft: AchievementTemplateDraft,
	maximumGeneratedInstances = 1000,
	limits: Partial<typeof defaultAchievementDraftLimits> = {},
) =>
	validateDraft(draft, {
		categories,
		limits: { ...defaultAchievementDraftLimits, maximumGeneratedInstances, ...limits },
	});

const compareDraft = (
	left: AchievementValueDraft,
	right: AchievementValueDraft,
	operator: AchievementComparisonOperator = 'equal',
	parameters: AchievementParameterDraft[] = [ parameter('n') ],
): AchievementTemplateDraft => validDraft({
	parameters,
	rule: {
		id:       'root',
		type:     'all',
		children: [ { id: 'compare', type: 'compare', left, operator, right } ],
	},
});

const messages = (draft: AchievementTemplateDraft, limits: Partial<typeof defaultAchievementDraftLimits> = {}) =>
	validate(draft, 1000, limits).map(error => error.message);

describe('tier and skip rules', () => {
	const threshold = (value: number, operator: AchievementComparisonOperator = 'greaterThanOrEqual') =>
		[ { parameter: 'n', operator, value } ];

	it('skips variants in the previews and gives each its tier', () => {
		const draft = validDraft({
			parameters: [ parameter('n', { maximum: 5 }) ],
			tier:       1,
			tierRules:  [ { tier: 3, when: threshold(4) } ],
			skipRules:  [ { when: threshold(2, 'equal') } ],
		});

		expect(getPreviews(draft).map(preview => [ preview.name, preview.tier ])).toEqual([
			[ 'Hit 1', 1 ],
			[ 'Hit 3', 1 ],
			[ 'Hit 4', 3 ],
			[ 'Hit 5', 3 ],
		]);
		expect(countAchievements(draft)).toBe(4);
		expect(getVariantSummary(draft)?.tierCounts.get(3)).toBe(2);
	});

	it('reports rules that do not fit the parameters', () => {
		const mode = parameter('mode', { valueType: 'string', generatorType: 'set', values: [ 'easy' ] });
		const draft = validDraft({
			parameters:   [ parameter('n'), mode ],
			nameTemplate: 'Hit {n} {mode}',
			tierRules:    [
				{ tier: 3, when: [ { parameter: 'missing', operator: 'equal', value: 1 } ] },
				{ tier: 9, when: [] },
			],
			skipRules: [
				{ when: [ { parameter: 'mode', operator: 'greaterThan', value: 'easy' } ] },
				{ when: [ { parameter: 'n', operator: 'equal', value: 'one' } ] },
			],
		});

		expect(messages(draft)).toEqual(expect.arrayContaining([
			'Tier rule 1 uses {missing}, which isn\u2019t a parameter.',
			'Tier rule 2 needs a valid tier.',
			'Tier rule 2 needs at least one condition.',
			'Skip rule 1 can only check {mode} with = or !=.',
			'Skip rule 2 compares {n} with something that isn\u2019t a number.',
		]));
	});

	it('reports a template whose every variant is skipped', () => {
		const draft = validDraft({ skipRules: [ { when: threshold(0, 'greaterThan') } ] });

		expect(messages(draft)).toContain('Every combination is skipped, so this template makes no achievements.');
	});

	it('follows a renamed parameter', () => {
		const draft = validDraft({
			parameters: [ parameter('m') ],
			tierRules:  [ { tier: 3, when: threshold(2) } ],
			skipRules:  [ { when: threshold(1, 'equal') } ],
		});
		const renamed = renameParameterReferences(draft, 'n', 'm');

		expect(renamed.tierRules[0]!.when[0]!.parameter).toBe('m');
		expect(renamed.skipRules[0]!.when[0]!.parameter).toBe('m');
	});
});

describe('ladder steps', () => {
	it('reports a rule step that leaves the ladder for some parameter value', () => {
		const draft = validDraft({ parameters: [ parameter('n', { minimum: 1, maximum: 2 }) ] });
		const round = draft.rule.type === 'all' ? draft.rule.children[0] : undefined;
		if (round?.type === 'round' && round.condition.type === 'throw')
			round.condition.hitLocation = { source: 'parameter.ladder', value: 'n', offset: -2 };

		const message = '{ladder n-2} leaves the ladder (1–20, 25, 50) when {n} is 1.';

		expect(messages(draft)).toEqual(expect.arrayContaining([ expect.stringContaining(message) ]));
	});

	it('reports a description step that leaves the ladder', () => {
		const draft = validDraft({
			parameters:          [ parameter('n', { generatorType: 'set', values: [ '20', '50' ] }) ],
			descriptionTemplate: 'Hit {n}, then {ladder n+1}.',
		});

		expect(messages(draft))
			.toContain('The description’s {ladder n+1} leaves the ladder (1–20, 25, 50) when {n} is 50.');
	});

	it('previews ladder steps in names and descriptions', () => {
		const draft = validDraft({
			parameters:          [ parameter('n', { generatorType: 'set', values: [ '19' ] }) ],
			descriptionTemplate: 'Hit {n}, {ladder n+1} and {ladder n+2}.',
		});

		expect(getPreviews(draft)[0]?.description).toBe('Hit 19, 20 and 25.');
	});
});

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
		const roundCondition = findRule(withRound, round.id);
		expect(roundCondition?.type === 'round' && roundCondition.condition).toMatchObject({
			type:     'all',
			children: [ throwRule ],
		});
	});
});

describe('throw type changes', () => {
	it('drops the hit location for rim and miss', () => {
		expect(getThrowTypePatch('rim', { source: 'constant', value: '5' }))
			.toEqual({ throwType: 'rim', hitLocation: undefined });
	});

	it('restores a hit location when clearing a rim or miss filter', () => {
		expect(getThrowTypePatch('any', undefined))
			.toEqual({ throwType: 'any', hitLocation: { source: 'constant', value: '20' } });
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

	it.each<[ AchievementRuleDraft['type'], 'root' | 'round', boolean ]>([
		[ 'round', 'root', true ],
		[ 'round', 'round', false ],
		[ 'winningThrow', 'round', false ],
		[ 'throw', 'root', false ],
		[ 'throwCount', 'round', true ],
		[ 'compare', 'root', true ],
		[ 'compare', 'round', true ],
	])('offers %s in %s scope: %s', (type, scope, offered) => {
		const parent = { ...createRule('all'), children: [ createRule('compare') ] };

		expect(getAddableRuleTypes(scope, parent).some(item => item.value === type)).toBe(offered);
	});

	it('only allows the lowest raw score on the left of a comparison', () => {
		expect(getAvailableValueSources('round', 'comparison-left')).toContain('round.minimumRawPoints');
		expect(getAvailableValueSources('round', 'comparison-right')).not.toContain('round.minimumRawPoints');
		expect(getAvailableValueSources('root', 'hit-location')).not.toContain('game.roundsPlayed');
	});

	it.each<[ AchievementParameterDraft['valueType'], AchievementValueDraft['source'], boolean, boolean ]>([
		[ 'integer', 'parameter.offset', true, true ],
		[ 'string', 'parameter', true, false ],
		[ 'string', 'parameter', false, true ],
		[ 'boolean', 'board.leftNeighbor', false, false ],
		[ 'boolean', 'parameter.offset', false, false ],
	])('lets a %s parameter fill a %s slot (numeric only: %s): %s', (valueType, source, numericOnly, fits) => {
		expect(canUseParameterAs(parameter('p', { valueType }), source, numericOnly)).toBe(fits);
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

	it('rejects unknown parameter tokens and stray braces in the text', () => {
		expect(validate(validDraft({
			nameTemplate:        'Hit {n} {missing}',
			descriptionTemplate: 'Hit {n} in a round }',
		}))).toEqual([
			{ tab: 'details', message: 'The name uses unknown parameters: {missing}.' },
			{ tab: 'details', message: 'The description has a { or } that is not part of a {parameter}.' },
		]);
	});

	it('limits the length of every generated name and description', () => {
		const errors = messages(validDraft({ descriptionTemplate: `Hit {n} ${ 'x'.repeat(495) }` }));
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/^Generated names and descriptions must be at most 500 characters/);
		expect(messages(validDraft({ descriptionTemplate: `Hit {n} ${ 'x'.repeat(490) }` }))).toEqual([]);
	});

	it('requires a number parameter where the logic needs a number', () => {
		const text = parameter('n', { valueType: 'string', generatorType: 'set', values: [ 'a' ] });
		const draft = validDraft({ parameters: [ text ] });
		expect(messages(draft)).toEqual([ 'Logic 1 round condition hit location needs a number, but {n} is text.' ]);
	});

	it('requires both sides of a comparison to have the same type', () => {
		const text = parameter('label', { valueType: 'string', generatorType: 'set', values: [ 'a' ] });
		const flag = parameter('flag', { valueType: 'boolean', generatorType: 'set', values: [ 'true' ] });
		const parameters = [ parameter('n'), text, flag ];

		expect(messages(compareDraft(
			{ source: 'game.roundsPlayed', value: '' },
			{ source: 'parameter', value: 'label' },
			'equal',
			parameters,
		))).toEqual([ 'Logic 1 compares a number with text; both sides must have the same type.' ]);
		expect(messages(compareDraft(
			{ source: 'parameter', value: 'label' },
			{ source: 'parameter', value: 'label' },
			'greaterThan',
			parameters,
		))).toEqual([]);
		expect(messages(compareDraft(
			{ source: 'parameter', value: 'flag' },
			{ source: 'parameter', value: 'flag' },
			'greaterThan',
			parameters,
		))).toEqual([ 'Logic 1 can only check yes/no values with "equal" or "not equal".' ]);
	});

	it('keeps constants and parameter values inside the 32-bit integer range', () => {
		expect(messages(compareDraft(
			{ source: 'game.roundsPlayed', value: '' },
			{ source: 'constant', value: '2147483648' },
		))).toEqual([ 'Logic 1 right value must be between -2147483648 and 2147483647.' ]);
		expect(messages(compareDraft(
			{ source: 'game.roundsPlayed', value: '' },
			{ source: 'constant', value: '-2147483648' },
		))).toEqual([]);
		expect(messages(validDraft({
			parameters: [ parameter('n', { generatorType: 'set', values: [ '1', '99999999999' ] }) ],
		}))).toEqual([ 'Parameter n values must be between -2147483648 and 2147483647.' ]);
		expect(messages(validDraft({
			parameters: [ parameter('n', { maximum: 2 ** 31 }) ],
		}))).toContain('Parameter n range values must be between -2147483648 and 2147483647.');
	});

	it('enforces the AST node, depth and quantifier limits on the compiled logic', () => {
		const tooManyNodes = /^The logic has \d+ nodes; the limit is 4\.$/;
		const tooDeep = /^The logic is nested \d+ levels deep; the limit is 3\.$/;
		const tooManyQuantifiers = 'The logic nests 2 round, throw or count blocks; the limit is 1.';

		expect(messages(validDraft(), { maximumAstNodes: 4 })).toEqual([ expect.stringMatching(tooManyNodes) ]);
		expect(messages(validDraft(), { maximumAstDepth: 3 })).toEqual([ expect.stringMatching(tooDeep) ]);
		expect(messages(validDraft(), { maximumQuantifierDepth: 1 })).toEqual([ tooManyQuantifiers ]);
		expect(messages(validDraft(), { maximumQuantifierDepth: 2 })).toEqual([]);
	});

	it('limits the saved definition to the backend text length', () => {
		expect(messages(validDraft(), { maximumDefinitionTextLength: 100 }))
			.toEqual([ expect.stringMatching(/^The logic is \d+ characters long when saved; the limit is 100\.$/) ]);
		expect(messages(validDraft(), { maximumDefinitionTextLength: 10_000 })).toEqual([]);
	});

	it('rejects blocks outside the scope they belong to', () => {
		const throwRule = createRule('throw', 'round');

		expect(messages(validDraft({ rule: { id: 'root', type: 'all', children: [ throwRule ] } })))
			.toEqual([ 'Logic 1: Throw blocks must be nested inside a round block.' ]);
	});

	it('counts progression reducers toward the node limit', () => {
		const progression = {
			statuses: [ 'valid' as const ],
			targets:  [ { id: 'target', hitLocation: { source: 'constant' as const, value: '20' }, throwType: 'single' as const } ],
		};
		// and + hasHitSegment + 2 values = 4 root nodes, plus 1 reducer.
		expect(messages(validDraft({ achievementScope: 'progression', progression }), { maximumAstNodes: 5 }))
			.toEqual([]);
		expect(messages(validDraft({ achievementScope: 'progression', progression }), { maximumAstNodes: 4 }))
			.toEqual([ 'The logic has 5 nodes; the limit is 4.' ]);
	});

	it('accepts stored progression logic that is kept verbatim', () => {
		expect(validate(validDraft({
			achievementScope: 'progression',
			progression:      {
				statuses: [ 'valid' ],
				targets:  [],
				raw:      { root: { kind: 'constant', valueType: 'boolean', value: true }, reducers: [] },
			},
		}))).toEqual([]);
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

describe('getConflictingDraftVersion', () => {
	const published = templateVersion(1);
	const draft = templateVersion(2, { status: 'Draft' });

	it('returns the newer draft when editing starts from a published version', () => {
		expect(getConflictingDraftVersion(template(published, draft), published.id)).toBe(draft);
	});

	it('has no conflict when the template has no draft', () => {
		expect(getConflictingDraftVersion(template(published, templateVersion(2)), published.id))
			.toBeUndefined();
	});

	it('has no conflict when the shown version is the draft itself', () => {
		expect(getConflictingDraftVersion(template(published, draft), draft.id)).toBeUndefined();
	});
});

describe('renameParameterReferences', () => {
	const renamedDraft = (): AchievementTemplateDraft => validDraft({
		nameTemplate:        'Hit {n} {nn}',
		descriptionTemplate: 'Hit {n}, not {nn}.',
		parameters:          [ parameter('number'), parameter('nn') ],
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
						hitLocation: { source: 'board.leftNeighbor', value: 'n' },
						throwType:   'any',
					},
				},
				{
					id:       'compare',
					type:     'compare',
					left:     { source: 'game.roundsPlayed', value: '' },
					operator: 'lessThan',
					right:    { source: 'parameter.offset', value: 'n', offset: 2 },
				},
				{
					id:   'raw',
					type: 'raw',
					ast:  { kind: 'equal', left: { kind: 'parameter', name: 'n' }, right: { kind: 'parameter', name: 'nn' } },
				},
			],
		},
	});

	it('renames the parameter in the logic, raw logic, name and description', () => {
		const renamed = renameParameterReferences(renamedDraft(), 'n', 'number');

		expect(renamed.nameTemplate).toBe('Hit {number} {nn}');
		expect(renamed.descriptionTemplate).toBe('Hit {number}, not {nn}.');
		expect(collectRules(renamed.rule).flatMap((rule): unknown[] => {
			switch (rule.type) {
			case 'throw':
				return [ rule.hitLocation ];
			case 'compare':
				return [ rule.left, rule.right ];
			case 'raw':
				return [ rule.ast ];
			default:
				return [];
			}
		})).toEqual([
			{ source: 'board.leftNeighbor', value: 'number' },
			{ source: 'game.roundsPlayed', value: '' },
			{ source: 'parameter.offset', value: 'number', offset: 2 },
			{ kind: 'equal', left: { kind: 'parameter', name: 'number' }, right: { kind: 'parameter', name: 'nn' } },
		]);
		expect(validate(renamed)).toEqual([]);
	});

	it('renames progression targets', () => {
		const draft = validDraft({
			achievementScope: 'progression',
			parameters:       [ parameter('m') ],
			progression:      {
				statuses: [ 'valid' ],
				targets:  [ { id: 'target', hitLocation: { source: 'parameter', value: 'n' }, throwType: 'single' } ],
			},
		});

		expect(renameParameterReferences(draft, 'n', 'm').progression?.targets[0]?.hitLocation)
			.toEqual({ source: 'parameter', value: 'm' });
	});

	it.each([
		[ 'the keys are the same', 'nn', 'nn' ],
		[ 'the new key is not valid', 'n', '1n' ],
		[ 'another parameter still has the old key', 'nn', 'number' ],
	])('leaves the draft alone when %s', (_reason, oldKey, newKey) => {
		const draft = renamedDraft();

		expect(renameParameterReferences(draft, oldKey, newKey)).toBe(draft);
	});

	it('leaves the draft alone when two parameters now share the new key', () => {
		const draft = validDraft({ parameters: [ parameter('m'), parameter('m', { id: 'other' }) ] });

		expect(renameParameterReferences(draft, 'n', 'm')).toBe(draft);
	});
});
