import {
	AchievementGroupRuleDraft,
	AchievementParameterDraft,
	AchievementRoundStatus,
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementTemplatePreview,
	AchievementValueDraft,
	AchievementValueSource,
	createAchievementBuilderId,
	createDefaultAchievementRule,
} from '../../models/achievementBuilder.js';
import type {
	AchievementCategoryResponse,
	AchievementParameterDefinition,
} from '../../models/achievementBuilderApi.js';
import { AchievementTier } from '../../models/enums.js';

export type BuilderScope = 'root' | 'round';
export type BuilderTab = 'details' | 'parameters' | 'logic';
export type ValueEditorRole = 'comparison-left' | 'comparison-right' | 'hit-location';
export type EditableAchievementRuleType = Exclude<AchievementRuleDraft['type'], 'raw'>;
export type ParameterValue = string | number | boolean;
export type ParameterBinding = Record<string, ParameterValue>;

export const sequenceTargetCount = 3;
export const parameterKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ruleTypes: { value: EditableAchievementRuleType; label: string; }[] = [
	{ value: 'all', label: 'All conditions' },
	{ value: 'any', label: 'Any condition' },
	{ value: 'not', label: 'Not' },
	{ value: 'round', label: 'Round matches' },
	{ value: 'throw', label: 'Throw matches' },
	{ value: 'throwCount', label: 'Count matching throws' },
	{ value: 'winningThrow', label: 'Winning throw' },
	{ value: 'compare', label: 'Compare values' },
	{ value: 'sequence', label: 'Ordered sequence' },
];

export const getRuleTypeLabel = (rule: AchievementRuleDraft): string =>
	rule.type === 'raw'
		? 'Advanced condition'
		: ruleTypes.find(item => item.value === rule.type)?.label ?? rule.type;

export const valueSources: { value: AchievementValueSource; label: string; }[] = [
	{ value: 'constant', label: 'Number' },
	{ value: 'parameter', label: 'Parameter' },
	{ value: 'parameter.offset', label: 'Parameter with numeric offset' },
	{ value: 'board.leftNeighbor', label: 'Left dartboard neighbor of parameter' },
	{ value: 'board.rightNeighbor', label: 'Right dartboard neighbor of parameter' },
	{ value: 'round.throwCount', label: 'Round throw count' },
	{ value: 'round.modifiedThrowCount', label: 'Throws using seasonal modifiers' },
	{ value: 'round.number', label: 'Round number' },
	{ value: 'round.finalPoints', label: 'Round final-points sum' },
	{ value: 'round.rawPointsDistinctCount', label: 'Number of unique unmodified throw scores' },
	{ value: 'round.minimumRawPoints', label: 'Lowest unmodified throw score' },
	{ value: 'round.singleCount', label: 'Singles in round' },
	{ value: 'round.doubleCount', label: 'Doubles in round' },
	{ value: 'round.tripleCount', label: 'Triples in round' },
	{ value: 'game.roundsPlayed', label: 'Rounds played' },
	{ value: 'game.placement', label: 'Final placement' },
	{ value: 'game.validRoundCount', label: 'Valid rounds' },
	{ value: 'game.victoryCount', label: 'Victory rounds' },
	{ value: 'game.overshootCount', label: 'Overshoot rounds' },
	{ value: 'game.failedWinConditionCount', label: 'Failed-win rounds' },
	{ value: 'game.doubleCount', label: 'Double hits' },
	{ value: 'game.tripleCount', label: 'Triple hits' },
	{ value: 'game.rimCount', label: 'Rim hits' },
	{ value: 'game.missCount', label: 'Misses' },
];

export const roundStatusOptions: { value: AchievementRoundStatus; label: string; }[] = [
	{ value: 'valid', label: 'Valid' },
	{ value: 'victory', label: 'Victory' },
	{ value: 'overshoot', label: 'Overshoot' },
	{ value: 'failedWinCondition', label: 'Failed win' },
];

const parameterValueSources: AchievementValueSource[] = [
	'parameter',
	'parameter.offset',
	'board.leftNeighbor',
	'board.rightNeighbor',
];

export const isParameterValueSource = (source: AchievementValueSource): boolean =>
	parameterValueSources.includes(source);

export const isGroupRule = (rule: AchievementRuleDraft): rule is AchievementGroupRuleDraft =>
	rule.type === 'all' || rule.type === 'any';

