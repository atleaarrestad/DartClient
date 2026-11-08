import { findTierByName, isOrderingOperator } from '../../../helpers/achievementVariantRules.js';
import { isBoardLocation } from '../../../helpers/dartboard.js';
import {
	AchievementComparisonOperator,
	AchievementParameterDraft,
	AchievementProgressionTargetDraft,
	AchievementRawRuleDraft,
	AchievementRoundStatus,
	AchievementRuleDraft,
	achievementRulePlacements,
	AchievementSkipRuleDraft,
	AchievementTierRuleDraft,
	AchievementValueDraft,
	AchievementVariantConditionDraft,
	createAchievementBuilderId,
} from '../../../models/achievementBuilder.js';
import type { BuilderScope } from '../achievement-draft.js';
import {
	HitTarget,
	HitTargetContextId,
	hitTargetContexts,
	TargetThrowType,
	targetTypeHasLocation,
} from '../hit-target/hit-target.js';
import { RuleTextToken, tokenizeRuleText } from './rule-text-lexer.js';
import type { RuleTextRange } from './rule-text-printer.js';
import {
	allRoundStatuses,
	bullWord,
	doubleBullWord,
	findFieldByName,
	findOperatorBySymbol,
	findStatusByWord,
	findThrowKindByLetter,
	variantKeywords,
} from './rule-text-vocabulary.js';

export interface RuleTextChange {
	from:   number;
	to:     number;
	insert: string;
}

export interface RuleTextFix {
	label:   string;
	changes: RuleTextChange[];
}

export interface RuleTextDiagnostic {
	from:     number;
	to:       number;
	severity: 'error' | 'warning';
	message:  string;
	fixes?:   RuleTextFix[];
}

export interface RuleTextParseContext {
	parameters: readonly AchievementParameterDraft[];
	/** Advanced conditions of the current rule, in print order; `raw(N)` refers to them. */
	rawRules?:  readonly AchievementRawRuleDraft[];
}

/** The `tier` and `skip` lines of a document. */
export interface RuleTextVariants {
	/** From the `tier <name>` line without conditions; undefined when the document has none. */
	tier?:     number;
	tierRules: AchievementTierRuleDraft[];
	skipRules: AchievementSkipRuleDraft[];
}

export interface RuleTextParseResult<T> {
	/** Undefined only when nothing could be read; check diagnostics for errors either way. */
	value?:      T;
	variants:    RuleTextVariants;
	diagnostics: RuleTextDiagnostic[];
	ranges:      Map<string, RuleTextRange>;
}

export interface ProgressionTextValue {
	statuses: ('valid' | 'victory')[];
	targets:  AchievementProgressionTargetDraft[];
}

export const hasErrors = (diagnostics: readonly RuleTextDiagnostic[]): boolean =>
	diagnostics.some(diagnostic => diagnostic.severity === 'error');

/** Thrown inside a statement; the parser records it and skips to the next line. */
class RuleTextSyntaxError extends Error {

	constructor(
		readonly from: number,
		readonly to: number,
		message: string,
		readonly fixes?: RuleTextFix[],
	) {
		super(message);
	}

}

const operatorHelp = 'Expected a comparison: =, !=, <, <=, > or >=.';
const targetHelp = 'Expected a target such as T20, D{n}, 20, Bull, DBull, rim or miss.';
const valueHelp = 'Expected a number, a {parameter} or a value such as round.points.';
const tierHelp = 'Expected a tier: bronze, silver, gold, platinum or diamond.';
const variantValueHelp = 'Expected a number, "text" in quotes, true or false.';

const typeNouns: Record<TargetThrowType, string> = {
	any:        'any throw',
	anyScoring: 'a scoring throw',
	single:     'a single',
	double:     'a double',
	triple:     'a triple',
	rim:        'a rim hit',
	miss:       'a miss',
};

