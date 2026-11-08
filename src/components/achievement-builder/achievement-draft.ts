import {
	compileAchievementTemplate,
	measureAchievementAst,
} from '../../helpers/compileAchievementTemplate.js';
import {
	achievementRoundStatusLabels,
	achievementRulePlacements,
	AchievementRuleScope,
	achievementValueSourceLabels,
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
	EditableAchievementRuleType,
	getRulePlacementError,
	sequenceTargetCount,
	throwTypeHasHitLocation,
} from '../../models/achievementBuilder.js';
import type {
	AchievementBuilderCatalog,
	AchievementCategoryResponse,
	AchievementParameterDefinition,
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
} from '../../models/achievementBuilderApi.js';
import { achievementTiersAscending } from '../../models/enums.js';

export type BuilderScope = AchievementRuleScope;
export type BuilderTab = 'details' | 'parameters' | 'logic';
export type ValueEditorRole = 'comparison-left' | 'comparison-right' | 'hit-location';
export type ParameterValue = string | number | boolean;
export type ParameterBinding = Record<string, ParameterValue>;

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

const toOptions = <TValue extends string>(
	labels: Record<TValue, string>,
): { value: TValue; label: string; }[] =>
	(Object.entries(labels) as [ TValue, string ][]).map(([ value, label ]) => ({ value, label }));

export const valueSources = toOptions<AchievementValueSource>(achievementValueSourceLabels);

export const roundStatusOptions = toOptions<AchievementRoundStatus>(achievementRoundStatusLabels);

const parameterValueSources: AchievementValueSource[] = [
	'parameter',
	'parameter.offset',
	'board.leftNeighbor',
	'board.rightNeighbor',
];

export const isParameterValueSource = (source: AchievementValueSource): boolean =>
	parameterValueSources.includes(source);

/**
 * Whether a parameter can fill a value slot. Offsets and board neighbors need a number;
 * a parameter used directly may be text or yes/no only where the slot isn't numeric.
 */
export const canUseParameterAs = (
	parameter: AchievementParameterDraft,
	source: AchievementValueSource,
	numericOnly: boolean,
): boolean => parameter.valueType === 'integer' || (source === 'parameter' && !numericOnly);

export const isGroupRule = (rule: AchievementRuleDraft): rule is AchievementGroupRuleDraft =>
	rule.type === 'all' || rule.type === 'any';

export const createDefaultHitLocation = (): AchievementValueDraft =>
	({ source: 'constant', value: '20' });

