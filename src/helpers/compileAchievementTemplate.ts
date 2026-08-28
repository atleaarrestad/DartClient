import {
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementValueDraft,
} from '../models/achievementBuilder.js';
import type {
	AchievementParameterDefinition,
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
	UpsertAchievementTemplateRequest,
} from '../models/achievementBuilderApi.js';

type AstNode = Record<string, unknown>;
type CompileScope = 'root' | 'round' | 'throw';

const field = (path: string): AstNode => ({ kind: 'field', path });
const integer = (value: number): AstNode => ({
	kind: 'constant',
	valueType: 'integer',
	value,
});
const throwType = (value: string): AstNode => ({
	kind: 'constant',
	valueType: 'throwType',
	value,
});
const status = (value: string): AstNode => ({ kind: 'status', value });
const equal = (left: AstNode, right: AstNode): AstNode => ({
	kind: 'equal',
	left,
	right,
});
const isPlayed = (): AstNode => field('throw.isPlayed');
const not = (operand: AstNode): AstNode => ({ kind: 'not', operand });
const and = (...operands: AstNode[]): AstNode => ({ kind: 'and', operands });
const or = (...operands: AstNode[]): AstNode => ({ kind: 'or', operands });

const statusNames: Record<string, string> = {
	valid: 'Valid',
	victory: 'Victory',
	overshoot: 'Overshoot',
	failedWinCondition: 'WinConditionFailed',
};

const throwTypeNames: Record<string, string> = {
	single: 'Single',
	double: 'Double',
	triple: 'Triple',
	rim: 'Rim',
	miss: 'Miss',
};

function compileValue(value: AchievementValueDraft): AstNode {
	switch (value.source) {
	case 'constant':
		return integer(Number(value.value));
	case 'parameter':
		return { kind: 'parameter', name: value.value };
	case 'board.leftNeighbor':
	case 'board.rightNeighbor':
		return {
			kind: 'boardNeighbor',
			number: { kind: 'parameter', name: value.value },
			offset: value.source === 'board.leftNeighbor' ? -1 : 1,
		};
	case 'round.throwCount':
		return {
			kind: 'count',
			collection: field('round.throws'),
			predicate: isPlayed(),
		};
	case 'round.finalPoints':
		return {
			kind: 'sum',
			collection: field('round.throws'),
			selector: field('throw.finalPoints'),
			predicate: isPlayed(),
		};
	case 'round.rawPointsDistinctCount':
		return {
			kind: 'distinctCount',
			collection: field('round.throws'),
			selector: field('throw.rawPoints'),
			predicate: isPlayed(),
		};
	case 'round.singleCount':
	case 'round.doubleCount':
	case 'round.tripleCount': {
		const type = value.source.split('.')[1]?.replace('Count', '') ?? '';
		return {
			kind: 'count',
			collection: field('round.throws'),
			predicate: and(
				isPlayed(),
				equal(field('throw.throwType'), throwType(
					type.charAt(0).toUpperCase() + type.slice(1),
				)),
			),
		};
	}
	case 'game.roundsPlayed':
		return {
			kind: 'count',
			collection: field('rounds'),
			predicate: {
				kind: 'notEqual',
				left: field('round.status'),
				right: status('Unplayed'),
			},
		};
	case 'game.placement':
		return field('placement');
	case 'game.overshootCount':
		return {
			kind: 'count',
			collection: field('rounds'),
			predicate: equal(field('round.status'), status('Overshoot')),
		};
	case 'game.rimCount':
	case 'game.missCount':
		return {
			kind: 'sum',
			collection: field('rounds'),
			selector: {
				kind: 'count',
				collection: field('round.throws'),
				predicate: and(
					isPlayed(),
					equal(
						field('throw.throwType'),
						throwType(value.source === 'game.rimCount' ? 'Rim' : 'Miss'),
					),
				),
			},
		};
	case 'round.minimumRawPoints':
		throw new Error('Minimum raw points can only be used in a comparison.');
	}
}

function compileThrowRule(rule: Extract<AchievementRuleDraft, { type: 'throw'; }>): AstNode {
	const operands: AstNode[] = [];
	if (rule.throwType !== 'any') {
		operands.push(equal(
			field('throw.throwType'),
			throwType(throwTypeNames[rule.throwType] ?? rule.throwType),
		));
	}
	operands.push(equal(field('throw.hitLocation'), compileValue(rule.hitLocation)));
	const hitPredicate = operands.length === 1
		? operands[0]!
		: { kind: 'and', operands };
	const predicate = and(isPlayed(), hitPredicate);
	if (rule.quantifier === 'all') {
		return and(
			{
				kind: 'any',
				collection: field('round.throws'),
				predicate: isPlayed(),
			},
			{
				kind: 'all',
				collection: field('round.throws'),
				predicate: or(not(isPlayed()), hitPredicate),
			},
		);
	}
	return {
		kind: 'any',
		collection: field('round.throws'),
		predicate,
	};
}

