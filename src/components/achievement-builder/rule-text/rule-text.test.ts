import { describe, expect, it } from 'vitest';

import type {
	AchievementParameterDraft,
	AchievementRuleDraft,
} from '../../../models/achievementBuilder.js';
import { formatTargetLabel } from '../hit-target/hit-target.js';
import { collectRawRules, isSameStructure, reconcileRuleIds } from './rule-structure.js';
import { getRuleTextCompletions } from './rule-text-completions.js';
import { hasErrors, parseProgressionText, parseRuleText, parseTargetText } from './rule-text-parser.js';
import { printProgressionText, printRuleText } from './rule-text-printer.js';

const n: AchievementParameterDraft = {
	id:            'p-n',
	key:           'n',
	valueType:     'integer',
	generatorType: 'range',
	minimum:       1,
	maximum:       20,
	step:          1,
	values:        [],
};
const context = { parameters: [ n ] };

let nextId = 0;
const id = (): string => `r${ ++nextId }`;

const all = (...children: AchievementRuleDraft[]): AchievementRuleDraft => ({ id: id(), type: 'all', children });
const any = (...children: AchievementRuleDraft[]): AchievementRuleDraft => ({ id: id(), type: 'any', children });
const round = (
	children: AchievementRuleDraft[],
	statuses: ('valid' | 'victory' | 'overshoot' | 'failedWinCondition')[] = [ 'valid', 'victory' ],
	quantifier: 'any' | 'all' = 'any',
): AchievementRuleDraft => ({ id: id(), type: 'round', quantifier, statuses, condition: all(...children) });

const hit = (
	throwType: 'any' | 'single' | 'double' | 'triple',
	hitLocation: { source: 'constant'; value: string; },
): AchievementRuleDraft => ({ id: id(), type: 'throw', quantifier: 'any', scope: 'currentRound', throwType, hitLocation });

/** Every rule type and value form the builder can produce. */
const clutchCloser = (): AchievementRuleDraft => all(
	{ id: id(), type: 'winningThrow', throwType: 'double' },
	{
		id:       id(),
		type:     'compare',
		left:     { source: 'game.placement', value: '' },
		operator: 'equal',
		right:    { source: 'constant', value: '1' },
	},
	any(
		{
			id:       id(),
			type:     'compare',
			left:     { source: 'game.roundsPlayed', value: '' },
			operator: 'lessThanOrEqual',
			right:    { source: 'parameter', value: 'n' },
		},
		{
			id:       id(),
			type:     'compare',
			left:     { source: 'game.tripleCount', value: '' },
			operator: 'greaterThanOrEqual',
			right:    { source: 'constant', value: '6' },
		},
	),
	{
		id:    id(),
		type:  'not',
		child: round(
			[ hit('single', { source: 'constant', value: '1' }) ],
			[ 'valid', 'victory', 'overshoot', 'failedWinCondition' ],
		),
	},
	round([
		{
			id:      id(),
			type:    'sequence',
			scope:   'sameRound',
			targets: [
				{ id: id(), throwType: 'anyScoring', hitLocation: { source: 'constant', value: '20' } },
				{ id: id(), throwType: 'anyScoring', hitLocation: { source: 'constant', value: '1' } },
				{ id: id(), throwType: 'anyScoring', hitLocation: { source: 'constant', value: '18' } },
			],
		},
		{ id: id(), type: 'throw', quantifier: 'all', scope: 'currentRound', throwType: 'triple' },
		{
			id:          id(),
			type:        'throwCount',
			throwType:   'triple',
			hitLocation: { source: 'board.leftNeighbor', value: 'n' },
			operator:    'greaterThan',
			count:       { source: 'constant', value: '2' },
		},
		{
			id:       id(),
			type:     'compare',
			left:     { source: 'round.number', value: '' },
			operator: 'notEqual',
			right:    { source: 'parameter.offset', value: 'n', offset: -1 },
		},
		hit('any', { source: 'constant', value: '25' }),
		{ id: id(), type: 'throw', quantifier: 'any', scope: 'currentRound', throwType: 'miss' },
	], [ 'valid' ], 'all'),
);

