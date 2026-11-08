import { describe, expect, it } from 'vitest';

import { getBoardNeighbor } from '../../../helpers/dartboard.js';
import type { AchievementRuleDraft } from '../../../models/achievementBuilder.js';
import { findRule } from '../achievement-draft.js';
import { buildRuleReadout, describeLeaf } from '../rule-workspace/rule-readout.js';
import { addCondition, duplicateChild, moveChild, removeRule, toggleNegation } from './rule-edits.js';
import { buildRuleGraph, virtualRootId } from './rule-graph.js';

const hit = (id: string, value: string, throwType: 'any' | 'single' | 'double' | 'triple' = 'any'): AchievementRuleDraft => ({
	id,
	type:        'throw',
	quantifier:  'any',
	scope:       'currentRound',
	throwType,
	hitLocation: { source: 'constant', value },
});
const placementIsFirst: AchievementRuleDraft = {
	id:       'placement',
	type:     'compare',
	left:     { source: 'game.placement', value: '' },
	operator: 'equal',
	right:    { source: 'constant', value: '1' },
};

/** All { placement = 1, not round { hit S1 }, any { round { hit T{n} } } } */
const sample = (): AchievementRuleDraft => ({
	id:       'root',
	type:     'all',
	children: [
		placementIsFirst,
		{
			id:    'not',
			type:  'not',
			child: {
				id:         'never-one',
				type:       'round',
				quantifier: 'any',
				statuses:   [ 'valid' ],
				condition:  { id: 'never-one-all', type: 'all', children: [ hit('s1', '1', 'single') ] },
			},
		},
		{
			id:       'alternatives',
			type:     'any',
			children: [
				{
					id:         'triple-round',
					type:       'round',
					quantifier: 'any',
					statuses:   [ 'valid', 'victory' ],
					condition:  {
						id:       'triple-all',
						type:     'all',
						children: [
							{
								id:          'tn',
								type:        'throw',
								quantifier:  'any',
								scope:       'currentRound',
								throwType:   'triple',
								hitLocation: { source: 'parameter', value: 'n' },
							},
						],
					},
				},
			],
		},
	],
});

describe('rule graph', () => {
	it('turns groups and rounds into nodes and simple conditions into lines', () => {
		const graph = buildRuleGraph(sample());
		const root = graph.nodes.find(node => node.id === graph.rootId)!;

		expect(graph.nodes.map(node => node.id)).toEqual([ 'root', 'never-one', 'alternatives', 'triple-round' ]);
		expect(root.lines.map(line => line.kind)).toEqual([ 'leaf', 'branch', 'branch' ]);
	});

	it('folds a Not into the node it wraps', () => {
		const graph = buildRuleGraph(sample());
		const negated = graph.nodes.find(node => node.id === 'never-one')!;

		expect(negated.negationIds).toEqual([ 'not' ]);
		expect(negated.scope).toBe('round');
		expect(negated.appendTargetId).toBe('never-one-all');
	});

	it('shows a root that is not a group inside a virtual node', () => {
		const graph = buildRuleGraph(placementIsFirst);

		expect(graph.rootId).toBe(virtualRootId);
		expect(graph.nodes[0]!.lines[0]).toMatchObject({ kind: 'leaf', outerId: 'placement' });
	});
});

describe('rule edits', () => {
	it('toggles a Not on and off', () => {
		const negated = toggleNegation(sample(), {
			outerId:     'placement',
			inner:       placementIsFirst,
			negationIds: [],
		});
		const wrapper = negated.type === 'all' ? negated.children[0]! : undefined;

		expect(wrapper?.type).toBe('not');
		expect(toggleNegation(negated, { outerId: wrapper!.id, inner: placementIsFirst, negationIds: [ wrapper!.id ] }))
			.toEqual(sample());
	});

	it('moves, duplicates and removes children', () => {
		const moved = moveChild(sample(), 'root', 'placement', 1);
		const duplicated = duplicateChild(sample(), 'root', 'placement');
		const removed = removeRule(sample(), 'alternatives');

		expect(moved.type === 'all' && moved.children.map(child => child.id)).toEqual([ 'not', 'placement', 'alternatives' ]);
		expect(duplicated.type === 'all' && duplicated.children).toHaveLength(4);
		expect(findRule(removed, 'alternatives')).toBeUndefined();
	});

	it('wraps a virtual root in an All group when adding', () => {
		const graph = buildRuleGraph(placementIsFirst);
		const { rule, addedId } = addCondition(placementIsFirst, graph.nodes[0]!, 'compare');

		expect(rule.type).toBe('all');
		expect(rule.type === 'all' && rule.children.map(child => child.id)).toEqual([ 'placement', addedId ]);
	});
});

describe('readout', () => {
	it('reads the whole rule for a preview value', () => {
		const readout = buildRuleReadout(sample(), { n: 7 });

		expect(readout.intro).toBe('when all of these are true:');
		expect(readout.items.map(item => item.text)).toEqual([
			'final placement is exactly 1',
			'in no valid round:',
			'any of these:',
		]);
		expect(readout.items[2]!.children[0]!.children[0]!.text).toBe('you hit T7');
	});

	it('keeps parameters without a preview value as placeholders', () => {
		expect(describeLeaf(findRule(sample(), 'tn')!)).toBe('you hit T{n}');
	});

	it('resolves board neighbours like the backend', () => {
		expect(getBoardNeighbor(20, 'left')).toBe(5);
		expect(getBoardNeighbor(20, 'right')).toBe(1);
		expect(getBoardNeighbor(7, 'left')).toBe(19);
		expect(describeLeaf({
			id:          'w',
			type:        'winningThrow',
			throwType:   'double',
			hitLocation: { source: 'board.leftNeighbor', value: 'n' },
		}, { n: 7 })).toBe('you win on D19');
	});

	it('phrases counts and every-dart rules', () => {
		expect(describeLeaf({
			id:          'c',
			type:        'throwCount',
			throwType:   'triple',
			hitLocation: { source: 'constant', value: '20' },
			operator:    'greaterThanOrEqual',
			count:       { source: 'constant', value: '3' },
		})).toBe('you hit T20 at least 3 times');
		expect(describeLeaf({ id: 'e', type: 'throw', quantifier: 'all', scope: 'currentRound', throwType: 'single' }))
			.toBe('every dart is a single');
		expect(describeLeaf(hit('b', '25'))).toBe('you hit the bull');
	});
});
