import type {
	AchievementProgressionTargetDraft,
	AchievementRoundStatus,
	AchievementRuleDraft,
	AchievementValueDraft,
} from '../../../models/achievementBuilder.js';
import { formatAchievementRule } from '../achievement-rule-presentation.js';
import { HitTarget, HitTargetContextId, hitTargetContexts, isBullLocation } from '../hit-target/hit-target.js';
import {
	allRoundStatuses,
	bullWord,
	doubleBullWord,
	findFieldBySource,
	operatorSymbols,
	roundStatusWords,
	throwKindLetters,
	throwTypeWords,
} from './rule-text-vocabulary.js';

export interface RuleTextRange {
	from: number;
	to:   number;
}

export interface RuleTextPrintResult {
	text:   string;
	/** Where each rule (or progression target) is written, by id. */
	ranges: Map<string, RuleTextRange>;
}

const indentUnit = '  ';
const progressionTargetsPerLine = 10;

/** A hit location inside a target: 20, {n}, {n+1}, {left n}. */
const printSegment = (value: AchievementValueDraft): string => {
	switch (value.source) {
	case 'constant':
		return value.value;
	case 'parameter':
		return `{${ value.value }}`;
	case 'parameter.offset': {
		const offset = value.offset ?? 0;

		return `{${ value.value }${ offset < 0 ? '-' : '+' }${ Math.abs(offset) }}`;
	}
	case 'board.leftNeighbor':
		return `{left ${ value.value }}`;
	case 'board.rightNeighbor':
		return `{right ${ value.value }}`;
	default:
		return findFieldBySource(value.source)?.name ?? value.source;
	}
};

/** A value in a comparison or count: a number, a parameter form or a field name. */
export const printValue = (value: AchievementValueDraft): string => printSegment(value);

/**
 * A target in darts shorthand: T20, D{n}, Bull, rim. A target without S/D/T has the block's
 * default type. Bulls are written Bull / DBull when they have that default type, which is
 * always the case for a valid bull target (progression stores them as singles).
 */
export const printTarget = (target: HitTarget, context?: HitTargetContextId): string => {
	const word = target.throwType === 'rim' || target.throwType === 'miss'
		? throwTypeWords[target.throwType]
		: undefined;
	if (word)
		return word;

	const letter = target.throwType === 'single' || target.throwType === 'double' || target.throwType === 'triple'
		? throwKindLetters[target.throwType]
		: '';
	const location = target.hitLocation;
	if (!location)
		return letter || 'any';

	const hasDefaultType = !letter || (!!context && target.throwType === hitTargetContexts[context].defaultType);
	if (hasDefaultType && isBullLocation(location))
		return location.value === '25' ? bullWord : doubleBullWord;

	return `${ letter }${ printSegment(location) }`;
};

const printStatuses = (statuses: readonly AchievementRoundStatus[]): string => {
	if (statuses.length === 0)
		return ' none';
	if (allRoundStatuses.every(status => statuses.includes(status)))
		return '';

	return ` ${ allRoundStatuses
		.filter(status => statuses.includes(status))
		.map(status => roundStatusWords[status])
		.join('|') }`;
};

/** Accumulates indented lines and the range of every printed rule. */
class RuleTextWriter {

	text = '';
	readonly ranges: Map<string, RuleTextRange> = new Map();
	private rawCount = 0;

	/** Writes a line; returns where its content (after the indent) starts. */
	private line(depth: number, content: string): number {
		const indent = indentUnit.repeat(depth);
		const start = this.text.length + indent.length;
		this.text += `${ indent }${ content }\n`;

		return start;
	}

	/** The end of the last written line, without its newline. */
	private get end(): number {
		return this.text.length - 1;
	}

	statements(rules: readonly AchievementRuleDraft[], depth: number): void {
		rules.forEach(rule => this.statement(rule, depth));
	}

