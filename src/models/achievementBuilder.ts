export type AchievementScope = 'session' | 'progression';

export type AchievementParameterValueType = 'integer' | 'string' | 'boolean';
export type AchievementParameterGeneratorType = 'range' | 'set';

export interface AchievementParameterDraft {
	id: string;
	key: string;
	valueType: AchievementParameterValueType;
	generatorType: AchievementParameterGeneratorType;
	minimum?: number;
	maximum?: number;
	step?: number;
	values: string[];
}

export const achievementComparisonOperators = [
	'equal',
	'notEqual',
	'greaterThan',
	'greaterThanOrEqual',
	'lessThan',
	'lessThanOrEqual',
] as const;

export type AchievementComparisonOperator = (typeof achievementComparisonOperators)[number];

export type AchievementValueSource =
	| 'constant'
	| 'parameter'
	| 'parameter.offset'
	| 'board.leftNeighbor'
	| 'board.rightNeighbor'
	| 'round.throwCount'
	| 'round.modifiedThrowCount'
	| 'round.number'
	| 'round.finalPoints'
	| 'round.rawPointsDistinctCount'
	| 'round.minimumRawPoints'
	| 'round.singleCount'
	| 'round.doubleCount'
	| 'round.tripleCount'
	| 'game.roundsPlayed'
	| 'game.placement'
	| 'game.validRoundCount'
	| 'game.victoryCount'
	| 'game.overshootCount'
	| 'game.failedWinConditionCount'
	| 'game.doubleCount'
	| 'game.tripleCount'
	| 'game.rimCount'
	| 'game.missCount';

/** Display labels for every value source; also the order the value editor lists them in. */
export const achievementValueSourceLabels: Record<AchievementValueSource, string> = {
	'constant':                     'Number',
	'parameter':                    'Parameter',
	'parameter.offset':             'Parameter with numeric offset',
	'board.leftNeighbor':           'Left dartboard neighbor of parameter',
	'board.rightNeighbor':          'Right dartboard neighbor of parameter',
	'round.throwCount':             'Round throw count',
	'round.modifiedThrowCount':     'Throws using seasonal modifiers',
	'round.number':                 'Round number',
	'round.finalPoints':            'Round final points',
	'round.rawPointsDistinctCount': 'Number of unique unmodified throw scores',
	'round.minimumRawPoints':       'Lowest unmodified throw score',
	'round.singleCount':            'Singles in round',
	'round.doubleCount':            'Doubles in round',
	'round.tripleCount':            'Triples in round',
	'game.roundsPlayed':            'Rounds played',
	'game.placement':               'Final placement',
	'game.validRoundCount':         'Valid rounds',
	'game.victoryCount':            'Victory rounds',
	'game.overshootCount':          'Overshoot rounds',
	'game.failedWinConditionCount': 'Failed-win rounds',
	'game.doubleCount':             'Double hits',
	'game.tripleCount':             'Triple hits',
	'game.rimCount':                'Rim hits',
	'game.missCount':               'Misses',
};

export type AchievementRoundStatus = 'valid' | 'victory' | 'overshoot' | 'failedWinCondition';

export const achievementRoundStatusLabels: Record<AchievementRoundStatus, string> = {
	valid:              'Valid',
	victory:            'Victory',
	overshoot:          'Overshoot',
	failedWinCondition: 'Failed win',
};

/** Draft throw types with their backend AST names, which the editor also shows as labels. */
export const achievementThrowTypeNames = {
	single: 'Single',
	double: 'Double',
	triple: 'Triple',
	rim:    'Rim',
	miss:   'Miss',
} as const;

export type AchievementThrowType = keyof typeof achievementThrowTypeNames;

/** Rim and miss throws have no hit location; every other throw type needs one. */
export const throwTypeHasHitLocation = (throwType: string): boolean =>
	throwType !== 'rim' && throwType !== 'miss';

export const sequenceTargetCount = 3;

/** Where a block is evaluated: once per game, or once per round inside a round block. */
export type AchievementRuleScope = 'root' | 'round';

export interface AchievementValueDraft {
	source: AchievementValueSource;
	value: string;
	offset?: number;
}

export interface AchievementGroupRuleDraft {
	id: string;
	type: 'all' | 'any';
	children: AchievementRuleDraft[];
}

export interface AchievementNotRuleDraft {
	id: string;
	type: 'not';
	child: AchievementRuleDraft;
}

export interface AchievementRoundRuleDraft {
	id: string;
	type: 'round';
	quantifier: 'any' | 'all';
	statuses: AchievementRoundStatus[];
	condition: AchievementRuleDraft;
}

export interface AchievementThrowRuleDraft {
	id: string;
	type: 'throw';
	quantifier: 'any' | 'all';
	scope: 'currentRound';
	hitLocation?: AchievementValueDraft;
	throwType: 'any' | AchievementThrowType;
}

export interface AchievementComparisonRuleDraft {
	id: string;
	type: 'compare';
	left: AchievementValueDraft;
	operator: AchievementComparisonOperator;
	right: AchievementValueDraft;
}

export interface AchievementThrowCountRuleDraft {
	id: string;
	type: 'throwCount';
	hitLocation?: AchievementValueDraft;
	throwType: 'any' | AchievementThrowType;
	operator: AchievementComparisonOperator;
	count: AchievementValueDraft;
}

