import { describe, expect, it } from 'vitest';

import type {
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementValueDraft,
} from '../models/achievementBuilder.js';
import type {
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
} from '../models/achievementBuilderApi.js';
import {
	compileAchievementTemplate,
	restoreAchievementTemplateDraft,
} from './compileAchievementTemplate.js';

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
	categoryId: '00000000-0000-0000-0000-000000000002',
	tier: 1,
	achievementScope: 'session',
	parameters: [],
	rule,
	progression: undefined,
	...overrides,
});

const version = (
	id: string,
	versionNumber: number,
	status: AchievementTemplateVersionResponse['status'],
	nameTemplate: string,
): AchievementTemplateVersionResponse => ({
	id,
	versionNumber,
	status,
	evaluationPhase: 'Live',
	nameTemplate,
	descriptionTemplate: `${ nameTemplate } description`,
	categoryId: '00000000-0000-0000-0000-000000000002',
	categoryName: 'Special',
	categoryIsArchived: false,
	achievementTier: 1,
	parameters: [],
	definition: {
		editor: {
			rule: {
				id: `rule-${ versionNumber }`,
				type: 'all',
				children: [],
			},
		},
	},
	createdAtUtc: `2026-08-${ String(versionNumber).padStart(2, '0') }T00:00:00Z`,
	publishedAtUtc: status === 'Published'
		? `2026-08-${ String(versionNumber).padStart(2, '0') }T00:00:00Z`
		: null,
});

