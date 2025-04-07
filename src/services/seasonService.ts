import { injectable, container } from "tsyringe";
import { Season } from "../models/schemas.js";
import { DataService } from "./dataService.js";

@injectable()
export class SeasonService {
	private season?: Season;
	private seasonPromise?: Promise<Season>;
	private dataService: DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	public async getSeason(forceGetFromDatabase: boolean): Promise<Season> {
		if (!forceGetFromDatabase && this.season) {
			return this.season;
		}

		if (!forceGetFromDatabase && this.seasonPromise) {
			return this.seasonPromise;
		}

		this.seasonPromise = this.dataService.GetCurrentSeason()
			.then((season) => {
				this.season = season;
				return season;
			})
			.finally(() => {
				this.seasonPromise = undefined;
			});

		return this.seasonPromise;
	}
}
