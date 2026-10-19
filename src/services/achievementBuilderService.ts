import { container, injectable } from 'tsyringe';

import type {
	CreateAchievementCategoryRequest,
	PredictAchievementThrowsRequest,
	ReorderAchievementCategoriesRequest,
	UpdateAchievementCategoryRequest,
	UpsertAchievementTemplateRequest,
} from '../models/achievementBuilderApi.js';
import { DataService } from './dataService.js';

@injectable()
export class AchievementBuilderService {
	private dataService = container.resolve(DataService);

	getCatalog() {
		return this.dataService.getAchievementBuilderCatalog();
	}

	getTemplates(seasonId: string, adminKey?: string) {
		return this.dataService.getAchievementBuilderTemplates(seasonId, adminKey);
	}

	getCategories(seasonId: string) {
		return this.dataService.getAchievementCategories(seasonId);
	}

	createCategory(request: CreateAchievementCategoryRequest, adminKey: string) {
		return this.dataService.createAchievementCategory(request, adminKey);
	}

	updateCategory(
		categoryId: string,
		request: UpdateAchievementCategoryRequest,
		adminKey: string,
	) {
		return this.dataService.updateAchievementCategory(
			categoryId,
			request,
			adminKey,
		);
	}

	reorderCategories(
		request: ReorderAchievementCategoriesRequest,
		adminKey: string,
	) {
		return this.dataService.reorderAchievementCategories(request, adminKey);
	}

	archiveCategory(categoryId: string, adminKey: string) {
		return this.dataService.archiveAchievementCategory(categoryId, adminKey);
	}

	restoreCategory(categoryId: string, adminKey: string) {
		return this.dataService.restoreAchievementCategory(categoryId, adminKey);
	}

	deleteCategory(categoryId: string, adminKey: string) {
		return this.dataService.deleteAchievementCategory(categoryId, adminKey);
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
