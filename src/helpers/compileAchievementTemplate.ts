import {
	achievementComparisonOperators,
	AchievementComparisonOperator,
	AchievementProgressionDraft,
	AchievementRoundRuleDraft,
	AchievementRoundStatus,
	AchievementRuleDraft,
	AchievementRuleScope,
	AchievementSequenceTargetDraft,
	AchievementTemplateDraft,
	AchievementThrowRuleDraft,
	AchievementThrowType,
	achievementThrowTypeNames,
	AchievementValueDraft,
	AchievementValueSource,
	createAchievementBuilderId,
	createDefaultAchievementProgression,
	createDefaultAchievementRule,
	getRulePlacementError,
	sequenceTargetCount,
	throwTypeHasHitLocation,
} from '../models/achievementBuilder.js';
import type {
	AchievementParameterDefinition,
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
	UpsertAchievementTemplateRequest,
} from '../models/achievementBuilderApi.js';
import { compileVariantRules, restoreVariantRules, variantsPropertyName } from './achievementVariantRules.js';

type AstNode = Record<string, unknown>;

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

// Draft names on the left, backend AST names on the right.
const statusNames: Record<AchievementRoundStatus, string> = {
	valid:              'Valid',
	victory:            'Victory',
	overshoot:          'Overshoot',
	failedWinCondition: 'WinConditionFailed',
};

const throwTypeNames = achievementThrowTypeNames;

type DraftThrowType = AchievementThrowType;

const roundStatusCountSources = {
	valid:              'game.validRoundCount',
	victory:            'game.victoryCount',
	overshoot:          'game.overshootCount',
	failedWinCondition: 'game.failedWinConditionCount',
} as const satisfies Record<AchievementRoundStatus, AchievementValueSource>;

const roundThrowCountSources = {
	single: 'round.singleCount',
	double: 'round.doubleCount',
	triple: 'round.tripleCount',
} as const satisfies Partial<Record<DraftThrowType, AchievementValueSource>>;

const gameThrowCountSources = {
	double: 'game.doubleCount',
	triple: 'game.tripleCount',
	rim:    'game.rimCount',
	miss:   'game.missCount',
} as const satisfies Partial<Record<DraftThrowType, AchievementValueSource>>;

const comparisonOperators: readonly string[] = achievementComparisonOperators;

const invert = <TKey extends string, TValue extends string>(
	record: Record<TKey, TValue>,
): Record<TValue, TKey> => Object.fromEntries(
	Object.entries(record).map(([ key, value ]) => [ value, key ]),
) as Record<TValue, TKey>;

const statusByName = invert(statusNames);
const throwTypeByName = invert(throwTypeNames);
const statusByCountSource = invert(roundStatusCountSources);
const throwTypeByRoundCountSource = invert(roundThrowCountSources);
const throwTypeByGameCountSource = invert(gameThrowCountSources);

/** Looks up an untrusted key without falling through to Object.prototype members. */
const lookup = <TRecord extends object>(
	record: TRecord,
	key: unknown,
): TRecord[keyof TRecord] | undefined =>
	typeof key === 'string' && Object.hasOwn(record, key)
		? record[key as keyof TRecord]
		: undefined;

const isComparisonOperator = (kind: string | undefined): kind is AchievementComparisonOperator =>
	kind !== undefined && comparisonOperators.includes(kind);

function compileValue(value: AchievementValueDraft): AstNode {
	switch (value.source) {
	case 'constant':
		return integer(Number(value.value));
	case 'parameter':
		return { kind: 'parameter', name: value.value };
	case 'parameter.offset': {
		const offset = Math.trunc(value.offset ?? 0);
		if (offset === 0)
			return { kind: 'parameter', name: value.value };
		return {
			kind: offset > 0 ? 'add' : 'subtract',
			left: { kind: 'parameter', name: value.value },
			right: integer(Math.abs(offset)),
		};
	}
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
	case 'round.modifiedThrowCount':
		return {
			kind: 'count',
			collection: field('round.throws'),
			predicate: {
				kind: 'greaterThan',
				left: field('throw.modifierCount'),
				right: integer(0),
			},
		};
	case 'round.number':
		return {
			kind: 'add',
			left: field('round.index'),
			right: integer(1),
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
	case 'round.tripleCount':
		return {
			kind: 'count',
			collection: field('round.throws'),
			predicate: and(
				isPlayed(),
				equal(
					field('throw.throwType'),
					throwType(throwTypeNames[throwTypeByRoundCountSource[value.source]]),
				),
			),
		};
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
	case 'game.validRoundCount':
	case 'game.victoryCount':
	case 'game.overshootCount':
	case 'game.failedWinConditionCount':
		return {
			kind: 'count',
			collection: field('rounds'),
			predicate: equal(
				field('round.status'),
				status(statusNames[statusByCountSource[value.source]]),
			),
		};
	case 'game.doubleCount':
	case 'game.tripleCount':
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
						throwType(throwTypeNames[throwTypeByGameCountSource[value.source]]),
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
			throwType(throwTypeNames[rule.throwType]),
		));
	}
	if (rule.hitLocation) {
		operands.push(equal(
			field('throw.hitLocation'),
			compileValue(rule.hitLocation),
		));
	}
	if (operands.length === 0)
		throw new Error('Throw blocks need a location or throw type.');
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

function compileThrowCountRule(
	rule: Extract<AchievementRuleDraft, { type: 'throwCount'; }>,
): AstNode {
	const operands: AstNode[] = [ isPlayed() ];
	if (rule.hitLocation) {
		operands.push(equal(
			field('throw.hitLocation'),
			compileValue(rule.hitLocation),
		));
	}
	if (rule.throwType !== 'any') {
		operands.push(equal(
			field('throw.throwType'),
			throwType(throwTypeNames[rule.throwType]),
		));
	}
	return {
		kind: rule.operator,
		left: {
			kind: 'count',
			collection: field('round.throws'),
			predicate: operands.length === 1 ? operands[0]! : and(...operands),
		},
		right: compileValue(rule.count),
	};
}

