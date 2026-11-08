import { describe, expect, it } from 'vitest';

import type {
	AchievementRuleDraft,
	AchievementValueSource,
} from '../models/achievementBuilder.js';
import type { AchievementTemplateVersionResponse } from '../models/achievementBuilderApi.js';
import {
	astAnd,
	astAnyRound,
	astAnyScoringType,
	astEqual,
	astField,
	astHitLocationIs,
	astInteger,
	astNodesOfKind,
	AstNode,
	astOr,
	astParameter,
	astRoundStatus,
	astThrowTypeIs,
	collectAstNodes,
	collectRules,
	constant,
	parameter,
	roundRule,
	storedTemplate,
	template,
	templateDraft,
	templateVersion,
	value,
} from '../test/achievementFixtures.js';
import {
	compileAchievementTemplate,
	measureAchievementAst,
	restoreAchievementTemplateDraft,
} from './compileAchievementTemplate.js';

const isPlayed = astField('throw.isPlayed');
const roundThrows = astField('round.throws');

const rangeParameter = (key: string, minimum = 1, maximum = 20) =>
	parameter(key, { minimum, maximum });

const compileRoot = (rule: AchievementRuleDraft, parameters = [ rangeParameter('n') ]): unknown =>
	compileAchievementTemplate(templateDraft(rule, { parameters })).definition['root'];

const restoreRule = (root: AstNode): AchievementRuleDraft | undefined =>
	restoreAchievementTemplateDraft(storedTemplate(root))?.rule;

const rawRules = (rule: AchievementRuleDraft | undefined): AchievementRuleDraft[] =>
	rule ? collectRules(rule).filter(item => item.type === 'raw') : [];

