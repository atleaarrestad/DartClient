export type RuleTextTokenType = 'word' | 'number' | 'punct' | 'comment' | 'unknown';

export interface RuleTextToken {
	type: RuleTextTokenType;
	text: string;
	from: number;
	to:   number;
	/** Zero-based line of the token's first character. */
	line: number;
}

/** Words may contain dots, so fields like `round.points` are one token. */
const wordPattern = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/y;
const numberPattern = /[0-9]+/y;
const twoCharPunct = new Set([ '<=', '>=', '!=' ]);
const oneCharPunct = new Set([ '{', '}', '(', ')', '|', '<', '>', '=', '+', '-' ]);

/** Splits rule text into tokens with their positions. Whitespace and newlines are skipped. */
export const tokenizeRuleText = (text: string): RuleTextToken[] => {
	const tokens: RuleTextToken[] = [];
	let position = 0;
	let line = 0;

	const match = (pattern: RegExp): string | undefined => {
		pattern.lastIndex = position;

		return pattern.exec(text)?.[0];
	};
	const push = (type: RuleTextTokenType, value: string): void => {
		tokens.push({ type, text: value, from: position, to: position + value.length, line });
		position += value.length;
	};

	while (position < text.length) {
		const char = text[position]!;
		if (char === '\n') {
			line++;
			position++;
			continue;
		}
		if (/\s/.test(char)) {
			position++;
			continue;
		}
		if (char === '#') {
			const end = text.indexOf('\n', position);
			push('comment', text.slice(position, end < 0 ? text.length : end));
			continue;
		}

		const word = match(wordPattern);
		if (word) {
			push('word', word);
			continue;
		}

		const number = match(numberPattern);
		if (number) {
			push('number', number);
			continue;
		}

		const pair = text.slice(position, position + 2);
		if (twoCharPunct.has(pair)) {
			push('punct', pair);
			continue;
		}
		if (oneCharPunct.has(char)) {
			push('punct', char);
			continue;
		}

		push('unknown', char);
	}

	return tokens;
};
