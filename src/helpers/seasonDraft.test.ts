import { describe, expect, it } from 'vitest';

import { AchievementTier, GameConstraint, ScoreModifier, WinCondition } from '../models/enums.js';
import { defaultMmrConfiguration } from '../models/mmr.js';
import { Rank } from '../models/rank.js';
import type { RuleDefinitionsResponse, Season } from '../models/schemas.js';
import {
	createDraftFromSeason,
	createNewSeasonDraft,
	defaultRankMinimums,
	findCurrentSeason,
	formatGameConstraintValue,
	getAchievementRewardErrors,
	getGameConstraintErrors,
	getGameConstraintSummary,
	getRuleNames,
	getScoreModifierErrors,
	getThresholdErrors,
	isManagementAccessError,
	normalizeAchievementRewards,
	normalizeThresholds,
	rankValues,
	serializeDraft,
	sortSeasons,
	validateSeasonDraft,
} from './seasonDraft.js';

type GameConstraintDefinition = RuleDefinitionsResponse['gameConstraints'][number];

function createSeason(id: string, start: string, end: string, overrides: Partial<Season> = {}): Season {
	return {
		id,
		name:                   `Season ${ id }`,
		startDate:              new Date(start),
		endDate:                new Date(end),
		goal:                   200,
		scoreModifierRules:     [ { scoreModifier: 1 as ScoreModifier, executionOrder: 0 } ],
		winConditionRules:      [ { winCondition: 1 as WinCondition } ],
		gameConstraintRules:    [],
		rankThresholds:         [],
		achievementTierRewards: [],
		mmrConfiguration:       { ...defaultMmrConfiguration, startingMmr: 1500 },
		...overrides,
	};
}

const constraintDefinitions: GameConstraintDefinition[] = [
	{ value: 1, name: 'Flag', description: '', codeImplementation: '' },
	{ value: 2, name: 'Limit', description: '', codeImplementation: '', label: 'Rounds', min: 1, max: 20, required: true },
	{ value: 3, name: 'Optional', description: '', codeImplementation: '', label: 'Darts', min: 0, max: 9 },
];

describe('season ordering', () => {
	const old = createSeason('old', '2025-01-01', '2025-04-01');
	const current = createSeason('current', '2026-09-01', '2026-12-01');
	const next = createSeason('next', '2026-12-01', '2027-03-01');

	it('sorts newest start first', () => {
		expect(sortSeasons([ old, next, current ]).map(season => season.id)).toEqual([ 'next', 'current', 'old' ]);
	});

	it('finds the running season, else the first', () => {
		const seasons = sortSeasons([ old, next, current ]);

		expect(findCurrentSeason(seasons, new Date('2026-10-19'))?.id).toBe('current');
		expect(findCurrentSeason(seasons, new Date('2030-01-01'))?.id).toBe('next');
		expect(findCurrentSeason([], new Date())).toBeUndefined();
	});
});

describe('normalization', () => {
	it('fills every rank with stored or default minimums', () => {
		const thresholds = normalizeThresholds([ { rank: Rank.Silver, minimumMmr: 1600 } ]);

		expect(thresholds.map(threshold => threshold.rank)).toEqual(rankValues);
		expect(thresholds[0]).toEqual({ rank: Rank.Bronze, minimumMmr: 0 });
		expect(thresholds.find(threshold => threshold.rank === Rank.Silver)?.minimumMmr).toBe(1600);
		expect(thresholds.find(threshold => threshold.rank === Rank.Bronze1)?.minimumMmr).toBe(defaultRankMinimums[1]);
		expect(getThresholdErrors(normalizeThresholds())).toEqual([]);
	});

	it('fills every achievement tier with stored or default rewards', () => {
		expect(normalizeAchievementRewards([
			{ achievementTier: AchievementTier.gold, mmrReward: 99, mmrCapIncrease: 7 },
		])).toEqual([
			{ achievementTier: AchievementTier.bronze, mmrReward: 5, mmrCapIncrease: 1 },
			{ achievementTier: AchievementTier.silver, mmrReward: 10, mmrCapIncrease: 1 },
			{ achievementTier: AchievementTier.gold, mmrReward: 99, mmrCapIncrease: 7 },
			{ achievementTier: AchievementTier.platinum, mmrReward: 20, mmrCapIncrease: 2 },
			{ achievementTier: AchievementTier.diamond, mmrReward: 30, mmrCapIncrease: 2 },
		]);
	});
});