describe('compileAchievementTemplate', () => {
	it('compiles a parameterized Shanghai sequence', () => {
		const result = compileAchievementTemplate(templateDraft(roundRule({
			id:      'sequence',
			type:    'sequence',
			scope:   'sameRound',
			targets: ([ 'single', 'double', 'triple' ] as const).map(throwType => ({
				id:          throwType,
				hitLocation: value('parameter', 'n'),
				throwType,
			})),
		}), { parameters: [ rangeParameter('n') ] }));

		expect(result.parameters).toEqual([ {
			name:          'n',
			kind:          'IntegerRange',
			minimum:       1,
			maximum:       20,
			step:          1,
			integerValues: [],
			stringValues:  [],
			booleanValues: [],
		} ]);
		expect(result.definition['root']).toEqual(astAnyRound([ 'Valid', 'Victory' ], {
			kind:       'sequence',
			collection: roundThrows,
			items:      [ 'Single', 'Double', 'Triple' ].map(throwType => astAnd(
				isPlayed,
				astHitLocationIs(astParameter('n')),
				astThrowTypeIs(throwType),
			)),
		}));
	});

	it('limits any-scoring sequence targets to played scoring darts', () => {
		const root = compileRoot(roundRule({
			id:      'sequence',
			type:    'sequence',
			scope:   'sameRound',
			targets: [ 1, 2, 3 ].map(target => ({
				id:          String(target),
				hitLocation: constant(target),
				throwType:   'anyScoring' as const,
			})),
		}));

		expect(astNodesOfKind(root, 'sequence')[0]?.['items']).toEqual([ 1, 2, 3 ].map(target => astAnd(
			isPlayed,
			astHitLocationIs(astInteger(target)),
			astAnyScoringType(),
		)));
		expect(collectAstNodes(root, node => node['value'] === 'Rim')).toEqual([]);
	});

	it('compiles rim sequence targets without a fake hit location', () => {
		const root = compileRoot(roundRule({
			id:      'sequence',
			type:    'sequence',
			scope:   'sameRound',
			targets: [
				{ id: 'one', hitLocation: constant(1), throwType: 'anyScoring' },
				{ id: 'rim-one', hitLocation: constant(0), throwType: 'rim' },
				{ id: 'rim-two', hitLocation: constant(0), throwType: 'rim' },
			],
		}));

		const items = astNodesOfKind(root, 'sequence')[0]?.['items'];
		expect(items).toEqual([
			astAnd(isPlayed, astHitLocationIs(astInteger(1)), astAnyScoringType()),
			astAnd(isPlayed, astThrowTypeIs('Rim')),
			astAnd(isPlayed, astThrowTypeIs('Rim')),
		]);
	});

	it('filters placeholder darts from round counts and aggregates', () => {
		const root = compileRoot(roundRule({
			id:       'balanced',
			type:     'all',
			children: [
				{ id: 'throw-count', type: 'compare', left: value('round.throwCount'), operator: 'equal', right: constant(3) },
				{
					id:       'distinct',
					type:     'compare',
					left:     value('round.rawPointsDistinctCount'),
					operator: 'equal',
					right:    constant(3),
				},
				{
					id:       'minimum',
					type:     'compare',
					left:     value('round.minimumRawPoints'),
					operator: 'greaterThanOrEqual',
					right:    constant(1),
				},
			],
		}));

		expect(astNodesOfKind(root, 'count')).toEqual([
			{ kind: 'count', collection: roundThrows, predicate: isPlayed },
		]);
		expect(astNodesOfKind(root, 'distinctCount')).toEqual([ {
			kind:       'distinctCount',
			collection: roundThrows,
			selector:   astField('throw.rawPoints'),
			predicate:  isPlayed,
		} ]);
		expect(astNodesOfKind(root, 'not')).toEqual([ { kind: 'not', operand: isPlayed } ]);
	});

	it('compiles dartboard-neighbor expressions and multiple parameters', () => {
		const result = compileAchievementTemplate(templateDraft(roundRule({
			id:          'classic',
			type:        'throw',
			quantifier:  'any',
			scope:       'currentRound',
			hitLocation: value('board.leftNeighbor', 'n'),
			throwType:   'any',
		}), {
			parameters: [
				parameter('n', { generatorType: 'set', values: [ '1', '20' ] }),
				parameter('variant', { valueType: 'string', generatorType: 'set', values: [ 'left', 'right' ] }),
			],
		}));

		expect(result.parameters.map(item => item.kind)).toEqual([ 'IntegerSet', 'StringSet' ]);
		expect(astNodesOfKind(result.definition['root'], 'boardNeighbor')).toEqual([
			{ kind: 'boardNeighbor', number: astParameter('n'), offset: -1 },
		]);
		const throwQuantifiers = collectAstNodes(result.definition['root'], node =>
			node['kind'] === 'any' && (node['collection'] as AstNode)['path'] === 'round.throws');
		expect(throwQuantifiers.map(node => (node['predicate'] as AstNode)['operands']))
			.toEqual([ [ isPlayed, astHitLocationIs({ kind: 'boardNeighbor', number: astParameter('n'), offset: -1 }) ] ]);
	});

	it('compiles progression target sets with parameterized segments', () => {
		const result = compileAchievementTemplate(templateDraft({ id: 'unused', type: 'all', children: [] }, {
			achievementScope: 'progression',
			parameters:       [ rangeParameter('n') ],
			progression:      {
				statuses: [ 'valid', 'victory' ],
				targets:  [ { id: 'target', hitLocation: value('parameter', 'n'), throwType: 'triple' } ],
			},
		}));

		expect(result.evaluationPhase).toBe('Progression');
		expect(result.definition['reducers']).toEqual([
			{ kind: 'collectHitSegments', statuses: [ 'Valid', 'Victory' ] },
		]);
		expect(result.definition['root']).toEqual(astAnd({
			kind:        'hasHitSegment',
			hitLocation: astParameter('n'),
			throwType:   { kind: 'constant', valueType: 'throwType', value: 'Triple' },
		}));
	});

	it('enforces the block placement table', () => {
		const throwRule: AchievementRuleDraft = {
			id:          'throw',
			type:        'throw',
			quantifier:  'any',
			scope:       'currentRound',
			hitLocation: constant(20),
			throwType:   'any',
		};

		expect(() => compileRoot(throwRule)).toThrow('Throw blocks must be nested inside a round block.');
		expect(() => compileRoot(roundRule(roundRule(throwRule))))
			.toThrow('Round blocks cannot be nested inside another round block.');
		expect(() => compileRoot(roundRule({ id: 'win', type: 'winningThrow', throwType: 'double' })))
			.toThrow('Winning-throw blocks must be used at the game level.');
	});

	it('only counts played darts in throw-count blocks', () => {
		const root = compileRoot(roundRule({
			id:        'count',
			type:      'throwCount',
			throwType: 'any',
			operator:  'greaterThanOrEqual',
			count:     constant(2),
		}));

		expect(astNodesOfKind(root, 'count')).toEqual([
			{ kind: 'count', collection: roundThrows, predicate: isPlayed },
		]);
	});

	it('deduplicates set parameter values', () => {
		const request = compileAchievementTemplate(templateDraft({ id: 'root', type: 'all', children: [] }, {
			parameters: [ parameter('n', { generatorType: 'set', values: [ '1', '2', '1' ] }) ],
		}));

		expect(request.parameters[0]?.integerValues).toEqual([ 1, 2 ]);
	});
});

