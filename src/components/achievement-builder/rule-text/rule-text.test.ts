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

describe('tier and skip lines', () => {
	const mode: AchievementParameterDraft = {
		id:            'p-mode',
		key:           'mode',
		valueType:     'string',
		generatorType: 'set',
		values:        [ 'easy', 'hard' ],
	};
	const variantContext = { parameters: [ n, mode ] };
	const variants = {
		tier:      1,
		tierRules: [
			{ tier: 5, when: [ { parameter: 'n', operator: 'greaterThanOrEqual' as const, value: 18 } ] },
			{
				tier: 3,
				when: [
					{ parameter: 'n', operator: 'equal' as const, value: 17 },
					{ parameter: 'mode', operator: 'equal' as const, value: 'hard' },
				],
			},
		],
		skipRules: [ { when: [ { parameter: 'n', operator: 'equal' as const, value: 13 } ] } ],
	};

	it('prints skips, tier rules and the default tier above the rule', () => {
		const { text } = printRuleText(all(round([ hit('triple', { source: 'constant', value: '20' }) ])), variants);

		expect(text).toBe([
			'skip if {n} = 13',
			'tier diamond if {n} >= 18',
			'tier gold if {n} = 17 and {mode} = "hard"',
			'tier bronze otherwise',
			'',
			'round any valid|victory {',
			'  hit T20',
			'}',
		].join('\n'));
	});

	it('prints only the tier when there are no rules', () => {
		expect(printRuleText(all(), { tier: 3, tierRules: [], skipRules: [] }).text).toBe('tier gold');
	});

	it('reads the lines back', () => {
		const printed = printRuleText(all(round([ hit('any', { source: 'constant', value: '20' }) ])), variants).text;
		const result = parseRuleText(printed, variantContext);

		expect(hasErrors(result.diagnostics)).toBe(false);
		expect(result.variants).toEqual(variants);
		expect(result.value?.type === 'all' && result.value.children).toHaveLength(1);
	});

	it('reads them in a progression document too', () => {
		const printed = printProgressionText({ statuses: [ 'valid' ], targets: [] }, variants).text;
		const result = parseProgressionText(printed, variantContext);

		expect(hasErrors(result.diagnostics)).toBe(false);
		expect(result.variants).toEqual(variants);
		expect(result.value?.statuses).toEqual([ 'valid' ]);
	});

	it.each([
		[ 'tier golden', 'Expected a tier' ],
		[ 'tier gold\ntier silver', 'The tier is already set' ],
		[ 'tier gold\nskip if {mode} > "easy"', '{mode} can only be compared with = or !=.' ],
		[ 'tier gold\nskip if {mode} = hard', 'Write text in quotes' ],
		[ 'tier gold\nskip if {n} = "13"', '{n} is a number' ],
		[ 'tier gold\nskip if {n+1} = 3', 'check the parameter itself' ],
		[ 'tier gold\nskip {n} = 3', 'Write skip if' ],
		[ 'round any {\n  tier gold\n}', 'outside every block' ],
	])('reports %j', (text, message) => {
		const { diagnostics } = parseRuleText(text, variantContext);

		expect(diagnostics.some(diagnostic => diagnostic.severity === 'error' && diagnostic.message.includes(message)))
			.toBe(true);
	});

	it('suggests tier names, then if or otherwise, then parameters and values', () => {
		const labels = (text: string): string[] =>
			getRuleTextCompletions(text, text.length, { parameters: [ n, mode ], documentKind: 'rule' })
				?.options.map(option => option.label) ?? [];

		expect(labels('tier ')).toEqual([ 'bronze', 'silver', 'gold', 'platinum', 'diamond' ]);
		expect(labels('tier gold ')).toEqual([ 'if', 'otherwise' ]);
		expect(labels('tier gold if ')).toEqual([ '{n}', '{mode}' ]);
		expect(labels('skip if {mode} = ')).toEqual([ '"easy"', '"hard"' ]);
		expect(labels('skip if {n} = 3 ')).toEqual([ 'and' ]);
		expect(labels('skip if {mode} = "ha')).toEqual([]);
		expect(labels('')).toEqual(expect.arrayContaining([ 'tier', 'skip if' ]));
	});
});
