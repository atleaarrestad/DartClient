import { container, injectable } from 'tsyringe';

import {
	AchievementTierReward,
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


		this.currentlyActiveSeasonPromise = this.dataService.getCurrentSeason()
			.finally(() => {
				this.currentlyActiveSeasonPromise = undefined;
			});

		return this.currentlyActiveSeasonPromise;
	}

	async getAll(forceGetFromDatabase: boolean = false): Promise<Season[]> {
		if (!forceGetFromDatabase && this.seasonsPromise)
			return this.seasonsPromise;


		this.seasonsPromise = this.dataService.GetAllSeasons()
			.finally(() => {
				this.seasonsPromise = undefined;
			});

		return this.seasonsPromise;
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
		window.dispatchEvent(new CustomEvent<Season>(seasonUpdatedEventName, {
			detail: season,
		}));

		return season;
	}

	private toRequest(input: SeasonConfigurationInput): object {
		return {
			name:                   input.name.trim(),
			startDate:              input.startDate.toISOString(),
			endDate:                input.endDate.toISOString(),
			goal:                   input.goal,
			scoreModifierRules:     input.scoreModifierRules,
			winConditionRules:      input.winConditionRules,
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