describe('raw progression logic', () => {
	const root = { kind: 'or', operands: [ { kind: 'progressionCounter', name: 'wins' } ] };
	const reducers = [ { kind: 'incrementCounter', name: 'wins', statuses: [ 'Victory' ] } ];
	const rawVersion = (editor?: unknown): AchievementTemplateVersionResponse => templateVersion(1, {
		status:          'Draft',
		evaluationPhase: 'Progression',
		definition:      { version: 1, reducers, root, ...editor ? { editor } : {} },
	});

	it('keeps logic the target editor cannot represent and saves it verbatim', () => {
		const restored = restoreAchievementTemplateDraft(template(rawVersion()));

		expect(restored?.progression?.raw).toEqual({ root, reducers });
		const saved = compileAchievementTemplate(restored!);
		expect(saved.definition['root']).toEqual(root);
		expect(saved.definition['reducers']).toEqual(reducers);
	});

	it('does not copy the raw logic into the editor tree', () => {
		const restored = restoreAchievementTemplateDraft(template(rawVersion()))!;

		expect(compileAchievementTemplate(restored).definition['editor']).toEqual({
			rule:        restored.rule,
			progression: { statuses: [ 'valid', 'victory' ], targets: [] },
		});
	});

	it('still loads editor trees saved with the raw logic in them', () => {
		const restored = restoreAchievementTemplateDraft(template(rawVersion({
			rule:        { id: 'rule', type: 'all', children: [] },
			progression: { statuses: [ 'valid' ], targets: [], raw: { root, reducers } },
		})));

		expect(restored?.progression?.raw).toEqual({ root, reducers });
	});

	it('shows progression targets as raw logic when the stored reducer does not match', () => {
		const target = {
			kind:        'hasHitSegment',
			hitLocation: astInteger(20),
			throwType:   { kind: 'constant', valueType: 'throwType', value: 'Single' },
		};
		const overshootReducers = [ { kind: 'collectHitSegments', statuses: [ 'Valid', 'Overshoot' ] } ];
		const restored = restoreAchievementTemplateDraft(template(templateVersion(1, {
			evaluationPhase: 'Progression',
			definition:      { version: 1, reducers: overshootReducers, root: astAnd(target) },
		})));

		expect(restored?.progression?.raw).toEqual({ root: astAnd(target), reducers: overshootReducers });
	});
});

