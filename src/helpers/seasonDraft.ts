import { AchievementTier, achievementTiersAscending } from '../models/enums.js';
import { defaultMmrConfiguration, validateMmrConfiguration } from '../models/mmr.js';
import { getRankDisplayValue, Rank } from '../models/rank.js';
import type {
	AchievementTierReward,
	GameConstraintRule,
	RankThreshold,
	RuleDefinitionsResponse,
	ScoreModifierRule,
	Season,
} from '../models/schemas.js';
import type { SeasonConfigurationInput } from '../services/seasonService.js';

/** A season being edited; `id` is missing until the season is first saved. */
export interface SeasonDraft extends SeasonConfigurationInput {
	id?: string;
}

/** A game-constraint rule while its value is being edited in the dialog. */
export interface GameConstraintRuleDraft extends GameConstraintRule {
	value: number | null;
}

type RuleDefinition = RuleDefinitionsResponse['scoreModifiers'][number];
type GameConstraintDefinition = RuleDefinitionsResponse['gameConstraints'][number];

/** Every rank, lowest first. */
export const rankValues: readonly Rank[] = Object.values(Rank)
	.filter((rank): rank is Rank => typeof rank === 'number')
	.sort((left, right) => left - right);

/** Default minimum MMR per rank, in `rankValues` order. */
export const defaultRankMinimums: readonly number[] = [
	0,
	1250,
	1500,
	1750,
	2000,
	2250,
	2500,
	2750,
	3000,
	3250,
	3500,
	3750,
	4000,
	4250,
	4500,
	4750,
	5000,
	5250,
	5500,
	5750,
	6000,
	6250,
	6500,
	6750,
	7000,
	7250,
	7500,
	7750,
	8000,
];

export const defaultAchievementRewards: Readonly<Record<AchievementTier, number>> = {
	[AchievementTier.bronze]:   5,
	[AchievementTier.silver]:   10,
	[AchievementTier.gold]:     15,
	[AchievementTier.platinum]: 20,
	[AchievementTier.diamond]:  30,
};

export const defaultAchievementCapIncreases: Readonly<Record<AchievementTier, number>> = {
	[AchievementTier.bronze]:   1,
	[AchievementTier.silver]:   1,
	[AchievementTier.gold]:     1,
	[AchievementTier.platinum]: 2,
	[AchievementTier.diamond]:  2,
};

/** Newest season first. */
export function sortSeasons(seasons: readonly Season[]): Season[] {
	return [ ...seasons ].sort(
		(left, right) => right.startDate.getTime() - left.startDate.getTime(),
	);
}

/** The season running at `now`, else the first one. */
export function findCurrentSeason(seasons: readonly Season[], now = new Date()): Season | undefined {
	return seasons.find(season => season.startDate <= now && season.endDate > now) ?? seasons[0];
}

/** One threshold per rank, in rank order; missing ranks get the default minimum. */
export function normalizeThresholds(thresholds?: readonly RankThreshold[]): RankThreshold[] {
	const byRank = new Map((thresholds ?? []).map(threshold => [ threshold.rank, threshold ]));

	return rankValues.map((rank, index) => ({
		rank,
		minimumMmr: byRank.get(rank)?.minimumMmr ?? defaultRankMinimums[index] ?? 0,
	}));
}

/** One reward per achievement tier, in tier order; missing tiers get the defaults. */
export function normalizeAchievementRewards(
	rewards?: readonly AchievementTierReward[],
): AchievementTierReward[] {
	const byTier = new Map(
		(rewards ?? []).map(reward => [ reward.achievementTier, reward ]),
	);

	return achievementTiersAscending.map(achievementTier => ({
		achievementTier,
		mmrReward: byTier.get(achievementTier)?.mmrReward
			?? defaultAchievementRewards[achievementTier],
		mmrCapIncrease: byTier.get(achievementTier)?.mmrCapIncrease
			?? defaultAchievementCapIncreases[achievementTier],
	}));
}

/** A draft of an existing season; it shares no objects with `season`. */
export function createDraftFromSeason(season: Season): SeasonDraft {
	return {
		id:                     season.id,
		name:                   season.name,
		startDate:              new Date(season.startDate),
		endDate:                new Date(season.endDate),
		goal:                   season.goal,
		scoreModifierRules:     season.scoreModifierRules.map(rule => ({ ...rule })),
		winConditionRules:      season.winConditionRules.map(rule => ({ ...rule })),
		gameConstraintRules:    season.gameConstraintRules.map(rule => ({ ...rule })),
		rankThresholds:         normalizeThresholds(season.rankThresholds),
		achievementTierRewards: normalizeAchievementRewards(season.achievementTierRewards),
		mmrConfiguration:       { ...season.mmrConfiguration },
	};
}

