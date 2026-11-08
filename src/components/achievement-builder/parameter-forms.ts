import { dartLadderDescription, getBoardNeighbor, getLadderStep } from '../../helpers/dartboard.js';
import type {
	AchievementParameterDraft,
	AchievementValueDraft,
	AchievementValueSource,
} from '../../models/achievementBuilder.js';

/**
 * Parameter forms: a parameter used as it is, or moved. Rule text and name and description
 * templates write them the same way:
 *
 *   {n}   {n+1}   {n-2}   {left n}   {right n}   {ladder n+1}
 *
 * A ladder step moves along 1–20, then the bull (25) and the double bull (50), so
 * {ladder n+1} is 6 for 5, 25 for 20 and 50 for 25.
 */

export type ParameterFormSource = Extract<
	AchievementValueSource,
	'parameter' | 'parameter.offset' | 'parameter.ladder' | 'board.leftNeighbor' | 'board.rightNeighbor'
>;

export const parameterFormSources: readonly ParameterFormSource[] = [
	'parameter',
	'parameter.offset',
	'parameter.ladder',
	'board.leftNeighbor',
	'board.rightNeighbor',
];

export const isParameterFormSource = (source: AchievementValueSource): source is ParameterFormSource =>
	(parameterFormSources as readonly AchievementValueSource[]).includes(source);

const signed = (offset: number): string => `${ offset < 0 ? '-' : '+' }${ Math.abs(offset) }`;

/** How a parameter form is written: `{n}`, `{n+1}`, `{left n}`, `{ladder n+2}`. */
export const formatParameterForm = (value: AchievementValueDraft): string => {
	switch (value.source) {
	case 'parameter.offset':
		return `{${ value.value }${ signed(value.offset ?? 0) }}`;
	case 'parameter.ladder':
		return `{ladder ${ value.value }${ signed(value.offset ?? 0) }}`;
	case 'board.leftNeighbor':
		return `{left ${ value.value }}`;
	case 'board.rightNeighbor':
		return `{right ${ value.value }}`;
	default:
		return `{${ value.value }}`;
	}
};

/**
 * The number a parameter form stands for when its parameter is `number`, or undefined when
 * there is none, e.g. a ladder step past the double bull.
 */
export const resolveParameterForm = (value: AchievementValueDraft, number: number): number | undefined => {
	switch (value.source) {
	case 'parameter':
		return number;
	case 'parameter.offset':
		return number + (value.offset ?? 0);
	case 'parameter.ladder':
		return getLadderStep(number, value.offset ?? 0);
	case 'board.leftNeighbor':
		return getBoardNeighbor(number, 'left');
	case 'board.rightNeighbor':
		return getBoardNeighbor(number, 'right');
	default:
		return undefined;
	}
};

/** Why a form has no number for a parameter value, e.g. "{ladder n+1} leaves the ladder … when {n} is 50". */
const describeUnresolved = (value: AchievementValueDraft, number: number): string =>
	value.source === 'parameter.ladder'
		? `${ formatParameterForm(value) } leaves the ladder (${ dartLadderDescription }) when {${ value.value }} is ${ number }`
		: `${ formatParameterForm(value) } needs a board number, but {${ value.value }} is ${ number }`;

/**
 * Ladder steps that leave the ladder for some of the parameter's values, one message per
 * step: the editor and the server both reject them.
 */
export const getLadderStepError = (
	value: AchievementValueDraft,
	values: readonly (string | number | boolean)[],
): string | undefined => {
	if (value.source !== 'parameter.ladder')
		return undefined;
	if (!Number.isInteger(value.offset) || value.offset === 0)
		return `${ formatParameterForm(value) } needs a whole number of steps other than 0.`;

	const outside = values.find(item => typeof item !== 'number' || getLadderStep(item, value.offset!) === undefined);

	return outside === undefined
		? undefined
		: typeof outside === 'number' && getLadderStep(outside, 0) !== undefined
			? `${ describeUnresolved(value, outside) }.`
			: `${ formatParameterForm(value) } needs {${ value.value }} to be on the ladder (${ dartLadderDescription }), `
				+ `but it can be ${ String(outside) }.`;
};