const contextNouns: Record<HitTargetContextId, string> = {
	throw:        'A hit',
	throwCount:   'A count',
	winningThrow: 'A winning dart',
	sequence:     'A sequence step',
	progression:  'A collected target',
};

class RuleTextParser {

	private index = 0;
	readonly diagnostics: RuleTextDiagnostic[] = [];
	readonly ranges:      Map<string, RuleTextRange> = new Map();
	readonly variants:    RuleTextVariants = { tierRules: [], skipRules: [] };

	constructor(
		private readonly text: string,
		private readonly tokens: readonly RuleTextToken[],
		private readonly context: RuleTextParseContext,
	) {}

	// ── Token helpers ───────────────────────────────────────────────────

	private peek(offset = 0): RuleTextToken | undefined {
		return this.tokens[this.index + offset];
	}

	private get previous(): RuleTextToken | undefined {
		return this.tokens[this.index - 1];
	}

	private atEnd(): boolean {
		return this.index >= this.tokens.length;
	}

	private is(text: string, offset = 0): boolean {
		return this.peek(offset)?.text === text;
	}

	private next(): RuleTextToken {
		const token = this.tokens[this.index];
		if (!token) {
			const end = this.text.length;
			throw new RuleTextSyntaxError(end, end, 'The rule ends too early.');
		}

		this.index++;

		return token;
	}

	private fail(token: RuleTextToken | undefined, message: string, fixes?: RuleTextFix[]): never {
		const from = token?.from ?? this.text.length;
		throw new RuleTextSyntaxError(from, token?.to ?? from, message, fixes);
	}

	private expect(text: string, message: string): RuleTextToken {
		if (!this.is(text))
			this.fail(this.peek(), message);

		return this.next();
	}

	private report(
		from: number,
		to: number,
		message: string,
		severity: RuleTextDiagnostic['severity'] = 'error',
		fixes?: RuleTextFix[],
	): void {
		this.diagnostics.push({ from, to, severity, message, fixes });
	}

	/** Skips the rest of a broken statement: up to the next line, a closing brace or the end. */
	private recover(error: RuleTextSyntaxError, startIndex: number): void {
		this.report(error.from, error.to, error.message, 'error', error.fixes);
		if (this.index === startIndex && !this.atEnd() && !this.is('}'))
			this.index++;

		const errorLine = this.tokens.find(token => token.from >= error.from)?.line
			?? this.previous?.line
			?? 0;
		while (!this.atEnd() && !this.is('}') && this.peek()!.line <= errorLine)
			this.index++;
	}

	// ── Documents ───────────────────────────────────────────────────────

	parseRuleDocument(): AchievementRuleDraft {
		const statements = this.parseStatements('root', false);
		const [ first ] = statements;
		const root: AchievementRuleDraft = statements.length === 1 && (first?.type === 'all' || first?.type === 'any')
			? first
			: { id: createAchievementBuilderId(), type: 'all', children: statements };
		this.ranges.set(root.id, { from: 0, to: this.text.length });

		return root;
	}

	parseProgressionDocument(): ProgressionTextValue | undefined {
		this.parseVariantLines();
		try {
			this.expect('collect', 'A progression achievement is written as: collect valid|victory { D1 D2 … }');
			const statuses = this.parseProgressionStatuses();

			this.expect('{', 'Expected { to start the list of targets.');
			const targets: AchievementProgressionTargetDraft[] = [];
			while (!this.atEnd() && !this.is('}')) {
				const start = this.index;
				try {
					const from = this.peek()!.from;
					const target = this.parseTarget('progression');
					const id = createAchievementBuilderId();
					targets.push({
						id,
						hitLocation: target.hitLocation!,
						throwType:   target.throwType as AchievementProgressionTargetDraft['throwType'],
					});
					this.ranges.set(id, { from, to: this.previous!.to });
				}
				catch (error) {
					if (!(error instanceof RuleTextSyntaxError))
						throw error;

					this.recover(error, start);
				}
			}
			this.expect('}', 'Missing } at the end of the targets.');
			this.parseVariantLines();
			if (!this.atEnd())
				this.fail(this.peek(), 'Only tier and skip lines may follow the collect block.');

			return { statuses, targets };
		}
		catch (error) {
			if (!(error instanceof RuleTextSyntaxError))
				throw error;

			this.report(error.from, error.to, error.message, 'error', error.fixes);

			return undefined;
		}
	}