function compileComparison(
	rule: Extract<AchievementRuleDraft, { type: 'compare'; }>,
): AstNode {
	if (rule.left.source === 'round.minimumRawPoints') {
		return and(
			{
				kind: 'any',
				collection: field('round.throws'),
				predicate: isPlayed(),
			},
			{
				kind: 'all',
				collection: field('round.throws'),
				predicate: or(
					not(isPlayed()),
					{
						kind: rule.operator,
						left: field('throw.rawPoints'),
						right: compileValue(rule.right),
					},
				),
			},
		);
	}

	return {
		kind: rule.operator,
		left: compileValue(rule.left),
		right: compileValue(rule.right),
	};
}

function compileSequence(
	rule: Extract<AchievementRuleDraft, { type: 'sequence'; }>,
): AstNode {
	if (rule.scope !== 'sameRound')
		throw new Error('Ordered sequences across multiple rounds are not supported.');

	return {
		kind: 'sequence',
		collection: field('round.throws'),
		items: rule.targets.map(target => {
			const operands: AstNode[] = [
				isPlayed(),
				equal(field('throw.hitLocation'), compileValue(target.hitLocation)),
			];
			if (target.throwType === 'anyScoring') {
				operands.push(or(
					equal(field('throw.throwType'), throwType('Single')),
					equal(field('throw.throwType'), throwType('Double')),
					equal(field('throw.throwType'), throwType('Triple')),
				));
			}
			else {
				operands.push(equal(
					field('throw.throwType'),
					throwType(throwTypeNames[target.throwType] ?? target.throwType),
				));
			}
			return operands.length === 1
				? operands[0]!
				: { kind: 'and', operands };
		}),
	};
}

function compileRule(rule: AchievementRuleDraft, scope: CompileScope): AstNode {
	switch (rule.type) {
	case 'all':
		return { kind: 'and', operands: rule.children.map(child => compileRule(child, scope)) };
	case 'any':
		return { kind: 'or', operands: rule.children.map(child => compileRule(child, scope)) };
	case 'not':
		return { kind: 'not', operand: compileRule(rule.child, scope) };
	case 'round': {
		const statusConditions = rule.statuses.map(item =>
			equal(field('round.status'), status(statusNames[item] ?? item)));
		const statusCondition = statusConditions.length === 1
			? statusConditions[0]!
			: { kind: 'or', operands: statusConditions };
		const roundCondition = compileRule(rule.condition, 'round');
		if (rule.quantifier === 'all') {
			return and(
				{
					kind: 'any',
					collection: field('rounds'),
					predicate: statusCondition,
				},
				{
					kind: 'all',
					collection: field('rounds'),
					predicate: or(not(statusCondition), roundCondition),
				},
			);
		}
		return {
			kind: 'any',
			collection: field('rounds'),
			predicate: and(statusCondition, roundCondition),
		};
	}
	case 'throw':
		if (scope !== 'round')
			throw new Error('Throw blocks must be nested inside a round block.');
		return compileThrowRule(rule);
	case 'compare':
		return compileComparison(rule);
	case 'sequence':
		if (scope !== 'round')
			throw new Error('Sequence blocks must be nested inside a round block.');
		return compileSequence(rule);
	}
}

function compileParameters(draft: AchievementTemplateDraft): AchievementParameterDefinition[] {
	return draft.parameters.map(parameter => {
		const common = {
			name: parameter.key,
			minimum: null,
			maximum: null,
			step: parameter.step ?? 1,
			integerValues: [] as number[],
			stringValues: [] as string[],
			booleanValues: [] as boolean[],
		};
		if (parameter.generatorType === 'range') {
			return {
				...common,
				kind: 'IntegerRange' as const,
				minimum: parameter.minimum ?? null,
				maximum: parameter.maximum ?? null,
			};
		}
		if (parameter.valueType === 'integer') {
			return {
				...common,
				kind: 'IntegerSet' as const,
				integerValues: parameter.values.map(Number),
			};
		}
		if (parameter.valueType === 'boolean') {
			return {
				...common,
				kind: 'BooleanSet' as const,
				booleanValues: parameter.values.map(value => value.toLowerCase() === 'true'),
			};
		}
		return {
			...common,
			kind: 'StringSet' as const,
			stringValues: parameter.values,
		};
	});
}

