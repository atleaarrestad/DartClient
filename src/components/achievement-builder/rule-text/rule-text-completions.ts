import type { AchievementParameterDraft } from '../../../models/achievementBuilder.js';
import { HitTargetContextId, hitTargetContexts } from '../hit-target/hit-target.js';
import { RuleTextToken, tokenizeRuleText } from './rule-text-lexer.js';
import {
	allRoundStatuses,
	findOperatorBySymbol,
	findStatusByWord,
	roundStatusWords,
	ruleTextFields,
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

const statementOptions = (scope: 'round' | 'root', parameters: readonly AchievementParameterDraft[]): RuleTextCompletion[] => {
	const keyword = (label: string, detail: string, apply = `${ label } `): RuleTextCompletion =>
		({ label, type: 'keyword', detail, apply });
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

		return previous ? undefined : { from, options: [ collect ] };
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

	return { from, options: statementOptions(scope, context.parameters) };
};