describe('drafts', () => {
	it('copy an existing season without sharing objects', () => {
		const season = createSeason('a', '2026-01-01', '2026-04-01');
		const draft = createDraftFromSeason(season);

		expect(draft).toMatchObject({ id: 'a', name: 'Season a', goal: 200 });
		expect(draft.startDate).toEqual(season.startDate);
		expect(draft.startDate).not.toBe(season.startDate);
		expect(draft.scoreModifierRules[0]).not.toBe(season.scoreModifierRules[0]);
		expect(draft.mmrConfiguration).not.toBe(season.mmrConfiguration);
		expect(draft.rankThresholds).toHaveLength(rankValues.length);
	});

	it('start a new season where the latest-ending one ends, with its settings', () => {
		const earlier = createSeason('earlier', '2026-01-01', '2026-04-01', { goal: 150 });
		const latest = createSeason('latest', '2026-04-01', '2026-07-01', { goal: 300 });
		const draft = createNewSeasonDraft([ latest, earlier ]);

		expect(draft.id).toBeUndefined();
		expect(draft.name).toBe('');
		expect(draft.startDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
		expect(draft.endDate.toISOString()).toBe('2026-09-29T00:00:00.000Z');
		expect(draft.goal).toBe(300);
		expect(draft.scoreModifierRules).toEqual(latest.scoreModifierRules);
		expect(draft.scoreModifierRules[0]).not.toBe(latest.scoreModifierRules[0]);
		expect(draft.mmrConfiguration).toEqual(latest.mmrConfiguration);
	});

	it('start the first season now with defaults', () => {
		const now = new Date('2026-10-19T12:00:00Z');
		const draft = createNewSeasonDraft([], now);

		expect(draft.startDate).toEqual(now);
		expect(draft.goal).toBe(180);
		expect(draft.scoreModifierRules).toEqual([]);
		expect(draft.mmrConfiguration).toEqual(defaultMmrConfiguration);
		expect(draft.mmrConfiguration).not.toBe(defaultMmrConfiguration);
	});

	it('serialize independently of rule order', () => {
		const draft = createDraftFromSeason(createSeason('a', '2026-01-01', '2026-04-01', {
			scoreModifierRules: [
				{ scoreModifier: 1 as ScoreModifier, executionOrder: 0 },
				{ scoreModifier: 2 as ScoreModifier, executionOrder: 1 },
			],
		}));
		const reordered = { ...draft, scoreModifierRules: [ ...draft.scoreModifierRules ].reverse() };

		expect(serializeDraft(reordered)).toBe(serializeDraft(draft));
		expect(serializeDraft({ ...draft, goal: 201 })).not.toBe(serializeDraft(draft));
	});
});

describe('rule summaries', () => {
	it('name the selected rules', () => {
		const definitions = [
			{ value: 1, name: 'One', description: '', codeImplementation: '' },
			{ value: 2, name: 'Two', description: '', codeImplementation: '' },
		];

		expect(getRuleNames([ 2, 1, 9 ], definitions)).toBe('Two, One');
		expect(getRuleNames([], definitions)).toBe('None selected');
	});

	it('summarise game constraints', () => {
		const rules = [
			{ gameConstraint: 1 as GameConstraint, value: null },
			{ gameConstraint: 2 as GameConstraint, value: 5 },
			{ gameConstraint: 9 as GameConstraint, value: null },
		];

		expect(getGameConstraintSummary(rules, constraintDefinitions)).toBe('Flag, Rounds 5');
		expect(getGameConstraintSummary(rules, undefined)).toBe('None selected');
		expect(getGameConstraintSummary([], constraintDefinitions)).toBe('None selected');
		expect(formatGameConstraintValue(constraintDefinitions[1]!, null)).toBe('No value');
		expect(formatGameConstraintValue(constraintDefinitions[0]!, 3)).toBe('3');
	});
});

describe('validation', () => {
	it('checks score-modifier orders', () => {
		const rule = (executionOrder: number) => ({ scoreModifier: 1 as ScoreModifier, executionOrder });

		expect(getScoreModifierErrors([ rule(0), rule(1) ])).toEqual([]);
		expect(getScoreModifierErrors([ rule(0), rule(0) ])).toEqual([ 'Score-modifier execution orders must be unique.' ]);
		expect(getScoreModifierErrors([ rule(-1) ])).toEqual([ 'Score-modifier execution orders must be non-negative whole numbers.' ]);
		expect(getScoreModifierErrors([ rule(0.5) ])).toEqual([ 'Score-modifier execution orders must be non-negative whole numbers.' ]);
	});

	it('checks game constraints against their definitions', () => {
		const rule = (gameConstraint: number, value: number | null) =>
			({ gameConstraint: gameConstraint as GameConstraint, value });

		expect(getGameConstraintErrors([ rule(1, null), rule(2, 5), rule(3, null) ], constraintDefinitions)).toEqual([]);
		expect(getGameConstraintErrors([ rule(1, null), rule(1, null) ], constraintDefinitions))
			.toEqual([ 'Each game constraint can only be configured once.' ]);
		expect(getGameConstraintErrors([ rule(9, null) ], constraintDefinitions)).toEqual([ 'Unknown game constraint selected.' ]);
		expect(getGameConstraintErrors([ rule(1, 3) ], constraintDefinitions)).toEqual([ 'Flag does not take a numeric value.' ]);
		expect(getGameConstraintErrors([ rule(2, null) ], constraintDefinitions)).toEqual([ 'Limit requires a Rounds.' ]);
		expect(getGameConstraintErrors([ rule(2, 2.5) ], constraintDefinitions)).toEqual([ 'Limit Rounds must be a whole number.' ]);
		expect(getGameConstraintErrors([ rule(2, 21) ], constraintDefinitions)).toEqual([ 'Limit Rounds must be between 1 and 20.' ]);
	});

	it('checks rank thresholds', () => {
		const thresholds = normalizeThresholds();
		const withMinimum = (rank: Rank, minimumMmr: number) =>
			thresholds.map(threshold => threshold.rank === rank ? { ...threshold, minimumMmr } : threshold);

		expect(getThresholdErrors(withMinimum(Rank.Bronze, 10))).toEqual([ 'Bronze must begin at 0 MMR.' ]);
		expect(getThresholdErrors(withMinimum(Rank.Bronze2, 1.5))).toContain('Rank thresholds must be non-negative whole numbers.');
		expect(getThresholdErrors(withMinimum(Rank.Bronze2, defaultRankMinimums[1]!)))
			.toEqual([ expect.stringMatching(/must start above/) ]);
		expect(getThresholdErrors(thresholds.slice(1))).toEqual([
			'Every rank must have exactly one threshold.',
			'Bronze must begin at 0 MMR.',
			'Rank thresholds are incomplete or out of order.',
		]);
	});

	it('checks achievement rewards', () => {
		const rewards = normalizeAchievementRewards();

		expect(getAchievementRewardErrors(rewards)).toEqual([]);
		expect(getAchievementRewardErrors(rewards.slice(1))).toEqual([ 'Every achievement tier must have exactly one MMR reward.' ]);
		expect(getAchievementRewardErrors([ ...rewards.slice(1), { ...rewards[1]! } ]))
			.toEqual([ 'Every achievement tier must have exactly one MMR reward.' ]);
		expect(getAchievementRewardErrors(rewards.map(reward => ({ ...reward, mmrReward: -1 }))))
			.toEqual([ 'Achievement MMR rewards must be non-negative whole numbers.' ]);
		expect(getAchievementRewardErrors(rewards.map(reward => ({ ...reward, mmrCapIncrease: 101 }))))
			.toEqual([ 'Achievement MMR cap increases must be whole numbers from 0 to 100.' ]);
	});

	it('validates a whole draft', () => {
		const existing = createSeason('a', '2026-01-01', '2026-04-01');
		const draft = createNewSeasonDraft([ existing ]);

		expect(validateSeasonDraft({ ...draft, name: 'Next' }, [ existing ], constraintDefinitions)).toEqual([]);
		// Editing a season never overlaps with itself.
		expect(validateSeasonDraft(createDraftFromSeason(existing), [ existing ], constraintDefinitions)).toEqual([]);
		expect(validateSeasonDraft({
			...draft,
			name:                ' ',
			startDate:           new Date('2027-03-01'),
			endDate:             new Date('2027-02-01'),
			goal:                0,
			gameConstraintRules: [ { gameConstraint: 9 as GameConstraint, value: null } ],
		}, [ existing ], constraintDefinitions)).toEqual([
			'Season name is required.',
			'End date must be after the start date.',
			'Goal must be a positive whole number.',
			'Unknown game constraint selected.',
		]);
		expect(validateSeasonDraft({
			...draft,
			name:      'Overlap',
			startDate: new Date('2026-03-01'),
			endDate:   new Date('2026-05-01'),
		}, [ existing ], constraintDefinitions)).toEqual([ 'Dates overlap Season a.' ]);
	});
});

describe('isManagementAccessError', () => {
	it.each([
		[ 'Invalid admin key', true ],
		[ 'Request failed: 403 Forbidden', true ],
		[ 'Unauthorized', true ],
		[ 'Season name already exists', false ],
	])('%s -> %s', (message, expected) => {
		expect(isManagementAccessError(message)).toBe(expected);
	});
});
