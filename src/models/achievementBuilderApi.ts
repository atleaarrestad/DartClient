import { z } from 'zod';

import { ThrowType } from './enums.js';
import type { PlayerRounds } from './schemas.js';

export const AchievementEvaluationPhaseSchema = z.enum([
	'Live',
	'GameCompleted',
	'Progression',
]);

export const AchievementVersionStatusSchema = z.enum([ 'Draft', 'Published' ]);

export const AchievementParameterKindSchema = z.enum([
	'IntegerRange',
	'IntegerSet',
	'StringSet',
	'BooleanSet',
]);

export const AchievementParameterDefinitionSchema = z.object({
	name: z.string(),
	kind: AchievementParameterKindSchema,
	minimum: z.number().int().nullable().optional(),
	maximum: z.number().int().nullable().optional(),
	step: z.number().int(),
	integerValues: z.array(z.number().int()),
	stringValues: z.array(z.string()),
	booleanValues: z.array(z.boolean()),
});

export const AchievementTemplateVersionResponseSchema = z.object({
	id: z.string().uuid(),
	versionNumber: z.number().int().positive(),
	status: AchievementVersionStatusSchema,
	evaluationPhase: AchievementEvaluationPhaseSchema,
	nameTemplate: z.string(),
	descriptionTemplate: z.string(),
	category: z.string(),
	achievementTier: z.number().int(),
	parameters: z.array(AchievementParameterDefinitionSchema),
	definition: z.record(z.string(), z.unknown()),
	createdAtUtc: z.string(),
	publishedAtUtc: z.string().nullable().optional(),
});

export const AchievementTemplateResponseSchema = z.object({
	id: z.string().uuid(),
	seasonId: z.string().uuid(),
	createdAtUtc: z.string(),
	versions: z.array(AchievementTemplateVersionResponseSchema),
});

export const AchievementInstanceResponseSchema = z.object({
	id: z.string().uuid(),
	templateId: z.string().uuid(),
	templateVersionId: z.string().uuid(),
	versionNumber: z.number().int().positive(),
	seasonId: z.string().uuid(),
	binding: z.record(z.string(), z.union([ z.string(), z.number(), z.boolean(), z.null() ])),
	bindingHash: z.string(),
	renderedName: z.string(),
	renderedDescription: z.string(),
	category: z.string(),
	achievementTier: z.number().int(),
	evaluationPhase: AchievementEvaluationPhaseSchema,
});

export const AchievementValidationResponseSchema = z.object({
	isValid: z.boolean(),
	errors: z.array(z.string()),
	dependencies: z.array(z.string()),
	nodeCount: z.number().int().nonnegative(),
	maximumDepth: z.number().int().nonnegative(),
	generatedInstanceCount: z.number().int().nonnegative(),
});

const AchievementCatalogEntrySchema = z.object({
	kind: z.string(),
	returns: z.string(),
	inputs: z.array(z.string()),
	phases: z.array(z.string()),
});

export const AchievementBuilderCatalogSchema = z.object({
	astVersion: z.number().int().positive(),
	limits: z.object({
		maximumDefinitionTextLength: z.number().int().positive(),
		maximumAstDepth: z.number().int().positive(),
		maximumAstNodes: z.number().int().positive(),
		maximumQuantifierDepth: z.number().int().positive(),
		maximumGeneratedInstances: z.number().int().positive(),
		maximumRenderedTextLength: z.number().int().positive(),
		maximumPredictionThrows: z.number().int().positive(),
		maximumPredictionSearchCombinations: z.number().int().positive(),
		maximumPredictionSequencesPerAchievement: z.number().int().positive(),
	}),
	evaluationPhases: z.array(z.string()),
	parameterKinds: z.array(z.string()),
	achievementTiers: z.array(z.string()),
	versionMetadataFields: z.array(z.string()),
	roundStatuses: z.array(z.string()),
	throwTypes: z.array(z.string()),
	blocks: z.array(AchievementCatalogEntrySchema),
	fields: z.array(z.object({
		path: z.string(),
		type: z.string(),
		scopes: z.array(z.string()),
		phases: z.array(z.string()),
	})),
	progressionReducers: z.array(z.object({
		kind: z.string(),
		inputs: z.array(z.string()),
	})),
});

export const AchievementLegalHitSchema = z.object({
	hitLocation: z.number().int(),
	throwType: z.nativeEnum(ThrowType),
});

export const AchievementPredictionSchema = z.object({
	achievement: AchievementInstanceResponseSchema,
	hitSequences: z.array(z.array(AchievementLegalHitSchema)),
	isTruncated: z.boolean(),
});

export const PredictAchievementThrowsResponseSchema = z.object({
	validHits: z.array(AchievementLegalHitSchema),
	roundIndex: z.number().int().nonnegative(),
	startingThrowIndex: z.number().int().min(0).max(2),
	throwsRemaining: z.number().int().positive(),
	predictions: z.array(AchievementPredictionSchema),
});

export type AchievementParameterDefinition = z.infer<
	typeof AchievementParameterDefinitionSchema
>;
export type AchievementTemplateResponse = z.infer<typeof AchievementTemplateResponseSchema>;
export type AchievementTemplateVersionResponse = z.infer<
	typeof AchievementTemplateVersionResponseSchema
>;
export type AchievementInstanceResponse = z.infer<typeof AchievementInstanceResponseSchema>;
export type AchievementValidationResponse = z.infer<
	typeof AchievementValidationResponseSchema
>;
export type AchievementBuilderCatalog = z.infer<typeof AchievementBuilderCatalogSchema>;
export type PredictAchievementThrowsResponse = z.infer<
	typeof PredictAchievementThrowsResponseSchema
>;

export interface UpsertAchievementTemplateRequest {
	seasonId: string;
	nameTemplate: string;
	descriptionTemplate: string;
	category: string;
	achievementTier: number;
	evaluationPhase: 'Live' | 'GameCompleted' | 'Progression';
	parameters: AchievementParameterDefinition[];
	definition: Record<string, unknown>;
}

export interface PredictAchievementThrowsRequest {
	seasonId: string;
	player: PlayerRounds;
	roundIndex?: number;
	throwIndex?: number;
	throwsRemaining?: number;
	unlockedAchievementInstanceIds: string[];
}