describe('rule text printing', () => {
	it('prints every rule type in darts shorthand', () => {
		expect(printRuleText(clutchCloser()).text).toBe([
			'winning D',
			'game.placement = 1',
			'any {',
			'  game.rounds <= {n}',
			'  game.triples >= 6',
			'}',
			'not round any {',
			'  hit S1',
			'}',
			'round every valid {',
			'  sequence 20 > 1 > 18',
			'  every dart T',
			'  count(T{left n}) > 2',
			'  round.number != {n-1}',
			'  hit Bull',
			'  hit miss',
			'}',
		].join('\n'));
	});

	it('records where each rule is written', () => {
		const rule = clutchCloser();
		const { text, ranges } = printRuleText(rule);
		const sequence = (rule.type === 'all' && rule.children[4]?.type === 'round' && rule.children[4].condition.type === 'all')
			? rule.children[4].condition.children[0]!
			: undefined;
		const range = ranges.get(sequence!.id)!;

		expect(text.slice(range.from, range.to)).toBe('sequence 20 > 1 > 18');
	});

	it('keeps braces around a root whose only child is a group', () => {
		const rule = all(any({
			id:       id(),
			type:     'compare',
			left:     { source: 'game.placement', value: '' },
			operator: 'equal',
			right:    { source: 'constant', value: '1' },
		}));
		const parsed = parseRuleText(printRuleText(rule).text, context).value!;

		expect(isSameStructure(parsed, rule)).toBe(true);
	});
});

describe('rule text round trip', () => {
	it('parses printed text back to the same rule', () => {
		const rule = clutchCloser();
		const result = parseRuleText(printRuleText(rule).text, context);

		expect(result.diagnostics).toEqual([]);
		expect(isSameStructure(result.value, rule)).toBe(true);
	});

	it('prints parsed text unchanged', () => {
		const text = printRuleText(clutchCloser()).text;

		expect(printRuleText(parseRuleText(text, context).value!).text).toBe(text);
	});

	it('round-trips progression targets', () => {
		const progression = {
			statuses: [ 'valid', 'victory' ] as ('valid' | 'victory')[],
			targets:  [
				{ id: 't1', throwType: 'double' as const, hitLocation: { source: 'constant' as const, value: '20' } },
				{ id: 't2', throwType: 'single' as const, hitLocation: { source: 'parameter' as const, value: 'n' } },
			],
		};
		const text = printProgressionText(progression).text;
		const parsed = parseProgressionText(text, context);

		expect(text).toBe('collect valid|victory {\n  D20 S{n}\n}');
		expect(parsed.diagnostics).toEqual([]);
		expect(isSameStructure(parsed.value?.targets, progression.targets)).toBe(true);
	});

	it('keeps advanced conditions by position', () => {
		const raw: AchievementRuleDraft = { id: 'raw-1', type: 'raw', ast: { kind: 'constant', value: true } };
		const rule = all(raw);
		const text = printRuleText(rule).text;
		const parsed = parseRuleText(text, { ...context, rawRules: collectRawRules(rule) });

		expect(text).toBe('raw(1) { true }');
		expect(parsed.diagnostics).toEqual([]);
		expect(isSameStructure(parsed.value, rule)).toBe(true);
	});
});