function compileWinningThrowRule(
	rule: Extract<AchievementRuleDraft, { type: 'winningThrow'; }>,
): AstNode {
	const conditions: AstNode[] = [ field('throw.isVictoryThrow') ];
	if (rule.throwType !== 'any') {
		conditions.push(rule.throwType === 'double'
			? or(
				equal(field('throw.throwType'), throwType('Double')),
				equal(field('throw.hitLocation'), integer(50)),
			)
			: equal(
				field('throw.throwType'),
				throwType(throwTypeNames[rule.throwType]),
			));
	}
	if (rule.hitLocation) {
		conditions.push(equal(
			field('throw.hitLocation'),
			compileValue(rule.hitLocation),
		));
	}
	return {
		kind: 'any',
		collection: field('rounds'),
		predicate: {
			kind: 'any',
			collection: field('round.throws'),
			predicate: and(...conditions),
		},
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
			const operands: AstNode[] = [ isPlayed() ];
			if (throwTypeHasHitLocation(target.throwType)) {
				operands.push(
					equal(field('throw.hitLocation'), compileValue(target.hitLocation)),
				);
			}
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
					throwType(throwTypeNames[target.throwType]),
				));
			}
			return operands.length === 1
				? operands[0]!
				: { kind: 'and', operands };
		}),
	};
}

type ChildCompiler = (rule: AchievementRuleDraft, scope: AchievementRuleScope) => AstNode;

/**
 * Compiles a block. Nested blocks go through `compileChild`, which restore verification
 * swaps out to check a block against stored logic one level at a time.
 */
function compileRule(
	rule: AchievementRuleDraft,
	scope: AchievementRuleScope,
	compileChild: ChildCompiler = compileRule,
): AstNode {
	const placementError = getRulePlacementError(rule.type, scope);
	if (placementError)
		throw new Error(placementError);

	switch (rule.type) {
	case 'all':
		return { kind: 'and', operands: rule.children.map(child => compileChild(child, scope)) };
	case 'any':
		return { kind: 'or', operands: rule.children.map(child => compileChild(child, scope)) };
	case 'not':
		return { kind: 'not', operand: compileChild(rule.child, scope) };
	case 'round': {
		const statusConditions = rule.statuses.map(item =>
			equal(field('round.status'), status(statusNames[item])));
		const statusCondition = statusConditions.length === 1
			? statusConditions[0]!
			: { kind: 'or', operands: statusConditions };
		const roundCondition = compileChild(rule.condition, 'round');
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
		return compileThrowRule(rule);
	case 'compare':
		return compileComparison(rule);
	case 'throwCount':
		return compileThrowCountRule(rule);
	case 'winningThrow':
		return compileWinningThrowRule(rule);
	case 'sequence':
		return compileSequence(rule);
	case 'raw':
		return structuredClone(rule.ast);
	}
}

function compileParameters(draft: AchievementTemplateDraft): AchievementParameterDefinition[] {
	const unique = <T>(values: T[]): T[] => [ ...new Set(values) ];
	return draft.parameters.map(parameter => {
		const common = {
			name: parameter.key.trim(),
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
				integerValues: unique(parameter.values.map(Number)),
			};
		}
		if (parameter.valueType === 'boolean') {
			return {
				...common,
				kind: 'BooleanSet' as const,
				booleanValues: unique(parameter.values.map(value => value.toLowerCase() === 'true')),
			};
		}
		return {
			...common,
			kind: 'StringSet' as const,
			stringValues: unique(parameter.values),
		};
	});
}

function compileProgressionReducers(progression: AchievementProgressionDraft): AstNode[] {
	return [
		{
			kind: 'collectHitSegments',
			statuses: progression.statuses.map(item => statusNames[item]),
		},
	];
}

function compileProgressionRoot(progression: AchievementProgressionDraft): AstNode {
	return {
		kind: 'and',
		operands: progression.targets.map(target => ({
			kind: 'hasHitSegment',
			hitLocation: compileValue(target.hitLocation),
			throwType: throwType(throwTypeNames[target.throwType]),
		})),
	};
}

/** The editor's copy of the progression. Raw logic already is the definition, so it is left out. */
function getEditorProgression(
	progression: AchievementProgressionDraft | undefined,
): AchievementProgressionDraft | undefined {
	if (!progression)
		return undefined;

	const editorProgression = { ...progression };
	delete editorProgression.raw;

	return editorProgression;
}

export function compileAchievementTemplate(
	draft: AchievementTemplateDraft,
): UpsertAchievementTemplateRequest {
	const progression = draft.progression ?? createDefaultAchievementProgression();
	const editor = {
		rule: draft.rule,
		progression: getEditorProgression(draft.progression),
	};
	const variants = compileVariantRules(draft);
	const header = {
		version: 1,
		editor,
		...variants ? { [variantsPropertyName]: variants } : {},
	};
	const definition = draft.achievementScope === 'progression'
		? {
			...header,
			reducers: progression.raw
				? structuredClone(progression.raw.reducers)
				: compileProgressionReducers(progression),
			root: progression.raw
				? structuredClone(progression.raw.root)
				: compileProgressionRoot(progression),
		}
		: {
			...header,
			root: compileRule(draft.rule, 'root'),
		};

	return {
		seasonId: draft.seasonId,
		nameTemplate: draft.nameTemplate.trim(),
		descriptionTemplate: draft.descriptionTemplate.trim(),
		categoryId: draft.categoryId,
		achievementTier: draft.tier,
		evaluationPhase: draft.achievementScope === 'progression'
			? 'Progression'
			: 'Live',
		parameters: compileParameters(draft),
		definition,
	};
}

export interface AchievementAstMeasure {
	nodeCount: number;
	maximumDepth: number;
	maximumQuantifierDepth: number;
}

const quantifierKinds = new Set([ 'any', 'all', 'count', 'sequence', 'sum', 'distinctCount' ]);

const isAstNode = (value: unknown): value is AstNode =>
	!!value && typeof value === 'object' && !Array.isArray(value)
	&& typeof (value as AstNode)['kind'] === 'string';

/**
 * Measures a compiled AST the way the backend parser does: the root is at depth 1, every
 * nested node is one level deeper, and everything a quantifier evaluates per item (all
 * but its collection) is one quantifier level deeper. Progression reducers count as well:
 * each reducer is one node at depth 1, and its `amount` and `when` expressions start at
 * depth 2 outside any quantifier.
 */