/** Drops or adds the hit location as the throw type needs (see throwTypeHasHitLocation). */
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
const getDirectChildCount = (rule: AchievementRuleDraft): number => {
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
	const directChildCount = getDirectChildCount(parent);

	return ruleTypes.filter(({ value }) => {
		if (directChildCount === 0 && (value === 'all' || value === 'any'))
			return false;
		if (parent.type === 'not' && value === 'not')
			return false;

		return achievementRulePlacements[value].scopes.includes(scope);
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

const renderTemplateText = (template: string, binding: ParameterBinding): string =>
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

/**
 * The draft that saving would overwrite when editing starts from another version. The
 * backend keeps at most one Draft per template and writes every save into it, so editing
 * an older version must not silently replace that draft.
 */
export const getConflictingDraftVersion = (
	template: AchievementTemplateResponse,
	versionId: string,
): AchievementTemplateVersionResponse | undefined =>
	template.versions.find(version => version.status === 'Draft' && version.id !== versionId);

const mapRuleValues = (
	rule: AchievementRuleDraft,
	mapValue: (value: AchievementValueDraft) => AchievementValueDraft,
	mapAst: (ast: unknown) => unknown,
): AchievementRuleDraft => {
	const mapOptional = (value: AchievementValueDraft | undefined) => value && mapValue(value);
	switch (rule.type) {
	case 'all':
	case 'any':
		return { ...rule, children: rule.children.map(child => mapRuleValues(child, mapValue, mapAst)) };
	case 'not':
		return { ...rule, child: mapRuleValues(rule.child, mapValue, mapAst) };
	case 'round':
		return { ...rule, condition: mapRuleValues(rule.condition, mapValue, mapAst) };
	case 'throw':
	case 'winningThrow':
		return { ...rule, hitLocation: mapOptional(rule.hitLocation) };
	case 'throwCount':
		return { ...rule, hitLocation: mapOptional(rule.hitLocation), count: mapValue(rule.count) };
	case 'compare':
		return { ...rule, left: mapValue(rule.left), right: mapValue(rule.right) };
	case 'sequence':
		return {
			...rule,
			targets: rule.targets.map(target => ({ ...target, hitLocation: mapValue(target.hitLocation) })),
		};
	case 'raw':
		return { ...rule, ast: mapAst(rule.ast) as Record<string, unknown> };
	}
};

/** Renames `{ kind: 'parameter' }` references anywhere in stored logic. */
const renameAstParameters = (ast: unknown, oldKey: string, newKey: string): unknown => {
	if (Array.isArray(ast))
		return ast.map(item => renameAstParameters(item, oldKey, newKey));
	if (!ast || typeof ast !== 'object')
		return ast;

	const node = Object.fromEntries(Object.entries(ast)
		.map(([ key, value ]) => [ key, renameAstParameters(value, oldKey, newKey) ]));

	return node['kind'] === 'parameter' && node['name'] === oldKey
		? { ...node, name: newKey }
		: node;
};

/**
 * Points every reference to parameter `oldKey` at `newKey`: the logic blocks, progression
 * targets, raw logic and the {tokens} in the name and description. The draft is returned
 * unchanged when the rename would be ambiguous: either key is not a valid parameter key,
 * another parameter still uses the old key, or several parameters now use the new key.
 */
export const renameParameterReferences = (
	draft: AchievementTemplateDraft,
	oldKey: string,
	newKey: string,
): AchievementTemplateDraft => {
	const keyCount = (key: string): number =>
		draft.parameters.filter(parameter => parameter.key === key).length;
	if (
		oldKey === newKey
		|| !parameterKeyPattern.test(oldKey)
		|| !parameterKeyPattern.test(newKey)
		|| keyCount(oldKey) > 0
		|| keyCount(newKey) !== 1
	)
		return draft;

	const mapValue = (value: AchievementValueDraft): AchievementValueDraft =>
		isParameterValueSource(value.source) && value.value === oldKey
			? { ...value, value: newKey }
			: value;
	const mapAst = (ast: unknown): unknown => renameAstParameters(ast, oldKey, newKey);
	const renameToken = (text: string): string => text.replaceAll(`{${ oldKey }}`, `{${ newKey }}`);
	const { progression } = draft;

	return {
		...draft,
		nameTemplate:        renameToken(draft.nameTemplate),
		descriptionTemplate: renameToken(draft.descriptionTemplate),
		rule:                mapRuleValues(draft.rule, mapValue, mapAst),
		progression:         progression && {
			...progression,
			targets: progression.targets.map(target => ({ ...target, hitLocation: mapValue(target.hitLocation) })),
			raw:     progression.raw && {
				root:     mapAst(progression.raw.root),
				reducers: mapAst(progression.raw.reducers),
			},
		},
	};
};

export interface DraftValidationError {
	tab:     BuilderTab;
	message: string;
}

/** The server's builder limits that draft validation checks (see the catalog endpoint). */
export type AchievementDraftLimits = Pick<
	AchievementBuilderCatalog['limits'],
	| 'maximumGeneratedInstances'
	| 'maximumRenderedTextLength'
	| 'maximumDefinitionTextLength'
	| 'maximumAstDepth'
	| 'maximumAstNodes'
	| 'maximumQuantifierDepth'
>;

/** Mirrors the backend defaults in AchievementBuilderLimits. */
export const defaultAchievementDraftLimits: AchievementDraftLimits = {
	maximumGeneratedInstances:   1000,
	maximumRenderedTextLength:   500,
	maximumDefinitionTextLength: 64 * 1024,
	maximumAstDepth:             32,
	maximumAstNodes:             2000,
	maximumQuantifierDepth:      8,
};

export interface DraftValidationContext {
	categories: AchievementCategoryResponse[];
	limits:     AchievementDraftLimits;
}

const int32Minimum = -2147483648;
const int32Maximum = 2147483647;
const int32RangeText = `between ${ int32Minimum } and ${ int32Maximum }`;
const isInt32 = (value: number): boolean =>
	Number.isInteger(value) && value >= int32Minimum && value <= int32Maximum;
const isWholeNumberText = (value: string): boolean => /^-?\d+$/.test(value.trim());

const templateTokenPattern = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

type DraftValueType = AchievementParameterDraft['valueType'];

const valueTypeLabels: Record<DraftValueType, string> = {
	integer: 'a number',
	string:  'text',
	boolean: 'a yes/no value',
};

/** Every value source is an integer except a text or yes/no parameter used directly. */
const getValueType = (
	value: AchievementValueDraft,
	parameters: AchievementParameterDraft[],
): DraftValueType =>
	value.source === 'parameter'
		? parameters.find(parameter => parameter.key === value.value)?.valueType ?? 'integer'
		: 'integer';

const getValueErrors = (
	value: AchievementValueDraft,
	path: string,
	scope: BuilderScope,
	role: ValueEditorRole,
	parameters: AchievementParameterDraft[],
	requiresInteger = true,
): string[] => {
	const errors: string[] = [];
	if (!getAvailableValueSources(scope, role).includes(value.source))
		errors.push(`${ path } is not available in this block scope.`);

	if (isParameterValueSource(value.source)) {
		const parameter = parameters.find(item => item.key === value.value);
		if (!parameter)
			errors.push(`${ path } references a missing parameter.`);
		else if (!canUseParameterAs(parameter, value.source, requiresInteger))
			errors.push(`${ path } needs a number, but {${ parameter.key }} is ${ valueTypeLabels[parameter.valueType] }.`);
		else if (value.source === 'parameter.offset' && !isInt32(value.offset ?? Number.NaN))
			errors.push(`${ path } needs a whole-number offset ${ int32RangeText }.`);
	}
	else if (value.source === 'constant') {
		if (!isWholeNumberText(value.value))
			errors.push(`${ path } needs a whole-number constant.`);
		else if (!isInt32(Number(value.value)))
			errors.push(`${ path } must be ${ int32RangeText }.`);
	}

	return errors;
};

const getComparisonTypeErrors = (
	rule: Extract<AchievementRuleDraft, { type: 'compare'; }>,
	path: string,
	parameters: AchievementParameterDraft[],
): string[] => {
	const leftType = getValueType(rule.left, parameters);
	const rightType = getValueType(rule.right, parameters);
	if (leftType !== rightType) {
		const types = `${ valueTypeLabels[leftType] } with ${ valueTypeLabels[rightType] }`;

		return [ `${ path } compares ${ types }; both sides must have the same type.` ];
	}
	if (leftType === 'boolean' && rule.operator !== 'equal' && rule.operator !== 'notEqual')
		return [ `${ path } can only check yes/no values with "equal" or "not equal".` ];

	return [];
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
		requiresInteger = true,
	): string[] => value
		? getValueErrors(value, `${ path } ${ valuePath }`, scope, role, parameters, requiresInteger)
		: [];

	const placementError = getRulePlacementError(rule.type, scope);
	if (placementError)
		return [ `${ path }: ${ placementError }` ];

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
			...valueErrors(rule.left, 'left value', 'comparison-left', false),
			...valueErrors(rule.right, 'right value', 'comparison-right', false),
			...getComparisonTypeErrors(rule, path, parameters),
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
		if (![ minimum, maximum, step ].every(isInt32))
			return [ `${ label } range values must be ${ int32RangeText }.` ];
		if (minimum > maximum || step <= 0)
			return [ `${ label } has an invalid range.` ];

		return [];
	}

	if (parameter.values.length === 0)
		return [ `${ label } needs at least one value.` ];
	if (parameter.valueType === 'integer') {
		if (parameter.values.some(value => !isWholeNumberText(value)))
			return [ `${ label } values must be whole numbers.` ];
		if (parameter.values.some(value => !isInt32(Number(value))))
			return [ `${ label } values must be ${ int32RangeText }.` ];
	}

	return [];
};

const getTemplateTextErrors = (
	draft: AchievementTemplateDraft,
	limits: AchievementDraftLimits,
	generatedCount: number,
): string[] => {
	const errors: string[] = [];
	const keys = new Set(draft.parameters.map(parameter => parameter.key));
	const fields = [
		[ 'name', draft.nameTemplate ],
		[ 'description', draft.descriptionTemplate ],
	] as const;
	for (const [ field, template ] of fields) {
		const unknownKeys = [ ...template.matchAll(templateTokenPattern) ]
			.map(match => match[1]!)
			.filter(key => !keys.has(key));
		if (unknownKeys.length > 0)
			errors.push(`The ${ field } uses unknown parameters: ${ unknownKeys.map(key => `{${ key }}`).join(', ') }.`);
		if (/[{}]/.test(template.replace(templateTokenPattern, '')))
			errors.push(`The ${ field } has a { or } that is not part of a {parameter}.`);
	}

	if (generatedCount <= limits.maximumGeneratedInstances) {
		const tooLong = getPreviews({
			...draft,
			nameTemplate:        draft.nameTemplate.trim(),
			descriptionTemplate: draft.descriptionTemplate.trim(),
		}).find(preview =>
			preview.name.length > limits.maximumRenderedTextLength
			|| preview.description.length > limits.maximumRenderedTextLength);
		if (tooLong) {
			errors.push(`Generated names and descriptions must be at most ${
				limits.maximumRenderedTextLength
			} characters ("${ tooLong.name.slice(0, 40) }…" is too long).`);
		}
	}

	return errors;
};

const getAstLimitErrors = (
	draft: AchievementTemplateDraft,
	limits: AchievementDraftLimits,
): string[] => {
	let definition: Record<string, unknown>;
	try {
		definition = compileAchievementTemplate(draft).definition;
	}
	catch (error) {
		return [ error instanceof Error ? error.message : 'The logic cannot be compiled.' ];
	}

	const errors: string[] = [];
	// The backend measures the definition's JSON text as sent, editor tree included.
	const definitionLength = JSON.stringify(definition).length;
	if (definitionLength > limits.maximumDefinitionTextLength) {
		errors.push(`The logic is ${ definitionLength } characters long when saved; `
			+ `the limit is ${ limits.maximumDefinitionTextLength }.`);
	}

	const measure = measureAchievementAst(definition['root'], definition['reducers']);
	if (measure.nodeCount > limits.maximumAstNodes)
		errors.push(`The logic has ${ measure.nodeCount } nodes; the limit is ${ limits.maximumAstNodes }.`);
	if (measure.maximumDepth > limits.maximumAstDepth)
		errors.push(`The logic is nested ${ measure.maximumDepth } levels deep; the limit is ${ limits.maximumAstDepth }.`);
	if (measure.maximumQuantifierDepth > limits.maximumQuantifierDepth) {
		errors.push(`The logic nests ${ measure.maximumQuantifierDepth } round, throw or count blocks; `
			+ `the limit is ${ limits.maximumQuantifierDepth }.`);
	}

	return errors;
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
	if (!achievementTiersAscending.includes(draft.tier))
		add('details', [ 'Choose a valid achievement tier.' ]);

	const keys = draft.parameters.map(parameter => parameter.key);
	if (keys.some(key => !parameterKeyPattern.test(key)))
		add('parameters', [ 'Parameter keys must start with a letter and contain only letters, numbers, and _.' ]);
	if (new Set(keys).size !== keys.length)
		add('parameters', [ 'Parameter keys must be unique.' ]);

	add('parameters', draft.parameters.flatMap(getParameterErrors));

	const { limits } = context;
	const generatedCount = countGeneratedInstances(draft.parameters);
	if (generatedCount > limits.maximumGeneratedInstances) {
		add('parameters', [
			`This template generates ${ generatedCount } achievements; the limit is ${
				limits.maximumGeneratedInstances
			}.`,
		]);
	}

	const missingNameKeys = draft.parameters
		.filter(parameter => countParameterValues(parameter) > 1)
		.map(parameter => `{${ parameter.key }}`)
		.filter(token => !draft.nameTemplate.includes(token));
	if (missingNameKeys.length > 0)
		add('details', [ `Name must include ${ missingNameKeys.join(', ') } so every generated achievement has a distinct name.` ]);

	add('details', getTemplateTextErrors(draft, limits, generatedCount));

	// Raw progression logic is kept verbatim; the server validates it on save.
	if (draft.achievementScope === 'progression' && !draft.progression?.raw) {
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
	else if (draft.achievementScope !== 'progression') {
		add('logic', getRuleErrors(draft.rule, 'Logic', 'root', draft.parameters));
	}

	// The size limits apply to the compiled AST, which only exists for an otherwise valid draft.
	if (!errors.some(error => error.tab !== 'details'))
		add('logic', getAstLimitErrors(draft, limits));

	return errors;
};
