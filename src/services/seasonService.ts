import { container, injectable } from 'tsyringe';

import {
	AchievementTierReward,
	GameConstraintRule,
	MmrConfiguration,
	RankThreshold,
	ScoreModifierRule,
	Season,
	WinConditionRule,
} from '../models/schemas.js';
import { DataService } from './dataService.js';

export interface SeasonConfigurationInput {
	name:                   string;
	startDate:              Date;
	endDate:                Date;
	goal:                   number;
	scoreModifierRules:     ScoreModifierRule[];
	winConditionRules:      WinConditionRule[];
	gameConstraintRules:    GameConstraintRule[];
	rankThresholds:         RankThreshold[];
	achievementTierRewards: AchievementTierReward[];
	mmrConfiguration:       MmrConfiguration;
}

export interface UpdateSeasonConfigurationInput extends SeasonConfigurationInput {
	id: string;
}

export const seasonUpdatedEventName = 'season-updated';

@injectable()
export class SeasonService {

	private currentlyActiveSeasonPromise?: Promise<Season>;
	private seasonsPromise?:               Promise<Season[]>;
	private dataService:                   DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	async getCurrentSeason(forceGetFromDatabase: boolean = false): Promise<Season> {
		if (!forceGetFromDatabase && this.currentlyActiveSeasonPromise)
			return this.currentlyActiveSeasonPromise;


		const promise = this.dataService.getCurrentSeason()
			.finally(() => {
				if (this.currentlyActiveSeasonPromise === promise)
					this.currentlyActiveSeasonPromise = undefined;
			});
		this.currentlyActiveSeasonPromise = promise;

		return promise;
	}

	async getAll(forceGetFromDatabase: boolean = false): Promise<Season[]> {
		if (!forceGetFromDatabase && this.seasonsPromise)
			return this.seasonsPromise;


		const promise = this.dataService.GetAllSeasons()
			.finally(() => {
				if (this.seasonsPromise === promise)
					this.seasonsPromise = undefined;
			});
		this.seasonsPromise = promise;

		return promise;
	}

	verifyManagementAccess(adminKey: string): Promise<void> {
		return this.dataService.verifySeasonManagementAccess(adminKey);
	}

	async create(
		input: SeasonConfigurationInput,
		adminKey: string,
	): Promise<Season> {
		const season = await this.dataService.createSeason(
			this.toRequest(input),
			adminKey,
		);

		this.clearRequests();
		this.dispatchSeasonUpdated(season);

		return season;
	}

	async update(
		input: UpdateSeasonConfigurationInput,
		adminKey: string,
	): Promise<Season> {
		const season = await this.dataService.updateSeason(
			{
				id: input.id,
				...this.toRequest(input),
			},
			adminKey,
		);

		this.clearRequests();
		this.dispatchSeasonUpdated(season);

		return season;
	}

	private dispatchSeasonUpdated(season: Season): void {
		window.dispatchEvent(new CustomEvent<Season>(seasonUpdatedEventName, {
			detail: season,
		}));
	}

	private toRequest(input: SeasonConfigurationInput): object {
		return {
			name:                   input.name.trim(),
			startDate:              input.startDate.toISOString(),
			endDate:                input.endDate.toISOString(),
			goal:                   input.goal,
			scoreModifierRules:     input.scoreModifierRules,
			winConditionRules:      input.winConditionRules,
			gameConstraintRules:    input.gameConstraintRules,
			rankThresholds:         input.rankThresholds,
			achievementTierRewards: input.achievementTierRewards,
			mmrConfiguration:       input.mmrConfiguration,
		};
	}

	private clearRequests(): void {
		this.currentlyActiveSeasonPromise = undefined;
		this.seasonsPromise = undefined;
	}

}