/**
 * A new 90-day season starting when the latest-ending season ends (or `now`), copying
 * that season's rules and settings.
 */
export function createNewSeasonDraft(seasons: readonly Season[], now = new Date()): SeasonDraft {
	const latest = [ ...seasons ]
		.sort((left, right) => right.endDate.getTime() - left.endDate.getTime())[0];
	const startDate = latest ? new Date(latest.endDate) : new Date(now);
	const endDate = new Date(startDate);
	endDate.setUTCDate(endDate.getUTCDate() + 90);

	return {
		name:                   '',
		startDate,
		endDate,
		goal:                   latest?.goal ?? 180,
		scoreModifierRules:     latest?.scoreModifierRules.map(rule => ({ ...rule })) ?? [],
		winConditionRules:      latest?.winConditionRules.map(rule => ({ ...rule })) ?? [],
		gameConstraintRules:    latest?.gameConstraintRules.map(rule => ({ ...rule })) ?? [],
		rankThresholds:         normalizeThresholds(latest?.rankThresholds),
		achievementTierRewards: normalizeAchievementRewards(latest?.achievementTierRewards),
		mmrConfiguration:       {
			...(latest?.mmrConfiguration ?? defaultMmrConfiguration),
		},
	};
}

/** A stable representation for dirty checks: rule order does not count as a change. */
export function serializeDraft(draft: SeasonDraft): string {
	return JSON.stringify({
		...draft,
		startDate:          draft.startDate.toISOString(),
		endDate:            draft.endDate.toISOString(),
		scoreModifierRules: [ ...draft.scoreModifierRules ]
			.sort((left, right) => left.scoreModifier - right.scoreModifier),
		winConditionRules: [ ...draft.winConditionRules ]
			.sort((left, right) => left.winCondition - right.winCondition),
		gameConstraintRules: [ ...draft.gameConstraintRules ]
			.sort((left, right) => left.gameConstraint - right.gameConstraint),
		rankThresholds: [ ...draft.rankThresholds ]
			.sort((left, right) => left.rank - right.rank),
		achievementTierRewards: [ ...draft.achievementTierRewards ]
			.sort((left, right) => left.achievementTier - right.achievementTier),
	});
}

/** Comma-separated names of the selected rules, or "None selected". */
export function getRuleNames(values: readonly number[], definitions: readonly RuleDefinition[]): string {
	const names = values
		.map(value => definitions.find(definition => definition.value === value)?.name)
		.filter((name): name is string => !!name);

	return names.length > 0 ? names.join(', ') : 'None selected';
}

export function formatGameConstraintValue(
	definition: GameConstraintDefinition,
	value: number | null,
): string {
	if (value === null)
		return 'No value';

	const label = definition.label?.trim();

	return label ? `${ label } ${ value }` : `${ value }`;
}

/** Without definitions nothing can be named, so the summary is "None selected". */
export function getGameConstraintSummary(
	rules: readonly GameConstraintRule[],
	definitions?: readonly GameConstraintDefinition[],
): string {
	if (!definitions)
		return 'None selected';

	const summaries = rules
		.map(rule => {
			const definition = definitions.find(item => item.value === rule.gameConstraint);
			if (!definition)
				return undefined;

			return rule.value === null
				? definition.name
				: formatGameConstraintValue(definition, rule.value);
		})
		.filter((summary): summary is string => !!summary);

	return summaries.length > 0 ? summaries.join(', ') : 'None selected';
}

export function getScoreModifierErrors(rules: readonly ScoreModifierRule[]): string[] {
	const executionOrders = rules.map(rule => rule.executionOrder);
	if (executionOrders.some(order => !Number.isInteger(order) || order < 0))
		return [ 'Score-modifier execution orders must be non-negative whole numbers.' ];
	if (new Set(executionOrders).size !== executionOrders.length)
		return [ 'Score-modifier execution orders must be unique.' ];

	return [];
}

