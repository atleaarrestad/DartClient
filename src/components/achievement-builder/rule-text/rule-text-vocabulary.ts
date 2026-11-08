import {
	AchievementComparisonOperator,
	AchievementRoundStatus,
	AchievementThrowType,
	AchievementValueSource,
	achievementValueSourceLabels,
} from '../../../models/achievementBuilder.js';

/** One round or game value as it is written in rule text. */
export interface RuleTextField {
	name:   string;
	source: AchievementValueSource;
	label:  string;
	scope:  'round' | 'game';
}

const field = (name: string, source: AchievementValueSource): RuleTextField => ({
	name,
	source,
	label: achievementValueSourceLabels[source],
	scope: name.startsWith('round.') ? 'round' : 'game',
});

/** Short text names for every round and game value source. */
export const ruleTextFields: readonly RuleTextField[] = [
	field('round.number', 'round.number'),
	field('round.points', 'round.finalPoints'),
	field('round.throws', 'round.throwCount'),
	field('round.modified', 'round.modifiedThrowCount'),
	field('round.singles', 'round.singleCount'),
	field('round.doubles', 'round.doubleCount'),
	field('round.triples', 'round.tripleCount'),
	field('round.distinctScores', 'round.rawPointsDistinctCount'),
	field('round.lowestScore', 'round.minimumRawPoints'),
	field('game.rounds', 'game.roundsPlayed'),
	field('game.placement', 'game.placement'),
	field('game.validRounds', 'game.validRoundCount'),
	field('game.victories', 'game.victoryCount'),
	field('game.overshoots', 'game.overshootCount'),
	field('game.failedWins', 'game.failedWinConditionCount'),
	field('game.doubles', 'game.doubleCount'),
	field('game.triples', 'game.tripleCount'),
	field('game.rims', 'game.rimCount'),
	field('game.misses', 'game.missCount'),
];

export const findFieldByName = (name: string): RuleTextField | undefined =>
	ruleTextFields.find(item => item.name === name);

export const findFieldBySource = (source: AchievementValueSource): RuleTextField | undefined =>
	ruleTextFields.find(item => item.source === source);

export const roundStatusWords: Readonly<Record<AchievementRoundStatus, string>> = {
	valid:              'valid',
	victory:            'victory',
	overshoot:          'overshoot',
	failedWinCondition: 'failed',
};

export const allRoundStatuses: readonly AchievementRoundStatus[] = [
	'valid',
	'victory',
	'overshoot',
	'failedWinCondition',
];

export const findStatusByWord = (word: string): AchievementRoundStatus | undefined =>
	allRoundStatuses.find(status => roundStatusWords[status] === word);

export const operatorSymbols: Readonly<Record<AchievementComparisonOperator, string>> = {
	equal:              '=',
	notEqual:           '!=',
	greaterThan:        '>',
	greaterThanOrEqual: '>=',
	lessThan:           '<',
	lessThanOrEqual:    '<=',
};

/** How operators read on the canvas and in the readout. */
export const operatorWords: Readonly<Record<AchievementComparisonOperator, string>> = {
	equal:              'is exactly',
	notEqual:           'is not',
	greaterThan:        'is more than',
	greaterThanOrEqual: 'is at least',
	lessThan:           'is less than',
	lessThanOrEqual:    'is at most',
};

export const findOperatorBySymbol = (symbol: string): AchievementComparisonOperator | undefined =>
	(Object.keys(operatorSymbols) as AchievementComparisonOperator[])
		.find(operator => operatorSymbols[operator] === symbol);

/** Darts shorthand for the scoring throw types: S20, D{n}, T19. */
export const throwKindLetters: Readonly<Record<'single' | 'double' | 'triple', string>> = {
	single: 'S',
	double: 'D',
	triple: 'T',
};

export const findThrowKindByLetter = (letter: string): 'single' | 'double' | 'triple' | undefined =>
	(Object.keys(throwKindLetters) as ('single' | 'double' | 'triple')[])
		.find(kind => throwKindLetters[kind] === letter);

/** Throw types written as a word instead of a letter prefix; they have no hit location. */
export const throwTypeWords: Readonly<Partial<Record<AchievementThrowType, string>>> = {
	rim:  'rim',
	miss: 'miss',
};

/** Words that start a statement, in the order completion lists them. */
export const statementKeywords = [
	'hit',
	'every',
	'count',
	'winning',
	'sequence',
	'round',
	'all',
	'any',
	'not',
] as const;

export const bullWord = 'Bull';
export const doubleBullWord = 'DBull';
