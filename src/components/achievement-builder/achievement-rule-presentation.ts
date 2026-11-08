import {
	AchievementComparisonOperator,
	achievementRoundStatusLabels,
	AchievementRuleDraft,
	AchievementValueDraft,
	achievementValueSourceLabels,
	throwTypeHasHitLocation,
} from '../../models/achievementBuilder.js';

export const operatorLabels: Record<AchievementComparisonOperator, string> = {
	equal:              '=',
	notEqual:           '!=',
	greaterThan:        '>',
	greaterThanOrEqual: '>=',
	lessThan:           '<',
	lessThanOrEqual:    '<=',
};

const throwTypeLabels = {
	any:        'throw',
	anyScoring: 'single, double, or triple',
	single:     'single',
	double:     'double',
	triple:     'triple',
	rim:        'rim hit',
	miss:       'miss',
} as const;

type ExpressionNode = Record<string, unknown>;

const expressionOperators: Record<string, string> = {
	...operatorLabels,
	add:      '+',
	subtract: '-',
};

const asExpressionNode = (value: unknown): ExpressionNode | undefined =>
	value && typeof value === 'object' && !Array.isArray(value)
		? value as ExpressionNode
		: undefined;

/**
 * Writes a compiled condition back out as a readable expression, so logic the
 * visual blocks cannot represent can still be checked.
 */
const formatAchievementExpression = (value: unknown): string => {
	const node = asExpressionNode(value);
	if (!node)
		return String(value);

	const kind = String(node['kind']);
	const format = formatAchievementExpression;
	const nested = (child: unknown): string => {
		const childKind = asExpressionNode(child)?.['kind'];

		return childKind === 'and' || childKind === 'or'
			? `(${ format(child) })`
			: format(child);
	};
	const where = node['predicate'] === undefined ? '' : ` where ${ format(node['predicate']) }`;

	switch (kind) {
	case 'field':
		return String(node['path']);
	case 'constant':
	case 'status':
		return String(node['value']);
	case 'parameter':
		return `{${ String(node['name']) }}`;
	case 'and':
	case 'or':
		return (Array.isArray(node['operands']) ? node['operands'] : [])
			.map(nested)
			.join(` ${ kind } `);
	case 'not':
		return `not ${ nested(node['operand']) }`;
	case 'all':
	case 'any':
		return `${ kind === 'all' ? 'every' : 'any' }(${ format(node['collection']) }${
			node['predicate'] === undefined ? '' : `: ${ format(node['predicate']) }`
		})`;
	case 'count':
		return `count(${ format(node['collection']) }${ where })`;
	case 'sum':
	case 'distinctCount':
		return `${ kind === 'sum' ? 'sum' : 'distinct' }(${ format(node['selector']) } of ${
			format(node['collection'])
		}${ where })`;
	case 'sequence':
		return `sequence(${ format(node['collection']) }: ${
			(Array.isArray(node['items']) ? node['items'] : [])
				.map(item => `[${ format(item) }]`)
				.join(' then ')
		})`;
	case 'boardNeighbor': {
		const offset = Number(node['offset']);
		const side = offset < 0 ? 'left' : 'right';

		return Math.abs(offset) === 1
			? `${ side } of ${ format(node['number']) }`
			: `${ Math.abs(offset) } ${ side } of ${ format(node['number']) }`;
	}
	case 'hasHitSegment':
		return `hit ${ format(node['throwType']) } ${ format(node['hitLocation']) }`;
	}

	const operator = expressionOperators[kind];
	if (operator && 'left' in node && 'right' in node)
		return `${ nested(node['left']) } ${ operator } ${ nested(node['right']) }`;

	return JSON.stringify(node);
};

export const formatAchievementValue = (value: AchievementValueDraft): string => {
	switch (value.source) {
	case 'constant':
	case 'parameter':
		return value.value || 'Choose value';
	case 'parameter.offset': {
		if (!value.value)
			return 'Choose adjusted parameter';
		const offset = value.offset ?? 0;
		return offset < 0
			? `${ value.value } - ${ Math.abs(offset) }`
			: `${ value.value } + ${ offset }`;
	}
	case 'board.leftNeighbor':
		return value.value ? `left of ${ value.value }` : 'Choose left neighbor';
	case 'board.rightNeighbor':
		return value.value ? `right of ${ value.value }` : 'Choose right neighbor';
	default:
		return achievementValueSourceLabels[value.source];
	}
};

