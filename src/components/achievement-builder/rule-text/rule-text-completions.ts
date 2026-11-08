import { findTierByName, formatTierLabel, getTierName } from '../../../helpers/achievementVariantRules.js';
import type { AchievementParameterDraft } from '../../../models/achievementBuilder.js';
import { achievementTiersAscending } from '../../../models/enums.js';
import { getParameterValues } from '../achievement-draft.js';
import { HitTargetContextId, hitTargetContexts } from '../hit-target/hit-target.js';
import { RuleTextToken, tokenizeRuleText } from './rule-text-lexer.js';
import {
	allRoundStatuses,
	findOperatorBySymbol,
	findStatusByWord,
	roundStatusWords,
	ruleTextFields,
	variantKeywords,
} from './rule-text-vocabulary.js';

export type RuleTextCompletionType = 'keyword' | 'field' | 'parameter' | 'target' | 'status';

export interface RuleTextCompletion {
	label:           string;
	type:            RuleTextCompletionType;
	detail?:         string;
	/** Text inserted instead of the label. */
	apply?:          string;
	/** Set when the option doesn't fit here; it is shown but can't be picked. */
	disabledReason?: string;
}

export interface RuleTextCompletionResult {
	from:    number;
	options: RuleTextCompletion[];
}

export interface RuleTextCompletionContext {
	parameters:   readonly AchievementParameterDraft[];
	documentKind: 'rule' | 'progression';
}

type BlockKind = 'round' | 'group' | 'collect' | 'parameter';

/** Tokens after which a `{` opens a block rather than a parameter. */
const blockOpeners = new Set([ 'all', 'any', 'every', 'round', 'collect', 'none', ')', ...Object.values(roundStatusWords) ]);

const blockKindFor = (tokens: readonly RuleTextToken[], braceIndex: number): BlockKind => {
	const before = tokens[braceIndex - 1];
	if (!before || !blockOpeners.has(before.text))
		return 'parameter';

	for (let index = braceIndex - 1; index >= 0 && tokens[index]!.line === tokens[braceIndex]!.line; index--) {
		const text = tokens[index]!.text;
		if (text === 'round')
			return 'round';
		if (text === 'collect')
			return 'collect';
	}

	return 'group';
};

/** The blocks open at the end of the tokens, innermost last. */
const openBlocks = (tokens: readonly RuleTextToken[]): BlockKind[] => {
	const stack: BlockKind[] = [];
	tokens.forEach((token, index) => {
		if (token.text === '{')
			stack.push(blockKindFor(tokens, index));
		else if (token.text === '}')
			stack.pop();
	});

	return stack;
};

/** The first word of the statement the cursor is in (same line), e.g. `sequence` or `count`. */
const statementKeyword = (tokens: readonly RuleTextToken[], line: number): string | undefined =>
	tokens.find(token => token.line === line && token.type === 'word')?.text;

const parameterForms = (parameters: readonly AchievementParameterDraft[]): RuleTextCompletion[] =>
	parameters.flatMap(parameter => [
		{ label: `{${ parameter.key }}`, type: 'parameter' as const, detail: 'parameter' },
		...parameter.valueType === 'integer'
			? [
				{ label: `{${ parameter.key }+1}`, type: 'parameter' as const, detail: 'parameter plus one' },
				{ label: `{ladder ${ parameter.key }+1}`, type: 'parameter' as const, detail: 'next on 1–20, 25, 50' },
				{ label: `{left ${ parameter.key }}`, type: 'parameter' as const, detail: 'board neighbour' },
				{ label: `{right ${ parameter.key }}`, type: 'parameter' as const, detail: 'board neighbour' },
			]
			: [],
	]);

const targetOptions = (
	contextId: HitTargetContextId,
	parameters: readonly AchievementParameterDraft[],
): RuleTextCompletion[] => {
	const context = hitTargetContexts[contextId];
	const allows = (type: string): boolean => context.throwTypes.includes(type as never);
	const numberParameters = parameters.filter(parameter => parameter.valueType === 'integer');
	const options: RuleTextCompletion[] = [];
	const kinds = [ [ 'S', 'single' ], [ 'D', 'double' ], [ 'T', 'triple' ] ] as const;

	kinds.filter(([ , type ]) => allows(type)).forEach(([ letter, type ]) => {
		options.push({ label: `${ letter }20`, type: 'target', detail: `${ type } 20` });
		numberParameters.forEach(parameter => options.push({
			label:  `${ letter }{${ parameter.key }}`,
			type:   'target',
			detail: `${ type } on {${ parameter.key }}`,
		}));
		if (!context.locationRequired)
			options.push({ label: letter, type: 'target', detail: `any ${ type }` });
	});
	options.push(
		{ label: 'Bull', type: 'target', detail: 'single bull (25)' },
		{ label: 'DBull', type: 'target', detail: 'double bull (50)' },
	);
	if (allows('rim'))
		options.push({ label: 'rim', type: 'target', detail: 'a rim hit' });
	if (allows('miss'))
		options.push({ label: 'miss', type: 'target', detail: 'a miss' });
	if (!context.locationRequired)
		options.push({ label: 'any', type: 'target', detail: 'any throw' });

	return options;
};