const template = (
	versions: AchievementTemplateVersionResponse[],
): AchievementTemplateResponse => ({
	id: '00000000-0000-0000-0000-000000000003',
	seasonId: '00000000-0000-0000-0000-000000000001',
	createdAtUtc: '2026-08-01T00:00:00Z',
	versions,
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

	it('compiles rim sequence targets without a fake hit location', () => {
		const result = compileAchievementTemplate(draft(roundRule({
			id: 'sequence',
			type: 'sequence',
			scope: 'sameRound',
			targets: [
				{
					id: 'one',
					hitLocation: value('constant', '1'),
					throwType: 'anyScoring',
				},
				{
					id: 'rim-one',
					hitLocation: value('constant', '0'),
					throwType: 'rim',
				},
				{
					id: 'rim-two',
					hitLocation: value('constant', '0'),
					throwType: 'rim',
				},
			],
		})));
		const definition = JSON.stringify(result.definition);

		expect(definition).toContain('"valueType":"throwType","value":"Rim"');
		expect(definition).not.toContain(
			'"path":"throw.hitLocation"},"right":{"kind":"constant","valueType":"integer","value":0',
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

	it('restores the highest draft version regardless of API ordering', () => {
		const restored = restoreAchievementTemplateDraft(template([
			version('00000000-0000-0000-0000-000000000011', 1, 'Published', 'Version one'),
			version('00000000-0000-0000-0000-000000000013', 3, 'Draft', 'Version three'),
			version('00000000-0000-0000-0000-000000000012', 2, 'Published', 'Version two'),
		]));

		expect(restored?.nameTemplate).toBe('Version three');
	});

	it('restores an explicitly selected published version', () => {
		const selectedId = '00000000-0000-0000-0000-000000000011';
		const restored = restoreAchievementTemplateDraft(template([
			version(selectedId, 1, 'Published', 'Version one'),
			version('00000000-0000-0000-0000-000000000012', 2, 'Published', 'Version two'),
		]), selectedId);

		expect(restored?.nameTemplate).toBe('Version one');
	});

	it('restores seeded Shanghai logic from the executable AST', () => {
		const seededVersion = version(
			'00000000-0000-0000-0000-000000000011',
			1,
			'Published',
			'Shanghai {number}',
		);
		seededVersion.parameters = [ {
			name: 'number',
			kind: 'IntegerRange',
			minimum: 1,
			maximum: 20,
			step: 1,
			integerValues: [],
			stringValues: [],
			booleanValues: [],
		} ];
		seededVersion.definition = {
			version: 1,
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'and',
					operands: [
						{
							kind: 'or',
							operands: [ 'Valid', 'Victory' ].map(status => ({
								kind: 'equal',
								left: { kind: 'field', path: 'round.status' },
								right: { kind: 'status', value: status },
							})),
						},
						...([ 'Single', 'Double', 'Triple' ] as const).map(throwType => ({
							kind: 'any',
							collection: { kind: 'field', path: 'round.throws' },
							predicate: {
								kind: 'and',
								operands: [
									{
										kind: 'equal',
										left: { kind: 'field', path: 'throw.hitLocation' },
										right: { kind: 'parameter', name: 'number' },
									},
									{
										kind: 'equal',
										left: { kind: 'field', path: 'throw.throwType' },
										right: {
											kind: 'constant',
											valueType: 'throwType',
											value: throwType,
										},
									},
								],
							},
						})),
					],
				},
			},
		};

		const restored = restoreAchievementTemplateDraft(template([ seededVersion ]));

		expect(restored?.rule).toMatchObject({
			type: 'all',
			children: [ {
				type: 'round',
				quantifier: 'any',
				statuses: [ 'valid', 'victory' ],
				condition: {
					type: 'all',
					children: [
						{
							type: 'throw',
							quantifier: 'any',
							hitLocation: { source: 'parameter', value: 'number' },
							throwType: 'single',
						},
						{
							type: 'throw',
							quantifier: 'any',
							hitLocation: { source: 'parameter', value: 'number' },
							throwType: 'double',
						},
						{
							type: 'throw',
							quantifier: 'any',
							hitLocation: { source: 'parameter', value: 'number' },
							throwType: 'triple',
						},
					],
				},
			} ],
		});
	});

	it('restores parameter arithmetic in seeded climbing sequences', () => {
		const seededVersion = version(
			'00000000-0000-0000-0000-000000000011',
			1,
			'Published',
			'Climbing {start}',
		);
		seededVersion.parameters = [ {
			name: 'start',
			kind: 'IntegerRange',
			minimum: 1,
			maximum: 18,
			step: 1,
			integerValues: [],
			stringValues: [],
			booleanValues: [],
		} ];
		seededVersion.definition = {
			version: 1,
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'and',
					operands: [
						{
							kind: 'or',
							operands: [ 'Valid', 'Victory' ].map(status => ({
								kind: 'equal',
								left: { kind: 'field', path: 'round.status' },
								right: { kind: 'status', value: status },
							})),
						},
						{
							kind: 'sequence',
							collection: { kind: 'field', path: 'round.throws' },
							items: [ 0, 1, 2 ].map(offset => ({
								kind: 'and',
								operands: [
									{
										kind: 'equal',
										left: { kind: 'field', path: 'throw.hitLocation' },
										right: offset === 0
											? { kind: 'parameter', name: 'start' }
											: {
												kind: 'add',
												left: { kind: 'parameter', name: 'start' },
												right: {
													kind: 'constant',
													valueType: 'integer',
													value: offset,
												},
											},
									},
									{
										kind: 'or',
										operands: [ 'Single', 'Double', 'Triple' ].map(throwType => ({
											kind: 'equal',
											left: { kind: 'field', path: 'throw.throwType' },
											right: {
												kind: 'constant',
												valueType: 'throwType',
												value: throwType,
											},
										})),
									},
								],
							})),
						},
					],
				},
			},
		};

		const restored = restoreAchievementTemplateDraft(template([ seededVersion ]));

		expect(restored?.rule).toMatchObject({
			children: [ {
				type: 'round',
				condition: {
					type: 'sequence',
					targets: [
						{ hitLocation: { source: 'parameter', value: 'start' } },
						{
							hitLocation: {
								source: 'parameter.offset',
								value: 'start',
								offset: 1,
							},
						},
						{
							hitLocation: {
								source: 'parameter.offset',
								value: 'start',
								offset: 2,
							},
						},
					],
				},
			} ],
		});
	});

	it('restores type-only rim targets in seeded descending sequences', () => {
		const seededVersion = version(
			'00000000-0000-0000-0000-000000000011',
			1,
			'Published',
			'Descending 1',
		);
		const rimTarget = {
			kind: 'equal',
			left: { kind: 'field', path: 'throw.throwType' },
			right: { kind: 'constant', valueType: 'throwType', value: 'Rim' },
		};
		seededVersion.definition = {
			version: 1,
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'and',
					operands: [
						{
							kind: 'or',
							operands: [ 'Valid', 'Victory' ].map(status => ({
								kind: 'equal',
								left: { kind: 'field', path: 'round.status' },
								right: { kind: 'status', value: status },
							})),
						},
						{
							kind: 'sequence',
							collection: { kind: 'field', path: 'round.throws' },
							items: [
								{
									kind: 'and',
									operands: [
										{
											kind: 'equal',
											left: { kind: 'field', path: 'throw.hitLocation' },
											right: {
												kind: 'constant',
												valueType: 'integer',
												value: 1,
											},
										},
										{
											kind: 'or',
											operands: [ 'Single', 'Double', 'Triple' ].map(throwType => ({
												kind: 'equal',
												left: { kind: 'field', path: 'throw.throwType' },
												right: {
													kind: 'constant',
													valueType: 'throwType',
													value: throwType,
												},
											})),
										},
									],
								},
								rimTarget,
								rimTarget,
							],
						},
					],
				},
			},
		};

		const restored = restoreAchievementTemplateDraft(template([ seededVersion ]));

		expect(restored?.rule).toMatchObject({
			children: [ {
				type: 'round',
				condition: {
					type: 'sequence',
					targets: [
						{
							hitLocation: { source: 'constant', value: '1' },
							throwType: 'anyScoring',
						},
						{
							hitLocation: { source: 'constant', value: '0' },
							throwType: 'rim',
						},
						{
							hitLocation: { source: 'constant', value: '0' },
							throwType: 'rim',
						},
					],
				},
			} ],
		});
	});

	it('restores filtered throw counts without losing the hit location', () => {
		const seededVersion = version(
			'00000000-0000-0000-0000-000000000011',
			1,
			'Published',
			'Three of a kind: {number}',
		);
		seededVersion.definition = {
			version: 1,
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'and',
					operands: [
						{
							kind: 'equal',
							left: { kind: 'field', path: 'round.status' },
							right: { kind: 'status', value: 'Valid' },
						},
						{
							kind: 'equal',
							left: {
								kind: 'count',
								collection: { kind: 'field', path: 'round.throws' },
								predicate: {
									kind: 'and',
									operands: [
										{
											kind: 'equal',
											left: { kind: 'field', path: 'throw.hitLocation' },
											right: { kind: 'parameter', name: 'number' },
										},
										{
											kind: 'equal',
											left: { kind: 'field', path: 'throw.throwType' },
											right: {
												kind: 'constant',
												valueType: 'throwType',
												value: 'Single',
											},
										},
									],
								},
							},
							right: { kind: 'constant', valueType: 'integer', value: 3 },
						},
					],
				},
			},
		};

		const restored = restoreAchievementTemplateDraft(template([ seededVersion ]));

		expect(restored?.rule).toMatchObject({
			children: [ {
				condition: {
					type: 'throwCount',
					hitLocation: { source: 'parameter', value: 'number' },
					throwType: 'single',
					operator: 'equal',
					count: { source: 'constant', value: '3' },
				},
			} ],
		});
	});

	it('restores round-number and winning-throw achievements as native blocks', () => {
		const finishRoundVersion = version(
			'00000000-0000-0000-0000-000000000011',
			1,
			'Published',
			'Finish on round {round} or better',
		);
		finishRoundVersion.definition = {
			version: 1,
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'and',
					operands: [
						{
							kind: 'equal',
							left: { kind: 'field', path: 'round.status' },
							right: { kind: 'status', value: 'Victory' },
						},
						{
							kind: 'lessThanOrEqual',
							left: { kind: 'field', path: 'round.index' },
							right: {
								kind: 'subtract',
								left: { kind: 'parameter', name: 'round' },
								right: { kind: 'constant', valueType: 'integer', value: 1 },
							},
						},
					],
				},
			},
		};
		expect(restoreAchievementTemplateDraft(template([ finishRoundVersion ]))?.rule)
			.toMatchObject({
				children: [ {
					condition: {
						type: 'compare',
						left: { source: 'round.number' },
						operator: 'lessThanOrEqual',
						right: { source: 'parameter', value: 'round' },
					},
				} ],
			});

		const winningThrowVersion = version(
			'00000000-0000-0000-0000-000000000012',
			1,
			'Published',
			'Finish With Double',
		);
		winningThrowVersion.definition = {
			version: 1,
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'any',
					collection: { kind: 'field', path: 'round.throws' },
					predicate: {
						kind: 'and',
						operands: [
							{ kind: 'field', path: 'throw.isVictoryThrow' },
							{
								kind: 'or',
								operands: [
									{
										kind: 'equal',
										left: { kind: 'field', path: 'throw.throwType' },
										right: {
											kind: 'constant',
											valueType: 'throwType',
											value: 'Double',
										},
									},
									{
										kind: 'equal',
										left: { kind: 'field', path: 'throw.hitLocation' },
										right: {
											kind: 'constant',
											valueType: 'integer',
											value: 50,
										},
									},
								],
							},
						],
					},
				},
			},
		};
		expect(restoreAchievementTemplateDraft(template([ winningThrowVersion ]))?.rule)
			.toMatchObject({
				children: [ {
					type: 'winningThrow',
					throwType: 'double',
				} ],
			});
	});

	it('compiles an exact single winning throw target', () => {
		const result = compileAchievementTemplate(draft({
			id: 'winning-single-16',
			type: 'winningThrow',
			hitLocation: value('constant', '16'),
			throwType: 'single',
		}));

		expect(result.definition).toMatchObject({
			root: {
				kind: 'any',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'any',
					collection: { kind: 'field', path: 'round.throws' },
					predicate: {
						kind: 'and',
						operands: [
							{ kind: 'field', path: 'throw.isVictoryThrow' },
							{
								kind: 'equal',
								left: { kind: 'field', path: 'throw.throwType' },
								right: {
									kind: 'constant',
									valueType: 'throwType',
									value: 'Single',
								},
							},
							{
								kind: 'equal',
								left: { kind: 'field', path: 'throw.hitLocation' },
								right: {
									kind: 'constant',
									valueType: 'integer',
									value: 16,
								},
							},
						],
					},
				},
			},
		});

		const restoredVersion = version(
			'00000000-0000-0000-0000-000000000013',
			1,
			'Published',
			'Finish With Single 16',
		);
		restoredVersion.definition = result.definition;
		expect(restoreAchievementTemplateDraft(template([ restoredVersion ]))?.rule)
			.toMatchObject({
				type: 'winningThrow',
				hitLocation: { source: 'constant', value: '16' },
				throwType: 'single',
			});
	});

	it('restores game-wide throw restrictions as editable count comparisons', () => {
		const seededVersion = version(
			'00000000-0000-0000-0000-000000000011',
			1,
			'Published',
			'No Multipliers Needed',
		);
		seededVersion.definition = {
			version: 1,
			root: {
				kind: 'all',
				collection: { kind: 'field', path: 'rounds' },
				predicate: {
					kind: 'all',
					collection: { kind: 'field', path: 'round.throws' },
					predicate: {
						kind: 'and',
						operands: [ 'Double', 'Triple' ].map(throwType => ({
							kind: 'notEqual',
							left: { kind: 'field', path: 'throw.throwType' },
							right: {
								kind: 'constant',
								valueType: 'throwType',
								value: throwType,
							},
						})),
					},
				},
			},
		};

		expect(restoreAchievementTemplateDraft(template([ seededVersion ]))?.rule)
			.toMatchObject({
				type: 'all',
				children: [
					{ type: 'compare', left: { source: 'game.doubleCount' } },
					{ type: 'compare', left: { source: 'game.tripleCount' } },
				],
			});
	});

	it('restores legacy modifier checks as native comparison blocks', () => {
		const seededVersion = version(
			'00000000-0000-0000-0000-000000000011',
			1,
			'Published',
			'Score At Least {threshold} (Raw)',
		);
		seededVersion.parameters = [ {
			name: 'threshold',
			kind: 'IntegerSet',
			minimum: null,
			maximum: null,
			step: 1,
			integerValues: [ 100 ],
			stringValues: [],
			booleanValues: [],
		} ];
		const root = {
			kind: 'any',
			collection: { kind: 'field', path: 'rounds' },
			predicate: {
				kind: 'and',
				operands: [
					{
						kind: 'or',
						operands: [ 'Valid', 'Victory' ].map(status => ({
							kind: 'equal',
							left: { kind: 'field', path: 'round.status' },
							right: { kind: 'status', value: status },
						})),
					},
					{
						kind: 'greaterThanOrEqual',
						left: {
							kind: 'sum',
							collection: { kind: 'field', path: 'round.throws' },
							selector: { kind: 'field', path: 'throw.finalPoints' },
						},
						right: { kind: 'parameter', name: 'threshold' },
					},
					{
						kind: 'all',
						collection: { kind: 'field', path: 'round.throws' },
						predicate: {
							kind: 'equal',
							left: { kind: 'field', path: 'throw.modifierCount' },
							right: { kind: 'constant', valueType: 'integer', value: 0 },
						},
					},
				],
			},
		};
		seededVersion.definition = { version: 1, root };

		const restored = restoreAchievementTemplateDraft(template([ seededVersion ]));

		expect(restored?.rule).toMatchObject({
			type: 'all',
			children: [ {
				type: 'round',
				condition: {
					type: 'all',
					children: [
						{ type: 'compare' },
						{
							type: 'compare',
							left: { source: 'round.modifiedThrowCount' },
							operator: 'equal',
							right: { source: 'constant', value: '0' },
						},
					],
				},
			} ],
		});
		const compiledRoot = compileAchievementTemplate(restored!).definition['root'];
		const serializedRoot = JSON.stringify(compiledRoot);
		expect(serializedRoot).toContain(
			JSON.stringify({
				kind: 'greaterThan',
				left: { kind: 'field', path: 'throw.modifierCount' },
				right: { kind: 'constant', valueType: 'integer', value: 0 },
			}),
		);
		expect(serializedRoot).not.toContain('"type":"raw"');

		seededVersion.definition = { version: 1, root: compiledRoot };
		const roundTripped = restoreAchievementTemplateDraft(template([ seededVersion ]));
		const restoredRound = roundTripped?.rule.type === 'all'
			? roundTripped.rule.children[0]
			: undefined;
		const restoredConditions = restoredRound?.type === 'round'
			&& (restoredRound.condition.type === 'all' || restoredRound.condition.type === 'any')
			? restoredRound.condition.children
			: [];
		expect(restoredConditions).toEqual(expect.arrayContaining([
			expect.objectContaining({
				type: 'compare',
				left: { source: 'round.modifiedThrowCount', value: '' },
			}),
		]));
	});

	it('only counts played darts in throw-count blocks', () => {
		const request = compileAchievementTemplate(draft(roundRule({
			id: 'count',
			type: 'throwCount',
			throwType: 'any',
			operator: 'greaterThanOrEqual',
			count: value('constant', '2'),
		})));
		expect(JSON.stringify(request.definition['root'])).toContain(JSON.stringify({
			kind: 'count',
			collection: { kind: 'field', path: 'round.throws' },
			predicate: { kind: 'field', path: 'throw.isPlayed' },
		}));
	});

	it('deduplicates set parameter values', () => {
		const request = compileAchievementTemplate(draft({ id: 'root', type: 'all', children: [] }, {
			parameters: [ {
				id: 'n',
				key: 'n',
				valueType: 'integer',
				generatorType: 'set',
				values: [ '1', '2', '1' ],
			} ],
		}));
		expect(request.parameters[0]?.integerValues).toEqual([ 1, 2 ]);
	});

	it('keeps the stored editor tree only while it matches the executable root', () => {
		const editorRule: AchievementRuleDraft = {
			id: 'editor-root',
			type: 'all',
			children: [ {
				id: 'editor-compare',
				type: 'compare',
				left: value('game.roundsPlayed', ''),
				operator: 'lessThanOrEqual',
				right: value('constant', '5'),
			} ],
		};
		const compiled = compileAchievementTemplate(draft(editorRule)).definition;
		const matching = version('matching', 1, 'Draft', 'Matching');
		matching.definition = compiled;
		expect(restoreAchievementTemplateDraft(template([ matching ]))?.rule).toEqual(editorRule);

		const drifted = version('drifted', 1, 'Draft', 'Drifted');
		drifted.definition = {
			...compiled,
			root: {
				kind: 'greaterThan',
				left: compiled['root'] && (compiled['root'] as { operands: { left: unknown; }[]; }).operands[0]!.left,
				right: { kind: 'constant', valueType: 'integer', value: 9 },
			},
		};
		const restored = restoreAchievementTemplateDraft(template([ drifted ]))?.rule;
		expect(restored?.id).not.toBe('editor-root');
		expect(JSON.stringify(restored)).toContain('"operator":"greaterThan"');
		expect(JSON.stringify(restored)).toContain('"value":"9"');
	});
});