export const formatAchievementRule = (rule: AchievementRuleDraft): string => {
	switch (rule.type) {
	case 'all':
		return `${ rule.children.length } condition${ rule.children.length === 1 ? '' : 's' }`;
	case 'any':
		return `${ rule.children.length } alternative${ rule.children.length === 1 ? '' : 's' }`;
	case 'not':
		return 'Not';
	case 'round': {
		const quantifier = rule.quantifier === 'any' ? 'Any' : 'Every';
		const statuses = rule.statuses
			.map(status => achievementRoundStatusLabels[status].toLowerCase())
			.join(' or ');

		return `${ quantifier } ${ statuses || 'matching' } round`;
	}
	case 'throw': {
		const quantifier = rule.quantifier === 'any' ? 'Any' : 'Every';
		return rule.hitLocation
			? `${ quantifier } ${ throwTypeLabels[rule.throwType] } hits ${
				formatAchievementValue(rule.hitLocation)
			}`
			: `${ quantifier } throw is a ${ throwTypeLabels[rule.throwType] }`;
	}
	case 'throwCount':
		return `${
			rule.hitLocation ? `${ formatAchievementValue(rule.hitLocation) } ` : ''
		}${ throwTypeLabels[rule.throwType] } count ${ operatorLabels[rule.operator] } ${
			formatAchievementValue(rule.count)
		}`;
	case 'winningThrow': {
		const target = rule.hitLocation
			? formatAchievementValue(rule.hitLocation)
			: '';
		if (rule.throwType === 'any' && target === '25')
			return 'Winning throw is a bull';
		if (rule.throwType === 'any' && target === '50')
			return 'Winning throw is a double bull';

		const typeLabels = {
			any: 'Winning throw',
			single: 'Winning throw is a single',
			double: 'Winning throw is a double or double bull',
			triple: 'Winning throw is a triple',
		};
		return target
			? `${ typeLabels[rule.throwType] } hitting ${ target }`
			: typeLabels[rule.throwType];
	}
	case 'compare':
		return `${ formatAchievementValue(rule.left) } ${ operatorLabels[rule.operator] } ${
			formatAchievementValue(rule.right)
		}`;
	case 'sequence': {
		const targets = rule.targets.map(target =>
			`${ formatAchievementValue(target.hitLocation) } (${
				throwTypeLabels[target.throwType]
			})`);

		return targets.length > 0
			? `Sequence: ${ targets.join(' -> ') }`
			: 'Sequence: add the first step';
	}
	case 'raw': {
		const collection = rule.ast['collection'];
		const predicate = rule.ast['predicate'];
		if (
			rule.ast['kind'] === 'all'
			&& collection && typeof collection === 'object'
			&& (collection as Record<string, unknown>)['kind'] === 'field'
			&& (collection as Record<string, unknown>)['path'] === 'round.throws'
			&& predicate && typeof predicate === 'object'
		) {
			const predicateNode = predicate as Record<string, unknown>;
			const left = predicateNode['left'];
			const right = predicateNode['right'];
			if (
				predicateNode['kind'] === 'equal'
				&& left && typeof left === 'object'
				&& (left as Record<string, unknown>)['kind'] === 'field'
				&& (left as Record<string, unknown>)['path'] === 'throw.modifierCount'
				&& right && typeof right === 'object'
				&& (right as Record<string, unknown>)['kind'] === 'constant'
				&& (right as Record<string, unknown>)['valueType'] === 'integer'
				&& (right as Record<string, unknown>)['value'] === 0
			)
				return 'No throws use seasonal modifiers';
		}

		return formatAchievementExpression(rule.ast);
	}
	}
};

export const formatSequenceTarget = (
	target: Extract<AchievementRuleDraft, { type: 'sequence'; }>['targets'][number],
): string =>
	throwTypeHasHitLocation(target.throwType)
		? `${ formatAchievementValue(target.hitLocation) } - ${ throwTypeLabels[target.throwType] }`
		: throwTypeLabels[target.throwType];
