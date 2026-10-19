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

export type AchievementComparisonOperator =
	| 'equal'
	| 'notEqual'
	| 'greaterThan'
	| 'greaterThanOrEqual'
	| 'lessThan'
	| 'lessThanOrEqual';

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

export type AchievementRoundStatus = 'valid' | 'victory' | 'overshoot' | 'failedWinCondition';

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
	throwType: 'any' | 'single' | 'double' | 'triple' | 'rim' | 'miss';
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
	throwType: 'any' | 'single' | 'double' | 'triple' | 'rim' | 'miss';
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
	throwType: 'anyScoring' | 'single' | 'double' | 'triple' | 'rim' | 'miss';
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

export interface AchievementTemplateDraft {
	id?: string;
	seasonId: string;
	nameTemplate: string;
	descriptionTemplate: string;
	categoryId: string;
	tier: number;
	achievementScope: AchievementScope;
	parameters: AchievementParameterDraft[];
	rule: AchievementRuleDraft;
	progression?: AchievementProgressionDraft;
}

export interface AchievementTemplatePreview {
	bindings: Record<string, string | number | boolean>;
	name: string;
	description: string;
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
	 * verbatim, so opening and saving such a template never replaces its logic.
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
	achievementScope: 'session',
	parameters: [],
	rule: createDefaultAchievementRule(),
	progression: undefined,
});