export const throwTypeHasHitLocation = (throwType: string): boolean =>
	throwType !== 'rim' && throwType !== 'miss';

export const createDefaultHitLocation = (): AchievementValueDraft =>
	({ source: 'constant', value: '20' });

/** Rim and miss throws have no hit location; every other throw type needs one. */
export const getThrowTypePatch = <TThrowType extends string>(
	throwType: TThrowType,
	hitLocation: AchievementValueDraft | undefined,
): { throwType: TThrowType; hitLocation: AchievementValueDraft | undefined; } => ({
	throwType,
	hitLocation: throwTypeHasHitLocation(throwType)
		? hitLocation ?? createDefaultHitLocation()
		: undefined,
});

const getChildRules = (rule: AchievementRuleDraft): AchievementRuleDraft[] => {
	switch (rule.type) {
	case 'all':
	case 'any':
		return rule.children;
	case 'not':
		return [ rule.child ];
	case 'round':
		return [ rule.condition ];
	default:
		return [];
	}
};

export const findRule = (
	root: AchievementRuleDraft,
	id: string,
): AchievementRuleDraft | undefined => {
	if (root.id === id)
		return root;

	for (const child of getChildRules(root)) {
		const found = findRule(child, id);
		if (found)
			return found;
	}

	return undefined;
};

/** Replaces the rule with the given id, or removes it when no replacement is given. */
export const replaceRule = (
	current: AchievementRuleDraft,
	id: string,
	replacement?: AchievementRuleDraft,
): AchievementRuleDraft => {
	if (current.id === id)
		return replacement ?? createDefaultAchievementRule();

	switch (current.type) {
	case 'all':
	case 'any':
		return {
			...current,
			children: current.children
				.filter(child => replacement || child.id !== id)
				.map(child => replaceRule(child, id, replacement)),
		};
	case 'not':
		return { ...current, child: replaceRule(current.child, id, replacement) };
	case 'round':
		return { ...current, condition: replaceRule(current.condition, id, replacement) };
	default:
		return current;
	}
};

export const updateRule = (
	root: AchievementRuleDraft,
	id: string,
	patch: Partial<AchievementRuleDraft>,
): AchievementRuleDraft => {
	const current = findRule(root, id);

	return current
		? replaceRule(root, id, { ...current, ...patch } as AchievementRuleDraft)
		: root;
};

export const appendChildRule = (
	root: AchievementRuleDraft,
	parentId: string,
	child: AchievementRuleDraft,
): AchievementRuleDraft => {
	const parent = findRule(root, parentId);
	if (!parent)
		return root;

	if (isGroupRule(parent))
		return updateRule(root, parentId, { children: [ ...parent.children, child ] });

	if (parent.type === 'round') {
		const condition = parent.condition.type === 'all'
			? parent.condition
			: { ...createDefaultAchievementRule(), children: [ parent.condition ] };

		return updateRule(root, parentId, {
			condition: { ...condition, children: [ ...condition.children, child ] },
		});
	}

	if (parent.type === 'not' && isGroupRule(parent.child)) {
		return updateRule(root, parentId, {
			child: { ...parent.child, children: [ ...parent.child.children, child ] },
		});
	}

	return root;
};

export const createRule = (
	type: EditableAchievementRuleType,
	scope: BuilderScope = 'root',
): AchievementRuleDraft => {
	const id = createAchievementBuilderId();
	const constant = (value: string): AchievementValueDraft => ({ source: 'constant', value });

	switch (type) {
	case 'all':
	case 'any':
		return { id, type, children: [] };
	case 'not':
		return { id, type, child: createDefaultAchievementRule() };
	case 'round':
		return {
			id,
			type,
			quantifier: 'any',
			statuses:   [ 'valid', 'victory' ],
			condition:  createDefaultAchievementRule(),
		};
	case 'throw':
		return {
			id,
			type,
			quantifier:  'any',
			scope:       'currentRound',
			hitLocation: createDefaultHitLocation(),
			throwType:   'any',
		};
	case 'throwCount':
		return {
			id,
			type,
			hitLocation: createDefaultHitLocation(),
			throwType:   'any',
			operator:    'equal',
			count:       constant('1'),
		};
	case 'winningThrow':
		return {
			id,
			type,
			hitLocation: createDefaultHitLocation(),
			throwType:   'any',
		};
	case 'compare':
		return {
			id,
			type,
			left: {
				source: scope === 'round' ? 'round.throwCount' : 'game.roundsPlayed',
				value:  '',
			},
			operator: 'equal',
			right:    constant('0'),
		};
	case 'sequence':
		return { id, type, scope: 'sameRound', targets: [] };
	}
};