describe('restoreAchievementTemplateDraft', () => {
	it('restores the highest draft version regardless of API ordering', () => {
		const restored = restoreAchievementTemplateDraft(template(
			templateVersion(1),
			templateVersion(3, { status: 'Draft' }),
			templateVersion(2),
		));

		expect(restored?.nameTemplate).toBe('Version 3');
	});

	it('restores an explicitly selected published version', () => {
		const first = templateVersion(1);
		const restored = restoreAchievementTemplateDraft(template(first, templateVersion(2)), first.id);

		expect(restored?.nameTemplate).toBe('Version 1');
	});

	it('restores seeded Shanghai logic from the executable AST', () => {
		const restored = restoreRule(astAnyRound(
			[ 'Valid', 'Victory' ],
			...[ 'Single', 'Double', 'Triple' ].map(throwType => ({
				kind:       'any',
				collection: roundThrows,
				predicate:  astAnd(astHitLocationIs(astParameter('number')), astThrowTypeIs(throwType)),
			})),
		));

		expect(restored).toMatchObject({
			type:     'all',
			children: [ {
				type:       'round',
				quantifier: 'any',
				statuses:   [ 'valid', 'victory' ],
				condition:  {
					type:     'all',
					children: ([ 'single', 'double', 'triple' ] as const).map(throwType => ({
						type:        'throw',
						quantifier:  'any',
						hitLocation: { source: 'parameter', value: 'number' },
						throwType,
					})),
				},
			} ],
		});
	});

	it('restores parameter arithmetic in seeded climbing sequences', () => {
		const restored = restoreRule(astAnyRound([ 'Valid', 'Victory' ], {
			kind:       'sequence',
			collection: roundThrows,
			items:      [ 0, 1, 2 ].map(offset => astAnd(
				astHitLocationIs(offset === 0
					? astParameter('start')
					: { kind: 'add', left: astParameter('start'), right: astInteger(offset) }),
				astAnyScoringType(),
			)),
		}));

		expect(restored).toMatchObject({
			children: [ {
				type:      'round',
				condition: {
					type:    'sequence',
					targets: [
						{ hitLocation: { source: 'parameter', value: 'start' }, throwType: 'anyScoring' },
						{ hitLocation: { source: 'parameter.offset', value: 'start', offset: 1 } },
						{ hitLocation: { source: 'parameter.offset', value: 'start', offset: 2 } },
					],
				},
			} ],
		});
	});

	it('restores type-only rim targets in seeded descending sequences', () => {
		const restored = restoreRule(astAnyRound([ 'Valid', 'Victory' ], {
			kind:       'sequence',
			collection: roundThrows,
			items:      [
				astAnd(astHitLocationIs(astInteger(1)), astAnyScoringType()),
				astThrowTypeIs('Rim'),
				astThrowTypeIs('Rim'),
			],
		}));

		expect(restored).toMatchObject({
			children: [ {
				type:      'round',
				condition: {
					type:    'sequence',
					targets: [
						{ hitLocation: { source: 'constant', value: '1' }, throwType: 'anyScoring' },
						{ hitLocation: { source: 'constant', value: '0' }, throwType: 'rim' },
						{ hitLocation: { source: 'constant', value: '0' }, throwType: 'rim' },
					],
				},
			} ],
		});
	});

	it('restores filtered throw counts without losing the hit location', () => {
		const restored = restoreRule(astAnyRound([ 'Valid' ], astEqual(
			{
				kind:       'count',
				collection: roundThrows,
				predicate:  astAnd(astHitLocationIs(astParameter('number')), astThrowTypeIs('Single')),
			},
			astInteger(3),
		)));

		expect(restored).toMatchObject({
			children: [ {
				condition: {
					type:        'throwCount',
					hitLocation: { source: 'parameter', value: 'number' },
					throwType:   'single',
					operator:    'equal',
					count:       { source: 'constant', value: '3' },
				},
			} ],
		});
	});

	it('restores round-number and winning-throw achievements as native blocks', () => {
		expect(restoreRule(astAnyRound([ 'Victory' ], {
			kind:  'lessThanOrEqual',
			left:  astField('round.index'),
			right: { kind: 'subtract', left: astParameter('round'), right: astInteger(1) },
		}))).toMatchObject({
			children: [ {
				condition: {
					type:     'compare',
					left:     { source: 'round.number' },
					operator: 'lessThanOrEqual',
					right:    { source: 'parameter', value: 'round' },
				},
			} ],
		});

		expect(restoreRule({
			kind:       'any',
			collection: astField('rounds'),
			predicate:  {
				kind:       'any',
				collection: roundThrows,
				predicate:  astAnd(
					astField('throw.isVictoryThrow'),
					astOr(astThrowTypeIs('Double'), astHitLocationIs(astInteger(50))),
				),
			},
		})).toMatchObject({
			children: [ { type: 'winningThrow', throwType: 'double', hitLocation: undefined } ],
		});
	});

	it('restores an exact single winning throw target it compiled', () => {
		const root = compileRoot({
			id:          'winning-single-16',
			type:        'winningThrow',
			hitLocation: constant(16),
			throwType:   'single',
		}) as AstNode;

		expect(root).toEqual({
			kind:       'any',
			collection: astField('rounds'),
			predicate:  {
				kind:       'any',
				collection: roundThrows,
				predicate:  astAnd(
					astField('throw.isVictoryThrow'),
					astThrowTypeIs('Single'),
					astHitLocationIs(astInteger(16)),
				),
			},
		});
		expect(restoreRule(root)).toMatchObject({
			type:     'all',
			children: [ {
				type:        'winningThrow',
				hitLocation: { source: 'constant', value: '16' },
				throwType:   'single',
			} ],
		});
	});

	it('restores game-wide throw restrictions as editable count comparisons', () => {
		const restored = restoreRule({
			kind:       'all',
			collection: astField('rounds'),
			predicate:  {
				kind:       'all',
				collection: roundThrows,
				predicate:  astAnd(...[ 'Double', 'Triple' ].map(throwType => ({
					kind:  'notEqual',
					left:  astField('throw.throwType'),
					right: { kind: 'constant', valueType: 'throwType', value: throwType },
				}))),
			},
		});

		expect(restored).toMatchObject({
			type:     'all',
			children: [
				{ type: 'compare', left: { source: 'game.doubleCount' }, operator: 'equal', right: { value: '0' } },
				{ type: 'compare', left: { source: 'game.tripleCount' }, operator: 'equal', right: { value: '0' } },
			],
		});
	});

	it('restores legacy modifier checks as native comparison blocks', () => {
		const seededRoot = astAnyRound(
			[ 'Valid', 'Victory' ],
			{
				kind:  'greaterThanOrEqual',
				left:  { kind: 'sum', collection: roundThrows, selector: astField('throw.finalPoints') },
				right: astParameter('threshold'),
			},
			{
				kind:       'all',
				collection: roundThrows,
				predicate:  astEqual(astField('throw.modifierCount'), astInteger(0)),
			},
		);

		const restored = restoreAchievementTemplateDraft(storedTemplate(seededRoot, {
			parameters: [ {
				name:          'threshold',
				kind:          'IntegerSet',
				minimum:       null,
				maximum:       null,
				step:          1,
				integerValues: [ 100 ],
				stringValues:  [],
				booleanValues: [],
			} ],
		}))!;

		expect(rawRules(restored.rule)).toEqual([]);
		expect(restored.rule).toMatchObject({
			type:     'all',
			children: [ {
				type:      'round',
				condition: {
					type:     'all',
					children: [
						{
							type:     'compare',
							left:     { source: 'round.finalPoints' },
							operator: 'greaterThanOrEqual',
							right:    { source: 'parameter', value: 'threshold' },
						},
						{
							type:     'compare',
							left:     { source: 'round.modifiedThrowCount' },
							operator: 'equal',
							right:    { source: 'constant', value: '0' },
						},
					],
				},
			} ],
		});

		// Saving writes the modifier check in the compiler's own shape, which restores the same way.
		const compiledRoot = compileAchievementTemplate(restored).definition['root'] as AstNode;
		expect(astNodesOfKind(compiledRoot, 'greaterThan')).toContainEqual({
			kind:  'greaterThan',
			left:  astField('throw.modifierCount'),
			right: astInteger(0),
		});
		const roundTripped = restoreRule(compiledRoot);
		expect(rawRules(roundTripped)).toEqual([]);
		expect(collectRules(roundTripped!)).toContainEqual(expect.objectContaining({
			type: 'compare',
			left: { source: 'round.modifiedThrowCount', value: '' },
		}));
	});

	it('keeps the stored editor tree only while it matches the executable root', () => {
		const editorRule: AchievementRuleDraft = {
			id:       'editor-root',
			type:     'all',
			children: [ {
				id:       'editor-compare',
				type:     'compare',
				left:     value('game.roundsPlayed'),
				operator: 'lessThanOrEqual',
				right:    constant(5),
			} ],
		};
		const compiled = compileAchievementTemplate(templateDraft(editorRule)).definition;
		expect(restoreAchievementTemplateDraft(template(templateVersion(1, { definition: compiled })))?.rule)
			.toEqual(editorRule);

		const roundsPlayed = (compiled['root'] as { operands: { left: AstNode; }[]; }).operands[0]!.left;
		const drifted = restoreAchievementTemplateDraft(template(templateVersion(1, {
			definition: { ...compiled, root: { kind: 'greaterThan', left: roundsPlayed, right: astInteger(9) } },
		})))?.rule;

		expect(drifted?.id).not.toBe('editor-root');
		expect(drifted).toMatchObject({
			type:     'all',
			children: [ {
				type:     'compare',
				left:     { source: 'game.roundsPlayed' },
				operator: 'greaterThan',
				right:    { source: 'constant', value: '9' },
			} ],
		});
	});

	// Each stored shape here used to restore as a block that compiles to different logic.
	it.each<{ name: string; root: AstNode; raw: (root: AstNode) => unknown; }>([
		{
			name: 'a game-wide restriction on a throw type without a game counter',
			root: {
				kind:       'all',
				collection: astField('rounds'),
				predicate:  {
					kind:       'all',
					collection: roundThrows,
					predicate:  astAnd(...[ 'Double', 'Single' ].map(throwType => ({
						kind:  'notEqual',
						left:  astField('throw.throwType'),
						right: { kind: 'constant', valueType: 'throwType', value: throwType },
					}))),
				},
			},
			raw: root => root,
		},
		{
			name: 'a game-wide round-status restriction with other statuses',
			root: {
				kind:       'all',
				collection: astField('rounds'),
				predicate:  astRoundStatus('Valid', 'Victory', 'Overshoot'),
			},
			raw: root => root,
		},
		{
			name: 'a typed throw count with an extra filter',
			root: astAnyRound([ 'Valid' ], {
				kind:  'greaterThanOrEqual',
				left:  {
					kind:       'count',
					collection: roundThrows,
					predicate:  astAnd(astThrowTypeIs('Double'), astEqual(astField('throw.modifierCount'), astInteger(1))),
				},
				right: astInteger(2),
			}),
			raw: root => ((root['predicate'] as AstNode)['operands'] as AstNode[])[1],
		},
		{
			name: 'a winning throw that must be a double but not the double bull',
			root: {
				kind:       'any',
				collection: astField('rounds'),
				predicate:  {
					kind:       'any',
					collection: roundThrows,
					predicate:  astAnd(astField('throw.isVictoryThrow'), astThrowTypeIs('Double')),
				},
			},
			raw: root => root,
		},
		{
			name: 'a winning throw with extra alternatives',
			root: {
				kind:       'any',
				collection: astField('rounds'),
				predicate:  {
					kind:       'any',
					collection: roundThrows,
					predicate:  astAnd(
						astField('throw.isVictoryThrow'),
						astOr(astThrowTypeIs('Double'), astHitLocationIs(astInteger(50)), astThrowTypeIs('Triple')),
					),
				},
			},
			raw: root => root,
		},
		{
			name: 'a sequence step that also accepts rim hits',
			root: astAnyRound([ 'Valid' ], {
				kind:       'sequence',
				collection: roundThrows,
				items:      [ 1, 2, 3 ].map(target => astAnd(
					astHitLocationIs(astInteger(target)),
					astOr(astAnyScoringType(), astThrowTypeIs('Rim')),
				)),
			}),
			raw: root => ((root['predicate'] as AstNode)['operands'] as AstNode[])[1],
		},
		{
			name: 'a round that must have two statuses at once',
			root: {
				kind:       'any',
				collection: astField('rounds'),
				predicate:  astAnd(
					astRoundStatus('Valid'),
					astRoundStatus('Victory'),
					{ kind: 'any', collection: roundThrows, predicate: astHitLocationIs(astInteger(20)) },
				),
			},
			raw: root => root,
		},
		{
			name: 'every round having a status',
			root: {
				kind:       'all',
				collection: astField('rounds'),
				predicate:  astAnd(
					astRoundStatus('Valid'),
					{ kind: 'any', collection: roundThrows, predicate: astHitLocationIs(astInteger(20)) },
				),
			},
			raw: root => root,
		},
	])('shows $name as raw logic', ({ root, raw }) => {
		const restored = restoreAchievementTemplateDraft(storedTemplate(root))!;

		expect(rawRules(restored.rule).map(rule => rule.type === 'raw' && rule.ast)).toEqual([ raw(root) ]);
		// Saving the restored draft keeps the stored logic.
		expect(collectAstNodes(compileAchievementTemplate(restored).definition['root']))
			.toContainEqual(raw(root));
	});
});