	/** `none`, a list of valid/victory, or nothing for both. */
	private parseProgressionStatuses(): ('valid' | 'victory')[] {
		if (this.is('none')) {
			this.next();

			return [];
		}

		const from = this.peek()?.from ?? this.text.length;
		const statuses = this.parseStatusList();
		if (statuses.length === 0)
			return [ 'valid', 'victory' ];

		const counted = statuses.filter((status): status is 'valid' | 'victory' =>
			status === 'valid' || status === 'victory');
		if (counted.length < statuses.length)
			this.report(from, this.previous!.to, 'Progression only counts valid and victory rounds.');

		return counted;
	}

	parseSingleTarget(contextId: HitTargetContextId): HitTarget {
		const target = this.parseTarget(contextId);
		if (!this.atEnd())
			this.fail(this.peek(), 'Write one target, such as T20 or D{n}.');

		return target;
	}

	// ── Tier and skip lines ─────────────────────────────────────────────

	private isVariantLine(): boolean {
		const token = this.peek();

		return token?.type === 'word' && (token.text === variantKeywords.tier || token.text === variantKeywords.skip);
	}

	private parseVariantLines(): void {
		while (this.isVariantLine()) {
			const start = this.index;
			try {
				this.parseVariantLine();
			}
			catch (error) {
				if (!(error instanceof RuleTextSyntaxError))
					throw error;

				this.recover(error, start);
			}
		}
	}

	/** `skip if …`, `tier gold if …`, or the default `tier bronze [otherwise]`. */
	private parseVariantLine(): void {
		const keyword = this.next();
		if (keyword.text === variantKeywords.skip) {
			if (!this.is(variantKeywords.if))
				this.fail(this.peek() ?? keyword, 'Write skip if and a condition, such as skip if {n} = 13.');

			this.next();
			this.variants.skipRules.push({ when: this.parseVariantConditions() });

			return;
		}

		const name = this.peek();
		if (!name || name.line !== keyword.line)
			this.fail(keyword, 'Write the tier after tier, such as tier gold.');

		const tier = findTierByName(this.next().text);
		if (tier === undefined)
			this.fail(name, tierHelp);

		if (this.is(variantKeywords.if)) {
			this.next();
			this.variants.tierRules.push({ tier, when: this.parseVariantConditions() });

			return;
		}

		if (this.is(variantKeywords.otherwise))
			this.next();
		if (this.variants.tier === undefined) {
			this.variants.tier = tier;

			return;
		}

		const remove = { label: 'Remove this line', changes: [ { from: keyword.from, to: this.previous!.to, insert: '' } ] };
		this.report(keyword.from, this.previous!.to, 'The tier is already set. Add if and a condition to give some '
			+ 'achievements another tier.', 'error', [ remove ]);
	}

	private parseVariantConditions(): AchievementVariantConditionDraft[] {
		const conditions = [ this.parseVariantCondition() ];
		while (this.is(variantKeywords.and)) {
			this.next();
			conditions.push(this.parseVariantCondition());
		}

		return conditions;
	}

