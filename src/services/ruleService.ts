import { injectable, container } from "tsyringe";
import { RuleDefinitionsResponse, Season } from "../models/schemas.js";
import { DataService } from "./dataService.js";

@injectable()
export class RuleService {
	private dataService: DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	public GetDefinitions(): Promise<RuleDefinitionsResponse>{
		return this.dataService.GetRuleDefinitions();
	}
}
