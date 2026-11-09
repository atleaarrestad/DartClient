import type {
	AchievementInstanceResponse,
	LastDartHints,
} from '../models/achievementBuilderApi.js';
import { RoundStatus, ThrowType } from '../models/enums.js';
import type { PlayerRounds, Round } from '../models/schemas.js';

export const testGameId = '81a3e496-7530-4678-82ff-323a27d50410';
export const testPlayerId = '11ea5813-f41e-4301-b7ed-881f8466100c';
export const testSecondPlayerId = '444a1f88-cdb8-4fd7-8cf7-92f9cc2ab0d8';

/** A thrown dart as `[ hitLocation, throwType ]`, or `null` for a dart not thrown yet. */
export type Dart = [ hitLocation: number, throwType: ThrowType ] | null;

export interface RoundOptions {
	roundStatus?:      RoundStatus;
	cumulativePoints?: number;
	/** Darts left out are placeholders (location 0, single, 0 points). */
	darts?:            Dart[];
}

/** A round of three dart slots; thrown darts score 1 point each. */
export function createRound(roundIndex: number, options: RoundOptions = {}): Round {
	return {
		roundIndex,
		roundStatus:         options.roundStatus ?? RoundStatus.Valid,
		cumulativePoints:    options.cumulativePoints ?? 0,
		indexOfVictoryThrow: null,
		dartThrows:          [ 0, 1, 2 ].map(throwIndex => {
			const dart = options.darts?.[throwIndex] ?? null;

			return {
				hitLocation:        dart?.[0] ?? 0,
				throwType:          dart?.[1] ?? ThrowType.Single,
				finalPoints:        dart ? 1 : 0,
				throwIndex,
				activatedModifiers: [],
			};
		}),
	};
}

export function createPlayer(playerId: string, rounds: Round[]): PlayerRounds {
	return { playerId, rounds };
}

/** A bronze live achievement as the server sends it in projections and hints. */
export function createAchievementInstance(id: string, renderedName: string): AchievementInstanceResponse {
	return {
		id,
		templateId:          '0f6a2a6e-5a8c-4c43-9a43-5b0b8f2f7d10',
		templateVersionId:   'a1c1d7e5-1c35-4a8e-9a43-2c7f4b8e5e21',
		versionNumber:       1,
		seasonId:            'c3d6a9f2-7b1e-4c5d-8e9f-0a1b2c3d4e5f',
		binding:             {},
		bindingHash:         '',
		renderedName,
		renderedDescription: '',
		evaluationPhase:     'Live',
		achievementTier:     1,
		categoryId:          'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70',
		categoryName:        'Custom',
		categoryIsArchived:  false,
	};
}

/** Hints for round 2 where a T20 unlocks `achievement`. */
export function createLastDartHints(achievement: AchievementInstanceResponse): LastDartHints {
	return {
		roundIndex: 2,
		totalCount: 1,
		hints:      [ {
			id:   achievement.id,
			name: achievement.renderedName,
			tier: achievement.achievementTier,
			hits: [ 'T20' ],
		} ],
		victoryHits:   [],
		sixtyNineHits: [],
	};
}