	/** `{n} >= 15`, `{mode} = "hard"` or `{double} = true`. */
	private parseVariantCondition(): AchievementVariantConditionDraft {
		const open = this.peek();
		if (open?.text !== '{')
			this.fail(open, 'Expected a {parameter}, such as {n}.');

		this.next();
		const name = this.next();
		if (name.type !== 'word')
			this.fail(name, 'Expected a parameter name inside { }.');

		this.checkParameter(name);
		if (!this.is('}'))
			this.fail(this.peek(), 'Tier and skip rules check the parameter itself, such as {n}.');

		this.next();
		const operatorToken = this.peek();
		const operator = this.parseOperator();
		const valueToken = this.peek();
		const value = this.parseVariantValue();
		const parameter = this.context.parameters.find(item => item.key === name.text)!;

		if (parameter.valueType !== 'integer' && isOrderingOperator(operator)) {
			this.report(operatorToken!.from, operatorToken!.to, `{${ parameter.key }} can only be compared with = or !=.`);
		}
		else if (typeof value !== variantValueTypes[parameter.valueType]) {
			const from = valueToken!.from;
			const to = this.previous!.to;
			const fixes = parameter.valueType === 'string' && typeof value === 'number'
				? [ { label: 'Put it in quotes', changes: [ { from, to, insert: `"${ value }"` } ] } ]
				: undefined;
			this.report(from, to, variantValueMessages[parameter.valueType](parameter.key), 'error', fixes);
		}

		return { parameter: name.text, operator, value };
	}

	private parseVariantValue(): string | number | boolean {
		const token = this.peek();
		if (!token)
			this.fail(token, variantValueHelp);

		if (token.text === '-' || token.type === 'number') {
			const negative = this.next().text === '-';
			const number = negative ? this.next() : token;
			if (number.type !== 'number')
				this.fail(number, 'Expected a number after -.');

			return Number(number.text) * (negative ? -1 : 1);
		}

		this.next();
		if (token.type === 'string') {
			if (token.text.length < 2 || !token.text.endsWith('"'))
				this.fail(token, 'Missing " at the end of the text.');

			return token.text.slice(1, -1);
		}
		if (token.text === 'true' || token.text === 'false')
			return token.text === 'true';
		if (token.type === 'word') {
			const quoted = `"${ token.text }"`;
			const quote = { label: `Write ${ quoted }`, changes: [ { from: token.from, to: token.to, insert: quoted } ] };
			this.fail(token, `Write text in quotes, such as ${ quoted }.`, [ quote ]);
		}

		this.fail(token, variantValueHelp);
	}

	// ── Statements ──────────────────────────────────────────────────────

	/** Statements until a closing brace (inside a block) or the end of the text. */
	private parseStatements(scope: BuilderScope, inBlock: boolean): AchievementRuleDraft[] {
		const statements: AchievementRuleDraft[] = [];
		while (!this.atEnd()) {
			if (this.is('}')) {
				if (inBlock)
					break;

				const stray = this.next();
				this.report(stray.from, stray.to, 'This } has no matching {.');
				continue;
			}

			const start = this.index;
			try {
				if (this.isVariantLine()) {
					if (inBlock)
						this.fail(this.peek(), 'Tier and skip lines go at the top, outside every block.');

					this.parseVariantLine();
					continue;
				}

				statements.push(this.parseStatement(scope));
			}
			catch (error) {
				if (!(error instanceof RuleTextSyntaxError))
					throw error;

				this.recover(error, start);
			}
		}

		return statements;
	}

	private parseBlock(scope: BuilderScope): AchievementRuleDraft[] {
		this.expect('{', 'Expected { to start the block.');
		const statements = this.parseStatements(scope, true);
		if (!this.is('}')) {
			const end = this.text.length;
			const addBrace = { label: 'Add }', changes: [ { from: end, to: end, insert: '\n}' } ] };
			throw new RuleTextSyntaxError(end, end, 'Missing } to close the block.', [ addBrace ]);
		}

		this.next();

		return statements;
	}

