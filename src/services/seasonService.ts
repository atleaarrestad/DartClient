import { container, injectable } from 'tsyringe';

import { Season } from '../models/schemas.js';
import { DataService } from './dataService.js';

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

}
