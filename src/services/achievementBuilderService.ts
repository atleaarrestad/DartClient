import { container, injectable } from 'tsyringe';

import type {
	PredictAchievementThrowsRequest,
	UpsertAchievementTemplateRequest,
} from '../models/achievementBuilderApi.js';
import { DataService } from './dataService.js';

@injectable()
export class AchievementBuilderService {
	private dataService = container.resolve(DataService);

	getCatalog() {
		return this.dataService.getAchievementBuilderCatalog();
	}

	getTemplates(seasonId: string) {
		return this.dataService.getAchievementBuilderTemplates(seasonId);
	}

	getInstances(seasonId: string) {
		return this.dataService.getAchievementBuilderInstances(seasonId);
	}

	createTemplate(request: UpsertAchievementTemplateRequest, adminKey: string) {
		return this.dataService.createAchievementBuilderTemplate(request, adminKey);
	}

	updateTemplate(
		templateId: string,
		request: UpsertAchievementTemplateRequest,
		adminKey: string,
	) {
		return this.dataService.updateAchievementBuilderTemplate(
			templateId,
			request,
			adminKey,
		);
	}

	validateTemplate(templateId: string) {
		return this.dataService.validateAchievementBuilderTemplate(templateId);
	}

	publishTemplate(templateId: string, adminKey: string) {
		return this.dataService.publishAchievementBuilderTemplate(templateId, adminKey);
	}

	predictRemainingThrows(request: PredictAchievementThrowsRequest) {
		return this.dataService.predictAchievementThrows(request);
	}
}