const fieldOptions = (scope: 'round' | 'root'): RuleTextCompletion[] =>
	ruleTextFields.map(field => ({
		label:          field.name,
		type:           'field' as const,
		detail:         field.label,
		disabledReason: field.scope === 'round' && scope !== 'round'
			? 'Only inside a round block'
			: field.scope === 'game' && scope === 'round'
				? 'Not inside a round block'
				: undefined,
	}));

const keyword = (label: string, detail: string, apply = `${ label } `): RuleTextCompletion =>
	({ label, type: 'keyword', detail, apply });

/** The lines that may start a document: the tier and skip lines. */
const variantLineOptions = (): RuleTextCompletion[] => [
	keyword(variantKeywords.tier, 'the achievements\u2019 tier, e.g. tier gold'),
	keyword(`${ variantKeywords.skip } ${ variantKeywords.if }`, 'leave some combinations out'),
];

/** How many values of a parameter are suggested after a comparison. */
const suggestedValueCount = 12;

/**
 * Inside a `tier` or `skip` line: tier names after `tier`, then `if`/`otherwise`, then plain
 * {parameters}, and after a comparison the values the parameter makes.
 */
const variantLineCompletions = (
	tokens: readonly RuleTextToken[],
	typed: string,
	from: number,
	parameters: readonly AchievementParameterDraft[],
): RuleTextCompletionResult | undefined => {
	const previous = tokens.at(-1);
	const braceAt = typed.lastIndexOf('{');
	if (braceAt >= 0) {
		const options = parameters.map(parameter => ({ label: parameter.key, type: 'parameter' as const, detail: 'parameter' }));

		return options.length > 0 ? { from: from + braceAt + 1, options } : undefined;
	}
	// Nothing fits inside text that is still being typed: `"ha`.
	if (!previous || (previous.type === 'string' && (previous.text.length < 2 || !previous.text.endsWith('"'))))
		return undefined;

	if (previous.text === variantKeywords.tier) {
		return {
			from,
			options: achievementTiersAscending.map(tier => ({
				label:  getTierName(tier)!,
				type:   'status' as const,
				detail: formatTierLabel(tier),
			})),
		};
	}
	if (findTierByName(previous.text) !== undefined && tokens.at(-2)?.text === variantKeywords.tier) {
		return {
			from,
			options: [
				keyword(variantKeywords.if, 'only for some combinations'),
				keyword(variantKeywords.otherwise, 'every other achievement', variantKeywords.otherwise),
			],
		};
	}
	if (previous.text === variantKeywords.if || previous.text === variantKeywords.and) {
		const options = parameters.map(parameter => ({
			label:  `{${ parameter.key }}`,
			type:   'parameter' as const,
			detail: 'parameter',
			apply:  `{${ parameter.key }} `,
		}));

		return options.length > 0 ? { from, options } : undefined;
	}
	if (previous.type === 'punct' && findOperatorBySymbol(previous.text)) {
		const parameter = parameters.find(item => item.key === tokens.at(-3)?.text);
		const values = parameter ? getParameterValues(parameter, suggestedValueCount) : [];

		return values.length > 0
			? {
				from,
				options: values.map(value => ({
					label:  typeof value === 'string' ? `"${ value }"` : String(value),
					type:   'field' as const,
					detail: `{${ parameter!.key }}`,
				})),
			}
			: undefined;
	}
	if (previous.type === 'number' || previous.type === 'string' || previous.text === 'true' || previous.text === 'false')
		return { from, options: [ keyword(variantKeywords.and, 'another condition that has to hold') ] };

	return undefined;
};

const statementOptions = (
	scope: 'round' | 'root',
	parameters: readonly AchievementParameterDraft[],
	topLevel: boolean,
): RuleTextCompletion[] => {
	const scoped = scope === 'round'
		? [
			keyword('hit', 'a dart hits a target'),
			keyword('every dart', 'every dart in the round'),
			keyword('count', 'count matching throws', 'count('),
			keyword('sequence', 'three hits in order'),
		]
		: [
			keyword('round any', 'conditions in one round', 'round any {'),
			keyword('round every', 'conditions in every round', 'round every {'),
			keyword('winning', 'the dart that wins'),
		];

	return [
		...scoped,
		...topLevel ? variantLineOptions() : [],
		keyword('all', 'all of these', 'all {'),
		keyword('any', 'any of these', 'any {'),
		keyword('not', 'this must not happen'),
		...fieldOptions(scope).filter(option => !option.disabledReason),
		...parameterForms(parameters).slice(0, 4),
	];
};

