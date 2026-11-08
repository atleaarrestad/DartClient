import { container, injectable } from 'tsyringe';

import type { RuleDefinitionsResponse } from '../models/schemas.js';
import { DataService } from './dataService.js';

@injectable()
export class RuleService {

	private dataService: DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	GetDefinitions(): Promise<RuleDefinitionsResponse> {
		return this.dataService.GetRuleDefinitions();
	}

}