describe('golden compiled definitions', () => {
	const throwRule = (overrides: Partial<Extract<AchievementRuleDraft, { type: 'throw'; }>>): AchievementRuleDraft => ({
		id:          'throw',
		type:        'throw',
		quantifier:  'any',
		scope:       'currentRound',
		hitLocation: value('parameter', 'n'),
		throwType:   'triple',
		...overrides,
	});
	const compare = (
		left: AchievementValueSource,
		right = constant(2),
	): AchievementRuleDraft => ({ id: left, type: 'compare', left: value(left), operator: 'greaterThan', right });

	const goldenRules: [ string, AchievementRuleDraft ][] = [
		[ 'round any + throw any', roundRule(throwRule({})) ],
		[ 'round every + throw every', roundRule(throwRule({ quantifier: 'all', throwType: 'any' }), { quantifier: 'all' }) ],
		[ 'throw type only', roundRule(throwRule({ hitLocation: undefined, throwType: 'miss' }), { statuses: [ 'overshoot' ] }) ],
		[ 'throw count', roundRule({
			id:          'count',
			type:        'throwCount',
			hitLocation: value('board.rightNeighbor', 'n'),
			throwType:   'double',
			operator:    'lessThan',
			count:       value('parameter.offset', 'n'),
		}) ],
		[ 'winning throw double', { id: 'win', type: 'winningThrow', throwType: 'double' } ],
		[ 'winning throw target', { id: 'win', type: 'winningThrow', throwType: 'any', hitLocation: constant(25) } ],
		[ 'not + any', {
			id:    'not',
			type:  'not',
			child: { id: 'any', type: 'any', children: [ compare('game.placement', constant(1)), compare('game.missCount') ] },
		} ],
		[ 'sequence', roundRule({
			id:      'sequence',
			type:    'sequence',
			scope:   'sameRound',
			targets: [
				{ id: 'a', hitLocation: value('parameter', 'n'), throwType: 'single' },
				{ id: 'b', hitLocation: { source: 'parameter.offset', value: 'n', offset: -1 }, throwType: 'anyScoring' },
				{ id: 'c', hitLocation: constant(0), throwType: 'rim' },
			],
		}) ],
		[ 'round values', roundRule({
			id:       'values',
			type:     'all',
			children: ([
				'round.throwCount',
				'round.modifiedThrowCount',
				'round.number',
				'round.finalPoints',
				'round.rawPointsDistinctCount',
				'round.minimumRawPoints',
				'round.singleCount',
				'round.doubleCount',
				'round.tripleCount',
			] as const).map(source => compare(source)),
		}, { statuses: [ 'valid', 'failedWinCondition' ] }) ],
		[ 'game values', {
			id:       'values',
			type:     'all',
			children: ([
				'game.roundsPlayed',
				'game.placement',
				'game.validRoundCount',
				'game.victoryCount',
				'game.overshootCount',
				'game.failedWinConditionCount',
				'game.doubleCount',
				'game.tripleCount',
				'game.rimCount',
				'game.missCount',
			] as const).map(source => compare(source, value('board.leftNeighbor', 'n'))),
		} ],
	];

	// The compiled AST is the stored format, so a compiler change shows up here first.
	it.each(goldenRules)('compiles %s to the stored shape', (_name, rule) => {
		expect(compileRoot({ id: 'root', type: 'all', children: [ rule ] })).toMatchSnapshot();
	});

	it.each(goldenRules)('restores %s from its compiled shape alone', (_name, rule) => {
		const root = compileRoot({ id: 'root', type: 'all', children: [ rule ] }) as AstNode;
		const restored = restoreRule(root);

		expect(rawRules(restored)).toEqual([]);
		expect(compileRoot(restored!)).toEqual(root);
	});
});

