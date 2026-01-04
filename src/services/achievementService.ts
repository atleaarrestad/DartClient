import { injectable, singleton, container } from 'tsyringe';
import { DataService } from "./dataService.js";
import { AchievementDefinitionsResponse } from "../models/schemas.js";


@singleton()
@injectable()
export class achievementService {
	private dataService:  DataService;
	private achievementDefinitionsPromise?: Promise<AchievementDefinitionsResponse>;
	constructor(){
		this.dataService = container.resolve(DataService);
	}

	public getAchievementDefinitions(): Promise<AchievementDefinitionsResponse> {
		if (!this.achievementDefinitionsPromise) {
			this.achievementDefinitionsPromise =
				this.dataService.GetAchievementDefinitions();
		}

		return this.achievementDefinitionsPromise;
	}
}