const statusOptions = (): RuleTextCompletion[] =>
	allRoundStatuses.map(status => ({ label: roundStatusWords[status], type: 'status' as const, detail: 'round status' }));

/**
 * Completion options at a cursor position, or undefined where nothing fits. Suggestions follow
 * the scope: round values and throws inside round blocks, game values and rounds outside.
 */
export const getRuleTextCompletions = (
	text: string,
	position: number,
	context: RuleTextCompletionContext,
): RuleTextCompletionResult | undefined => {
	const before = text.slice(0, position);
	const typed = /[A-Za-z0-9_.{]*$/.exec(before)?.[0] ?? '';
	const from = position - typed.length;
	const tokens = tokenizeRuleText(text.slice(0, from));
	const blocks = openBlocks(tokens);
	const scope = blocks.includes('round') ? 'round' : 'root';
	const previous = tokens.at(-1);
	const cursorLine = before.split('\n').length - 1;

	const lineKeyword = previous?.line === cursorLine ? statementKeyword(tokens, cursorLine) : undefined;
	if (lineKeyword === variantKeywords.tier || lineKeyword === variantKeywords.skip)
		return variantLineCompletions(tokens, typed, from, context.parameters);

	// Inside a parameter: `D{` or `{le`.
	const braceAt = typed.lastIndexOf('{');
	if (braceAt >= 0 || blocks.at(-1) === 'parameter') {
		const nameStart = braceAt >= 0 ? from + braceAt + 1 : from;
		const options = context.parameters.flatMap(parameter => [
			{ label: parameter.key, type: 'parameter' as const, detail: 'parameter' },
			...parameter.valueType === 'integer'
				? [
					{ label: `left ${ parameter.key }`, type: 'parameter' as const, detail: 'left neighbour' },
					{ label: `right ${ parameter.key }`, type: 'parameter' as const, detail: 'right neighbour' },
					{ label: `ladder ${ parameter.key }+1`, type: 'parameter' as const, detail: 'next on 1–20, 25, 50' },
					{ label: `ladder ${ parameter.key }-1`, type: 'parameter' as const, detail: 'previous on 1–20, 25, 50' },
				]
				: [],
		]);

		return options.length > 0 ? { from: nameStart, options } : undefined;
	}

	if (context.documentKind === 'progression') {
		if (blocks.includes('collect'))
			return { from, options: targetOptions('progression', context.parameters) };
		if (previous?.text === 'collect' || previous?.text === '|')
			return { from, options: [ 'valid', 'victory', 'none' ].map(label => ({ label, type: 'status' as const })) };

		const collect: RuleTextCompletion = { label: 'collect', type: 'keyword', apply: 'collect valid|victory {' };
		const hasCollect = tokens.some(token => token.text === 'collect');
		const lineStart = !previous || previous.line < cursorLine;

		return lineStart
			? { from, options: [ ...variantLineOptions(), ...hasCollect ? [] : [ collect ] ] }
			: undefined;
	}

	if (typed.includes('.'))
		return { from, options: fieldOptions(scope) };

	const keyword = previous ? statementKeyword(tokens, previous.line) : undefined;
	const sameLine = previous?.line === cursorLine;

	if (sameLine && previous) {
		if (previous.text === 'hit' || previous.text === 'dart')
			return { from, options: targetOptions('throw', context.parameters) };
		if (previous.text === 'winning')
			return { from, options: targetOptions('winningThrow', context.parameters) };
		if (previous.text === 'sequence' || (previous.text === '>' && keyword === 'sequence'))
			return { from, options: targetOptions('sequence', context.parameters) };
		if (previous.text === '(' && keyword === 'count')
			return { from, options: targetOptions('throwCount', context.parameters) };
		if (previous.text === 'every' && keyword === 'every')
			return { from, options: [ { label: 'dart', type: 'keyword', apply: 'dart ' } ] };
		if (previous.text === 'round')
			return { from, options: [ { label: 'any', type: 'keyword' }, { label: 'every', type: 'keyword' } ] };
		if (keyword === 'round' && (previous.text === 'any' || previous.text === 'every' || previous.text === '|'
			|| findStatusByWord(previous.text)))
			return { from, options: [ ...statusOptions(), { label: '{', type: 'keyword', detail: 'start the block' } ] };
		if (previous.type === 'punct' && findOperatorBySymbol(previous.text)) {
			return {
				from,
				options: [
					...parameterForms(context.parameters),
					...fieldOptions(scope).filter(option => !option.disabledReason),
				],
			};
		}
		if (previous.text !== '{' && previous.text !== '}')
			return undefined;
	}

	return { from, options: statementOptions(scope, context.parameters, blocks.length === 0) };
};
