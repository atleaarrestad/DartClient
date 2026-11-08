import type { AchievementRuleDraft } from '../../../models/achievementBuilder.js';
import type { BuilderScope } from '../achievement-draft.js';

/** A condition shown as one sentence line. */
export type LeafRule = Extract<
	AchievementRuleDraft,
	{ type: 'throw' | 'throwCount' | 'winningThrow' | 'compare' | 'sequence' | 'raw'; }
>;

/** A rule shown as its own node: a group or a round. */
export type NodeRule = Extract<AchievementRuleDraft, { type: 'all' | 'any' | 'round'; }>;

interface RuleGraphLineBase {
	/** The outermost rule of the line (a Not when negated); unique, so also the line's key. */
	outerId:     string;
	/** Not rules wrapped around the line, outermost first. */
	negationIds: string[];
}

export interface RuleGraphLeafLine extends RuleGraphLineBase {
	kind:  'leaf';
	rule:  LeafRule;
	scope: BuilderScope;
}

export interface RuleGraphBranchLine extends RuleGraphLineBase {
	kind:   'branch';
	rule:   NodeRule;
	nodeId: string;
}

export type RuleGraphLine = RuleGraphLeafLine | RuleGraphBranchLine;

export interface RuleGraphNode {
	/** The node's rule id, or `virtualRootId` when the root isn't a group. */
	id:              string;
	/** Undefined for the virtual root. */
	rule?:           NodeRule;
	kind:            'all' | 'any' | 'round';
	/** The word between lines: "and" for All, "or" for Any. */
	joiner:          'and' | 'or';
	negationIds:     string[];
	/** Where the node's lines are checked. */
	scope:           BuilderScope;
	depth:           number;
	lines:           RuleGraphLine[];
	/** The group whose children are this node's lines; lines can only be moved inside one. */
	childGroupId?:   string;
	/** Where new conditions are appended; undefined for the virtual root. */
	appendTargetId?: string;
	/** The line in the parent node that branches to this node. */
	parentLineId?:   string;
}

export interface RuleGraph {
	nodes:  RuleGraphNode[];
	rootId: string;
}

export const virtualRootId = 'virtual-root';

const isNodeRule = (rule: AchievementRuleDraft): rule is NodeRule =>
	rule.type === 'all' || rule.type === 'any' || rule.type === 'round';

/**
 * Strips Not rules off a rule. A group with a single child directly under a Not is only there
 * to hold that child, so it is unwrapped too: `not all { x }` reads as `not x`.
 */
export const unwrapNegations = (rule: AchievementRuleDraft): {
	rule:        AchievementRuleDraft;
	negationIds: string[];
} => {
	const negationIds: string[] = [];
	let current = rule;
	for (;;) {
		if (current.type === 'not') {
			negationIds.push(current.id);
			current = current.child;
			continue;
		}
		if (negationIds.length > 0 && (current.type === 'all' || current.type === 'any') && current.children.length === 1) {
			current = current.children[0]!;
			continue;
		}

		return { rule: current, negationIds };
	}
};

/**
 * Lays a rule tree out as sentence nodes: groups and rounds become nodes, their simple
 * conditions become lines, and child groups become branch lines that point to their own node.
 */
export const buildRuleGraph = (root: AchievementRuleDraft): RuleGraph => {
	const nodes: RuleGraphNode[] = [];

	const toLine = (
		child: AchievementRuleDraft,
		scope: BuilderScope,
		depth: number,
	): RuleGraphLine => {
		const { rule, negationIds } = unwrapNegations(child);
		if (isNodeRule(rule)) {
			const node = addNode(rule, negationIds, scope, depth + 1, child.id);

			return { kind: 'branch', rule, nodeId: node.id, outerId: child.id, negationIds };
		}

		return { kind: 'leaf', rule: rule as LeafRule, scope, outerId: child.id, negationIds };
	};

	const addNode = (
		rule: NodeRule,
		negationIds: string[],
		scope: BuilderScope,
		depth: number,
		parentLineId?: string,
	): RuleGraphNode => {
		const condition = rule.type === 'round' ? rule.condition : rule;
		const conditionIsGroup = condition.type === 'all' || condition.type === 'any';
		const node: RuleGraphNode = {
			id:             rule.id,
			rule,
			kind:           rule.type,
			joiner:         condition.type === 'any' ? 'or' : 'and',
			negationIds,
			scope:          rule.type === 'round' ? 'round' : scope,
			depth,
			lines:          [],
			childGroupId:   conditionIsGroup ? condition.id : undefined,
			appendTargetId: conditionIsGroup ? condition.id : rule.id,
			parentLineId,
		};
		nodes.push(node);

		const children = conditionIsGroup ? condition.children : [ condition ];
		node.lines = children.map(child => toLine(child, node.scope, depth));

		return node;
	};

	const { rule, negationIds } = unwrapNegations(root);
	if (isNodeRule(rule) && negationIds.length === 0) {
		addNode(rule, [], 'root', 0);

		return { nodes, rootId: rule.id };
	}

	// A root that isn't a plain group shows inside a virtual "all of these" node.
	const virtualRoot: RuleGraphNode = {
		id:          virtualRootId,
		kind:        'all',
		joiner:      'and',
		negationIds: [],
		scope:       'root',
		depth:       0,
		lines:       [],
	};
	nodes.push(virtualRoot);
	virtualRoot.lines = [ toLine(root, 'root', 0) ];

	return { nodes, rootId: virtualRootId };
};