	private parseStatement(scope: BuilderScope): AchievementRuleDraft {
		const start = this.peek()!;
		if (start.type === 'comment') {
			this.next();
			const removeComment = { label: 'Remove comment', changes: [ { from: start.from, to: start.to, insert: '' } ] };
			this.fail(start, 'Comments can\'t be saved with the rule, so they aren\'t allowed.', [ removeComment ]);
		}

		const id = createAchievementBuilderId();
		let rule: AchievementRuleDraft;
		switch (start.type === 'word' ? start.text : '') {
		case 'all':
		case 'any': {
			const type = this.next().text as 'all' | 'any';
			rule = { id, type, children: this.parseBlock(scope) };
			break;
		}
		case 'not':
			this.next();
			rule = { id, type: 'not', child: this.parseStatement(scope) };
			break;
		case 'round':
			rule = this.parseRound(id);
			break;
		case 'hit':
			this.next();
			rule = this.createThrowRule(id, 'any');
			break;
		case 'every':
			this.next();
			if (!this.is('dart'))
				this.fail(this.peek(), 'Write "every dart" followed by a target, such as every dart S.');

			this.next();
			rule = this.createThrowRule(id, 'all');
			break;
		case 'count':
			rule = this.parseCount(id, scope);
			break;
		case 'winning': {
			this.next();
			const target = this.parseTarget('winningThrow');
			rule = {
				id,
				type:        'winningThrow',
				throwType:   target.throwType as 'any' | 'single' | 'double' | 'triple',
				hitLocation: target.hitLocation,
			};
			break;
		}
		case 'sequence':
			rule = this.parseSequence(id);
			break;
		case 'raw':
			rule = this.parseRaw(id);
			break;
		default:
			rule = this.parseCompare(id, scope);
		}

		this.ranges.set(rule.id, { from: start.from, to: this.previous!.to });
		this.checkPlacement(rule, scope, start.from, this.previous!.to);

		return rule;
	}

	private createThrowRule(id: string, quantifier: 'any' | 'all'): AchievementRuleDraft {
		const target = this.parseTarget('throw');

		return {
			id,
			type:        'throw',
			quantifier,
			scope:       'currentRound',
			throwType:   target.throwType as AchievementThrowRuleType,
			hitLocation: target.hitLocation,
		};
	}

	/** Reports a block used in the wrong scope; the rule itself is still read. */
	private checkPlacement(rule: AchievementRuleDraft, scope: BuilderScope, from: number, to: number): void {
		if (rule.type === 'raw' || rule.type === 'not')
			return;

		const placement = achievementRulePlacements[rule.type];
		if (placement.scopes.includes(scope))
			return;

		const wrapFix = scope === 'root' && placement.scopes.includes('round')
			? [ this.wrapInRoundFix(from, to) ]
			: undefined;
		this.report(from, to, placement.message ?? 'This block can\'t be used here.', 'error', wrapFix);
	}

	private wrapInRoundFix(from: number, to: number): RuleTextFix {
		return {
			label:   'Wrap in round any { }',
			changes: [
				{ from, to: from, insert: 'round any {\n  ' },
				{ from: to, to, insert: '\n}' },
			],
		};
	}

	private parseStatusList(): AchievementRoundStatus[] {
		const statuses: AchievementRoundStatus[] = [];
		const readStatus = (): void => {
			const token = this.next();
			const status = findStatusByWord(token.text);
			if (!status)
				this.fail(token, 'Round statuses are valid, victory, overshoot and failed.');
			if (!statuses.includes(status))
				statuses.push(status);
		};

		if (!findStatusByWord(this.peek()?.text ?? ''))
			return statuses;

		readStatus();
		while (this.is('|')) {
			this.next();
			readStatus();
		}

		return statuses;
	}

	private parseRound(id: string): AchievementRuleDraft {
		this.next();
		let quantifier: 'any' | 'all' = 'any';
		if (this.is('any') || this.is('every'))
			quantifier = this.next().text === 'every' ? 'all' : 'any';

		let statuses: AchievementRoundStatus[];
		if (this.is('none')) {
			this.next();
			statuses = [];
		}
		else {
			statuses = this.parseStatusList();
			if (statuses.length === 0)
				statuses = [ ...allRoundStatuses ];
		}

		const children = this.parseBlock('round');

		return {
			id,
			type:      'round',
			quantifier,
			statuses,
			condition: { id: createAchievementBuilderId(), type: 'all', children },
		};
	}