export function getGameConstraintErrors(
	rules: readonly GameConstraintRule[],
	definitions: readonly GameConstraintDefinition[],
): string[] {
	const errors: string[] = [];
	const constraintValues = rules.map(rule => rule.gameConstraint);
	if (new Set(constraintValues).size !== constraintValues.length)
		errors.push('Each game constraint can only be configured once.');

	for (const rule of rules) {
		const definition = definitions.find(item => item.value === rule.gameConstraint);
		if (!definition) {
			errors.push('Unknown game constraint selected.');
			continue;
		}

		const hasParameter = !!definition.label;
		if (!hasParameter) {
			if (rule.value !== null)
				errors.push(`${ definition.name } does not take a numeric value.`);

			continue;
		}

		if (rule.value === null) {
			if (definition.required)
				errors.push(`${ definition.name } requires a ${ definition.label }.`);

			continue;
		}

		if (!Number.isInteger(rule.value))
			errors.push(`${ definition.name } ${ definition.label } must be a whole number.`);
		else if ((definition.min != null && rule.value < definition.min) || (definition.max != null && rule.value > definition.max))
			errors.push(`${ definition.name } ${ definition.label } must be between ${ definition.min } and ${ definition.max }.`);
	}

	return errors;
}

export function getThresholdErrors(thresholds: readonly RankThreshold[]): string[] {
	const errors: string[] = [];
	const sortedThresholds = [ ...thresholds ]
		.sort((left, right) => left.rank - right.rank);
	if (sortedThresholds.some(
		threshold =>
			!Number.isFinite(threshold.minimumMmr)
			|| !Number.isInteger(threshold.minimumMmr)
			|| threshold.minimumMmr < 0,
	))
		errors.push('Rank thresholds must be non-negative whole numbers.');

	if (sortedThresholds.length !== rankValues.length)
		errors.push('Every rank must have exactly one threshold.');
	if (sortedThresholds[0]?.rank !== Rank.Bronze || sortedThresholds[0].minimumMmr !== 0)
		errors.push('Bronze must begin at 0 MMR.');

	for (let index = 1; index < sortedThresholds.length; index++) {
		const previous = sortedThresholds[index - 1];
		const current = sortedThresholds[index];
		if (!previous || !current || current.rank !== rankValues[index]) {
			errors.push('Rank thresholds are incomplete or out of order.');
			break;
		}
		if (current.minimumMmr <= previous.minimumMmr) {
			errors.push(
				`${ getRankDisplayValue(current.rank) } must start above ${ getRankDisplayValue(previous.rank) }.`,
			);
			break;
		}
	}

	return errors;
}

export function getAchievementRewardErrors(rewards: readonly AchievementTierReward[]): string[] {
	const errors: string[] = [];
	const tiers = rewards.map(reward => reward.achievementTier);
	if (
		rewards.length !== achievementTiersAscending.length
		|| new Set(tiers).size !== achievementTiersAscending.length
		|| achievementTiersAscending.some(tier => !tiers.includes(tier))
	)
		errors.push('Every achievement tier must have exactly one MMR reward.');

	if (rewards.some(reward => !Number.isInteger(reward.mmrReward) || reward.mmrReward < 0))
		errors.push('Achievement MMR rewards must be non-negative whole numbers.');
	if (rewards.some(reward =>
		!Number.isInteger(reward.mmrCapIncrease)
		|| reward.mmrCapIncrease < 0
		|| reward.mmrCapIncrease > 100))
		errors.push('Achievement MMR cap increases must be whole numbers from 0 to 100.');

	return errors;
}

/** Every problem that blocks saving `draft`; `seasons` are checked for overlapping dates. */
export function validateSeasonDraft(
	draft: SeasonDraft,
	seasons: readonly Season[],
	gameConstraintDefinitions: readonly GameConstraintDefinition[],
): string[] {
	const errors: string[] = [];
	if (!draft.name.trim())
		errors.push('Season name is required.');
	if (draft.startDate >= draft.endDate)
		errors.push('End date must be after the start date.');
	if (!Number.isInteger(draft.goal) || draft.goal <= 0)
		errors.push('Goal must be a positive whole number.');

	const overlappingSeason = seasons.find(season =>
		season.id !== draft.id &&
		draft.startDate < season.endDate &&
		draft.endDate > season.startDate);
	if (overlappingSeason)
		errors.push(`Dates overlap ${ overlappingSeason.name }.`);

	errors.push(...getThresholdErrors(draft.rankThresholds));
	errors.push(...getAchievementRewardErrors(draft.achievementTierRewards));
	errors.push(...validateMmrConfiguration(draft.mmrConfiguration));

	errors.push(...getScoreModifierErrors(draft.scoreModifierRules));
	errors.push(...getGameConstraintErrors(draft.gameConstraintRules, gameConstraintDefinitions));

	return errors;
}

/** Whether a save error means the management key was rejected, so saving should lock again. */
export function isManagementAccessError(message: string): boolean {
	return /admin key|access denied|X-Season-Admin-Key|SEASON_ADMIN_KEY|401|403|unauthorized|forbidden/i
		.test(message);
}