describe('measureAchievementAst', () => {
	// Same accounting as the backend parser: compiling this draft there reports 21 nodes and
	// depth 7, and it fails with a quantifier limit of 1 but passes with 2.
	it('counts nodes, depth and quantifier nesting like the backend parser', () => {
		const root = compileRoot(roundRule({
			id:          'throw',
			type:        'throw',
			quantifier:  'any',
			scope:       'currentRound',
			hitLocation: value('parameter', 'n'),
			throwType:   'triple',
		}));

		expect(measureAchievementAst(root)).toEqual({
			nodeCount:              21,
			maximumDepth:           7,
			maximumQuantifierDepth: 2,
		});
	});

	it('does not raise the quantifier level for the collection itself', () => {
		expect(measureAchievementAst({
			kind:       'any',
			collection: astField('game.rounds'),
			predicate:  {
				kind:       'all',
				collection: roundThrows,
				predicate:  { kind: 'constant', value: true },
			},
		})).toEqual({ nodeCount: 5, maximumDepth: 3, maximumQuantifierDepth: 2 });
	});

	// The backend counts each reducer as a node at depth 1 and parses its amount and
	// condition from depth 2 outside any quantifier.
	it('counts progression reducers like the backend parser', () => {
		const root = astAnd({
			kind:        'hasHitSegment',
			hitLocation: astInteger(20),
			throwType:   { kind: 'constant', valueType: 'throwType', value: 'Single' },
		});
		const reducers = [
			{ kind: 'collectHitSegments', statuses: [ 'Valid' ] },
			{
				kind:    'incrementCounter',
				counter: 'wins',
				amount:  astInteger(1),
				when:    astEqual(astField('placement'), astInteger(1)),
			},
		];

		expect(measureAchievementAst(root)).toEqual({ nodeCount: 4, maximumDepth: 3, maximumQuantifierDepth: 0 });
		expect(measureAchievementAst(root, reducers)).toEqual({
			nodeCount:              4 + 2 + 1 + 3,
			maximumDepth:           3,
			maximumQuantifierDepth: 0,
		});
	});
});

