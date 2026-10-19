import {
	AchievementComparisonOperator,
	AchievementProgressionDraft,
	AchievementRoundRuleDraft,
	AchievementRoundStatus,
	AchievementRuleDraft,
	AchievementSequenceTargetDraft,
	AchievementTemplateDraft,
	AchievementThrowRuleDraft,
	AchievementValueDraft,
	AchievementValueSource,
	createAchievementBuilderId,
	createDefaultAchievementProgression,
	createDefaultAchievementRule,
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

// Draft names on the left, backend AST names on the right.
const statusNames: Record<AchievementRoundStatus, string> = {
	valid:              'Valid',
	victory:            'Victory',
	overshoot:          'Overshoot',
	failedWinCondition: 'WinConditionFailed',
};

const throwTypeNames = {
	single: 'Single',
	double: 'Double',
	triple: 'Triple',
	rim:    'Rim',
	miss:   'Miss',
} as const;

type DraftThrowType = keyof typeof throwTypeNames;

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

const comparisonOperators: readonly string[] = [
	'equal',
	'notEqual',
	'greaterThan',
	'greaterThanOrEqual',
	'lessThan',
	'lessThanOrEqual',
] satisfies AchievementComparisonOperator[];

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
			if (target.throwType !== 'rim' && target.throwType !== 'miss') {
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
			equal(field('round.status'), status(statusNames[item])));
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
	case 'throwCount':
		if (scope !== 'round')
			throw new Error('Throw-count blocks must be nested inside a round block.');
		return compileThrowCountRule(rule);
	case 'winningThrow':
		if (scope !== 'root')
			throw new Error('Winning-throw blocks must be used at the game level.');
		return compileWinningThrowRule(rule);
	case 'sequence':
		if (scope !== 'round')
			throw new Error('Sequence blocks must be nested inside a round block.');
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

export function compileAchievementTemplate(
	draft: AchievementTemplateDraft,
): UpsertAchievementTemplateRequest {
	const progression = draft.progression ?? createDefaultAchievementProgression();
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
					statuses: progression.statuses.map(item => statusNames[item]),
				},
			],
			root: compileProgressionRoot(progression),
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
		categoryId: draft.categoryId,
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

function isField(node: AstNode | undefined, path: string): boolean {
	return getAstKind(node) === 'field' && node?.['path'] === path;
}