// ── Name and description templates ──────────────────────────────────────────

/** One {token} in a name or description, as written. */
export interface TemplateToken {
	text:    string;
	key:     string;
	form?:   'left' | 'right' | 'ladder';
	offset?: number;
}

/** The same forms as rule text. Kept in step with the backend's AchievementTextTemplate. */
const templateTokenPattern = /\{(?:(left|right|ladder) +)?([A-Za-z_][A-Za-z0-9_]*)(?:([+-])(\d{1,9}))?\}/g;

const toToken = (text: string, form?: string, key = '', sign?: string, amount?: string): TemplateToken => ({
	text,
	key,
	...form ? { form: form as TemplateToken['form'] } : {},
	...sign ? { offset: Number(amount) * (sign === '-' ? -1 : 1) } : {},
});

export const readTemplateTokens = (template: string): TemplateToken[] =>
	[ ...template.matchAll(templateTokenPattern) ].map(([ text, form, key, sign, amount ]) =>
		toToken(text, form, key, sign, amount));

/** What a token stands for, as a value. */
const tokenValue = (token: TemplateToken): AchievementValueDraft => {
	switch (token.form) {
	case 'left':
		return { source: 'board.leftNeighbor', value: token.key };
	case 'right':
		return { source: 'board.rightNeighbor', value: token.key };
	case 'ladder':
		return { source: 'parameter.ladder', value: token.key, offset: token.offset ?? 0 };
	default:
		return token.offset === undefined
			? { source: 'parameter', value: token.key }
			: { source: 'parameter.offset', value: token.key, offset: token.offset };
	}
};

/** Why a token doesn't fit its parameter, or undefined when it does. Unknown parameters are reported separately. */
export const getTemplateTokenProblem = (
	token: TemplateToken,
	parameter: AchievementParameterDraft,
): string | undefined => {
	if ((token.form || token.offset !== undefined) && parameter.valueType !== 'integer')
		return `${ token.text } needs a number parameter`;
	if ((token.form === 'left' || token.form === 'right') && token.offset !== undefined)
		return `${ token.text } can’t add a number to a board neighbour`;
	if (token.form === 'ladder' && !token.offset)
		return `${ token.text } needs a step, such as {ladder ${ token.key }+1}`;

	return undefined;
};

/** Whether text is left over that looks like a token but isn't one, e.g. `{n*2}` or a lone `{`. */
export const hasMalformedTokens = (template: string): boolean =>
	/[{}]/.test(template.replace(templateTokenPattern, ''));

export const templateUsesParameter = (template: string, key: string): boolean =>
	readTemplateTokens(template).some(token => token.key === key);

/** Points every token of `oldKey` at `newKey`, keeping its form: {n+1} becomes {m+1}. */
export const renameTemplateParameter = (template: string, oldKey: string, newKey: string): string =>
	template.replace(
		templateTokenPattern,
		(text: string, form?: string, key?: string, sign?: string, amount?: string) =>
			key === oldKey ? `{${ form ? `${ form } ` : '' }${ newKey }${ sign ? `${ sign }${ amount }` : '' }}` : text,
	);

/**
 * A template for one combination of parameter values. A token without a value for it, such as
 * a ladder step past the double bull, is left as written and reported in `problems`.
 */
export const renderTemplate = (
	template: string,
	binding: Readonly<Record<string, string | number | boolean>>,
): { text: string; problems: string[]; } => {
	const problems: string[] = [];
	const text = template.replace(
		templateTokenPattern,
		(written: string, form?: string, key = '', sign?: string, amount?: string) => {
			const bound = binding[key];
			if (bound === undefined)
				return written;

			const token = toToken(written, form, key, sign, amount);
			if (!token.form && token.offset === undefined)
				return String(bound);
			if (typeof bound !== 'number')
				return written;

			const value = tokenValue(token);
			const resolved = resolveParameterForm(value, bound);
			if (resolved === undefined) {
				problems.push(describeUnresolved(value, bound));

				return written;
			}

			return String(resolved);
		},
	);

	return { text, problems };
};
