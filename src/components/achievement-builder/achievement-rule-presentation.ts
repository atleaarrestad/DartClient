import type {
	AchievementComparisonOperator,
	AchievementRuleDraft,
	AchievementValueDraft,
	AchievementValueSource,
} from '../../models/achievementBuilder.js';

const valueSourceLabels: Partial<Record<AchievementValueSource, string>> = {
	'round.throwCount':             'Round throw count',
	'round.finalPoints':            'Round final points',
	'round.rawPointsDistinctCount': 'Distinct raw-point values',
	'round.minimumRawPoints':       'Minimum raw points',
	'round.singleCount':            'Singles in round',
	'round.doubleCount':            'Doubles in round',
	'round.tripleCount':            'Triples in round',
	'game.roundsPlayed':            'Rounds played',
	'game.placement':               'Final placement',
	'game.overshootCount':          'Overshoot rounds',
	'game.rimCount':                'Rim hits',
	'game.missCount':               'Misses',
};

const operatorLabels: Record<AchievementComparisonOperator, string> = {
	equal:              '=',
	notEqual:           '!=',
	greaterThan:        '>',
	greaterThanOrEqual: '>=',
	lessThan:           '<',
	lessThanOrEqual:    '<=',
};

const throwTypeLabels = {
	any:        'throw',
	anyScoring: 'scoring throw',
	single:     'single',
	double:     'double',
	triple:     'triple',
	rim:        'rim hit',
	miss:       'miss',
} as const;

export const formatAchievementValue = (value: AchievementValueDraft): string => {
	switch (value.source) {
	case 'constant':
	case 'parameter':
		return value.value || 'Choose value';
	case 'board.leftNeighbor':
		return value.value ? `left of ${ value.value }` : 'Choose left neighbor';
	case 'board.rightNeighbor':
		return value.value ? `right of ${ value.value }` : 'Choose right neighbor';
	default:
		return valueSourceLabels[value.source] ?? value.source;
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
			.map(status => status === 'failedWinCondition' ? 'failed win' : status)
			.join(' or ');

		return `${ quantifier } ${ statuses || 'matching' } round`;
	}
	case 'throw': {
		const quantifier = rule.quantifier === 'any' ? 'Any' : 'Every';

		return `${ quantifier } ${ throwTypeLabels[rule.throwType] } hits ${
			formatAchievementValue(rule.hitLocation)
		}`;
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
	}
};

export const formatSequenceTarget = (
	target: Extract<AchievementRuleDraft, { type: 'sequence'; }>['targets'][number],
): string =>
	`${ formatAchievementValue(target.hitLocation) } - ${ throwTypeLabels[target.throwType] }`;
