import {
	AchievementParameterDraft,
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementValueDraft,
	createEmptyAchievementTemplate,
} from '../models/achievementBuilder.js';
import type {
	AchievementCategoryResponse,
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
} from '../models/achievementBuilderApi.js';

export const fixtureSeasonId = '00000000-0000-0000-0000-000000000001';
export const fixtureCategoryId = '00000000-0000-0000-0000-000000000002';
export const fixtureTemplateId = '00000000-0000-0000-0000-000000000003';

export type AstNode = Record<string, unknown>;

// Draft builders

export const value = (
	source: AchievementValueDraft['source'],
	contents = '',
): AchievementValueDraft => ({ source, value: contents });

export const constant = (contents: number | string): AchievementValueDraft =>
	value('constant', String(contents));

export const parameter = (
	key: string,
	overrides: Partial<AchievementParameterDraft> = {},
): AchievementParameterDraft => ({
	id:            key,
	key,
	valueType:     'integer',
	generatorType: 'range',
	minimum:       1,
	maximum:       3,
	step:          1,
	values:        [],
	...overrides,
});

export const roundRule = (
	condition: AchievementRuleDraft,
	overrides: Partial<Extract<AchievementRuleDraft, { type: 'round'; }>> = {},
): AchievementRuleDraft => ({
	id:         'round',
	type:       'round',
	quantifier: 'any',
	statuses:   [ 'valid', 'victory' ],
	condition,
	...overrides,
});

export const templateDraft = (
	rule: AchievementRuleDraft,
	overrides: Partial<AchievementTemplateDraft> = {},
): AchievementTemplateDraft => ({
	...createEmptyAchievementTemplate(fixtureSeasonId),
	nameTemplate:        'Test {n}',
	descriptionTemplate: 'Test description {n}',
	categoryId:          fixtureCategoryId,
	rule,
	...overrides,
});

/** Every rule in a draft tree, depth first. */
export const collectRules = (rule: AchievementRuleDraft): AchievementRuleDraft[] => {
	switch (rule.type) {
	case 'all':
	case 'any':
		return [ rule, ...rule.children.flatMap(collectRules) ];
	case 'not':
		return [ rule, ...collectRules(rule.child) ];
	case 'round':
		return [ rule, ...collectRules(rule.condition) ];
	default:
		return [ rule ];
	}
};

// API builders

export const category = (
	id: string,
	name: string,
	overrides: Partial<AchievementCategoryResponse> = {},
): AchievementCategoryResponse => ({
	id,
	seasonId:   fixtureSeasonId,
	name,
	sortOrder:  0,
	isArchived: false,
	usageCount: 0,
	...overrides,
});

export const templateVersion = (
	versionNumber: number,
	overrides: Partial<AchievementTemplateVersionResponse> = {},
): AchievementTemplateVersionResponse => {
	const day = String(versionNumber).padStart(2, '0');
	const status = overrides.status ?? 'Published';

	return {
		id:                  `00000000-0000-0000-0000-0000000000${ day }`,
		versionNumber,
		status,
		evaluationPhase:     'Live',
		nameTemplate:        `Version ${ versionNumber }`,
		descriptionTemplate: `Version ${ versionNumber } description`,
		categoryId:          fixtureCategoryId,
		categoryName:        'Special',
		categoryIsArchived:  false,
		achievementTier:     1,
		parameters:          [],
		definition:          {
			editor: { rule: { id: `rule-${ versionNumber }`, type: 'all', children: [] } },
		},
		createdAtUtc:        `2026-08-${ day }T00:00:00Z`,
		publishedAtUtc:      status === 'Published' ? `2026-08-${ day }T00:00:00Z` : null,
		...overrides,
	};
};

export const template = (
	...versions: AchievementTemplateVersionResponse[]
): AchievementTemplateResponse => ({
	id:           fixtureTemplateId,
	seasonId:     fixtureSeasonId,
	createdAtUtc: '2026-08-01T00:00:00Z',
	versions,
});

/** A published template with one version whose stored definition is `{ version: 1, root }`. */
export const storedTemplate = (
	root: AstNode,
	overrides: Partial<AchievementTemplateVersionResponse> = {},
): AchievementTemplateResponse => template(templateVersion(1, {
	definition: { version: 1, root },
	...overrides,
}));

// AST builders, in the shapes the backend stores

export const astField = (path: string): AstNode => ({ kind: 'field', path });
export const astInteger = (contents: number): AstNode =>
	({ kind: 'constant', valueType: 'integer', value: contents });
export const astThrowType = (contents: string): AstNode =>
	({ kind: 'constant', valueType: 'throwType', value: contents });
export const astParameter = (name: string): AstNode => ({ kind: 'parameter', name });
export const astEqual = (left: AstNode, right: AstNode): AstNode => ({ kind: 'equal', left, right });
export const astAnd = (...operands: AstNode[]): AstNode => ({ kind: 'and', operands });
export const astOr = (...operands: AstNode[]): AstNode => ({ kind: 'or', operands });
export const astRoundStatus = (...statuses: string[]): AstNode => {
	const conditions = statuses.map(status =>
		astEqual(astField('round.status'), { kind: 'status', value: status }));

	return conditions.length === 1 ? conditions[0]! : astOr(...conditions);
};
export const astThrowTypeIs = (throwType: string): AstNode =>
	astEqual(astField('throw.throwType'), astThrowType(throwType));
export const astHitLocationIs = (hitLocation: AstNode): AstNode =>
	astEqual(astField('throw.hitLocation'), hitLocation);
export const astAnyScoringType = (): AstNode =>
	astOr(...[ 'Single', 'Double', 'Triple' ].map(astThrowTypeIs));
/** `any` round with one of the statuses that also meets every condition. */
export const astAnyRound = (statuses: string[], ...conditions: AstNode[]): AstNode => ({
	kind:       'any',
	collection: astField('rounds'),
	predicate:  astAnd(astRoundStatus(...statuses), ...conditions),
});

/** Every AST node under `root` (itself included) that matches the predicate. */
export const collectAstNodes = (
	root: unknown,
	predicate: (node: AstNode) => boolean = () => true,
): AstNode[] => {
	const found: AstNode[] = [];
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			value.forEach(visit);

			return;
		}
		if (!value || typeof value !== 'object')
			return;

		const node = value as AstNode;
		if (typeof node['kind'] === 'string' && predicate(node))
			found.push(node);
		Object.values(node).forEach(visit);
	};
	visit(root);

	return found;
};

/** The AST nodes of one kind under `root`. */
export const astNodesOfKind = (root: unknown, kind: string): AstNode[] =>
	collectAstNodes(root, node => node['kind'] === kind);
