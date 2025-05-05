import { injectable, container } from "tsyringe";
import { Season } from "../models/schemas.js";
import { DataService } from "./dataService.js";

@injectable()
export class SeasonService {
	private currentlyActiveSeason?: Season;
	private currentlyActiveSeasonPromise?: Promise<Season>;
	private seasons: Season[] = [];
	private seasonsPromise?: Promise<Season[]>;
	private dataService: DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	public async getCurrentSeason(forceGetFromDatabase: boolean = false): Promise<Season> {
		if (!forceGetFromDatabase && this.currentlyActiveSeason) {
			return this.currentlyActiveSeason;
		}

		if (!forceGetFromDatabase && this.currentlyActiveSeasonPromise) {
			return this.currentlyActiveSeasonPromise;
		}

		this.currentlyActiveSeasonPromise = this.dataService.GetCurrentSeason()
			.then((season) => {
				this.currentlyActiveSeason = season;
				return season;
			})
			.finally(() => {
				this.currentlyActiveSeasonPromise = undefined;
			});

		return this.currentlyActiveSeasonPromise;
	}

	public async getAll(forceGetFromDatabase: boolean = false): Promise<Season[]> {
		if (!forceGetFromDatabase && this.seasons.length > 0) {
			return this.seasons;
		}

		if (!forceGetFromDatabase && this.seasonsPromise) {
			return this.seasonsPromise;
		}

		this.seasonsPromise = this.dataService.GetAllSeasons()
			.then((seasons) => {
				this.seasons = seasons;
				return seasons;
			})
			.finally(() => {
				this.seasonsPromise = undefined;
			});

		return this.seasonsPromise;
	}
}
