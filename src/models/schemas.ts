import { z } from "zod";
import { RoundStatus, WinCondition, ScoreModifier } from "./enums.js";
import { DartThrowSchema } from "./dartThrowSchema.js";
import { Rank } from "./rank.js";

export const RoundSchema = z.object({
	roundNumber: z.number().int().min(0),
	dartThrows: z.array(DartThrowSchema).min(1).max(3),
	cumulativePoints: z.number().min(0),
	roundStatus: z.nativeEnum(RoundStatus),
});

export const PlayerRoundsScema = z.object({
	playerId: z.string().uuid(),
	rounds: z.array(RoundSchema),
});

export const GameSubmissionSchema = z.object({
	playerRoundsList: z.array(PlayerRoundsScema),
});

export const PlayerResultSchema = z.object({
	id: z.number().int(),
	userId: z.string().uuid(),
	placement: z.number().int(),
	totalScore: z.number().int(),
	averageScore: z.number(),
	overShoots: z.number(),
	roundsPlayed: z.number().int(),
	oldMMR: z.number().int(),
	newMMR: z.number().int(),
	oldRank: z.nativeEnum(Rank),
	newRank: z.nativeEnum(Rank),
});

export const SeasonStatisticsSchema = z.object({
	id: z.number(),
	userId: z.string().uuid(),
	seasonId: z.string().uuid(),
	currentRank: z.nativeEnum(Rank),
	highestAchievedRank: z.nativeEnum(Rank),
	mmr: z.number(),
});

export const UserSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	alias: z.string(),
	seasonStatistics: z.array(SeasonStatisticsSchema),
});

export const WinConditionRuleSchema = z.object({
	winCondition: z.nativeEnum(WinCondition),
});

export const ScoreModifierRuleSchema = z.object({
	scoreModifier: z.nativeEnum(ScoreModifier),
	executionOrder: z.number().int(),
});

export const SeasonSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	startDate: z.string().transform(str => new Date(str)),
	endDate: z.string().transform(str => new Date(str)),
	scoreModifierRules: z.array(ScoreModifierRuleSchema),
	winConditionRules: z.array(WinConditionRuleSchema),
	goal: z.number().int(),

	seasonStatistics: z.array(SeasonStatisticsSchema).optional(),
	gameResults: z.array(z.unknown()).optional(),
});

export const GameResultSchema = z.object({
	date: z.string().transform(str => new Date(str)),
	playerRoundsList: z.array(PlayerRoundsScema),
	playerResults: z.array(PlayerResultSchema),
	season: SeasonSchema,
	goal: z.number().int(),
});

export type Round = z.infer<typeof RoundSchema>;
export type PlayerRounds = z.infer<typeof PlayerRoundsScema>;

export type GameSubmission = z.infer<typeof GameSubmissionSchema>;
export type PlayerResult = z.infer<typeof PlayerResultSchema>;
export type SeasonStatistics = z.infer<typeof SeasonStatisticsSchema>;

export type User = z.infer<typeof UserSchema>;

export type Season = z.infer<typeof SeasonSchema>;
export type GameResult = z.infer<typeof GameResultSchema>;
export type WinConditionRule = z.infer<typeof WinConditionRuleSchema>;
export type ScoreModifierRule = z.infer<typeof ScoreModifierRuleSchema>;
