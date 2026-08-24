import { z } from 'zod';

import { DartThrowSchema } from './dartThrowSchema.js';
import { AchievementTier, GameConstraint, ProgressAchievement, RoundStatus, ScoreModifier, SessionAchievement, ThrowType, WinCondition } from './enums.js';
import { Rank } from './rank.js';


export const RoundSchema = z.object({
	roundIndex:       z.number().int().min(0),
	dartThrows:       z.array(DartThrowSchema).min(1).max(3),
	cumulativePoints: z.number().min(0),
	roundStatus:      z.nativeEnum(RoundStatus),
});

export const PlayerRoundsSchema = z.object({
	playerId: z.string().uuid(),
	rounds:   z.array(RoundSchema),
});

export const GameSubmissionSchema = z.object({
	playerRoundsList: z.array(PlayerRoundsSchema),
});

export const PlayerResultSchema = z.object({
	id:                           z.number().int(),
	userId:                       z.string().uuid(),
	placement:                    z.number().int(),
	totalScore:                   z.number().int(),
	averageScore:                 z.number(),
	overShoots:                   z.number(),
	roundsPlayed:                 z.number().int(),
	oldMMR:                       z.number().int(),
	newMMR:                       z.number().int(),
	oldRank:                      z.nativeEnum(Rank),
	newRank:                      z.nativeEnum(Rank),
	unlockedProgressAchievements: z.array(z.nativeEnum(ProgressAchievement)),
	unlockedSessionAchievements:  z.array(z.nativeEnum(SessionAchievement)),
});

export const GameTrackerSchema = z.object({
	id:                                   z.string().uuid(),
	started:                              z.string().transform(str => new Date(str)),
	maximumRounds:                        z.number().int().nullable().default(null),
	configuredMaximumRounds:              z.number().int().nullable().default(null),
	playersRounds:                        z.array(PlayerRoundsSchema),
	projectedSessionAchievementsByPlayer: z.record(
		z.string().uuid(),
		z.array(z.nativeEnum(SessionAchievement)),
	).default({}),
});

export const MatchSnapshotSchema = z.object({
	id:                 z.number(),
	seasonStatisticsId: z.number(),
	date:               z.string().transform(str => new Date(str)),
	mmr:                z.number(),
	rank:               z.nativeEnum(Rank),
	playerCount:        z.number(),
});

export const HitCountSchema = z.object({
	id:                 z.number(),
	throwType:          z.nativeEnum(ThrowType),
	hitLocation:        z.number(),
	count:              z.number(),
	seasonStatisticsId: z.number(),
});
export const FinishCountSchema = z.object({
	id:                 z.number(),
	roundNumber:        z.number(),
	count:              z.number(),
	seasonStatisticsId: z.number(),
});

const SessionAchievementValues = Object.values(SessionAchievement).filter(
	(v): v is number => typeof v === 'number',
);

const ProgressionAchievementValues = Object.values(ProgressAchievement).filter(
	(v): v is number => typeof v === 'number',
);

export const SessionAchievementSafeSchema = z
	.number()
	.int()
	.transform((value) =>
		SessionAchievementValues.includes(value)
			? (value as SessionAchievement)
			: 'unknown');
export const ProgressionAchievementSafeSchema = z
	.number()
	.int()
	.transform((value) =>
		ProgressionAchievementValues.includes(value)
			? (value as ProgressAchievement)
			: 'unknown');

export type SessionAchievementSafe = SessionAchievement | 'unknown';
export type ProgressionAchievementSafe = ProgressAchievement | 'unknown';

export const ProgressionAchievementTargetSchema = z.object({
	hitLocation: z.number().int(),
	throwType:   z.nativeEnum(ThrowType),
});

export const ProgressionAchievementProgressSchema = z.object({
	achievement:      ProgressionAchievementSafeSchema,
	completedTargets: z.number().int().nonnegative(),
	requiredTargets:  z.number().int().nonnegative(),
	remainingTargets: z.array(ProgressionAchievementTargetSchema),
});

