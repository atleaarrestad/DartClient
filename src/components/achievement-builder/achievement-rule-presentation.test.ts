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
		expect(formatSequenceTarget(target)).toBe('1 - scoring throw');
		expect(formatAchievementValue({
			source: 'board.leftNeighbor',
			value:  'king',
		})).toBe('left of king');
	});
});