	private parseCount(id: string, scope: BuilderScope): AchievementRuleDraft {
		this.next();
		this.expect('(', 'Write count(target), such as count(T20) >= 3.');
		const target = this.parseTarget('throwCount');
		this.expect(')', 'Expected ) after the counted target.');
		const operator = this.parseOperator();
		const count = this.parseValue(scope);

		return {
			id,
			type:        'throwCount',
			throwType:   target.throwType as AchievementThrowCountType,
			hitLocation: target.hitLocation,
			operator,
			count,
		};
	}

	private parseSequence(id: string): AchievementRuleDraft {
		const keyword = this.next();
		const targets = [ this.parseTarget('sequence') ];
		while (this.is('>')) {
			this.next();
			targets.push(this.parseTarget('sequence'));
		}
		if (targets.length > 3)
			this.report(keyword.from, this.previous!.to, 'A sequence has at most 3 steps.');

		return {
			id,
			type:    'sequence',
			scope:   'sameRound',
			targets: targets.map(target => ({
				id:          createAchievementBuilderId(),
				throwType:   target.throwType as AchievementSequenceStepType,
				hitLocation: target.hitLocation ?? { source: 'constant', value: '20' },
			})),
		};
	}

	/** `raw(N) { … }` keeps the Nth advanced condition; its text is only shown, never read. */
	private parseRaw(id: string): AchievementRuleDraft {
		const keyword = this.next();
		this.expect('(', 'Write raw(N), where N numbers the advanced conditions.');
		const numberToken = this.next();
		this.expect(')', 'Expected ) after the advanced condition number.');
		const braceToken = this.expect('{', 'Expected { before the advanced condition.');
		let depth = 1;
		while (depth > 0) {
			const token = this.peek();
			if (!token)
				this.fail(braceToken, 'Missing } to close the advanced condition.');

			this.next();
			if (token.text === '{')
				depth++;
			else if (token.text === '}')
				depth--;
		}

		const raw = this.context.rawRules?.[Number(numberToken.text) - 1];
		if (!raw)
			this.fail(keyword, 'Advanced conditions can\'t be written as text; raw(N) only keeps an existing one.');


		return { ...raw, id };
	}

	private parseCompare(id: string, scope: BuilderScope): AchievementRuleDraft {
		const first = this.peek();
		const isValueStart = first && (first.type === 'number' || first.text === '-' || first.text === '{'
			|| (first.type === 'word' && first.text.includes('.')));
		if (!isValueStart) {
			this.fail(first, 'Expected a condition: hit, every dart, count, winning, sequence, round, all, any, not, '
				+ 'or a comparison such as round.points >= 100.');
		}

		const left = this.parseValue(scope);
		const operator = this.parseOperator();
		const right = this.parseValue(scope);

		return { id, type: 'compare', left, operator, right };
	}

	// ── Values ──────────────────────────────────────────────────────────

	private parseOperator(): AchievementComparisonOperator {
		const token = this.peek();
		const operator = token?.type === 'punct' ? findOperatorBySymbol(token.text) : undefined;
		if (!operator)
			this.fail(token, operatorHelp);

		this.next();

		return operator;
	}

	private parseValue(scope: BuilderScope): AchievementValueDraft {
		const token = this.peek();
		if (!token)
			this.fail(token, valueHelp);

		if (token.text === '-' || token.type === 'number') {
			const negative = token.text === '-';
			if (negative)
				this.next();

			const number = this.next();
			if (number.type !== 'number')
				this.fail(number, 'Expected a number after -.');

			return { source: 'constant', value: `${ negative ? '-' : '' }${ number.text }` };
		}

		if (token.text === '{')
			return this.parseParameterForm();

		if (token.type === 'word' && token.text.includes('.')) {
			this.next();
			const field = findFieldByName(token.text);
			if (!field)
				this.fail(token, `Unknown value ${ token.text }. Type round. or game. to see the list.`);
			if (field.scope === 'round' && scope !== 'round')
				this.fail(token, `${ field.name } only exists inside a round block.`);
			if (field.scope === 'game' && scope === 'round')
				this.fail(token, `${ field.name } is about the whole game, so it can't be used inside a round block.`);

			return { source: field.source, value: '' };
		}

		this.fail(token, valueHelp);
	}