export const SeasonStatisticsSchema = z.object({
	id:                           	 z.number(),
	userId:                       	 z.string().uuid(),
	seasonId:                     	 z.string().uuid(),
	currentRank:                  	 z.nativeEnum(Rank),
	highestAchievedRank:          	 z.nativeEnum(Rank),
	highestRoundScore:            	 z.number(),
	highestRoundScoreForVictory:  	 z.number(),
	highestRoundScoreNoSeasonRules: z.number(),
	mmr:                          	 z.number(),
	matchSnapshots:               	 z.array(MatchSnapshotSchema),
	hitCounts:                    	 z.array(HitCountSchema),
	finishCount:                  	 z.array(FinishCountSchema),
	unlockedProgressAchievements: 	 z.array(ProgressionAchievementSafeSchema),
	unlockedSessionAchievements:  	 z.array(SessionAchievementSafeSchema),
	progressAchievementProgress:    z.array(ProgressionAchievementProgressSchema).default([]),
});

export const UserSchema = z.object({
	id:               z.string().uuid(),
	name:             z.string(),
	alias:            z.string(),
	seasonStatistics: z.array(SeasonStatisticsSchema),
});

export const WinConditionRuleSchema = z.object({
	winCondition: z.nativeEnum(WinCondition),
});

export const GameConstraintRuleSchema = z.object({
	gameConstraint: z.nativeEnum(GameConstraint),
	value:          z.number().int().nullable(),
});

export const ScoreModifierRuleSchema = z.object({
	scoreModifier:  z.nativeEnum(ScoreModifier),
	executionOrder: z.number().int(),
});

export const RankThresholdSchema = z.object({
	rank:       z.nativeEnum(Rank),
	minimumMmr: z.number().int().nonnegative(),
});

export const AchievementTierRewardSchema = z.object({
	achievementTier: z.nativeEnum(AchievementTier),
	mmrReward:       z.number().int().nonnegative(),
	mmrCapIncrease:  z.number().int().min(0).max(100),
});

export const MmrConfigurationSchema = z.object({
	startingMmr:                 z.number().int(),
	maximumGain:                 z.number().int(),
	maximumLoss:                 z.number().int(),
	ratingPivot:                 z.number().int(),
	ratingPullDivisor:           z.number().int(),
	baseScore:                   z.number().int(),
	averageScoreMultiplier:      z.number(),
	overshootPenalty:            z.number(),
	placementBonus:              z.number().int(),
	finishBonus:                 z.number().int(),
	roundPenalty:                z.number().int(),
	minimumOpponentFactor:       z.number(),
	maximumOpponentFactor:       z.number(),
});

export const SeasonSchema = z.object({
	id:                     z.string().uuid(),
	name:                   z.string(),
	startDate:              z.string().transform(str => new Date(str)),
	endDate:                z.string().transform(str => new Date(str)),
	scoreModifierRules:     z.array(ScoreModifierRuleSchema),
	winConditionRules:      z.array(WinConditionRuleSchema),
	gameConstraintRules:    z.array(GameConstraintRuleSchema).default([]),
	rankThresholds:         z.array(RankThresholdSchema),
	achievementTierRewards: z.array(AchievementTierRewardSchema),
	mmrConfiguration:       MmrConfigurationSchema,
	goal:                   z.number().int(),

	seasonStatistics: z.array(SeasonStatisticsSchema).optional(),
	gameResults:      z.array(z.unknown()).optional(),
});

export const GameResultSchema = z.object({
	date:             z.string().transform(str => new Date(str)),
	playerRoundsList: z.array(PlayerRoundsSchema),
	playerResults:    z.array(PlayerResultSchema),
	season:           SeasonSchema,
	goal:             z.number().int(),
});