	/** Writes one rule. `prefix` carries `not ` from enclosing Not rules. */
	statement(rule: AchievementRuleDraft, depth: number, prefix = ''): void {
		const record = (start: number): void => {
			this.ranges.set(rule.id, { from: start, to: this.end });
		};

		switch (rule.type) {
		case 'not': {
			const start = this.text.length + indentUnit.repeat(depth).length;
			this.statement(rule.child, depth, `${ prefix }not `);
			record(start);

			return;
		}
		case 'all':
		case 'any': {
			const start = this.line(depth, `${ prefix }${ rule.type } {`);
			this.statements(rule.children, depth + 1);
			this.line(depth, '}');
			record(start);

			return;
		}
		case 'round': {
			const quantifier = rule.quantifier === 'all' ? 'every' : 'any';
			const start = this.line(depth, `${ prefix }round ${ quantifier }${ printStatuses(rule.statuses) } {`);
			this.statements(rule.condition.type === 'all' ? rule.condition.children : [ rule.condition ], depth + 1);
			this.line(depth, '}');
			record(start);

			return;
		}
		default:
			record(this.line(depth, `${ prefix }${ this.leaf(rule) }`));
		}
	}

	private leaf(rule: AchievementRuleDraft): string {
		switch (rule.type) {
		case 'throw':
			return `${ rule.quantifier === 'all' ? 'every dart' : 'hit' } ${ printTarget(rule, 'throw') }`;
		case 'throwCount':
			return `count(${ printTarget(rule, 'throwCount') }) ${ operatorSymbols[rule.operator] } ${
				printValue(rule.count)
			}`;
		case 'winningThrow':
			return `winning ${ printTarget(rule, 'winningThrow') }`;
		case 'sequence':
			return [ 'sequence', rule.targets.map(target => printTarget(target, 'sequence')).join(' > ') ]
				.filter(Boolean)
				.join(' ');
		case 'compare':
			return `${ printValue(rule.left) } ${ operatorSymbols[rule.operator] } ${ printValue(rule.right) }`;
		case 'raw':
			this.rawCount++;

			return `raw(${ this.rawCount }) { ${ formatAchievementRule(rule) } }`;
		default:
			return '';
		}
	}

	progressionTargets(targets: readonly AchievementProgressionTargetDraft[], depth: number): void {
		for (let index = 0; index < targets.length; index += progressionTargetsPerLine) {
			const chunk = targets.slice(index, index + progressionTargetsPerLine);
			let offset = this.line(depth, chunk.map(target => printTarget(target, 'progression')).join(' '));
			chunk.forEach(target => {
				const written = printTarget(target, 'progression');
				this.ranges.set(target.id, { from: offset, to: offset + written.length });
				offset += written.length + 1;
			});
		}
	}

}

/**
 * Prints a session rule. A root All group is written as top-level lines without braces,
 * except when its only child is a group: a single top-level group reads back as the root,
 * so that case keeps its braces and parses back to the same shape.
 */
export const printRuleText = (rule: AchievementRuleDraft): RuleTextPrintResult => {
	const writer = new RuleTextWriter();
	const onlyChild = rule.type === 'all' && rule.children.length === 1 ? rule.children[0] : undefined;
	const onlyChildIsGroup = onlyChild?.type === 'all' || onlyChild?.type === 'any';
	if (rule.type === 'all' && !onlyChildIsGroup)
		writer.statements(rule.children, 0);
	else
		writer.statement(rule, 0);

	const text = writer.text.replace(/\n$/, '');
	writer.ranges.set(rule.id, { from: 0, to: text.length });

	return { text, ranges: writer.ranges };
};

/** Prints a progression target set as a `collect` block. */
export const printProgressionText = (progression: {
	statuses: readonly ('valid' | 'victory')[];
	targets:  readonly AchievementProgressionTargetDraft[];
}): RuleTextPrintResult => {
	const writer = new RuleTextWriter();
	const statuses = progression.statuses.map(status => roundStatusWords[status]).join('|');
	writer.text = `collect ${ statuses || 'none' } {\n`;
	writer.progressionTargets(progression.targets, 1);
	writer.text += '}';

	return { text: writer.text, ranges: writer.ranges };
};