export function measureAchievementAst(root: unknown, reducers?: unknown): AchievementAstMeasure {
	const measure: AchievementAstMeasure = { nodeCount: 0, maximumDepth: 0, maximumQuantifierDepth: 0 };
	const visit = (node: unknown, depth: number, quantifierDepth: number): void => {
		if (!isAstNode(node))
			return;

		measure.nodeCount++;
		measure.maximumDepth = Math.max(measure.maximumDepth, depth);
		const isQuantifier = quantifierKinds.has(node['kind'] as string);
		if (isQuantifier)
			measure.maximumQuantifierDepth = Math.max(measure.maximumQuantifierDepth, quantifierDepth + 1);

		for (const [ key, value ] of Object.entries(node)) {
			const childQuantifierDepth = isQuantifier && key !== 'collection'
				? quantifierDepth + 1
				: quantifierDepth;
			for (const child of Array.isArray(value) ? value : [ value ])
				visit(child, depth + 1, childQuantifierDepth);
		}
	};
	visit(root, 1, 0);
	for (const reducer of Array.isArray(reducers) ? reducers : []) {
		measure.nodeCount++;
		measure.maximumDepth = Math.max(measure.maximumDepth, 1);
		if (reducer && typeof reducer === 'object') {
			visit((reducer as AstNode)['amount'], 2, 0);
			visit((reducer as AstNode)['when'], 2, 0);
		}
	}

	return measure;
}

/** The requested version, or else the draft, or else the latest version. */
export function getEditableVersion(
	template: AchievementTemplateResponse,
	versionId?: string,
): AchievementTemplateVersionResponse | undefined {
	const versions = [ ...template.versions ]
		.sort((left, right) => right.versionNumber - left.versionNumber);
	return versionId
		? versions.find(version => version.id === versionId)
		: versions.find(version => version.status === 'Draft')
			?? versions[0];
}

