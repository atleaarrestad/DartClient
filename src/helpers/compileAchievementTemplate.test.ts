import { describe, expect, it } from 'vitest';

import type {
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementValueDraft,
} from '../models/achievementBuilder.js';
import { compileAchievementTemplate } from './compileAchievementTemplate.js';

const value = (
	source: AchievementValueDraft['source'],
	contents: string,
): AchievementValueDraft => ({ source, value: contents });

const roundRule = (condition: AchievementRuleDraft): AchievementRuleDraft => ({
	id: 'round',
	type: 'round',
	quantifier: 'any',
	statuses: [ 'valid', 'victory' ],
	condition,
});

const draft = (
	rule: AchievementRuleDraft,
	overrides: Partial<AchievementTemplateDraft> = {},
): AchievementTemplateDraft => ({
	seasonId: '00000000-0000-0000-0000-000000000001',
	nameTemplate: 'Test {n}',
	descriptionTemplate: 'Test description {n}',
	category: 'Custom',
	tier: 1,
	achievementScope: 'session',
	parameters: [],
	rule,
	progression: undefined,
	...overrides,
});

describe('compileAchievementTemplate', () => {
	it('compiles a parameterized Shanghai sequence', () => {
		const result = compileAchievementTemplate(draft(roundRule({
			id: 'sequence',
			type: 'sequence',
			scope: 'sameRound',
			targets: [
				{
					id: 'single',
					hitLocation: value('parameter', 'n'),
					throwType: 'single',
				},
				{
					id: 'double',
					hitLocation: value('parameter', 'n'),
					throwType: 'double',
				},
				{
					id: 'triple',
					hitLocation: value('parameter', 'n'),
					throwType: 'triple',
				},
			],
		}), {
			parameters: [ {
				id: 'n',
				key: 'n',
				valueType: 'integer',
				generatorType: 'range',
				minimum: 1,
				maximum: 20,
				step: 1,
				values: [],
			} ],
		}));

		expect(result.parameters).toEqual([ expect.objectContaining({
			name: 'n',
			kind: 'IntegerRange',
			minimum: 1,
			maximum: 20,
		}) ]);
		expect(result.definition).toMatchObject({
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'and',
					operands: expect.arrayContaining([
						{
							kind: 'sequence',
							collection: { kind: 'field', path: 'round.throws' },
							items: expect.any(Array),
						},
					]),
				},
			},
		});
	});

	it('limits any-scoring sequence targets to played scoring darts', () => {
		const result = compileAchievementTemplate(draft(roundRule({
			id: 'sequence',
			type: 'sequence',
			scope: 'sameRound',
			targets: [ 1, 2, 3 ].map(target => ({
				id: String(target),
				hitLocation: value('constant', String(target)),
				throwType: 'anyScoring' as const,
			})),
		})));
		const definition = JSON.stringify(result.definition);

		expect(definition).toContain(
			'"kind":"field","path":"throw.isPlayed"',
		);
		expect(definition).toContain(
			'"valueType":"throwType","value":"Single"',
		);
		expect(definition).toContain(
			'"valueType":"throwType","value":"Double"',
		);
		expect(definition).toContain(
			'"valueType":"throwType","value":"Triple"',
		);
		expect(definition).not.toContain(
			'"valueType":"throwType","value":"Rim"',
		);
	});

	it('filters placeholder darts from round counts and aggregates', () => {
		const result = compileAchievementTemplate(draft(roundRule({
			id: 'balanced',
			type: 'all',
			children: [
				{
					id: 'throw-count',
					type: 'compare',
					left: value('round.throwCount', ''),
					operator: 'equal',
					right: value('constant', '3'),
				},
				{
					id: 'distinct',
					type: 'compare',
					left: value('round.rawPointsDistinctCount', ''),
					operator: 'equal',
					right: value('constant', '3'),
				},
				{
					id: 'minimum',
					type: 'compare',
					left: value('round.minimumRawPoints', ''),
					operator: 'greaterThanOrEqual',
					right: value('constant', '1'),
				},
			],
		})));

		const definition = JSON.stringify(result.definition);
		expect(definition).toContain(
			'"kind":"count","collection":{"kind":"field","path":"round.throws"},'
			+ '"predicate":{"kind":"field","path":"throw.isPlayed"}',
		);
		expect(definition).toContain(
			'"kind":"distinctCount","collection":{"kind":"field","path":"round.throws"},'
			+ '"selector":{"kind":"field","path":"throw.rawPoints"},'
			+ '"predicate":{"kind":"field","path":"throw.isPlayed"}',
		);
		expect(definition).toContain(
			'"kind":"not","operand":{"kind":"field","path":"throw.isPlayed"}',
		);
	});

	it('compiles dartboard-neighbor expressions and multiple parameters', () => {
		const result = compileAchievementTemplate(draft(roundRule({
			id: 'classic',
			type: 'throw',
			quantifier: 'any',
			scope: 'currentRound',
			hitLocation: value('board.leftNeighbor', 'n'),
			throwType: 'any',
		}), {
			parameters: [
				{
					id: 'n',
					key: 'n',
					valueType: 'integer',
					generatorType: 'set',
					values: [ '1', '20' ],
				},
				{
					id: 'variant',
					key: 'variant',
					valueType: 'string',
					generatorType: 'set',
					values: [ 'left', 'right' ],
				},
			],
		}));

		expect(result.parameters.map(parameter => parameter.kind)).toEqual([
			'IntegerSet',
			'StringSet',
		]);
		const definition = JSON.stringify(result.definition);
		expect(definition).toContain(
			'"kind":"field","path":"throw.isPlayed"',
		);
		expect(definition).toContain(
			'"kind":"boardNeighbor","number":{"kind":"parameter","name":"n"},"offset":-1',
		);
	});

	it('compiles progression target sets with parameterized segments', () => {
		const result = compileAchievementTemplate(draft({
			id: 'unused',
			type: 'all',
			children: [],
		}, {
			achievementScope: 'progression',
			parameters: [ {
				id: 'n',
				key: 'n',
				valueType: 'integer',
				generatorType: 'range',
				minimum: 1,
				maximum: 20,
				step: 1,
				values: [],
			} ],
			progression: {
				statuses: [ 'valid', 'victory' ],
				targets: [ {
					id: 'target',
					hitLocation: value('parameter', 'n'),
					throwType: 'triple',
				} ],
			},
		}));

		expect(result.evaluationPhase).toBe('Progression');
		expect(result.definition).toMatchObject({
			reducers: [ {
				kind: 'collectHitSegments',
				statuses: [ 'Valid', 'Victory' ],
			} ],
			root: {
				kind: 'and',
				operands: [ {
					kind: 'hasHitSegment',
					hitLocation: { kind: 'parameter', name: 'n' },
					throwType: {
						kind: 'constant',
						valueType: 'throwType',
						value: 'Triple',
					},
				} ],
			},
		});
	});
});
