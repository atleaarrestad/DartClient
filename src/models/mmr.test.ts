import { describe, expect, it } from 'vitest';

import {
	calculateMmrChange,
	defaultMmrConfiguration,
	type MmrScenario,
	validateMmrConfiguration,
} from './mmr.js';
import type { MmrConfiguration } from './schemas.js';

const scenario = (overrides: Partial<MmrScenario>): MmrScenario => ({
	playerMmr:       1750,
	averageLobbyMmr: 1750,
	averageScore:    0,
	overshoots:      0,
	placement:       0,
	roundsPlayed:    0,
	...overrides,
});

const configuration = (overrides: Partial<MmrConfiguration> = {}): MmrConfiguration => ({
	...defaultMmrConfiguration,
	...overrides,
});

describe('calculateMmrChange', () => {
	// Expected values are worked out by hand from the backend formula (RankUtils.CalculateMMRGainForPlayer):
	// (avg * 10 - overshoots * 2 + 30 / placement + clamp(100 - 6 * rounds, 0, 100) - 250)
	// * factor (or * (2 - factor) when negative) + (1000 - mmr) / 28, truncated and clamped.
	it.each<[ string, Partial<MmrScenario>, Partial<MmrConfiguration>, number ]>([
		// Backend RankUtilsTests.CalculateMmrGain_UsesConfiguredAchievementTierReward: 0 * 1 + trunc(-750 / 28).
		[ 'an even game with no placement', { averageScore: 25, roundsPlayed: 10 }, {}, -26 ],
		// Backend ..._DefaultConfigurationPreservesLegacyFloatRounding: factor 200 / 250 = 0.8f,
		// (0 + 30 + 40 - 250) * (2 - 0.8f) = -216.00001, + trunc(750 / 28) = 26.
		[
			'a weaker lobby with float factors',
			{ playerMmr: 250, averageLobbyMmr: 200, placement: 1, roundsPlayed: 10 },
			{},
			-190,
		],
		// Backend ..._UsesExistingAchievementTierCapIncreases: cap 10 + 3 + 7 + 5 = 25; 874 - 26 = 848 is capped.
		[ 'a gain above the maximum', { averageScore: 100, placement: 1, roundsPlayed: 1 }, { maximumGain: 25 }, 25 ],
		// 250 * 1.4f = 349.99999, so float rounding truncates to 349, not 350.
		[
			'a factor clamped to the float maximum',
			{ playerMmr: 1000, averageLobbyMmr: 2000, averageScore: 40, placement: 1, roundsPlayed: 5 },
			{ maximumGain: 2000 },
			349,
		],
		// -20 - 250 = -270, - 26 = -296, clamped to the maximum loss.
		[ 'a loss above the maximum', { overshoots: 10 }, {}, -200 ],
		// 200 - 6 + 15 + 28 - 250 = -13; * (2 - 0.8f) = -15.6; - 26 = -41.6, truncated toward zero.
		[
			'a negative change truncated toward zero',
			{ averageLobbyMmr: 1400, averageScore: 20, overshoots: 3, placement: 2, roundsPlayed: 12 },
			{},
			-41,
		],
		// Factor falls back to the maximum 1.4f: (300 + trunc(30 / 4) + 0 - 250) * 1.4f = 79.8; + trunc(1000 / 28) = 35.
		[
			'a player without MMR in a rated lobby',
			{ playerMmr: 0, averageLobbyMmr: 500, averageScore: 30, placement: 4, roundsPlayed: 20 },
			{},
			114,
		],
		// Factor 1 when nobody has MMR: 0 + 35.
		[ 'a lobby without MMR', { playerMmr: 0, averageLobbyMmr: 0, averageScore: 25 }, {}, 35 ],
	])('%s', (_name, scenarioOverrides, configurationOverrides, expected) => {
		expect(calculateMmrChange(configuration(configurationOverrides), scenario(scenarioOverrides)))
			.toBe(expected);
	});

	it('uses the season configuration', () => {
		const request = scenario({ averageScore: 25, roundsPlayed: 10 });

		// Backend ..._UsesSeasonConfiguration: 25 * 20 - 250 = 250, - 26.
		expect(calculateMmrChange(configuration({ averageScoreMultiplier: 20 }), request)).toBe(224);
	});
});

describe('validateMmrConfiguration', () => {
	it('accepts the default configuration', () => {
		expect(validateMmrConfiguration(defaultMmrConfiguration)).toEqual([]);
	});

	it('accepts the boundaries', () => {
		expect(validateMmrConfiguration(configuration({
			startingMmr:           10000,
			maximumGain:           0,
			maximumLoss:           2000,
			ratingPullDivisor:     1,
			minimumOpponentFactor: 1,
			maximumOpponentFactor: 1,
		}))).toEqual([]);
	});

	it.each<[ Partial<MmrConfiguration>, string ]>([
		[ { baseScore: 2.5 }, 'Whole-number MMR settings must contain integers.' ],
		[ { startingMmr: -1 }, 'Starting MMR must be between 0 and 10000.' ],
		[ { startingMmr: 10001 }, 'Starting MMR must be between 0 and 10000.' ],
		[ { maximumGain: 2001 }, 'Maximum MMR gain and loss must be between 0 and 2000.' ],
		[ { maximumLoss: -1 }, 'Maximum MMR gain and loss must be between 0 and 2000.' ],
		[ { ratingPivot: 10001 }, 'Rating pivot must be between 0 and 10000.' ],
		[ { ratingPullDivisor: 0 }, 'Rating pull divisor must be between 1 and 1000.' ],
		[ { roundPenalty: 201 }, 'MMR score and bonus values are outside the supported range.' ],
		[ { placementBonus: -1 }, 'MMR score and bonus values are outside the supported range.' ],
		[ { averageScoreMultiplier: Number.NaN }, 'MMR score multipliers are outside the supported range.' ],
		[ { overshootPenalty: 201 }, 'MMR score multipliers are outside the supported range.' ],
		[ { minimumOpponentFactor: 0.05 }, 'Opponent factors must satisfy 0.1 <= minimum <= 1 <= maximum <= 3.' ],
		[ { maximumOpponentFactor: 0.9 }, 'Opponent factors must satisfy 0.1 <= minimum <= 1 <= maximum <= 3.' ],
		[ { maximumOpponentFactor: Infinity }, 'Opponent factors must satisfy 0.1 <= minimum <= 1 <= maximum <= 3.' ],
	])('rejects %o', (overrides, message) => {
		expect(validateMmrConfiguration(configuration(overrides))).toEqual([ message ]);
	});

	it('reports every problem at once', () => {
		expect(validateMmrConfiguration(configuration({ startingMmr: -1, ratingPullDivisor: 0 })))
			.toHaveLength(2);
	});
});