export interface AchievementWinningThrowRuleDraft {
	id: string;
	type: 'winningThrow';
	hitLocation?: AchievementValueDraft;
	throwType: 'any' | 'single' | 'double' | 'triple';
}

export interface AchievementSequenceTargetDraft {
	id: string;
	hitLocation: AchievementValueDraft;
	throwType: 'anyScoring' | AchievementThrowType;
}

export interface AchievementSequenceRuleDraft {
	id: string;
	type: 'sequence';
	scope: 'sameRound';
	targets: AchievementSequenceTargetDraft[];
}

export interface AchievementRawRuleDraft {
	id: string;
	type: 'raw';
	ast: Record<string, unknown>;
}

export type AchievementRuleDraft =
	| AchievementGroupRuleDraft
	| AchievementNotRuleDraft
	| AchievementRoundRuleDraft
	| AchievementThrowRuleDraft
	| AchievementComparisonRuleDraft
	| AchievementThrowCountRuleDraft
	| AchievementWinningThrowRuleDraft
	| AchievementSequenceRuleDraft
	| AchievementRawRuleDraft;

export type EditableAchievementRuleType = Exclude<AchievementRuleDraft['type'], 'raw'>;

/**
 * Where each block may appear. The draft editor, the validator and the compiler all read
 * this table, so a block can't be offered somewhere the compiler then rejects.
 */
export const achievementRulePlacements: Record<
	EditableAchievementRuleType,
	{ scopes: readonly AchievementRuleScope[]; message?: string; }
> = {
	all:          { scopes: [ 'root', 'round' ] },
	any:          { scopes: [ 'root', 'round' ] },
	not:          { scopes: [ 'root', 'round' ] },
	compare:      { scopes: [ 'root', 'round' ] },
	round:        { scopes: [ 'root' ], message: 'Round blocks cannot be nested inside another round block.' },
	winningThrow: { scopes: [ 'root' ], message: 'Winning-throw blocks must be used at the game level.' },
	throw:        { scopes: [ 'round' ], message: 'Throw blocks must be nested inside a round block.' },
	throwCount:   { scopes: [ 'round' ], message: 'Throw-count blocks must be nested inside a round block.' },
	sequence:     { scopes: [ 'round' ], message: 'Sequence blocks must be nested inside a round block.' },
};

/** Why a block can't be used in the given scope, or undefined when it can. */
export const getRulePlacementError = (
	type: AchievementRuleDraft['type'],
	scope: AchievementRuleScope,
): string | undefined => {
	if (type === 'raw')
		return undefined;

	const placement = achievementRulePlacements[type];

	return placement.scopes.includes(scope)
		? undefined
		: placement.message ?? 'This block cannot be used here.';
};

/** One comparison of a parameter with a value, e.g. `{threshold} >= 100`. */
export interface AchievementVariantConditionDraft {
	parameter: string;
	operator:  AchievementComparisonOperator;
	value:     string | number | boolean;
}

/** Generated achievements that match every condition get this tier instead of the default. */
export interface AchievementTierRuleDraft {
	tier: number;
	when: AchievementVariantConditionDraft[];
}

/** Generated achievements that match every condition are left out. */
export interface AchievementSkipRuleDraft {
	when: AchievementVariantConditionDraft[];
}

export interface AchievementTemplateDraft {
	id?: string;
	seasonId: string;
	nameTemplate: string;
	descriptionTemplate: string;
	categoryId: string;
	/** The tier of every generated achievement no tier rule matches. */
	tier: number;
	/** Checked in order; the first rule that matches decides the tier. */
	tierRules: AchievementTierRuleDraft[];
	skipRules: AchievementSkipRuleDraft[];
	achievementScope: AchievementScope;
	parameters: AchievementParameterDraft[];
	rule: AchievementRuleDraft;
	progression?: AchievementProgressionDraft;
}

export interface AchievementTemplatePreview {
	bindings: Record<string, string | number | boolean>;
	name: string;
	description: string;
	tier: number;
}

export interface AchievementProgressionTargetDraft {
	id: string;
	hitLocation: AchievementValueDraft;
	throwType: 'single' | 'double' | 'triple';
}

export interface AchievementProgressionDraft {
	statuses: ('valid' | 'victory')[];
	targets: AchievementProgressionTargetDraft[];
	/**
	 * Stored progression logic the target editor cannot represent. It is saved back
	 * verbatim as the definition's root and reducers, so opening and saving such a
	 * template never replaces its logic. It is never stored in the editor tree.
	 */
	raw?: { root: unknown; reducers: unknown; };
}

export const createAchievementBuilderId = (): string =>
	globalThis.crypto?.randomUUID?.()
		?? `${ Date.now() }-${ Math.random().toString(16).slice(2) }`;

export const createDefaultAchievementRule = (): AchievementGroupRuleDraft => ({
	id: createAchievementBuilderId(),
	type: 'all',
	children: [],
});

export const createDefaultAchievementProgression = (): AchievementProgressionDraft => ({
	statuses: [ 'valid', 'victory' ],
	targets:  [],
});

export const createEmptyAchievementTemplate = (
	seasonId: string,
): AchievementTemplateDraft => ({
	seasonId,
	nameTemplate: '',
	descriptionTemplate: '',
	categoryId: '',
	tier: 1,
	tierRules: [],
	skipRules: [],
	achievementScope: 'session',
	parameters: [],
	rule: createDefaultAchievementRule(),
	progression: undefined,
});
