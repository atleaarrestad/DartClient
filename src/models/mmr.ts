import type { MmrConfiguration } from './schemas.js';

export const defaultMmrConfiguration: MmrConfiguration = {
	startingMmr:                  1750,
	maximumGain:                  250,
	maximumLoss:                  200,
	ratingPivot:                  1000,
	ratingPullDivisor:            28,
	baseScore:                    250,
	averageScoreMultiplier:       10,
	overshootPenalty:             2,
	placementBonus:               30,
	finishBonus:                  100,
	roundPenalty:                 6,
	minimumOpponentFactor:        0.75,
	maximumOpponentFactor:        1.4,
};

export interface MmrScenario {
	playerMmr: number;
	averageLobbyMmr: number;
	averageScore: number;
	overshoots: number;
	placement: number;
	roundsPlayed: number;
}

export function calculateMmrChange(
	configuration: MmrConfiguration,
	scenario: MmrScenario,
): number {
	const rawOpponentFactor = scenario.playerMmr > 0
		? Math.fround(scenario.averageLobbyMmr / scenario.playerMmr)
		: scenario.averageLobbyMmr > 0
			? Math.fround(configuration.maximumOpponentFactor)
			: 1;
	const opponentFactor = Math.min(
		Math.fround(configuration.maximumOpponentFactor),
		Math.max(
			Math.fround(configuration.minimumOpponentFactor),
			rawOpponentFactor,
		),
	);
	const ratingPull = Math.trunc(
		(configuration.ratingPivot - scenario.playerMmr)
		/ configuration.ratingPullDivisor,
	);
	const placementPoints = scenario.placement > 0
		? Math.trunc(configuration.placementBonus / scenario.placement)
		: 0;
	const finishPoints = scenario.placement > 0
		? Math.min(
			configuration.finishBonus,
			Math.max(
				0,
				configuration.finishBonus
				- configuration.roundPenalty * scenario.roundsPlayed,
			),
		)
		: 0;
	let change =
		scenario.averageScore * configuration.averageScoreMultiplier
		- scenario.overshoots * configuration.overshootPenalty
		+ placementPoints
		+ finishPoints
		- configuration.baseScore;
	change *= change < 0 ? Math.fround(2 - opponentFactor) : opponentFactor;
	change += ratingPull;

	return Math.min(
		configuration.maximumGain,
		Math.max(-configuration.maximumLoss, Math.trunc(change)),
	);
}

export function validateMmrConfiguration(configuration: MmrConfiguration): string[] {
	const errors: string[] = [];
	const integerFields: (keyof MmrConfiguration)[] = [
		'startingMmr',
		'maximumGain',
		'maximumLoss',
		'ratingPivot',
		'ratingPullDivisor',
		'baseScore',
		'placementBonus',
		'finishBonus',
		'roundPenalty',
	];

	if (integerFields.some(field => !Number.isInteger(configuration[field])))
		errors.push('Whole-number MMR settings must contain integers.');
	if (configuration.startingMmr < 0 || configuration.startingMmr > 10000)
		errors.push('Starting MMR must be between 0 and 10000.');
	if (
		configuration.maximumGain < 0 || configuration.maximumGain > 2000
		|| configuration.maximumLoss < 0 || configuration.maximumLoss > 2000
	)
		errors.push('Maximum MMR gain and loss must be between 0 and 2000.');
	if (configuration.ratingPivot < 0 || configuration.ratingPivot > 10000)
		errors.push('Rating pivot must be between 0 and 10000.');
	if (configuration.ratingPullDivisor < 1 || configuration.ratingPullDivisor > 1000)
		errors.push('Rating pull divisor must be between 1 and 1000.');
	if (
		configuration.baseScore < 0 || configuration.baseScore > 2000
		|| configuration.placementBonus < 0 || configuration.placementBonus > 1000
		|| configuration.finishBonus < 0 || configuration.finishBonus > 2000
		|| configuration.roundPenalty < 0 || configuration.roundPenalty > 200
	)
		errors.push('MMR score and bonus values are outside the supported range.');
	if (
		!Number.isFinite(configuration.averageScoreMultiplier)
		|| configuration.averageScoreMultiplier < 0
		|| configuration.averageScoreMultiplier > 100
		|| !Number.isFinite(configuration.overshootPenalty)
		|| configuration.overshootPenalty < 0
		|| configuration.overshootPenalty > 200
	)
		errors.push('MMR score multipliers are outside the supported range.');
	if (
		!Number.isFinite(configuration.minimumOpponentFactor)
		|| !Number.isFinite(configuration.maximumOpponentFactor)
		|| configuration.minimumOpponentFactor < 0.1
		|| configuration.minimumOpponentFactor > 1
		|| configuration.maximumOpponentFactor < 1
		|| configuration.maximumOpponentFactor > 3
		|| configuration.minimumOpponentFactor > configuration.maximumOpponentFactor
	)
		errors.push('Opponent factors must satisfy 0.1 <= minimum <= 1 <= maximum <= 3.');

	return errors;
}
