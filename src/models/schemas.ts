import { z } from 'zod';

import { AchievementInstanceResponseSchema, LastDartHintsSchema } from './achievementBuilderApi.js';
import { DartThrowSchema } from './dartThrowSchema.js';
import { AchievementTier, GameConstraint, RoundStatus, ScoreModifier, ThrowType, WinCondition } from './enums.js';
import { Rank } from './rank.js';


export const RoundSchema = z.object({
	roundIndex:          z.number().int().min(0),
	dartThrows:          z.array(DartThrowSchema).min(1).max(3),
	cumulativePoints:    z.number().min(0),
	roundStatus:         z.nativeEnum(RoundStatus),
	indexOfVictoryThrow: z.number().int().min(0).max(2).nullable().default(null),
});

export const PlayerRoundsSchema = z.object({
	playerId: z.string().uuid(),
	rounds:   z.array(RoundSchema),
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
	unlockedV2Achievements:       z.array(AchievementInstanceResponseSchema).default([]),
});

export const GameTrackerSchema = z.object({
	id:                                   z.string().uuid(),
	started:                              z.string().transform(str => new Date(str)),
	revision:                             z.number().int().nonnegative().default(0),
	maximumRounds:                        z.number().int().nullable().default(null),
	configuredMaximumRounds:              z.number().int().nullable().default(null),
	playersRounds:                        z.array(PlayerRoundsSchema),
	projectedV2AchievementsByPlayer: z.record(
		z.string().uuid(),
		z.array(AchievementInstanceResponseSchema),
	).default({}),
	// Only players about to throw the last dart of their round with something in reach.
	lastDartHintsByPlayer: z.record(
		z.string().uuid(),
		LastDartHintsSchema,
	).default({}),
});

export const PlayerRoundDeltaSchema = z.object({
	playerId:        z.string().uuid(),
	startRoundIndex: z.number().int().nonnegative(),
	roundCount:      z.number().int().nonnegative(),
	rounds:          z.array(RoundSchema),
}).superRefine((delta, context) => {
	if (delta.startRoundIndex > delta.roundCount) {
		context.addIssue({
			code:    'custom',
			message: 'startRoundIndex cannot exceed roundCount',
		});
	}

	if (delta.rounds.length !== delta.roundCount - delta.startRoundIndex) {
		context.addIssue({
			code:    'custom',
			message: 'rounds must contain the complete authoritative tail',
		});
	}

	delta.rounds.forEach((round, index) => {
		if (round.roundIndex !== delta.startRoundIndex + index) {
			context.addIssue({
				code:    'custom',
				message: 'round indexes must be contiguous from startRoundIndex',
				path:    [ 'rounds', index, 'roundIndex' ],
			});
		}
	});
});

export const GameTrackerDeltaSchema = z.object({
	gameId:                               z.string().uuid(),
	baseRevision:                         z.number().int().nonnegative(),
	revision:                             z.number().int().positive(),
	maximumRounds:                        z.number().int().nullable(),
	configuredMaximumRounds:              z.number().int().nullable(),
	playerRoundDeltas:                    z.array(PlayerRoundDeltaSchema),
	// Only players whose projection changed; an empty list clears the projection.
	projectedV2AchievementsByPlayer: z.record(
		z.string().uuid(),
		z.array(AchievementInstanceResponseSchema),
	).default({}),
	// Only players whose hints changed; null clears the player's hints.
	lastDartHintsByPlayer: z.record(
		z.string().uuid(),
		LastDartHintsSchema.nullable(),
	).default({}),
}).superRefine((delta, context) => {
	if (delta.revision !== delta.baseRevision + 1) {
		context.addIssue({
			code:    'custom',
			message: 'revision must immediately follow baseRevision',
		});
	}

	const playerIds = new Set<string>();
	delta.playerRoundDeltas.forEach((playerDelta, index) => {
		if (playerIds.has(playerDelta.playerId)) {
			context.addIssue({
				code:    'custom',
				message: 'playerRoundDeltas cannot contain duplicate players',
				path:    [ 'playerRoundDeltas', index, 'playerId' ],
			});
		}

		playerIds.add(playerDelta.playerId);
	});
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

export const AchievementProgressionTargetSchema = z.object({
	hitLocation: z.number().int(),
	throwType:   z.nativeEnum(ThrowType),
});

export const AchievementProgressionProgressSchema = z.object({
	achievementInstanceId: z.string().uuid(),
	completedTargets:      z.number().int().nonnegative(),
	requiredTargets:       z.number().int().nonnegative(),
	remainingTargets:      z.array(AchievementProgressionTargetSchema),
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
	unlockedV2Achievements:          z.array(AchievementInstanceResponseSchema).default([]),
	progressionAchievementProgress:  z.array(AchievementProgressionProgressSchema).default([]),
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

export type Round = z.infer<typeof RoundSchema>;
export type PlayerRounds = z.infer<typeof PlayerRoundsSchema>;

export type PlayerResult = z.infer<typeof PlayerResultSchema>;
export type SeasonStatistics = z.infer<typeof SeasonStatisticsSchema>;
export type MatchSnapshot = z.infer<typeof MatchSnapshotSchema>;
export type HitCount = z.infer<typeof HitCountSchema>;
export type FinishCount = z.infer<typeof FinishCountSchema>;
export type AchievementProgressionTarget = z.infer<typeof AchievementProgressionTargetSchema>;
export type AchievementProgressionProgress = z.infer<typeof AchievementProgressionProgressSchema>;
export type GameTracker = z.infer<typeof GameTrackerSchema>;
export type GameTrackerDelta = z.infer<typeof GameTrackerDeltaSchema>;

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