describe('tier and skip rules', () => {
	const tierRules = [ { tier: 3, when: [ { parameter: 'n', operator: 'greaterThanOrEqual' as const, value: 15 } ] } ];
	const skipRules = [ { when: [ { parameter: 'n', operator: 'equal' as const, value: 13 } ] } ];
	const rule: AchievementRuleDraft = { id: 'root', type: 'all', children: [] };

	it('stores them in the definition next to the logic', () => {
		const definition = compileAchievementTemplate(templateDraft(rule, {
			parameters: [ rangeParameter('n') ],
			tierRules,
			skipRules,
		})).definition;

		expect(definition['variants']).toEqual({
			skip:  [ { when: [ { parameter: 'n', operator: 'equal', value: 13 } ] } ],
			tiers: [ { tier: 'gold', when: [ { parameter: 'n', operator: 'greaterThanOrEqual', value: 15 } ] } ],
		});
	});

	it('leaves the definition unchanged without rules', () => {
		const definition = compileAchievementTemplate(templateDraft(rule)).definition;

		expect(definition).not.toHaveProperty('variants');
	});

	it('reads them back when a version is opened', () => {
		const { definition } = compileAchievementTemplate(templateDraft(rule, {
			parameters: [ rangeParameter('n') ],
			tierRules,
			skipRules,
		}));
		const restored = restoreAchievementTemplateDraft(template(templateVersion(1, { definition })));

		expect(restored?.tierRules).toEqual(tierRules);
		expect(restored?.skipRules).toEqual(skipRules);
	});
});