export const getAvailableValueSources = (
	scope: BuilderScope,
	role: ValueEditorRole,
): AchievementValueSource[] => {
	const common: AchievementValueSource[] = [ 'constant', ...parameterValueSources ];
	if (role === 'hit-location')
		return common;

	const scopePrefix = scope === 'round' ? 'round.' : 'game.';

	return [
		...common,
		...valueSources
			.map(source => source.value)
			.filter(source => source.startsWith(scopePrefix))
			.filter(source => role === 'comparison-left' || source !== 'round.minimumRawPoints'),
	];
};

/** Number of conditions a block visually connects to (structural groups are unwrapped). */
export const getDirectChildCount = (rule: AchievementRuleDraft): number => {
	switch (rule.type) {
	case 'all':
	case 'any':
		return rule.children.length;
	case 'round':
		return isGroupRule(rule.condition) ? rule.condition.children.length : 1;
	case 'not':
		return isGroupRule(rule.child) ? rule.child.children.length : 1;
	default:
		return 0;
	}
};

export const getAddableRuleTypes = (
	scope: BuilderScope,
	parent: AchievementRuleDraft,
): typeof ruleTypes => {
	const roundOnly: EditableAchievementRuleType[] = [ 'throw', 'throwCount', 'sequence' ];
	const rootOnly: EditableAchievementRuleType[] = [ 'round', 'winningThrow' ];
	const directChildCount = getDirectChildCount(parent);

	return ruleTypes.filter(({ value }) => {
		if (directChildCount === 0 && (value === 'all' || value === 'any'))
			return false;
		if (parent.type === 'not' && value === 'not')
			return false;

		return scope === 'round'
			? !rootOnly.includes(value)
			: !roundOnly.includes(value);
	});
};

const getRangeBounds = (
	parameter: AchievementParameterDraft,
): { minimum: number; maximum: number; step: number; } => {
	const minimum = parameter.minimum ?? 0;

	return {
		minimum,
		maximum: parameter.maximum ?? minimum,
		step:    Math.max(parameter.step ?? 1, 1),
	};
};

const countRange = (minimum: number, maximum: number, step: number): number =>
	Math.max(0, Math.floor((maximum - minimum) / Math.max(step, 1)) + 1);

/** Values a parameter generates, deduplicated the same way the backend expands them. */
export const getParameterValues = (
	parameter: AchievementParameterDraft,
	limit = Number.POSITIVE_INFINITY,
): ParameterValue[] => {
	if (parameter.generatorType === 'range') {
		const { minimum, maximum, step } = getRangeBounds(parameter);
		const values: number[] = [];
		for (let value = minimum; value <= maximum && values.length < limit; value += step)
			values.push(value);

		return values;
	}

	const values = parameter.valueType === 'integer'
		? parameter.values.map(Number).filter(Number.isFinite)
		: parameter.valueType === 'boolean'
			? parameter.values.map(value => value.toLowerCase() === 'true')
			: parameter.values;

	return [ ...new Set<ParameterValue>(values) ].slice(0, limit);
};

export const countParameterValues = (parameter: AchievementParameterDraft): number => {
	if (parameter.generatorType !== 'range')
		return getParameterValues(parameter).length;

	const { minimum, maximum, step } = getRangeBounds(parameter);

	return countRange(minimum, maximum, step);
};

export const countGeneratedInstances = (parameters: AchievementParameterDraft[]): number =>
	parameters.reduce((count, parameter) => count * countParameterValues(parameter), 1);

export const countDefinitionInstances = (
	parameters: AchievementParameterDefinition[],
): number => parameters.reduce((count, parameter) => {
	switch (parameter.kind) {
	case 'IntegerRange': {
		const minimum = parameter.minimum ?? 0;

		return count * countRange(minimum, parameter.maximum ?? minimum, parameter.step);
	}
	case 'IntegerSet':
		return count * new Set(parameter.integerValues).size;
	case 'StringSet':
		return count * new Set(parameter.stringValues).size;
	case 'BooleanSet':
		return count * new Set(parameter.booleanValues).size;
	}
}, 1);

