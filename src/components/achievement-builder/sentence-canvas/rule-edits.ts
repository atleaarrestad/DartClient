import {
	AchievementRuleDraft,
	createAchievementBuilderId,
	EditableAchievementRuleType,
} from '../../../models/achievementBuilder.js';
import {
	appendChildRule,
	BuilderScope,
	createRule,
	findRule,
	replaceRule,
	updateRule,
} from '../achievement-draft.js';
import type { RuleGraphNode } from './rule-graph.js';

/** What a negation toggle needs to know about a line or node. */
export interface Negatable {
	/** The outermost rule (the first Not when negated). */
	outerId:     string;
	/** The rule inside the Nots. */
	inner:       AchievementRuleDraft;
	negationIds: string[];
}

/** Removes every Not around the target, or wraps it in one. */
export const toggleNegation = (root: AchievementRuleDraft, target: Negatable): AchievementRuleDraft => {
	if (target.negationIds.length > 0)
		return replaceRule(root, target.negationIds[0]!, target.inner);

	const current = findRule(root, target.outerId);

	return current
		? replaceRule(root, target.outerId, { id: createAchievementBuilderId(), type: 'not', child: current })
		: root;
};

/** Removes a rule (with any Nots around it) from the tree. */
export const removeRule = (root: AchievementRuleDraft, outerId: string): AchievementRuleDraft =>
	replaceRule(root, outerId);

const withChildren = (
	root: AchievementRuleDraft,
	groupId: string,
	update: (children: AchievementRuleDraft[]) => AchievementRuleDraft[] | undefined,
): AchievementRuleDraft => {
	const group = findRule(root, groupId);
	if (!group || (group.type !== 'all' && group.type !== 'any'))
		return root;

	const children = update([ ...group.children ]);

	return children ? updateRule(root, groupId, { children }) : root;
};

/** Moves a child of a group up (-1) or down (+1). */
export const moveChild = (
	root: AchievementRuleDraft,
	groupId: string,
	childId: string,
	delta: -1 | 1,
): AchievementRuleDraft => withChildren(root, groupId, children => {
	const index = children.findIndex(child => child.id === childId);
	const target = index + delta;
	if (index < 0 || target < 0 || target >= children.length)
		return undefined;

	[ children[index], children[target] ] = [ children[target]!, children[index]! ];

	return children;
});

/** A deep copy with fresh ids, so the copy can be edited on its own. */
export const cloneRule = (rule: AchievementRuleDraft): AchievementRuleDraft => {
	const id = createAchievementBuilderId();
	switch (rule.type) {
	case 'all':
	case 'any':
		return { ...rule, id, children: rule.children.map(cloneRule) };
	case 'not':
		return { ...rule, id, child: cloneRule(rule.child) };
	case 'round':
		return { ...rule, id, condition: cloneRule(rule.condition) };
	case 'sequence':
		return { ...rule, id, targets: rule.targets.map(target => ({ ...target, id: createAchievementBuilderId() })) };
	default:
		return structuredClone({ ...rule, id });
	}
};

/** Inserts a copy of a group's child right after it. */
export const duplicateChild = (
	root: AchievementRuleDraft,
	groupId: string,
	childId: string,
): AchievementRuleDraft => withChildren(root, groupId, children => {
	const index = children.findIndex(child => child.id === childId);
	if (index < 0)
		return undefined;

	children.splice(index + 1, 0, cloneRule(children[index]!));

	return children;
});

/**
 * Adds a new condition to a node. A virtual root (a root that isn't a group) is wrapped in an
 * All group first, so it has somewhere to put the new condition.
 */
export const addCondition = (
	root: AchievementRuleDraft,
	node: RuleGraphNode,
	type: EditableAchievementRuleType,
): { rule: AchievementRuleDraft; addedId: string; } => {
	const child = createRule(type, node.scope);
	const rule = node.appendTargetId
		? appendChildRule(root, node.appendTargetId, child)
		: { id: createAchievementBuilderId(), type: 'all' as const, children: [ root, child ] };

	return { rule, addedId: child.id };
};

/** Switches a group between All and Any. */
export const setGroupType = (
	root: AchievementRuleDraft,
	groupId: string,
	type: 'all' | 'any',
): AchievementRuleDraft => updateRule(root, groupId, { type });

/** The block types a node offers in its "+ Add" menu; Not is a toggle, not a block. */
export const getAddableTypes = (scope: BuilderScope): EditableAchievementRuleType[] =>
	scope === 'round'
		? [ 'throw', 'throwCount', 'sequence', 'compare', 'all', 'any' ]
		: [ 'round', 'winningThrow', 'compare', 'all', 'any' ];