describe('ladder steps', () => {
	const ladderSequence = (direction: 1 | -1): AstNode => astAnyRound([ 'Valid', 'Victory' ], {
		kind:       'sequence',
		collection: roundThrows,
		items:      [ 0, 1, 2 ].map(step => astAnd(
			astHitLocationIs(step === 0
				? astParameter('start')
				: { kind: 'ladderStep', number: astParameter('start'), offset: step * direction }),
			astAnyScoringType(),
		)),
	});

	it('restores the built-in Climbing sequence as ladder steps', () => {
		expect(restoreRule(ladderSequence(1))).toMatchObject({
			children: [ {
				type:      'round',
				condition: {
					type:    'sequence',
					targets: [
						{ hitLocation: { source: 'parameter', value: 'start' } },
						{ hitLocation: { source: 'parameter.ladder', value: 'start', offset: 1 } },
						{ hitLocation: { source: 'parameter.ladder', value: 'start', offset: 2 } },
					],
				},
			} ],
		});
	});

	it('compiles a ladder step back to the stored block', () => {
		const rule = restoreRule(ladderSequence(-1))!;

		expect(astNodesOfKind(compileRoot(rule, [ rangeParameter('start', 3, 20) ]), 'ladderStep')).toEqual([
			{ kind: 'ladderStep', number: astParameter('start'), offset: -1 },
			{ kind: 'ladderStep', number: astParameter('start'), offset: -2 },
		]);
	});
});
