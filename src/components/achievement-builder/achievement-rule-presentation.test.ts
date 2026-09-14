import { describe, expect, it } from 'vitest';

import type { AchievementRuleDraft } from '../../models/achievementBuilder.js';
import {
	formatAchievementRule,
	formatAchievementValue,
	formatSequenceTarget,
} from './achievement-rule-presentation.js';

describe('achievement rule presentation', () => {
	it('formats comparisons without exposing value source implementation details', () => {
		const rule: AchievementRuleDraft = {
			id:       'compare',
			type:     'compare',
			left:     { source: 'round.finalPoints', value: '' },
			operator: 'equal',
			right:    { source: 'constant', value: '0' },
		};

		expect(formatAchievementRule(rule)).toBe('Round final points = 0');
		expect(formatAchievementRule({
			...rule,
			left: { source: 'round.modifiedThrowCount', value: '' },
		})).toBe('Throws using seasonal modifiers = 0');
		expect(formatAchievementRule({
			...rule,
			left: { source: 'round.rawPointsDistinctCount', value: '' },
		})).toBe('Number of unique unmodified throw scores = 0');
	});

	it('formats throw and sequence rules as readable sentences', () => {
		const throwRule: AchievementRuleDraft = {
			id:          'throw',
			type:        'throw',
			quantifier:  'any',
			scope:       'currentRound',
			hitLocation: { source: 'parameter', value: 'king' },
			throwType:   'single',
		};
		const target = {
			id:          'target',
			hitLocation: { source: 'constant' as const, value: '1' },
			throwType:   'anyScoring' as const,
		};

		expect(formatAchievementRule(throwRule)).toBe('Any single hits king');
		expect(formatSequenceTarget(target)).toBe('1 - single, double, or triple');
		expect(formatSequenceTarget({
			...target,
			hitLocation: { source: 'constant', value: '0' },
			throwType: 'rim',
		})).toBe('rim hit');
		expect(formatAchievementValue({
			source: 'board.leftNeighbor',
			value:  'king',
		})).toBe('left of king');
		expect(formatAchievementValue({
			source: 'parameter.offset',
			value: 'start',
			offset: 2,
		})).toBe('start + 2');
		expect(formatAchievementRule({
			id: 'winning-single-16',
			type: 'winningThrow',
			hitLocation: { source: 'constant', value: '16' },
			throwType: 'single',
		})).toBe('Winning throw is a single hitting 16');
		expect(formatAchievementRule({
			id: 'winning-bull',
			type: 'winningThrow',
			hitLocation: { source: 'constant', value: '25' },
			throwType: 'any',
		})).toBe('Winning throw is a bull');
	});

	it('formats preserved advanced conditions', () => {
		expect(formatAchievementRule({
			id: 'raw',
			type: 'raw',
			ast: {
				kind: 'all',
				collection: { kind: 'field', path: 'round.throws' },
			},
		})).toBe('Every item matches an advanced condition');

		expect(formatAchievementRule({
			id: 'raw-no-modifiers',
			type: 'raw',
			ast: {
				kind: 'all',
				collection: { kind: 'field', path: 'round.throws' },
				predicate: {
					kind: 'equal',
					left: { kind: 'field', path: 'throw.modifierCount' },
					right: { kind: 'constant', valueType: 'integer', value: 0 },
				},
			},
		})).toBe('No throws use seasonal modifiers');
	});
});