	/**
	 * `{n}`, `{n+1}`, `{n-1}`, `{left n}`, `{right n}` or `{ladder n+1}`; the opening brace is
	 * next. A ladder step needs its number of steps.
	 */
	private parseParameterForm(): AchievementValueDraft {
		const open = this.next();
		const first = this.next();
		if (first.type !== 'word')
			this.fail(first, 'Expected a parameter name inside { }.');

		let side: 'left' | 'right' | 'ladder' | undefined;
		let nameToken = first;
		if ((first.text === 'left' || first.text === 'right' || first.text === 'ladder') && this.peek()?.type === 'word') {
			side = first.text;
			nameToken = this.next();
		}

		this.checkParameter(nameToken);

		let offset: number | undefined;
		if ((!side || side === 'ladder') && (this.is('+') || this.is('-'))) {
			const sign = this.next().text === '-' ? -1 : 1;
			const amount = this.next();
			if (amount.type !== 'number')
				this.fail(amount, 'Expected a number after + or -.');

			offset = sign * Number(amount.text);
		}

		const close = this.peek();
		if (close?.text !== '}')
			this.fail(close ?? open, 'Expected } to close the parameter.');

		this.next();

		if (side === 'ladder') {
			if (!offset) {
				const addStep = { label: 'Add +1', changes: [ { from: nameToken.to, to: nameToken.to, insert: '+1' } ] };
				this.fail(nameToken, `Say how many steps along the ladder, such as {ladder ${ nameToken.text }+1}.`, [ addStep ]);
			}

			return { source: 'parameter.ladder', value: nameToken.text, offset };
		}
		if (side)
			return { source: side === 'left' ? 'board.leftNeighbor' : 'board.rightNeighbor', value: nameToken.text };
		if (offset !== undefined)
			return { source: 'parameter.offset', value: nameToken.text, offset };

		return { source: 'parameter', value: nameToken.text };
	}

	private checkParameter(token: RuleTextToken): void {
		const keys = this.context.parameters.map(parameter => parameter.key);
		if (keys.includes(token.text))
			return;

		const fixes = keys.slice(0, 3).map(key => ({
			label:   `Use {${ key }}`,
			changes: [ { from: token.from, to: token.to, insert: key } ],
		}));
		this.fail(token, keys.length > 0
			? `There is no parameter {${ token.text }}. Parameters: ${ keys.map(key => `{${ key }}`).join(', ') }.`
			: `There is no parameter {${ token.text }}. Add one under Variants first.`, fixes);
	}

	// ── Targets ─────────────────────────────────────────────────────────

	private parseTarget(contextId: HitTargetContextId): HitTarget {
		const context = hitTargetContexts[contextId];
		const token = this.peek();
		if (!token)
			this.fail(token, targetHelp);

		const target = this.readTarget(token, context.defaultType);
		const end = this.previous!.to;

		if (!context.throwTypes.includes(target.throwType)) {
			throw new RuleTextSyntaxError(token.from, end,
				`${ contextNouns[contextId] } can't be ${ typeNouns[target.throwType] }.`);
		}
		if (context.locationRequired && targetTypeHasLocation(target.throwType) && !target.hitLocation) {
			throw new RuleTextSyntaxError(token.from, end,
				`${ contextNouns[contextId] } needs a segment, such as ${ target.throwType === 'anyScoring' ? '20' : 'T20' }.`);
		}

		const location = target.hitLocation;
		if (location?.source === 'constant' && !isBoardLocation(Number(location.value))) {
			this.report(token.from, end, `${ location.value } is not on the board. Segments are 1 to 20, Bull (25) or DBull (50).`,
				'warning');
		}

		return target;
	}