export const renderTemplateText = (template: string, binding: ParameterBinding): string =>
	Object.entries(binding).reduce(
		(result, [ key, value ]) => result.replaceAll(`{${ key }}`, String(value)),
		template,
	);

const createPreview = (
	draft: AchievementTemplateDraft,
	binding: ParameterBinding,
): AchievementTemplatePreview => ({
	bindings:    binding,
	name:        renderTemplateText(draft.nameTemplate, binding),
	description: renderTemplateText(draft.descriptionTemplate, binding),
});

/**
 * The generated achievements in generation order, up to `limit`, or an empty
 * list while a parameter has no values.
 */
export const getPreviews = (
	draft: AchievementTemplateDraft,
	limit = Number.POSITIVE_INFINITY,
): AchievementTemplatePreview[] => {
	if (countGeneratedInstances(draft.parameters) === 0)
		return [];

	const valueLists = draft.parameters.map(parameter => getParameterValues(parameter, limit));
	const previews: AchievementTemplatePreview[] = [];
	const binding: ParameterBinding = {};
	const visit = (index: number): void => {
		if (index === draft.parameters.length) {
			previews.push(createPreview(draft, { ...binding }));

			return;
		}

		for (const value of valueLists[index]!) {
			if (previews.length >= limit)
				return;

			binding[draft.parameters[index]!.key] = value;
			visit(index + 1);
		}
	};
	visit(0);

	return previews;
};

export const sortCategories = (
	categories: AchievementCategoryResponse[],
): AchievementCategoryResponse[] =>
	[ ...categories ].sort((left, right) => left.sortOrder - right.sortOrder);

export const getDefaultCategoryId = (categories: AchievementCategoryResponse[]): string => {
	const active = sortCategories(categories.filter(category => !category.isArchived));

	return active.find(category => category.name.localeCompare('Custom', undefined, {
		sensitivity: 'accent',
	}) === 0)?.id
		?? active[0]?.id
		?? '';
};

export interface DraftValidationError {
	tab:     BuilderTab;
	message: string;
}

export interface DraftValidationContext {
	categories:                AchievementCategoryResponse[];
	maximumGeneratedInstances: number;
}

const getValueErrors = (
	value: AchievementValueDraft,
	path: string,
	scope: BuilderScope,
	role: ValueEditorRole,
	parameters: AchievementParameterDraft[],
): string[] => {
	const errors: string[] = [];
	if (!getAvailableValueSources(scope, role).includes(value.source))
		errors.push(`${ path } is not available in this block scope.`);

	if (isParameterValueSource(value.source)) {
		const parameter = parameters.find(item => item.key === value.value);
		if (!parameter)
			errors.push(`${ path } references a missing parameter.`);
		else if (value.source !== 'parameter' && parameter.valueType !== 'integer')
			errors.push(`${ path } needs an integer parameter.`);
		else if (value.source === 'parameter.offset' && !Number.isInteger(value.offset))
			errors.push(`${ path } needs an integer offset.`);
	}
	else if (value.source === 'constant' && !/^-?\d+$/.test(value.value.trim())) {
		errors.push(`${ path } needs a whole-number constant.`);
	}

	return errors;
};

const getRuleErrors = (
	rule: AchievementRuleDraft,
	path: string,
	scope: BuilderScope,
	parameters: AchievementParameterDraft[],
): string[] => {
	const valueErrors = (
		value: AchievementValueDraft | undefined,
		valuePath: string,
		role: ValueEditorRole = 'hit-location',
	): string[] => value
		? getValueErrors(value, `${ path } ${ valuePath }`, scope, role, parameters)
		: [];

	switch (rule.type) {
	case 'all':
	case 'any':
		return [
			...rule.children.length === 0 ? [ `${ path } needs at least one child block.` ] : [],
			...rule.children.flatMap((child, index) =>
				getRuleErrors(child, `${ path } ${ index + 1 }`, scope, parameters)),
		];
	case 'not':
		return getRuleErrors(rule.child, `${ path } not`, scope, parameters);
	case 'round':
		return [
			...rule.statuses.length === 0
				? [ `${ path } must include at least one round status.` ]
				: [],
			...getRuleErrors(rule.condition, `${ path } round condition`, 'round', parameters),
		];
	case 'throw':
		return !rule.hitLocation && rule.throwType === 'any'
			? [ `${ path } needs a hit location or a throw type.` ]
			: valueErrors(rule.hitLocation, 'hit location');
	case 'throwCount':
		return [
			...valueErrors(rule.hitLocation, 'hit location'),
			...valueErrors(rule.count, 'count', 'comparison-right'),
		];
	case 'compare':
		return [
			...valueErrors(rule.left, 'left value', 'comparison-left'),
			...valueErrors(rule.right, 'right value', 'comparison-right'),
		];
	case 'sequence':
		return [
			...rule.targets.length === sequenceTargetCount
				? []
				: [ `${ path } needs exactly ${ sequenceTargetCount } sequence targets.` ],
			...rule.targets.flatMap((target, index) =>
				throwTypeHasHitLocation(target.throwType)
					? valueErrors(target.hitLocation, `target ${ index + 1 }`)
					: []),
		];
	case 'winningThrow':
		return valueErrors(rule.hitLocation, 'hit location');
	case 'raw':
		return [];
	}
};

