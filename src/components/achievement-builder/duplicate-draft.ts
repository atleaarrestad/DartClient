import {
	AchievementTemplateDraft,
	createAchievementBuilderId,
} from '../../models/achievementBuilder.js';
import type { AchievementCategoryResponse } from '../../models/achievementBuilderApi.js';
import { getDefaultCategoryId } from './achievement-draft.js';
import { cloneRule } from './sentence-canvas/rule-edits.js';

/**
 * A new, unsaved achievement with everything the original has: text, tier, type, category,
 * parameters and logic. Every id is new, so the copy is saved as its own template. An archived
 * category can't hold a new achievement, so the copy then moves to the default category.
 */
export const duplicateDraft = (
	draft: AchievementTemplateDraft,
	categories: readonly AchievementCategoryResponse[],
): AchievementTemplateDraft => {
	const copy = structuredClone(draft);
	const category = categories.find(item => item.id === draft.categoryId);

	return {
		...copy,
		id:           undefined,
		nameTemplate: `${ draft.nameTemplate.trim() || 'Untitled achievement' } (copy)`,
		categoryId:   category && !category.isArchived ? category.id : getDefaultCategoryId([ ...categories ]),
		parameters:   copy.parameters.map(parameter => ({ ...parameter, id: createAchievementBuilderId() })),
		rule:         cloneRule(draft.rule),
		progression:  copy.progression && {
			...copy.progression,
			targets: copy.progression.targets.map(target => ({ ...target, id: createAchievementBuilderId() })),
		},
	};
};