	private readTarget(token: RuleTextToken, defaultType: TargetThrowType): HitTarget {
		const constant = (value: string): AchievementValueDraft => ({ source: 'constant', value });

		if (token.type === 'number') {
			this.next();

			return { throwType: defaultType, hitLocation: constant(token.text) };
		}
		if (token.text === '{')
			return { throwType: defaultType, hitLocation: this.parseParameterForm() };
		if (token.type !== 'word')
			this.fail(token, targetHelp);

		this.next();
		switch (token.text) {
		case 'rim':
		case 'miss':
			return { throwType: token.text };
		case 'any':
			return { throwType: defaultType };
		case bullWord:
			return { throwType: defaultType, hitLocation: constant('25') };
		case doubleBullWord:
			return { throwType: defaultType, hitLocation: constant('50') };
		}

		const match = /^([SDT])(\d*)$/.exec(token.text);
		const kind = match ? findThrowKindByLetter(match[1]!) : undefined;
		if (!match || !kind)
			this.fail(token, targetHelp);

		if (match[2])
			return { throwType: kind, hitLocation: constant(match[2]) };

		// `D{n}`: the parameter must follow without a space.
		const next = this.peek();
		if (next?.text === '{' && next.from === token.to)
			return { throwType: kind, hitLocation: this.parseParameterForm() };

		return { throwType: kind };
	}

}

const variantValueTypes = {
	integer: 'number',
	string:  'string',
	boolean: 'boolean',
} as const satisfies Record<AchievementParameterDraft['valueType'], string>;

const variantValueMessages: Record<AchievementParameterDraft['valueType'], (key: string) => string> = {
	integer: key => `{${ key }} is a number, so compare it with a number.`,
	string:  key => `{${ key }} is text, so compare it with text in quotes.`,
	boolean: key => `{${ key }} is yes or no, so compare it with true or false.`,
};

type AchievementThrowRuleType = Extract<AchievementRuleDraft, { type: 'throw'; }>['throwType'];
type AchievementThrowCountType = Extract<AchievementRuleDraft, { type: 'throwCount'; }>['throwType'];
type AchievementSequenceStepType = Extract<AchievementRuleDraft, { type: 'sequence'; }>['targets'][number]['throwType'];

const createParser = (text: string, context: RuleTextParseContext): RuleTextParser =>
	new RuleTextParser(text, tokenizeRuleText(text), context);

/** Reads rule text into a rule tree. Errors are reported, and the readable parts still parse. */
export const parseRuleText = (
	text: string,
	context: RuleTextParseContext,
): RuleTextParseResult<AchievementRuleDraft> => {
	const parser = createParser(text, context);
	const value = parser.parseRuleDocument();

	return { value, variants: parser.variants, diagnostics: parser.diagnostics, ranges: parser.ranges };
};

/** Reads a `collect { … }` progression document. */
export const parseProgressionText = (
	text: string,
	context: RuleTextParseContext,
): RuleTextParseResult<ProgressionTextValue> => {
	const parser = createParser(text, context);
	const value = parser.parseProgressionDocument();

	return { value, variants: parser.variants, diagnostics: parser.diagnostics, ranges: parser.ranges };
};

/** Reads one target in shorthand, e.g. what someone types into a target chip. */
export const parseTargetText = (
	text: string,
	contextId: HitTargetContextId,
	parameters: readonly AchievementParameterDraft[],
): { target?: HitTarget; error?: string; } => {
	const parser = createParser(text.trim(), { parameters });
	try {
		const target = parser.parseSingleTarget(contextId);
		const error = parser.diagnostics.find(diagnostic => diagnostic.severity === 'error');

		return error ? { error: error.message } : { target };
	}
	catch (error) {
		if (error instanceof RuleTextSyntaxError)
			return { error: error.message };

		throw error;
	}
};
