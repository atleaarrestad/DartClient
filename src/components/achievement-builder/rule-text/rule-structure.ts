import type {
	AchievementProgressionTargetDraft,
	AchievementRuleDraft,
} from '../../../models/achievementBuilder.js';

/** JSON with sorted keys and without ids or undefined values, for comparing structure. */
const structuralJson = (value: unknown): string => JSON.stringify(value, (key, item: unknown) => {
	if (key === 'id')
		return undefined;
	if (item && typeof item === 'object' && !Array.isArray(item)) {
		return Object.fromEntries(Object.entries(item as Record<string, unknown>)
			.filter(([ , entry ]) => entry !== undefined)
			.sort(([ left ], [ right ]) => left.localeCompare(right)));
	}

	return item;
});

/** Whether two rules (or target lists) are the same apart from their ids. */
export const isSameStructure = (left: unknown, right: unknown): boolean =>
	structuralJson(left) === structuralJson(right);

/**
 * Copies ids from the previous tree onto a freshly parsed one wherever the same kind of rule
 * sits in the same place, so canvas state keyed by id (collapsed nodes, selection) survives
 * an edit in the text.
 */
export const reconcileRuleIds = (
	previous: AchievementRuleDraft | undefined,
	next: AchievementRuleDraft,
): AchievementRuleDraft => {
	if (!previous || previous.type !== next.type)
		return next;

	const id = previous.id;
	switch (next.type) {
	case 'all':
	case 'any': {
		const before = previous as typeof next;

		return { ...next, id, children: next.children.map((child, index) => reconcileRuleIds(before.children[index], child)) };
	}
	case 'not':
		return { ...next, id, child: reconcileRuleIds((previous as typeof next).child, next.child) };
	case 'round':
		return { ...next, id, condition: reconcileRuleIds((previous as typeof next).condition, next.condition) };
	case 'sequence': {
		const before = previous as typeof next;

		const targets = next.targets.map((target, index) => ({ ...target, id: before.targets[index]?.id ?? target.id }));

		return { ...next, id, targets };
	}
	default:
		return { ...next, id };
	}
};

/** Keeps progression target ids by position, for the same reason as reconcileRuleIds. */
export const reconcileTargetIds = (
	previous: readonly AchievementProgressionTargetDraft[],
	next: AchievementProgressionTargetDraft[],
): AchievementProgressionTargetDraft[] =>
	next.map((target, index) => ({ ...target, id: previous[index]?.id ?? target.id }));

/** Advanced conditions in print order, which `raw(N)` in rule text refers to. */
export const collectRawRules = (rule: AchievementRuleDraft): Extract<AchievementRuleDraft, { type: 'raw'; }>[] => {
	switch (rule.type) {
	case 'raw':
		return [ rule ];
	case 'all':
	case 'any':
		return rule.children.flatMap(collectRawRules);
	case 'not':
		return collectRawRules(rule.child);
	case 'round':
		return collectRawRules(rule.condition);
	default:
		return [];
	}
};