function getThrowTypeValue(node: AstNode | undefined): string | undefined {
	const operands = getAstKind(node) === 'and' ? getAstOperands(node) : node ? [ node ] : [];
	const typeOperand = operands.find(operand =>
		getAstKind(operand) === 'equal'
		&& isField(getAstNode(operand['left']), 'throw.throwType'));
	const value = getAstNode(typeOperand?.['right']);
	return getAstKind(value) === 'constant'
		&& value?.['valueType'] === 'throwType'
		&& typeof value['value'] === 'string'
		? value['value']
		: undefined;
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
			const predicateOperands = getAstKind(predicate) === 'and'
				? getAstOperands(predicate)
				: predicate ? [ predicate ] : [];
			const hasHitLocation = predicateOperands.some(operand =>
				getAstKind(operand) === 'equal'
				&& isField(getAstNode(operand['left']), 'throw.hitLocation'));
			return source && !hasHitLocation
				? { source, value: '' }
				: undefined;
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
	const operands = getAstKind(node) === 'and' ? getAstOperands(node) : node ? [ node ] : [];
	let hitLocation: AchievementValueDraft | undefined;
	let throwType: AchievementThrowRuleDraft['throwType'] = 'any';

	for (const operand of operands) {
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

	return hitLocation || throwType === 'rim' || throwType === 'miss'
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

	const operands = getAstKind(node) === 'and' ? getAstOperands(node) : [];
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
	const predicate = getAstNode(throwQuantifier?.['predicate']);
	const operands = getAstKind(predicate) === 'and' ? getAstOperands(predicate) : [];
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
		if (getAstKind(match) === 'or') {
			const alternatives = getAstOperands(match);
			const isType = (target: AstNode, value: string): boolean =>
				getAstKind(target) === 'equal'
				&& isField(getAstNode(target['left']), 'throw.throwType')
				&& getAstNode(target['right'])?.['value'] === value;
			const isDoubleBull = (target: AstNode): boolean =>
				getAstKind(target) === 'equal'
				&& isField(getAstNode(target['left']), 'throw.hitLocation')
				&& getAstNode(target['right'])?.['value'] === 50;
			if (
				alternatives.some(alternative => isType(alternative, 'Double'))
				&& alternatives.some(isDoubleBull)
			) {
				winningThrowType = 'double';
				continue;
			}
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
		const statuses = getAstOperands(predicate)
			.map(operand => getAstNode(operand['right'])?.['value']);
		if ([ 'Valid', 'Victory', 'Unplayed' ].every(value => statuses.includes(value))) {
			return {
				id: createAchievementBuilderId(),
				type: 'all',
				children: [
					zeroComparison('game.overshootCount'),
					zeroComparison('game.failedWinConditionCount'),
				],
			};
		}
	}
	if (
		getAstKind(predicate) !== 'all'
		|| !isField(getAstNode(predicate?.['collection']), 'round.throws')
	)
		return undefined;
	const throwPredicate = getAstNode(predicate?.['predicate']);
	const operands = getAstKind(throwPredicate) === 'and'
		? getAstOperands(throwPredicate)
		: throwPredicate ? [ throwPredicate ] : [];
	const excludedTypes = operands
		.filter(operand =>
			getAstKind(operand) === 'notEqual'
			&& isField(getAstNode(operand['left']), 'throw.throwType'))
		.map(operand => getAstNode(operand['right'])?.['value']);
	const sources: AchievementValueDraft['source'][] = [];
	if (excludedTypes.includes('Miss'))
		sources.push('game.missCount');
	if (excludedTypes.includes('Rim'))
		sources.push('game.rimCount');
	if (excludedTypes.includes('Double'))
		sources.push('game.doubleCount');
	if (excludedTypes.includes('Triple'))
		sources.push('game.tripleCount');
	return sources.length > 0
		? {
			id: createAchievementBuilderId(),
			type: 'all',
			children: sources.map(zeroComparison),
		}
		: undefined;
}

function restoreAstRule(
	node: AstNode | undefined,
	scope: CompileScope,
): AchievementRuleDraft | undefined {
	const rawRule = (): AchievementRuleDraft | undefined => node
		? {
			id: createAchievementBuilderId(),
			type: 'raw',
			ast: structuredClone(node),
		}
		: undefined;
	const kind = getAstKind(node);
	const winningThrowRule = scope === 'root' ? restoreWinningThrowRule(node) : undefined;
	if (winningThrowRule)
		return winningThrowRule;
	const gameWideAllRule = scope === 'root' ? restoreGameWideAllRule(node) : undefined;
	if (gameWideAllRule)
		return gameWideAllRule;
	if (kind === 'and' || kind === 'or') {
		const children = getAstOperands(node)
			.map(operand => restoreAstRule(operand, scope));
		if (children.some(child => child === undefined))
			return rawRule();
		return {
			id: createAchievementBuilderId(),
			type: kind === 'and' ? 'all' : 'any',
			children: children as AchievementRuleDraft[],
		};
	}
	if (kind === 'not') {
		const child = restoreAstRule(getAstNode(node?.['operand']), scope);
		return child
			? { id: createAchievementBuilderId(), type: 'not', child }
			: undefined;
	}
	if (
		(kind === 'any' || kind === 'all')
		&& isField(getAstNode(node?.['collection']), 'rounds')
	) {
		const predicate = getAstNode(node?.['predicate']);
		const operands = getAstKind(predicate) === 'and'
			? getAstOperands(predicate)
			: predicate ? [ predicate ] : [];
		let statuses: AchievementRoundRuleDraft['statuses'] = [];
		const conditionOperands: AstNode[] = [];
		for (const operand of operands) {
			const restoredStatuses = restoreStatusValues(operand);
			if (restoredStatuses)
				statuses = [ ...new Set([ ...statuses, ...restoredStatuses ]) ];
			else
				conditionOperands.push(operand);
		}
		if (statuses.length === 0)
			return rawRule();
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
			? conditionOperands[0]
			: { kind: 'and', operands: conditionOperands };
		const condition = restoreAstRule(conditionNode, 'round');
		return condition
			? {
				id: createAchievementBuilderId(),
				type: 'round',
				quantifier: kind,
				statuses,
				condition,
			}
			: undefined;
	}
	if (
		(kind === 'any' || kind === 'all')
		&& scope === 'round'
		&& isField(getAstNode(node?.['collection']), 'round.throws')
	) {
		const predicate = getAstNode(node?.['predicate']);
		const modifierCountLeft = getAstNode(predicate?.['left']);
		const modifierCountRight = getAstNode(predicate?.['right']);
		if (
			kind === 'all'
			&& getAstKind(predicate) === 'equal'
			&& isField(modifierCountLeft, 'throw.modifierCount')
			&& getAstKind(modifierCountRight) === 'constant'
			&& modifierCountRight?.['valueType'] === 'integer'
			&& modifierCountRight['value'] === 0
		) {
			return {
				id: createAchievementBuilderId(),
				type: 'compare',
				left: { source: 'round.modifiedThrowCount', value: '' },
				operator: 'equal',
				right: { source: 'constant', value: '0' },
			};
		}
		const predicateKind = getAstKind(predicate);
		if (
			kind === 'all'
			&& isComparisonOperator(predicateKind)
			&& isField(getAstNode(predicate?.['left']), 'throw.rawPoints')
		) {
			const right = restoreAstValue(getAstNode(predicate?.['right']));
			if (right) {
				return comparisonRule(
					{ source: 'round.minimumRawPoints', value: '' },
					predicateKind,
					right,
				);
			}
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
			: rawRule();
	}
	if (
		kind === 'sequence'
		&& scope === 'round'
		&& isField(getAstNode(node?.['collection']), 'round.throws')
		&& Array.isArray(node?.['items'])
	) {
		const targets = node['items'].map(item => restoreSequenceTarget(getAstNode(item)));
		return targets.length === 3 && targets.every(target => target !== undefined)
			? {
				id: createAchievementBuilderId(),
				type: 'sequence',
				scope: 'sameRound',
				targets: targets as AchievementSequenceTargetDraft[],
			}
			: rawRule();
	}
	if (isComparisonOperator(kind)) {
		const leftNode = getAstNode(node?.['left']);
		const rightNode = getAstNode(node?.['right']);
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
			if (
				rightKind === 'subtract'
				&& getAstKind(getAstNode(rightNode?.['left'])) === 'parameter'
				&& getAstNode(rightNode?.['right'])?.['value'] === 1
			) {
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
			? {
				id: createAchievementBuilderId(),
				type: 'compare',
				left,
				operator: kind,
				right,
			}
			: rawRule();
	}
	return rawRule();
}

function getStoredAstRule(
	version: AchievementTemplateVersionResponse,
): AchievementRuleDraft | undefined {
	const restored = restoreAstRule(getAstNode(version.definition['root']), 'root');
	if (!restored || restored.type === 'all' || restored.type === 'any')
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
	const targetNodes = getAstKind(root) === 'and' ? getAstOperands(root) : root ? [ root ] : [];
	const targets = targetNodes.map(node => {
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
	return {
		statuses: statuses.length > 0 ? statuses : createDefaultAchievementProgression().statuses,
		targets: targets as AchievementProgressionDraft['targets'],
	};
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
 * compiles to the executable root, so the editor always shows the logic that runs.
 */
function compilesToStoredRoot(
	version: AchievementTemplateVersionResponse,
	compile: () => AstNode,
): boolean {
	try {
		return isSameAst(compile(), version.definition['root']);
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
		&& (!isSession || compilesToStoredRoot(version, () => compileRule(editorRule, 'root')))
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
	const editorProgression = editor?.['progression'] && typeof editor['progression'] === 'object'
		? structuredClone(editor['progression']) as AchievementProgressionDraft
		: undefined;
	if (version.evaluationPhase !== 'Progression')
		return editorProgression;

	return editorProgression
		&& Array.isArray(editorProgression.targets)
		&& compilesToStoredRoot(version, () => compileProgressionRoot(editorProgression))
		? editorProgression
		: getStoredAstProgression(version);
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
		achievementScope: version.evaluationPhase === 'Progression'
			? 'progression'
			: 'session',
		parameters: restoreParameters(version.parameters),
		rule:        restoreRule(version, editor),
		progression: restoreProgression(version, editor),
	};
}