describe('rule text errors', () => {
	it('reports throws outside a round with a wrap fix', () => {
		const { diagnostics } = parseRuleText('hit T20', context);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]!.message).toContain('round block');
		expect(diagnostics[0]!.fixes?.[0]?.label).toBe('Wrap in round any { }');
	});

	it('reports round values outside a round block', () => {
		const { diagnostics } = parseRuleText('round.points >= 100', context);

		expect(diagnostics[0]!.message).toBe('round.points only exists inside a round block.');
	});

	it('suggests existing parameters for unknown ones', () => {
		const { diagnostics } = parseRuleText('round any {\n  hit T{m}\n}', context);

		expect(diagnostics[0]!.message).toContain('There is no parameter {m}');
		expect(diagnostics[0]!.fixes?.[0]?.label).toBe('Use {n}');
	});

	it('warns about locations that are not on the board', () => {
		const { diagnostics } = parseRuleText('round any {\n  hit T21\n}', context);

		expect(diagnostics).toMatchObject([ { severity: 'warning' } ]);
		expect(hasErrors(diagnostics)).toBe(false);
	});

	it('rejects comments, because the rule cannot store them', () => {
		const { diagnostics } = parseRuleText('# note\ngame.placement = 1', context);

		expect(diagnostics[0]!.message).toContain('Comments');
	});

	it('keeps reading after a broken line', () => {
		const result = parseRuleText('game.placement ==\ngame.rounds <= 8', context);

		expect(hasErrors(result.diagnostics)).toBe(true);
		expect(result.value?.type === 'all' && result.value.children).toHaveLength(1);
	});

	it('reports a missing closing brace with a fix', () => {
		const { diagnostics } = parseRuleText('round any {\n  hit 20', context);

		expect(diagnostics[0]!.fixes?.[0]?.label).toBe('Add }');
	});

	it('rejects types a block cannot have', () => {
		expect(parseTargetText('rim', 'winningThrow', [ n ]).error).toBe('A winning dart can\'t be a rim hit.');
		expect(parseTargetText('T', 'sequence', [ n ]).error).toContain('needs a segment');
		expect(parseTargetText('D{n}', 'throw', [ n ]).target)
			.toEqual({ throwType: 'double', hitLocation: { source: 'parameter', value: 'n' } });
	});
});

describe('rule text completions', () => {
	const complete = (text: string): string[] =>
		getRuleTextCompletions(text, text.length, { parameters: [ n ], documentKind: 'rule' })?.options
			.filter(option => !option.disabledReason)
			.map(option => option.label) ?? [];

	it('offers round blocks and game values at the top level', () => {
		const labels = complete('');

		expect(labels).toContain('round any');
		expect(labels).toContain('game.placement');
		expect(labels).not.toContain('hit');
	});

	it('offers throws and round values inside a round block', () => {
		const labels = complete('round any {\n  ');

		expect(labels).toContain('hit');
		expect(labels).toContain('round.points');
		expect(labels).not.toContain('game.placement');
	});

	it('offers targets after hit, including parameter forms', () => {
		expect(complete('round any {\n  hit ')).toEqual(expect.arrayContaining([ 'T20', 'D{n}', 'Bull', 'miss' ]));
	});

	it('shows round values outside a round as unavailable', () => {
		const result = getRuleTextCompletions('round.', 6, { parameters: [ n ], documentKind: 'rule' });

		expect(result?.options.find(option => option.label === 'round.points')?.disabledReason)
			.toBe('Only inside a round block');
	});
});

describe('rule structure', () => {
	it('copies ids onto a parsed tree where the shape matches', () => {
		const rule = clutchCloser();
		const parsed = parseRuleText(printRuleText(rule).text, context).value!;
		const reconciled = reconcileRuleIds(rule, parsed);

		expect(reconciled).toEqual(rule);
	});
});

describe('bull targets', () => {
	const bull = { source: 'constant' as const, value: '25' };
	const doubleBull = { source: 'constant' as const, value: '50' };

	it('writes progression bulls as Bull and DBull and reads them back as singles', () => {
		const progression = {
			statuses: [ 'valid', 'victory' ] as ('valid' | 'victory')[],
			targets:  [
				{ id: 'b1', throwType: 'single' as const, hitLocation: bull },
				{ id: 'b2', throwType: 'single' as const, hitLocation: doubleBull },
				{ id: 't20', throwType: 'single' as const, hitLocation: { source: 'constant' as const, value: '20' } },
			],
		};
		const text = printProgressionText(progression).text;
		const parsed = parseProgressionText(text, context);

		expect(text).toBe('collect valid|victory {\n  Bull DBull S20\n}');
		expect(parsed.diagnostics).toEqual([]);
		expect(isSameStructure(parsed.value?.targets, progression.targets)).toBe(true);
	});

	it('labels a bull chip without a type word', () => {
		expect(formatTargetLabel({ throwType: 'single', hitLocation: bull })).toBe('Bull');
		expect(formatTargetLabel({ throwType: 'any', hitLocation: doubleBull })).toBe('D-Bull');
	});
});