export function compileAchievementTemplate(
	draft: AchievementTemplateDraft,
): UpsertAchievementTemplateRequest {
	const definition = draft.achievementScope === 'progression'
		? {
			version: 1,
			editor: {
				rule: draft.rule,
				progression: draft.progression,
			},
			reducers: [
				{
					kind: 'collectHitSegments',
					statuses: (draft.progression?.statuses ?? [ 'valid', 'victory' ])
						.map(item => statusNames[item] ?? item),
				},
			],
			root: {
				kind: 'and',
				operands: (draft.progression?.targets ?? []).map(target => ({
					kind: 'hasHitSegment',
					hitLocation: compileValue(target.hitLocation),
					throwType: throwType(
						throwTypeNames[target.throwType] ?? target.throwType,
					),
				})),
			},
		}
		: {
			version: 1,
			editor: {
				rule: draft.rule,
				progression: draft.progression,
			},
			root: compileRule(draft.rule, 'root'),
		};

	return {
		seasonId: draft.seasonId,
		nameTemplate: draft.nameTemplate.trim(),
		descriptionTemplate: draft.descriptionTemplate.trim(),
		category: draft.category.trim(),
		achievementTier: draft.tier,
		evaluationPhase: draft.achievementScope === 'progression'
			? 'Progression'
			: 'Live',
		parameters: compileParameters(draft),
		definition,
	};
}

function getEditableVersion(
	template: AchievementTemplateResponse,
): AchievementTemplateVersionResponse | undefined {
	return template.versions.find(version => version.status === 'Draft')
		?? template.versions[0];
}

function restoreParameters(
	parameters: AchievementParameterDefinition[],
): AchievementTemplateDraft['parameters'] {
	return parameters.map(parameter => {
		const common = {
			id: globalThis.crypto.randomUUID(),
			key: parameter.name,
			values: [] as string[],
		};
		switch (parameter.kind) {
		case 'IntegerRange':
			return {
				...common,
				valueType: 'integer' as const,
				generatorType: 'range' as const,
				minimum: parameter.minimum ?? undefined,
				maximum: parameter.maximum ?? undefined,
				step: parameter.step,
			};
		case 'IntegerSet':
			return {
				...common,
				valueType: 'integer' as const,
				generatorType: 'set' as const,
				values: parameter.integerValues.map(String),
			};
		case 'BooleanSet':
			return {
				...common,
				valueType: 'boolean' as const,
				generatorType: 'set' as const,
				values: parameter.booleanValues.map(String),
			};
		case 'StringSet':
			return {
				...common,
				valueType: 'string' as const,
				generatorType: 'set' as const,
				values: parameter.stringValues,
			};
		}
	});
}

function getStoredEditor(
	version: AchievementTemplateVersionResponse,
): Record<string, unknown> | undefined {
	const editor = version.definition['editor'];
	if (!editor || typeof editor !== 'object')
		return undefined;

	return editor as Record<string, unknown>;
}

function getStoredEditorRule(
	editor: Record<string, unknown> | undefined,
): AchievementRuleDraft | undefined {
	const rule = editor?.['rule'];
	if (!rule || typeof rule !== 'object' || typeof (rule as { type?: unknown }).type !== 'string')
		return undefined;

	return structuredClone(rule) as AchievementRuleDraft;
}

export function restoreAchievementTemplateDraft(
	template: AchievementTemplateResponse,
): AchievementTemplateDraft | undefined {
	const version = getEditableVersion(template);
	if (!version)
		return undefined;
	const editor = getStoredEditor(version);
	return {
		id: template.id,
		seasonId: template.seasonId,
		nameTemplate: version.nameTemplate,
		descriptionTemplate: version.descriptionTemplate,
		category: version.category,
		tier: version.achievementTier,
		achievementScope: version.evaluationPhase === 'Progression'
			? 'progression'
			: 'session',
		parameters: restoreParameters(version.parameters),
		rule: getStoredEditorRule(editor) ?? {
			id: globalThis.crypto.randomUUID(),
			type: 'all',
			children: [],
		},
		progression: editor?.['progression']
			? structuredClone(editor['progression']) as AchievementTemplateDraft['progression']
			: undefined,
	};
}
