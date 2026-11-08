import type { AchievementTemplateDraft } from '../../models/achievementBuilder.js';

/** An edit of the unlock rule or progression targets, from any of the rule views. */
export const ruleChangeEventName = 'achievement-logic-change';
export type AchievementLogicChangeDetail = Partial<Pick<AchievementTemplateDraft, 'rule' | 'progression'>>;

/** A rule to highlight in every view, e.g. while its line, phrase or text is hovered. */
export const ruleHighlightEventName = 'rule-highlight';
/** A rule picked on the canvas; the text view moves its cursor there. */
export const ruleSelectEventName = 'rule-select';

export interface RuleIdDetail {
	ruleId: string;
}