export const RuleDefinitionSchema = z.object({
	value:              z.number().int(),
	name:               z.string(),
	description:        z.string(),
	codeImplementation: z.string(),
	label:              z.string().optional(),
	min:                z.number().int().nullable().optional(),
	max:                z.number().int().nullable().optional(),
	defaultValue:       z.number().int().nullable().optional(),
	required:           z.boolean().optional(),
});
export const RuleDefinitionsResponseSchema = z.object({
	scoreModifiers: z.array(RuleDefinitionSchema),
	winConditions:  z.array(RuleDefinitionSchema),
	gameConstraints: z.array(RuleDefinitionSchema).default([]),
});

export const SessionAchievementDefinition = z.object({
	name:            z.string(),
	description:     z.string(),
	achievementTier: z.number(),
	achievementType: z.number(),
});

export const ProgressionAchievementDefinition = z.object({
	name:            z.string(),
	description:     z.string(),
	achievementTier: z.number(),
	achievementType: z.number(),
});

const SessionAchievementKeySchema = z.string().refine(
	(k): k is keyof typeof SessionAchievement => k in SessionAchievement,
	{ message: 'Invalid SessionAchievement key' },
);

const ProgressAchievementKeySchema = z.string().refine(
	(k): k is keyof typeof ProgressAchievement => k in ProgressAchievement,
	{ message: 'Invalid ProgressAchievement key' },
);

export const AchievementDefinitionsResponseSchema = z.object({
	sessionAchievementDefinitions: z.record(
		SessionAchievementKeySchema,
		SessionAchievementDefinition,
	),
	progressionAchievementDefinitions: z.record(
		ProgressAchievementKeySchema,
		ProgressionAchievementDefinition,
	),
}).transform((resp) => {
	return {
		sessionAchievementDefinitions: new Map(
			Object.entries(resp.sessionAchievementDefinitions).map(([ k, v ]) => [
				SessionAchievement[k as keyof typeof SessionAchievement],
				v,
			]),
		),
		progressionAchievementDefinitions: new Map(
			Object.entries(resp.progressionAchievementDefinitions).map(([ k, v ]) => [
				ProgressAchievement[k as keyof typeof ProgressAchievement],
				v,
			]),
		),
	};
});


export type Round = z.infer<typeof RoundSchema>;
export type PlayerRounds = z.infer<typeof PlayerRoundsSchema>;

export type GameSubmission = z.infer<typeof GameSubmissionSchema>;
export type PlayerResult = z.infer<typeof PlayerResultSchema>;
export type SeasonStatistics = z.infer<typeof SeasonStatisticsSchema>;
export type MatchSnapshot = z.infer<typeof MatchSnapshotSchema>;
export type HitCount = z.infer<typeof HitCountSchema>;
export type FinishCount = z.infer<typeof FinishCountSchema>;
export type ProgressionAchievementTarget = z.infer<typeof ProgressionAchievementTargetSchema>;
export type ProgressionAchievementProgress = z.infer<typeof ProgressionAchievementProgressSchema>;
export type GameTracker = z.infer<typeof GameTrackerSchema>;

export type User = z.infer<typeof UserSchema>;

export type Season = z.infer<typeof SeasonSchema>;
export type GameResult = z.infer<typeof GameResultSchema>;
export type WinConditionRule = z.infer<typeof WinConditionRuleSchema>;
export type GameConstraintRule = z.infer<typeof GameConstraintRuleSchema>;
export type ScoreModifierRule = z.infer<typeof ScoreModifierRuleSchema>;
export type RankThreshold = z.infer<typeof RankThresholdSchema>;
export type AchievementTierReward = z.infer<typeof AchievementTierRewardSchema>;
export type MmrConfiguration = z.infer<typeof MmrConfigurationSchema>;
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;
export type RuleDefinitionsResponse = z.infer<typeof RuleDefinitionsResponseSchema>;
export type AchievementDefinitionsResponse = z.infer<typeof AchievementDefinitionsResponseSchema>;
export type SessionsAchievementDefinition = z.infer<typeof SessionAchievementDefinition>;
export type ProgressionAchievementDefinition = z.infer<typeof ProgressionAchievementDefinition>;