function restoreParameters(
	parameters: AchievementParameterDefinition[],
): AchievementTemplateDraft['parameters'] {
	return parameters.map(parameter => {
		const common = {
			id: createAchievementBuilderId(),
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

function getAstNode(value: unknown): AstNode | undefined {
	return value && typeof value === 'object'
		? value as AstNode
		: undefined;
}

function getAstKind(node: AstNode | undefined): string | undefined {
	return typeof node?.['kind'] === 'string'
		? node['kind']
		: undefined;
}

function getAstOperands(node: AstNode | undefined): AstNode[] {
	return Array.isArray(node?.['operands'])
		? node['operands'].map(getAstNode).filter(item => item !== undefined)
		: [];
}

/** The operands of an `and` node with nested `and`s flattened, or the node itself. */
function andOperands(node: AstNode | undefined): AstNode[] {
	if (getAstKind(node) === 'and')
		return getAstOperands(node).flatMap(andOperands);

	return node ? [ node ] : [];
}

function isField(node: AstNode | undefined, path: string): boolean {
	return getAstKind(node) === 'field' && node?.['path'] === path;
}

function getThrowTypeValue(node: AstNode | undefined): string | undefined {
	const typeOperand = andOperands(node).find(operand =>
		getAstKind(operand) === 'equal'
		&& isField(getAstNode(operand['left']), 'throw.throwType'));
	const value = getAstNode(typeOperand?.['right']);
	return getAstKind(value) === 'constant'
		&& value?.['valueType'] === 'throwType'
		&& typeof value['value'] === 'string'
		? value['value']
		: undefined;
}

// Restoring turns stored logic back into editor blocks. The matchers below only propose a
// block; verifyRestoredRule keeps it only when it reproduces the stored node, so a block
// never shows (and, once saved, never runs) different logic than what is stored.

const booleanConstant = (value: boolean): AstNode => ({
	kind: 'constant',
	valueType: 'boolean',
	value,
});

const isBooleanConstant = (node: unknown, value: boolean): boolean => {
	const astNode = getAstNode(node);

	return getAstKind(astNode) === 'constant'
		&& astNode?.['valueType'] === 'boolean'
		&& astNode['value'] === value;
};

/** JSON with sorted keys and without undefined members, so equal ASTs serialize equally. */
function canonicalAstJson(value: unknown): string {
	if (Array.isArray(value))
		return `[${ value.map(canonicalAstJson).join(',') }]`;
	if (value && typeof value === 'object') {
		const members = Object.entries(value)
			.filter(([ , member ]) => member !== undefined)
			.sort(([ left ], [ right ]) => left < right ? -1 : left > right ? 1 : 0)
			.map(([ key, member ]) => `${ JSON.stringify(key) }:${ canonicalAstJson(member) }`);

		return `{${ members.join(',') }}`;
	}

	return JSON.stringify(value) ?? 'null';
}

/**
 * Rewrites an AST into the form restored blocks are compared in. Older stored logic leaves
 * out the played-dart guards the compiler adds, so every dart counts as played: the guard
 * becomes `true` and the constant parts it leaves behind are folded away (a round always
 * has its three dart slots, so `any` over them is `true`). `and`/`or` groups are flattened
 * and their operands sorted, which doesn't change what they mean.
 */
function normalizeAst(value: unknown): unknown {
	if (Array.isArray(value))
		return value.map(normalizeAst);
	if (!value || typeof value !== 'object')
		return value;
	if (isField(value as AstNode, 'throw.isPlayed'))
		return booleanConstant(true);

	const node: AstNode = Object.fromEntries(
		Object.entries(value)
			.filter(([ , member ]) => member !== undefined)
			.map(([ key, member ]) => [ key, normalizeAst(member) ]),
	);
	const kind = getAstKind(node);
	switch (kind) {
	case 'and':
	case 'or': {
		// `true` is the identity of `and` and absorbs `or`; `false` is the reverse.
		const identity = kind === 'and';
		const operands = getAstOperands(node)
			.flatMap(operand => getAstKind(operand) === kind ? getAstOperands(operand) : [ operand ]);
		if (operands.some(operand => isBooleanConstant(operand, !identity)))
			return booleanConstant(!identity);

		const remaining = operands.filter(operand => !isBooleanConstant(operand, identity));
		if (remaining.length === 0)
			return booleanConstant(identity);
		if (remaining.length === 1)
			return remaining[0];

		return {
			...node,
			operands: remaining
				.map(operand => ({ operand, key: canonicalAstJson(operand) }))
				.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
				.map(item => item.operand),
		};
	}
	case 'not':
		if (isBooleanConstant(node['operand'], true))
			return booleanConstant(false);
		if (isBooleanConstant(node['operand'], false))
			return booleanConstant(true);
		return node;
	case 'any':
		if (isBooleanConstant(node['predicate'], false))
			return booleanConstant(false);
		if (
			isBooleanConstant(node['predicate'], true)
			&& isField(getAstNode(node['collection']), 'round.throws')
		)
			return booleanConstant(true);
		return node;
	case 'all':
		return isBooleanConstant(node['predicate'], true) ? booleanConstant(true) : node;
	case 'count':
	case 'sum':
	case 'distinctCount':
		if (isBooleanConstant(node['predicate'], true))
			delete node['predicate'];
		return node;
	default:
		return node;
	}
}

function isEquivalentAst(left: unknown, right: unknown): boolean {
	return canonicalAstJson(normalizeAst(left)) === canonicalAstJson(normalizeAst(right));
}

const integerValue = (value: AchievementValueDraft): number | undefined =>
	value.source === 'constant' && /^-?\d+$/.test(value.value.trim())
		? Number(value.value)
		: undefined;

const isZeroComparison = (
	rule: AchievementRuleDraft,
	operator: AchievementComparisonOperator = 'equal',
): rule is Extract<AchievementRuleDraft, { type: 'compare'; }> =>
	rule.type === 'compare' && rule.operator === operator && integerValue(rule.right) === 0;

const roundStatusCondition = (statuses: string[]): AstNode => {
	const conditions = statuses.map(item => equal(field('round.status'), status(item)));

	return conditions.length === 1 ? conditions[0]! : or(...conditions);
};

/**
 * Older stored shapes a restored block stands for. These are written differently from
 * what the compiler emits for the block, but mean the same.
 */
function compileLegacyShape(rule: AchievementRuleDraft): AstNode | undefined {
	switch (rule.type) {
	case 'compare': {
		// Round number compared through the zero-based round index.
		if (rule.left.source === 'round.number') {
			const constant = integerValue(rule.right);
			const right = rule.right.source === 'parameter'
				? { kind: 'subtract', left: compileValue(rule.right), right: integer(1) }
				: constant === undefined ? undefined : integer(constant - 1);

			return right && { kind: rule.operator, left: field('round.index'), right };
		}
		// No dart in the round uses a seasonal modifier.
		if (rule.left.source === 'round.modifiedThrowCount' && isZeroComparison(rule)) {
			return {
				kind: 'all',
				collection: field('round.throws'),
				predicate: equal(field('throw.modifierCount'), integer(0)),
			};
		}
		// At least one round has the status.
		const countedStatus = lookup(statusByCountSource, rule.left.source);
		return countedStatus && isZeroComparison(rule, 'greaterThan')
			? {
				kind: 'any',
				collection: field('rounds'),
				predicate: equal(field('round.status'), status(statusNames[countedStatus])),
			}
			: undefined;
	}
	case 'any': {
		// At least one round has one of the statuses.
		const statuses = rule.children.map(child => child.type === 'compare' && isZeroComparison(child, 'greaterThan')
			? lookup(statusByCountSource, child.left.source)
			: undefined);
		return statuses.length > 0 && statuses.every(item => item !== undefined)
			? {
				kind: 'any',
				collection: field('rounds'),
				predicate: roundStatusCondition(statuses.map(item => statusNames[item!])),
			}
			: undefined;
	}
	case 'all': {
		const sources = rule.children.map(child => isZeroComparison(child) ? child.left.source : undefined);
		if (sources.length === 0 || sources.some(source => source === undefined))
			return undefined;

		// No round overshot or failed the win condition.
		if (
			sources.length === 2
			&& sources.includes('game.overshootCount')
			&& sources.includes('game.failedWinConditionCount')
		) {
			return {
				kind: 'all',
				collection: field('rounds'),
				predicate: roundStatusCondition([ 'Valid', 'Victory', 'Unplayed' ]),
			};
		}

		// No dart of the excluded types in the whole game.
		const excludedTypes = sources.map(source => lookup(throwTypeByGameCountSource, source));
		if (excludedTypes.some(type => type === undefined))
			return undefined;

		return {
			kind: 'all',
			collection: field('rounds'),
			predicate: {
				kind: 'all',
				collection: field('round.throws'),
				predicate: and(...excludedTypes.map(type => ({
					kind: 'notEqual',
					left: field('throw.throwType'),
					right: throwType(throwTypeNames[type!]),
				}))),
			},
		};
	}
	default:
		return undefined;
	}
}

/** Restored blocks mapped to the stored node each one was verified against. */
type RestoredSources = WeakMap<AchievementRuleDraft, AstNode>;

/**
 * Keeps a restored block only when compiling it reproduces the stored node, up to
 * normalizeAst. Nested blocks were verified on their own, so they stand in for their
 * stored nodes here and one block is checked at a time.
 */
function verifyRestoredRule(
	rule: AchievementRuleDraft,
	node: AstNode,
	scope: AchievementRuleScope,
	sources: RestoredSources,
): AchievementRuleDraft | undefined {
	const compileChild: ChildCompiler = (child, childScope) =>
		sources.get(child) ?? compileRule(child, childScope, compileChild);
	const expectations = [
		() => compileRule(rule, scope, compileChild),
		() => compileLegacyShape(rule),
	];
	const matches = expectations.some(expected => {
		try {
			const expectedNode = expected();

			return expectedNode !== undefined && isEquivalentAst(expectedNode, node);
		}
		catch {
			return false;
		}
	});
	if (!matches)
		return undefined;

	sources.set(rule, node);

	return rule;
}

function restoreAstValue(node: AstNode | undefined): AchievementValueDraft | undefined {
	const kind = getAstKind(node);
	switch (kind) {
	case 'constant':
		return node?.['valueType'] === 'integer' && typeof node['value'] === 'number'
			? { source: 'constant', value: String(node['value']) }
			: undefined;
	case 'parameter':
		return typeof node?.['name'] === 'string'
			? { source: 'parameter', value: node['name'] }
			: undefined;
	case 'add':
	case 'subtract': {
		const left = getAstNode(node?.['left']);
		const right = getAstNode(node?.['right']);
		if (
			kind === 'add'
			&& isField(left, 'round.index')
			&& getAstKind(right) === 'constant'
			&& right?.['valueType'] === 'integer'
			&& right['value'] === 1
		)
			return { source: 'round.number', value: '' };
		if (
			getAstKind(left) !== 'parameter'
			|| typeof left?.['name'] !== 'string'
			|| getAstKind(right) !== 'constant'
			|| right?.['valueType'] !== 'integer'
			|| typeof right['value'] !== 'number'
		)
			return undefined;
		return {
			source: 'parameter.offset',
			value: left['name'],
			offset: kind === 'add' ? right['value'] : -right['value'],
		};
	}
	case 'boardNeighbor': {
		const number = getAstNode(node?.['number']);
		const offset = node?.['offset'];
		if (
			getAstKind(number) !== 'parameter'
			|| typeof number?.['name'] !== 'string'
			|| (offset !== -1 && offset !== 1)
		)
			return undefined;
		return {
			source: offset === -1 ? 'board.leftNeighbor' : 'board.rightNeighbor',
			value: number['name'],
		};
	}
	case 'field':
		return isField(node, 'placement')
			? { source: 'game.placement', value: '' }
			: undefined;
	case 'count': {
		const collection = getAstNode(node?.['collection']);
		const predicate = getAstNode(node?.['predicate']);
		if (isField(collection, 'round.throws')) {
			if (!predicate || isField(predicate, 'throw.isPlayed'))
				return { source: 'round.throwCount', value: '' };
			if (
				getAstKind(predicate) === 'greaterThan'
				&& isField(getAstNode(predicate['left']), 'throw.modifierCount')
				&& getAstKind(getAstNode(predicate['right'])) === 'constant'
				&& getAstNode(predicate['right'])?.['valueType'] === 'integer'
				&& getAstNode(predicate['right'])?.['value'] === 0
			)
				return { source: 'round.modifiedThrowCount', value: '' };
			const source = lookup(
				roundThrowCountSources,
				lookup(throwTypeByName, getThrowTypeValue(predicate)),
			);
			return source ? { source, value: '' } : undefined;
		}
		if (isField(collection, 'rounds')) {
			if (
				getAstKind(predicate) === 'notEqual'
				&& isField(getAstNode(predicate?.['left']), 'round.status')
				&& getAstNode(predicate?.['right'])?.['value'] === 'Unplayed'
			)
				return { source: 'game.roundsPlayed', value: '' };
			const statuses = restoreStatusValues(predicate);
			if (statuses?.length === 1)
				return { source: roundStatusCountSources[statuses[0]!], value: '' };
		}
		return undefined;
	}
	case 'sum': {
		const collection = getAstNode(node?.['collection']);
		const selector = getAstNode(node?.['selector']);
		if (isField(collection, 'round.throws') && isField(selector, 'throw.finalPoints'))
			return { source: 'round.finalPoints', value: '' };
		if (isField(collection, 'rounds') && getAstKind(selector) === 'count') {
			const source = lookup(
				gameThrowCountSources,
				lookup(throwTypeByName, getThrowTypeValue(getAstNode(selector?.['predicate']))),
			);
			if (source)
				return { source, value: '' };
		}
		return undefined;
	}
	case 'distinctCount':
		return isField(getAstNode(node?.['collection']), 'round.throws')
			&& isField(getAstNode(node?.['selector']), 'throw.rawPoints')
			? { source: 'round.rawPointsDistinctCount', value: '' }
			: undefined;
	default:
		return undefined;
	}
}

function restoreStatusValues(node: AstNode | undefined): AchievementRoundRuleDraft['statuses']
	| undefined {
	if (getAstKind(node) === 'or') {
		const restored = getAstOperands(node).map(restoreStatusValues);
		return restored.length > 0 && restored.every(statuses => statuses !== undefined)
			? [ ...new Set(restored.flatMap(statuses => statuses ?? [])) ]
			: undefined;
	}
	if (getAstKind(node) !== 'equal')
		return undefined;

	const left = getAstNode(node?.['left']);
	const right = getAstNode(node?.['right']);
	if (!isField(left, 'round.status') || getAstKind(right) !== 'status')
		return undefined;

	const statusValue = lookup(statusByName, right?.['value']);
	return statusValue ? [ statusValue ] : undefined;
}

function restoreThrowMatch(
	node: AstNode | undefined,
): Pick<AchievementThrowRuleDraft, 'hitLocation' | 'throwType'> | undefined {
	let hitLocation: AchievementValueDraft | undefined;
	let throwType: AchievementThrowRuleDraft['throwType'] = 'any';

	for (const operand of andOperands(node)) {
		if (isField(operand, 'throw.isPlayed'))
			continue;
		if (getAstKind(operand) !== 'equal')
			return undefined;

		const left = getAstNode(operand['left']);
		const right = getAstNode(operand['right']);
		if (isField(left, 'throw.hitLocation')) {
			hitLocation = restoreAstValue(right);
			if (!hitLocation)
				return undefined;
			continue;
		}
		if (
			isField(left, 'throw.throwType')
			&& getAstKind(right) === 'constant'
			&& right?.['valueType'] === 'throwType'
			&& typeof right['value'] === 'string'
		) {
			throwType = lookup(throwTypeByName, right['value']) ?? 'any';
			continue;
		}
		return undefined;
	}

	return hitLocation || !throwTypeHasHitLocation(throwType)
		? { hitLocation, throwType }
		: undefined;
}

function restoreSequenceTarget(node: AstNode | undefined): AchievementSequenceTargetDraft
	| undefined {
	const match = restoreThrowMatch(node);
	if (match?.hitLocation) {
		return {
			id: createAchievementBuilderId(),
			hitLocation: match.hitLocation,
			throwType: match.throwType === 'any' ? 'anyScoring' : match.throwType,
		};
	}

	const throwTypeValue = getThrowTypeValue(node);
	if (throwTypeValue === 'Rim' || throwTypeValue === 'Miss') {
		return {
			id: createAchievementBuilderId(),
			hitLocation: { source: 'constant', value: '0' },
			throwType: throwTypeValue === 'Rim' ? 'rim' : 'miss',
		};
	}

	const operands = andOperands(node);
	const hitOperand = operands.find(operand =>
		getAstKind(operand) === 'equal'
		&& isField(getAstNode(operand['left']), 'throw.hitLocation'));
	const typeOperand = operands.find(operand => {
		if (getAstKind(operand) !== 'or')
			return false;
		const types = getAstOperands(operand)
			.map(item => getAstNode(item['right'])?.['value']);
		return [ 'Single', 'Double', 'Triple' ].every(type => types.includes(type));
	});
	const hitLocation = restoreAstValue(getAstNode(hitOperand?.['right']));
	return hitLocation && typeOperand
		? {
			id: createAchievementBuilderId(),
			hitLocation,
			throwType: 'anyScoring',
		}
		: undefined;
}

function restoreWinningThrowRule(
	node: AstNode | undefined,
): AchievementRuleDraft | undefined {
	if (
		getAstKind(node) !== 'any'
		|| !isField(getAstNode(node?.['collection']), 'rounds')
	)
		return undefined;
	const throwQuantifier = getAstNode(node?.['predicate']);
	if (
		getAstKind(throwQuantifier) !== 'any'
		|| !isField(getAstNode(throwQuantifier?.['collection']), 'round.throws')
	)
		return undefined;
	const operands = andOperands(getAstNode(throwQuantifier?.['predicate']));
	if (!operands.some(operand => isField(operand, 'throw.isVictoryThrow')))
		return undefined;
	const matches = operands.filter(operand => !isField(operand, 'throw.isVictoryThrow'));
	let hitLocation: AchievementValueDraft | undefined;
	let winningThrowType: Extract<
		AchievementRuleDraft,
		{ type: 'winningThrow'; }
	>['throwType'] = 'any';

	for (const match of matches) {
		if (
			getAstKind(match) === 'equal'
			&& isField(getAstNode(match['left']), 'throw.hitLocation')
		) {
			hitLocation = restoreAstValue(getAstNode(match['right']));
			if (!hitLocation)
				return undefined;
			continue;
		}
		if (
			getAstKind(match) === 'equal'
			&& isField(getAstNode(match['left']), 'throw.throwType')
		) {
			const type = lookup(throwTypeByName, getAstNode(match['right'])?.['value']);
			if (type !== 'single' && type !== 'double' && type !== 'triple')
				return undefined;
			winningThrowType = type;
			continue;
		}
		// The compiler writes "double" as "a double or the double bull".
		if (getAstKind(match) === 'or') {
			winningThrowType = 'double';
			continue;
		}
		return undefined;
	}

	return {
		id: createAchievementBuilderId(),
		type: 'winningThrow',
		hitLocation,
		throwType: winningThrowType,
	};
}

function comparisonRule(
	left: AchievementValueDraft,
	operator: AchievementComparisonOperator,
	right: AchievementValueDraft,
): AchievementRuleDraft {
	return {
		id: createAchievementBuilderId(),
		type: 'compare',
		left,
		operator,
		right,
	};
}

function zeroComparison(source: AchievementValueDraft['source']): AchievementRuleDraft {
	return comparisonRule(
		{ source, value: '' },
		'equal',
		{ source: 'constant', value: '0' },
	);
}

function restoreGameWideAllRule(node: AstNode | undefined): AchievementRuleDraft | undefined {
	if (
		getAstKind(node) !== 'all'
		|| !isField(getAstNode(node?.['collection']), 'rounds')
	)
		return undefined;
	const predicate = getAstNode(node?.['predicate']);
	if (getAstKind(predicate) === 'or') {
		return {
			id: createAchievementBuilderId(),
			type: 'all',
			children: [
				zeroComparison('game.overshootCount'),
				zeroComparison('game.failedWinConditionCount'),
			],
		};
	}
	if (
		getAstKind(predicate) !== 'all'
		|| !isField(getAstNode(predicate?.['collection']), 'round.throws')
	)
		return undefined;
	const excludedTypes = andOperands(getAstNode(predicate?.['predicate']))
		.map(operand => lookup(throwTypeByName, getAstNode(operand['right'])?.['value']));
	const sources = excludedTypes.map(type => lookup(gameThrowCountSources, type));
	return sources.length > 0 && sources.every(source => source !== undefined)
		? {
			id: createAchievementBuilderId(),
			type: 'all',
			children: sources.map(source => zeroComparison(source!)),
		}
		: undefined;
}

function rawRule(node: AstNode): AchievementRuleDraft {
	return {
		id: createAchievementBuilderId(),
		type: 'raw',
		ast: structuredClone(node),
	};
}

/** Restores a stored node as an editor block, or as raw logic when no block reproduces it. */
function restoreAstRule(
	node: AstNode,
	scope: AchievementRuleScope,
	sources: RestoredSources,
): AchievementRuleDraft {
	const proposals = [
		() => scope === 'root' ? restoreWinningThrowRule(node) : undefined,
		() => scope === 'root' ? restoreGameWideAllRule(node) : undefined,
		() => restoreEveryRule(node, scope, sources),
		() => proposeAstRule(node, scope, sources),
	];
	for (const propose of proposals) {
		const candidate = propose();
		const verified = candidate && verifyRestoredRule(candidate, node, scope, sources);
		if (verified)
			return verified;
	}

	return rawRule(node);
}

/**
 * The compiler's "every" shape, `and(any(items, guard), all(items, or(not guard, check)))`:
 * a round block matching every round, a throw block matching every dart, or a comparison
 * of the lowest unmodified dart score.
 */
function restoreEveryRule(
	node: AstNode,
	scope: AchievementRuleScope,
	sources: RestoredSources,
): AchievementRuleDraft | undefined {
	const operands = getAstKind(node) === 'and' ? getAstOperands(node) : [];
	const [ exists, every ] = operands;
	if (operands.length !== 2 || getAstKind(exists) !== 'any' || getAstKind(every) !== 'all')
		return undefined;

	const alternatives = andOperands(getAstNode(every?.['predicate']));
	const everyPredicate = getAstNode(every?.['predicate']);
	const check = getAstKind(everyPredicate) === 'or'
		? getAstOperands(everyPredicate).find(operand => getAstKind(operand) !== 'not')
		: undefined;
	if (alternatives.length !== 1 || !check)
		return undefined;

	const collection = getAstNode(every?.['collection']);
	if (scope === 'root' && isField(collection, 'rounds')) {
		const statuses = restoreStatusValues(getAstNode(exists?.['predicate']));
		return statuses && {
			id: createAchievementBuilderId(),
			type: 'round',
			quantifier: 'all',
			statuses,
			condition: restoreAstRule(check, 'round', sources),
		};
	}
	if (scope !== 'round' || !isField(collection, 'round.throws'))
		return undefined;

	const checkKind = getAstKind(check);
	if (isComparisonOperator(checkKind) && isField(getAstNode(check['left']), 'throw.rawPoints')) {
		const right = restoreAstValue(getAstNode(check['right']));
		return right && comparisonRule({ source: 'round.minimumRawPoints', value: '' }, checkKind, right);
	}

	const match = restoreThrowMatch(check);
	return match && {
		id: createAchievementBuilderId(),
		type: 'throw',
		quantifier: 'all',
		scope: 'currentRound',
		...match,
	};
}

/** A block that may represent the node; restoreAstRule only keeps it once verified. */
function proposeAstRule(
	node: AstNode,
	scope: AchievementRuleScope,
	sources: RestoredSources,
): AchievementRuleDraft | undefined {
	const kind = getAstKind(node);
	if (kind === 'and' || kind === 'or') {
		return {
			id: createAchievementBuilderId(),
			type: kind === 'and' ? 'all' : 'any',
			children: getAstOperands(node).map(operand => restoreAstRule(operand, scope, sources)),
		};
	}
	if (kind === 'not') {
		const operand = getAstNode(node['operand']);
		return operand
			? { id: createAchievementBuilderId(), type: 'not', child: restoreAstRule(operand, scope, sources) }
			: undefined;
	}
	if (
		(kind === 'any' || kind === 'all')
		&& isField(getAstNode(node['collection']), 'rounds')
	) {
		let statuses: AchievementRoundRuleDraft['statuses'] = [];
		const conditionOperands: AstNode[] = [];
		// Only the top level: a nested `and` belongs to one condition block.
		const predicate = getAstNode(node['predicate']);
		const operands = getAstKind(predicate) === 'and'
			? getAstOperands(predicate)
			: predicate ? [ predicate ] : [];
		for (const operand of operands) {
			const restoredStatuses = restoreStatusValues(operand);
			if (restoredStatuses)
				statuses = [ ...new Set([ ...statuses, ...restoredStatuses ]) ];
			else
				conditionOperands.push(operand);
		}
		if (statuses.length === 0)
			return undefined;
		if (conditionOperands.length === 0 && kind === 'any') {
			const children = statuses.map(item => comparisonRule(
				{ source: roundStatusCountSources[item], value: '' },
				'greaterThan',
				{ source: 'constant', value: '0' },
			));
			return children.length === 1
				? children[0]
				: {
					id: createAchievementBuilderId(),
					type: 'any',
					children,
				};
		}
		const conditionNode = conditionOperands.length === 1
			? conditionOperands[0]!
			: { kind: 'and', operands: conditionOperands };
		return {
			id: createAchievementBuilderId(),
			type: 'round',
			quantifier: kind,
			statuses,
			condition: restoreAstRule(conditionNode, 'round', sources),
		};
	}
	if (
		(kind === 'any' || kind === 'all')
		&& scope === 'round'
		&& isField(getAstNode(node['collection']), 'round.throws')
	) {
		const predicate = getAstNode(node['predicate']);
		const predicateKind = getAstKind(predicate);
		if (
			kind === 'all'
			&& predicateKind === 'equal'
			&& isField(getAstNode(predicate?.['left']), 'throw.modifierCount')
		) {
			return comparisonRule(
				{ source: 'round.modifiedThrowCount', value: '' },
				'equal',
				{ source: 'constant', value: '0' },
			);
		}
		if (
			kind === 'all'
			&& isComparisonOperator(predicateKind)
			&& isField(getAstNode(predicate?.['left']), 'throw.rawPoints')
		) {
			const right = restoreAstValue(getAstNode(predicate?.['right']));
			return right
				? comparisonRule({ source: 'round.minimumRawPoints', value: '' }, predicateKind, right)
				: undefined;
		}

		const match = restoreThrowMatch(predicate);
		return match
			? {
				id: createAchievementBuilderId(),
				type: 'throw',
				quantifier: kind,
				scope: 'currentRound',
				...match,
			}
			: undefined;
	}
	if (
		kind === 'sequence'
		&& scope === 'round'
		&& isField(getAstNode(node['collection']), 'round.throws')
		&& Array.isArray(node['items'])
	) {
		const targets = node['items'].map(item => restoreSequenceTarget(getAstNode(item)));
		return targets.length === sequenceTargetCount && targets.every(target => target !== undefined)
			? {
				id: createAchievementBuilderId(),
				type: 'sequence',
				scope: 'sameRound',
				targets: targets as AchievementSequenceTargetDraft[],
			}
			: undefined;
	}
	if (isComparisonOperator(kind)) {
		const leftNode = getAstNode(node['left']);
		const rightNode = getAstNode(node['right']);
		if (
			getAstKind(leftNode) === 'count'
			&& isField(getAstNode(leftNode?.['collection']), 'round.throws')
		) {
			const match = restoreThrowMatch(getAstNode(leftNode?.['predicate']));
			const count = restoreAstValue(rightNode);
			if (match && count) {
				return {
					id: createAchievementBuilderId(),
					type: 'throwCount',
					...match,
					operator: kind,
					count,
				};
			}
		}
		if (isField(leftNode, 'round.index')) {
			const rightKind = getAstKind(rightNode);
			if (rightKind === 'subtract' && getAstKind(getAstNode(rightNode?.['left'])) === 'parameter') {
				return comparisonRule(
					{ source: 'round.number', value: '' },
					kind,
					{
						source: 'parameter',
						value: String(getAstNode(rightNode?.['left'])?.['name'] ?? ''),
					},
				);
			}
			if (
				rightKind === 'constant'
				&& rightNode?.['valueType'] === 'integer'
				&& typeof rightNode['value'] === 'number'
			) {
				return comparisonRule(
					{ source: 'round.number', value: '' },
					kind,
					{ source: 'constant', value: String(rightNode['value'] + 1) },
				);
			}
		}
		const left = restoreAstValue(leftNode);
		const right = restoreAstValue(rightNode);
		return left && right
			? comparisonRule(left, kind, right)
			: undefined;
	}
	return undefined;
}

function getStoredAstRule(
	version: AchievementTemplateVersionResponse,
): AchievementRuleDraft | undefined {
	const root = getAstNode(version.definition['root']);
	if (!root)
		return undefined;

	const restored = restoreAstRule(root, 'root', new WeakMap());
	if (restored.type === 'all' || restored.type === 'any')
		return restored;
	return {
		id: createAchievementBuilderId(),
		type: 'all',
		children: [ restored ],
	};
}

function getStoredAstProgression(
	version: AchievementTemplateVersionResponse,
): AchievementProgressionDraft | undefined {
	const root = getAstNode(version.definition['root']);
	const targets = andOperands(root).map(node => {
		if (getAstKind(node) !== 'hasHitSegment')
			return undefined;
		const hitLocation = restoreAstValue(getAstNode(node['hitLocation']));
		const throwTypeNode = getAstNode(node['throwType']);
		const type = getAstKind(throwTypeNode) === 'constant'
			&& throwTypeNode?.['valueType'] === 'throwType'
			? lookup(throwTypeByName, throwTypeNode['value'])
			: undefined;
		return hitLocation && (type === 'single' || type === 'double' || type === 'triple')
			? {
				id: createAchievementBuilderId(),
				hitLocation,
				throwType: type,
			}
			: undefined;
	});
	if (targets.length === 0 || targets.some(target => target === undefined))
		return undefined;

	const reducers = Array.isArray(version.definition['reducers'])
		? version.definition['reducers'].map(getAstNode)
		: [];
	const statusValues = reducers.find(reducer =>
		getAstKind(reducer) === 'collectHitSegments')?.['statuses'];
	const statuses = Array.isArray(statusValues)
		? statusValues
			.map(status => lookup(statusByName, status))
			.filter((status): status is 'valid' | 'victory' =>
				status === 'valid' || status === 'victory')
		: [];
	const progression: AchievementProgressionDraft = {
		statuses: statuses.length > 0 ? statuses : createDefaultAchievementProgression().statuses,
		targets: targets as AchievementProgressionDraft['targets'],
	};

	// Same rule as for session blocks: keep the targets only when they reproduce the stored logic.
	return isEquivalentAst(compileProgressionRoot(progression), root)
		&& isSameAst(compileProgressionReducers(progression), version.definition['reducers'])
		? progression
		: undefined;
}

function isSameAst(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left)
			&& Array.isArray(right)
			&& left.length === right.length
			&& left.every((item, index) => isSameAst(item, right[index]));
	}
	if (left && right && typeof left === 'object' && typeof right === 'object') {
		const leftEntries = Object.entries(left).filter(([ , value ]) => value !== undefined);
		const rightRecord = right as Record<string, unknown>;
		return leftEntries.length === Object.values(rightRecord).filter(value => value !== undefined).length
			&& leftEntries.every(([ key, value ]) => isSameAst(value, rightRecord[key]));
	}

	return left === right;
}

/**
 * The stored editor tree is only a UI convenience; it is trusted only while it still
 * compiles to the executable definition, so the editor always shows the logic that runs.
 */
function compilesToStoredDefinition(
	version: AchievementTemplateVersionResponse,
	compile: () => { root: AstNode; reducers?: AstNode[]; },
): boolean {
	try {
		const compiled = compile();

		return isSameAst(compiled.root, version.definition['root'])
			&& isSameAst(compiled.reducers, version.definition['reducers']);
	}
	catch {
		return false;
	}
}

function restoreRule(
	version: AchievementTemplateVersionResponse,
	editor: Record<string, unknown> | undefined,
): AchievementRuleDraft {
	const editorRule = getStoredEditorRule(editor);
	const isSession = version.evaluationPhase !== 'Progression';
	if (
		editorRule
		&& (!isSession || compilesToStoredDefinition(version, () => ({ root: compileRule(editorRule, 'root') })))
	)
		return editorRule;

	return (isSession ? getStoredAstRule(version) : undefined)
		?? editorRule
		?? createDefaultAchievementRule();
}

function restoreProgression(
	version: AchievementTemplateVersionResponse,
	editor: Record<string, unknown> | undefined,
): AchievementProgressionDraft | undefined {
	// Older editor trees also stored the raw logic; the definition holds it, so it is ignored.
	const editorProgression = editor?.['progression'] && typeof editor['progression'] === 'object'
		? getEditorProgression(structuredClone(editor['progression']) as AchievementProgressionDraft)
		: undefined;
	if (version.evaluationPhase !== 'Progression')
		return editorProgression;

	if (
		editorProgression
		&& Array.isArray(editorProgression.targets)
		&& Array.isArray(editorProgression.statuses)
		&& compilesToStoredDefinition(version, () => ({
			root:     compileProgressionRoot(editorProgression),
			reducers: compileProgressionReducers(editorProgression),
		}))
	)
		return editorProgression;

	return getStoredAstProgression(version) ?? {
		...createDefaultAchievementProgression(),
		raw: {
			root:     structuredClone(version.definition['root']),
			reducers: structuredClone(version.definition['reducers'] ?? []),
		},
	};
}

export function restoreAchievementTemplateDraft(
	template: AchievementTemplateResponse,
	versionId?: string,
): AchievementTemplateDraft | undefined {
	const version = getEditableVersion(template, versionId);
	if (!version)
		return undefined;
	const editor = getStoredEditor(version);
	return {
		id: template.id,
		seasonId: template.seasonId,
		nameTemplate: version.nameTemplate,
		descriptionTemplate: version.descriptionTemplate,
		categoryId: version.categoryId,
		tier: version.achievementTier,
		...restoreVariantRules(version.definition[variantsPropertyName]),
		achievementScope: version.evaluationPhase === 'Progression'
			? 'progression'
			: 'session',
		parameters: restoreParameters(version.parameters),
		rule:        restoreRule(version, editor),
		progression: restoreProgression(version, editor),
	};
}