const getParameterErrors = (parameter: AchievementParameterDraft): string[] => {
	const label = `Parameter ${ parameter.key || '(unnamed)' }`;
	if (parameter.generatorType === 'range') {
		const { minimum, maximum, step } = parameter;
		if (minimum === undefined || maximum === undefined || step === undefined)
			return [ `${ label } needs a complete range.` ];
		if (![ minimum, maximum, step ].every(Number.isInteger))
			return [ `${ label } range values must be whole numbers.` ];
		if (minimum > maximum || step <= 0)
			return [ `${ label } has an invalid range.` ];

		return [];
	}

	if (parameter.values.length === 0)
		return [ `${ label } needs at least one value.` ];
	if (
		parameter.valueType === 'integer'
		&& parameter.values.some(value => !/^-?\d+$/.test(value.trim()))
	)
		return [ `${ label } values must be whole numbers.` ];

	return [];
};

export const validateDraft = (
	draft: AchievementTemplateDraft,
	context: DraftValidationContext,
): DraftValidationError[] => {
	const errors: DraftValidationError[] = [];
	const add = (tab: BuilderTab, messages: string[]): void => {
		errors.push(...messages.map(message => ({ tab, message })));
	};

	if (!draft.nameTemplate.trim())
		add('details', [ 'Name is required.' ]);
	if (!draft.descriptionTemplate.trim())
		add('details', [ 'Description is required.' ]);

	const category = context.categories.find(item => item.id === draft.categoryId);
	if (!category)
		add('details', [ 'Choose a valid category.' ]);
	else if (category.isArchived && !draft.id)
		add('details', [ 'Choose an active category for a new achievement.' ]);
	if (!Object.values(AchievementTier).includes(draft.tier))
		add('details', [ 'Choose a valid achievement tier.' ]);

	const keys = draft.parameters.map(parameter => parameter.key);
	if (keys.some(key => !parameterKeyPattern.test(key)))
		add('parameters', [ 'Parameter keys must start with a letter and contain only letters, numbers, and _.' ]);
	if (new Set(keys).size !== keys.length)
		add('parameters', [ 'Parameter keys must be unique.' ]);

	add('parameters', draft.parameters.flatMap(getParameterErrors));

	const generatedCount = countGeneratedInstances(draft.parameters);
	if (generatedCount > context.maximumGeneratedInstances) {
		add('parameters', [
			`This template generates ${ generatedCount } achievements; the limit is ${
				context.maximumGeneratedInstances
			}.`,
		]);
	}

	const missingNameKeys = draft.parameters
		.filter(parameter => countParameterValues(parameter) > 1)
		.map(parameter => `{${ parameter.key }}`)
		.filter(token => !draft.nameTemplate.includes(token));
	if (missingNameKeys.length > 0)
		add('details', [ `Name must include ${ missingNameKeys.join(', ') } so every generated achievement has a distinct name.` ]);


	if (draft.achievementScope === 'progression') {
		const targets = draft.progression?.targets ?? [];
		if (targets.length === 0)
			add('logic', [ 'Progression achievements need at least one target segment.' ]);

		add('logic', targets.flatMap((target, index) => getValueErrors(
			target.hitLocation,
			`Progression target ${ index + 1 }`,
			'root',
			'hit-location',
			draft.parameters,
		)));
	}
	else {
		add('logic', getRuleErrors(draft.rule, 'Logic', 'root', draft.parameters));
	}

	return errors;
};
