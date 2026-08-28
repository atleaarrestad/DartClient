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
	| 'board.leftNeighbor'
	| 'board.rightNeighbor'
	| 'round.throwCount'
	| 'round.finalPoints'
	| 'round.rawPointsDistinctCount'
	| 'round.minimumRawPoints'
	| 'round.singleCount'
	| 'round.doubleCount'
	| 'round.tripleCount'
	| 'game.roundsPlayed'
	| 'game.placement'
	| 'game.overshootCount'
	| 'game.rimCount'
	| 'game.missCount';

export interface AchievementValueDraft {
	source: AchievementValueSource;
	value: string;
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
	statuses: ('valid' | 'victory' | 'overshoot' | 'failedWinCondition')[];
	condition: AchievementRuleDraft;
}

export interface AchievementThrowRuleDraft {
	id: string;
	type: 'throw';
	quantifier: 'any' | 'all';
	scope: 'currentRound';
	hitLocation: AchievementValueDraft;
	throwType: 'any' | 'single' | 'double' | 'triple' | 'rim' | 'miss';
}

export interface AchievementComparisonRuleDraft {
	id: string;
	type: 'compare';
	left: AchievementValueDraft;
	operator: AchievementComparisonOperator;
	right: AchievementValueDraft;
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

export type AchievementRuleDraft =
	| AchievementGroupRuleDraft
	| AchievementNotRuleDraft
	| AchievementRoundRuleDraft
	| AchievementThrowRuleDraft
	| AchievementComparisonRuleDraft
	| AchievementSequenceRuleDraft;

export interface AchievementTemplateDraft {
	id?: string;
	seasonId: string;
	nameTemplate: string;
	descriptionTemplate: string;
	category: string;
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
}

export const createAchievementBuilderId = (): string =>
	globalThis.crypto?.randomUUID?.()
		?? `${ Date.now() }-${ Math.random().toString(16).slice(2) }`;

export const createDefaultAchievementRule = (): AchievementGroupRuleDraft => ({
	id: createAchievementBuilderId(),
	type: 'all',
	children: [],
});

export const createEmptyAchievementTemplate = (
	seasonId: string,
): AchievementTemplateDraft => ({
	seasonId,
	nameTemplate: '',
	descriptionTemplate: '',
	category: 'Custom',
	tier: 1,
	achievementScope: 'session',
	parameters: [],
	rule: createDefaultAchievementRule(),
	progression: undefined,
});
