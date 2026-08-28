import '../aa-tabs/aa-tabs.js';
import '../../ui/button/aa-button.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import {
	AchievementParameterDraft,
	AchievementProgressionDraft,
	AchievementRuleDraft,
	AchievementTemplateDraft,
	AchievementTemplatePreview,
	AchievementValueDraft,
	AchievementValueSource,
	createAchievementBuilderId,
	createDefaultAchievementRule,
	createEmptyAchievementTemplate,
} from '../../models/achievementBuilder.js';
import { AchievementTier } from '../../models/enums.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import type { AaTabItem } from '../aa-tabs/aa-tabs.js';
import achievementBuilderStyles from './achievement-builder.css?inline';

export const achievementBuilderSaveEventName = 'achievement-builder-save';

export type AchievementBuilderSaveEvent = CustomEvent<AchievementTemplateDraft>;

const tabs: AaTabItem[] = [
	{ id: 'details', label: 'Details' },
	{ id: 'parameters', label: 'Parameters' },
	{ id: 'logic', label: 'Logic blocks' },
	{ id: 'preview', label: 'Preview' },
];

const ruleTypes: { value: AchievementRuleDraft['type']; label: string; }[] = [
	{ value: 'all', label: 'All conditions' },
	{ value: 'any', label: 'Any condition' },
	{ value: 'not', label: 'Not' },
	{ value: 'round', label: 'Round matches' },
	{ value: 'throw', label: 'Throw matches' },
	{ value: 'compare', label: 'Compare values' },
	{ value: 'sequence', label: 'Ordered sequence' },
];

const valueSources: { value: AchievementValueSource; label: string; }[] = [
	{ value: 'constant', label: 'Constant' },
	{ value: 'parameter', label: 'Parameter' },
	{ value: 'board.leftNeighbor', label: 'Left dartboard neighbor of parameter' },
	{ value: 'board.rightNeighbor', label: 'Right dartboard neighbor of parameter' },
	{ value: 'round.throwCount', label: 'Round throw count' },
	{ value: 'round.finalPoints', label: 'Round final-points sum' },
	{ value: 'round.rawPointsDistinctCount', label: 'Distinct raw-point values' },
	{ value: 'round.minimumRawPoints', label: 'Minimum raw points' },
	{ value: 'round.singleCount', label: 'Singles in round' },
	{ value: 'round.doubleCount', label: 'Doubles in round' },
	{ value: 'round.tripleCount', label: 'Triples in round' },
	{ value: 'game.roundsPlayed', label: 'Rounds played' },
	{ value: 'game.placement', label: 'Final placement' },
	{ value: 'game.overshootCount', label: 'Overshoot rounds' },
	{ value: 'game.rimCount', label: 'Rim hits' },
	{ value: 'game.missCount', label: 'Misses' },
];

type BuilderScope = 'root' | 'round';
type ValueEditorRole = 'comparison-left' | 'comparison-right' | 'hit-location';

@customElement('aa-achievement-builder')
export class AaAchievementBuilder extends LitElement {

	@property({ type: String }) seasonId = '';
	@property({ attribute: false }) initialDraft?: AchievementTemplateDraft;
	@property({ type: Number }) maximumGeneratedInstances = 500;

	@state() private selectedTab = 'details';
	@state() private draft: AchievementTemplateDraft = createEmptyAchievementTemplate('');
	@state() private errors: string[] = [];

	override firstUpdated(): void {
		this.resetDraft();
	}

	private resetDraft(): void {
		this.draft = structuredClone(
			this.initialDraft ?? createEmptyAchievementTemplate(this.seasonId),
		);
		this.selectedTab = 'details';
		this.errors = [];
	}

	public loadDraft(draft?: AchievementTemplateDraft): void {
		this.initialDraft = draft;
		this.resetDraft();
	}

	private updateDraft(patch: Partial<AchievementTemplateDraft>): void {
		this.draft = { ...this.draft, ...patch };
		this.errors = [];
	}

	private handleTabChange(event: CustomEvent<{ id: string; }>): void {
		this.selectedTab = event.detail.id;
	}

	private validate(): string[] {
		const errors: string[] = [];
		if (!this.draft.nameTemplate.trim())
			errors.push('Name is required.');
		if (!this.draft.descriptionTemplate.trim())
			errors.push('Description is required.');
		if (!this.draft.category.trim())
			errors.push('Category is required.');
		if (!Object.values(AchievementTier).includes(this.draft.tier))
			errors.push('Choose a valid achievement tier.');

		const keys = this.draft.parameters.map(parameter => parameter.key.trim());
		if (keys.some(key => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)))
			errors.push('Parameter keys must start with a letter and contain only letters, numbers, and _.');
		if (new Set(keys).size !== keys.length)
			errors.push('Parameter keys must be unique.');

		for (const parameter of this.draft.parameters) {
			if (parameter.generatorType === 'range') {
				if (
					parameter.minimum === undefined
					|| parameter.maximum === undefined
					|| parameter.step === undefined
				)
					errors.push(`Parameter ${ parameter.key || '(unnamed)' } needs a complete range.`);
				else if (parameter.minimum > parameter.maximum || parameter.step <= 0)
					errors.push(`Parameter ${ parameter.key || '(unnamed)' } has an invalid range.`);
			}
			else if (parameter.values.length === 0) {
				errors.push(`Parameter ${ parameter.key || '(unnamed)' } needs at least one value.`);
			}
		}

		if (this.getGeneratedCount() > this.maximumGeneratedInstances) {
			errors.push(
				`This template generates more than ${ this.maximumGeneratedInstances } achievements.`,
			);
		}

		if (this.draft.achievementScope === 'progression') {
			if (!this.draft.progression || this.draft.progression.targets.length === 0)
				errors.push('Progression achievements need at least one target segment.');
		}
		else {
			errors.push(...this.getRuleErrors(this.draft.rule, 'Logic', 'root'));
		}

		return errors;
	}

	private getRuleErrors(
		rule: AchievementRuleDraft,
		path: string,
		scope: BuilderScope,
	): string[] {
		const errors: string[] = [];
		const validateValue = (
			value: AchievementValueDraft,
			valuePath: string,
			role: ValueEditorRole,
		): void => {
			if (!this.getAvailableValueSources(scope, role).includes(value.source))
				errors.push(`${ valuePath } is not available in this block scope.`);
			if (
				value.source === 'parameter'
				|| value.source === 'board.leftNeighbor'
				|| value.source === 'board.rightNeighbor'
			) {
				const parameter = this.draft.parameters.find(item => item.key === value.value);
				if (!parameter)
					errors.push(`${ valuePath } references a missing parameter.`);
				else if (
					value.source !== 'parameter'
					&& parameter.valueType !== 'integer'
				)
					errors.push(`${ valuePath } needs an integer parameter.`);
			}
			else if (value.source === 'constant' && !Number.isFinite(Number(value.value))) {
				errors.push(`${ valuePath } needs a numeric constant.`);
			}
		};

		switch (rule.type) {
		case 'all':
		case 'any':
			if (rule.children.length === 0)
				errors.push(`${ path } needs at least one child block.`);
			rule.children.forEach((child, index) =>
				errors.push(...this.getRuleErrors(child, `${ path } ${ index + 1 }`, scope)));
			break;
		case 'not':
			errors.push(...this.getRuleErrors(rule.child, `${ path } not`, scope));
			break;
		case 'round':
			if (rule.statuses.length === 0)
				errors.push(`${ path } must include at least one round status.`);
			errors.push(...this.getRuleErrors(rule.condition, `${ path } round condition`, 'round'));
			break;
		case 'throw':
			validateValue(rule.hitLocation, `${ path } hit location`, 'hit-location');
			break;
		case 'compare':
			validateValue(rule.left, `${ path } left value`, 'comparison-left');
			validateValue(rule.right, `${ path } right value`, 'comparison-right');
			break;
		case 'sequence':
			if (rule.targets.length !== 3)
				errors.push(`${ path } needs exactly three sequence targets.`);
			rule.targets.forEach((target, index) =>
				validateValue(
					target.hitLocation,
					`${ path } target ${ index + 1 }`,
					'hit-location',
				));
			break;
		}

		return errors;
	}

	public submit(): boolean {
		const errors = this.validate();
		this.errors = errors;
		if (errors.length > 0) {
			this.selectedTab = errors.some(error => error.includes('Parameter'))
				? 'parameters'
				: errors.some(error => error.includes('logic') || error.includes('placement'))
					? 'logic'
					: 'details';
			return false;
		}

		this.dispatchEvent(new CustomEvent<AchievementTemplateDraft>(
			achievementBuilderSaveEventName,
			{
				detail: structuredClone(this.draft),
				bubbles: true,
				composed: true,
			},
		));
		return true;
	}

	private addParameter(): void {
		const parameter: AchievementParameterDraft = {
			id: createAchievementBuilderId(),
			key: `parameter${ this.draft.parameters.length + 1 }`,
			valueType: 'integer',
			generatorType: 'range',
			minimum: 1,
			maximum: 20,
			step: 1,
			values: [],
		};
		this.updateDraft({ parameters: [ ...this.draft.parameters, parameter ] });
	}

	private updateParameter(id: string, patch: Partial<AchievementParameterDraft>): void {
		this.updateDraft({
			parameters: this.draft.parameters.map(parameter =>
				parameter.id === id ? { ...parameter, ...patch } : parameter),
		});
	}

	private removeParameter(id: string): void {
		this.updateDraft({
			parameters: this.draft.parameters.filter(parameter => parameter.id !== id),
		});
	}

	private createRule(
		type: AchievementRuleDraft['type'],
		scope: BuilderScope = 'root',
	): AchievementRuleDraft {
		const id = createAchievementBuilderId();
		const constant = (): AchievementValueDraft => ({ source: 'constant', value: '0' });

		switch (type) {
		case 'all':
		case 'any':
			return { id, type, children: [] };
		case 'not':
			return { id, type, child: { id: createAchievementBuilderId(), type: 'all', children: [] } };
		case 'round':
			return {
				id,
				type,
				quantifier: 'any',
				statuses: [ 'valid', 'victory' ],
				condition: { id: createAchievementBuilderId(), type: 'all', children: [] },
			};
		case 'throw':
			return {
				id,
				type,
				quantifier: 'any',
				scope: 'currentRound',
				hitLocation: constant(),
				throwType: 'any',
			};
		case 'compare':
			return {
				id,
				type,
				left: {
					source: scope === 'round' ? 'round.throwCount' : 'game.roundsPlayed',
					value: '',
				},
				operator: 'equal',
				right: constant(),
			};
		case 'sequence':
			return {
				id,
				type,
				scope: 'sameRound',
				targets: [],
			};
		}
	}

	private loadPreset(
		preset: 'shanghai' | 'rangeKing' | 'perfectlyBalanced' | 'classic',
	): void {
		const id = createAchievementBuilderId;
		const constant = (value: number): AchievementValueDraft => ({
			source: 'constant',
			value: String(value),
		});
		const parameter = (key: string): AchievementValueDraft => ({
			source: 'parameter',
			value: key,
		});
		const compare = (
			source: AchievementValueSource,
			operator: 'equal' | 'greaterThan' | 'greaterThanOrEqual',
			right: AchievementValueDraft,
		): AchievementRuleDraft => ({
			id: id(),
			type: 'compare',
			left: { source, value: '' },
			operator,
			right,
		});
		const round = (children: AchievementRuleDraft[], statuses: ('valid' | 'victory')[]) => ({
			id: id(),
			type: 'round' as const,
			quantifier: 'any' as const,
			statuses,
			condition: {
				id: id(),
				type: 'all' as const,
				children,
			},
		});

		if (preset === 'shanghai') {
			const hit = (
				throwType: 'single' | 'double' | 'triple',
			): AchievementRuleDraft => ({
				id: id(),
				type: 'throw',
				quantifier: 'any',
				scope: 'currentRound',
				hitLocation: parameter('n'),
				throwType,
			});
			this.draft = {
				...createEmptyAchievementTemplate(this.seasonId),
				nameTemplate: 'Shanghai {n}',
				descriptionTemplate: 'Hit {n}, D{n} and T{n} in the same round.',
				category: 'Shanghai',
				tier: AchievementTier.platinum,
				parameters: [ {
					id: id(),
					key: 'n',
					valueType: 'integer',
					generatorType: 'range',
					minimum: 1,
					maximum: 20,
					step: 1,
					values: [],
				} ],
				rule: round([ hit('single'), hit('double'), hit('triple') ], [ 'valid', 'victory' ]),
			};
		}
		else if (preset === 'rangeKing') {
			this.draft = {
				...createEmptyAchievementTemplate(this.seasonId),
				nameTemplate: 'Range King {threshold}',
				descriptionTemplate: 'Score at least {threshold} points in the winning round.',
				category: 'Victory',
				tier: AchievementTier.bronze,
				parameters: [ {
					id: id(),
					key: 'threshold',
					valueType: 'integer',
					generatorType: 'range',
					minimum: 50,
					maximum: 180,
					step: 10,
					values: [],
				} ],
				rule: round(
					[ compare('round.finalPoints', 'greaterThanOrEqual', parameter('threshold')) ],
					[ 'victory' ],
				),
			};
		}
		else if (preset === 'perfectlyBalanced') {
			this.draft = {
				...createEmptyAchievementTemplate(this.seasonId),
				nameTemplate: 'Perfectly Balanced',
				descriptionTemplate:
					'Score the same raw points with one single, one double, and one triple in the same round.',
				category: 'Special',
				tier: AchievementTier.gold,
				parameters: [],
				rule: round(
					[
						compare('round.throwCount', 'equal', constant(3)),
						compare('round.singleCount', 'equal', constant(1)),
						compare('round.doubleCount', 'equal', constant(1)),
						compare('round.tripleCount', 'equal', constant(1)),
						compare('round.rawPointsDistinctCount', 'equal', constant(1)),
						compare('round.minimumRawPoints', 'greaterThan', constant(0)),
					],
					[ 'valid', 'victory' ],
				),
			};
		}
		else {
			const hit = (hitLocation: AchievementValueDraft): AchievementRuleDraft => ({
				id: id(),
				type: 'throw',
				quantifier: 'any',
				scope: 'currentRound',
				hitLocation,
				throwType: 'single',
			});
			this.draft = {
				...createEmptyAchievementTemplate(this.seasonId),
				nameTemplate: 'Classic {n}',
				descriptionTemplate: 'Hit {n} and both adjacent dartboard numbers as singles.',
				category: 'Classic',
				tier: AchievementTier.bronze,
				parameters: [ {
					id: id(),
					key: 'n',
					valueType: 'integer',
					generatorType: 'range',
					minimum: 1,
					maximum: 20,
					step: 1,
					values: [],
				} ],
				rule: round(
					[
						hit({ source: 'board.leftNeighbor', value: 'n' }),
						hit(parameter('n')),
						hit({ source: 'board.rightNeighbor', value: 'n' }),
					],
					[ 'valid', 'victory' ],
				),
			};
		}

		this.errors = [];
		this.selectedTab = 'details';
	}

	private addRootRule(type: AchievementRuleDraft['type']): void {
		const root = this.draft.rule.type === 'all' || this.draft.rule.type === 'any'
			? structuredClone(this.draft.rule)
			: { ...createDefaultAchievementRule(), children: [ structuredClone(this.draft.rule) ] };
		root.children.push(this.createRule(type, 'root'));
		this.updateDraft({ rule: root });
	}

	private replaceRule(
		current: AchievementRuleDraft,
		id: string,
		replacement?: AchievementRuleDraft,
	): AchievementRuleDraft {
		if (current.id === id)
			return replacement ?? createDefaultAchievementRule();

		switch (current.type) {
		case 'all':
		case 'any':
			return {
				...current,
				children: replacement
					? current.children.map(child => this.replaceRule(child, id, replacement))
					: current.children
						.filter(child => child.id !== id)
						.map(child => this.replaceRule(child, id)),
			};
		case 'not':
			return { ...current, child: this.replaceRule(current.child, id, replacement) };
		case 'round':
			return { ...current, condition: this.replaceRule(current.condition, id, replacement) };
		default:
			return current;
		}
	}

	private updateRule(id: string, patch: Partial<AchievementRuleDraft>): void {
		const find = (rule: AchievementRuleDraft): AchievementRuleDraft | undefined => {
			if (rule.id === id)
				return rule;
			if (rule.type === 'all' || rule.type === 'any')
				return rule.children.map(find).find(Boolean);
			if (rule.type === 'not')
				return find(rule.child);
			if (rule.type === 'round')
				return find(rule.condition);
			return undefined;
		};
		const current = find(this.draft.rule);
		if (!current)
			return;

		this.updateDraft({
			rule: this.replaceRule(
				this.draft.rule,
				id,
				{ ...current, ...patch } as AchievementRuleDraft,
			),
		});
	}

	private addChildRule(
		parentId: string,
		type: AchievementRuleDraft['type'],
		scope: BuilderScope,
	): void {
		const find = (rule: AchievementRuleDraft): AchievementRuleDraft | undefined => {
			if (rule.id === parentId)
				return rule;
			if (rule.type === 'all' || rule.type === 'any')
				return rule.children.map(find).find(Boolean);
			if (rule.type === 'not')
				return find(rule.child);
			if (rule.type === 'round')
				return find(rule.condition);
			return undefined;
		};
		const parent = find(this.draft.rule);
		if (!parent)
			return;

		if (parent.type === 'all' || parent.type === 'any') {
			this.updateRule(parent.id, {
				children: [ ...parent.children, this.createRule(type, scope) ],
			});
		}
		else if (parent.type === 'round') {
			const condition = parent.condition.type === 'all'
				? parent.condition
				: { ...createDefaultAchievementRule(), children: [ parent.condition ] };
			this.updateRule(parent.id, {
				condition: {
					...condition,
					children: [ ...condition.children, this.createRule(type, 'round') ],
				},
			});
		}
	}

	private removeRule(id: string): void {
		this.updateDraft({ rule: this.replaceRule(this.draft.rule, id) });
	}

	private renderValueEditor(
		value: AchievementValueDraft,
		onChange: (value: AchievementValueDraft) => void,
		scope: BuilderScope,
		role: ValueEditorRole = 'hit-location',
	): TemplateResult {
		const sourceNames = this.getAvailableValueSources(scope, role);
		const availableSources = valueSources.filter(source => sourceNames.includes(source.value));
		return html`
			<div class="value-editor">
				<select
					.value=${ value.source }
					@change=${ (event: Event) => onChange({
						...value,
						source: (event.currentTarget as HTMLSelectElement).value as AchievementValueSource,
					}) }
				>
					${ availableSources.map(source => html`
						<option value=${ source.value }>${ source.label }</option>
					`) }
				</select>
				${ value.source === 'constant'
					? html`
						<input
							type="number"
							.value=${ value.value }
							@input=${ (event: InputEvent) => onChange({
								...value,
								value: (event.currentTarget as HTMLInputElement).value,
							}) }
						/>
					`
					: value.source === 'parameter'
						|| value.source === 'board.leftNeighbor'
						|| value.source === 'board.rightNeighbor'
						? html`
							<select
								.value=${ value.value }
								@change=${ (event: Event) => onChange({
									...value,
									value: (event.currentTarget as HTMLSelectElement).value,
								}) }
							>
								<option value="">Choose parameter</option>
								${ this.draft.parameters.map(parameter => html`
									<option value=${ parameter.key }>${ parameter.key }</option>
								`) }
							</select>
						`
						: nothing }
			</div>
		`;
	}

	private getAvailableValueSources(
		scope: BuilderScope,
		role: ValueEditorRole,
	): AchievementValueSource[] {
		const common: AchievementValueSource[] = [
			'constant',
			'parameter',
			'board.leftNeighbor',
			'board.rightNeighbor',
		];
		if (role === 'hit-location')
			return common;

		const scoped = valueSources
			.map(source => source.value)
			.filter(source => scope === 'round'
				? source.startsWith('round.')
				: source.startsWith('game.'));
		return [
			...common,
			...scoped.filter(source =>
				role === 'comparison-left' || source !== 'round.minimumRawPoints'),
		];
	}

	private updateProgression(patch: Partial<AchievementProgressionDraft>): void {
		const progression = this.draft.progression ?? {
			statuses: [ 'valid', 'victory' ],
			targets: [],
		};
		this.updateDraft({ progression: { ...progression, ...patch } });
	}

	private renderProgressionLogic(): TemplateResult {
		const progression = this.draft.progression ?? {
			statuses: [ 'valid', 'victory' ],
			targets: [],
		};
		return html`
			<section class="builder-panel">
				<div class="panel-intro panel-intro--actions">
					<div>
						<h3>Progression target set</h3>
						<p>
							Collect matching dartboard segments across completed games. This can
							express all current board-coverage progression achievements.
						</p>
					</div>
					<aa-button
						type="button"
						size="small"
						@click=${ () => this.updateProgression({
							targets: [
								...progression.targets,
								{
									id: createAchievementBuilderId(),
									hitLocation: { source: 'constant', value: '1' },
									throwType: 'single',
								},
							],
						}) }
					>
						Add target
					</aa-button>
				</div>
				<div class="sequence-targets">
					${ progression.targets.map((target, index) => html`
						<div class="sequence-target">
							<strong>#${ index + 1 }</strong>
							${ this.renderValueEditor(target.hitLocation, value =>
								this.updateProgression({
									targets: progression.targets.map(item =>
										item.id === target.id
											? { ...item, hitLocation: value }
											: item),
								}), 'root') }
							<select
								.value=${ target.throwType }
								@change=${ (event: Event) => this.updateProgression({
									targets: progression.targets.map(item =>
										item.id === target.id
											? {
												...item,
												throwType: (event.currentTarget as HTMLSelectElement)
													.value as typeof target.throwType,
											}
											: item),
								}) }
							>
								<option value="single">Single</option>
								<option value="double">Double</option>
								<option value="triple">Triple</option>
							</select>
							<button
								type="button"
								class="remove-button"
								aria-label="Remove progression target"
								@click=${ () => this.updateProgression({
									targets: progression.targets.filter(item => item.id !== target.id),
								}) }
							>&times;</button>
						</div>
					`) }
				</div>
				${ progression.targets.length === 0
					? html`
						<div class="empty-panel">
							Add the segments a player must collect across games.
						</div>
					`
					: nothing }
			</section>
		`;
	}

	private renderRule(
		rule: AchievementRuleDraft,
		depth = 0,
		scope: BuilderScope = 'root',
	): TemplateResult {
		const canRemove = depth > 0;
		return html`
			<article class="logic-block logic-block--${ rule.type }">
				<header>
					<strong>${ ruleTypes.find(item => item.value === rule.type)?.label }</strong>
					${ canRemove
						? html`
							<button
								type="button"
								class="remove-button"
								aria-label="Remove logic block"
								@click=${ () => this.removeRule(rule.id) }
							>&times;</button>
						`
						: nothing }
				</header>
				<div class="logic-block__body">
					${ this.renderRuleBody(rule, depth, scope) }
				</div>
			</article>
		`;
	}

	private getRuleTypes(scope: BuilderScope): typeof ruleTypes {
		return ruleTypes.filter(ruleType =>
			scope === 'round'
				? ruleType.value !== 'round'
				: ruleType.value !== 'throw' && ruleType.value !== 'sequence');
	}

	private renderAddBlock(parentId: string, scope: BuilderScope): TemplateResult {
		return html`
			<div class="add-block-row">
				${ this.getRuleTypes(scope).map(ruleType => html`
					<button
						type="button"
						@click=${ () => this.addChildRule(parentId, ruleType.value, scope) }
					>
						+ ${ ruleType.label }
					</button>
				`) }
			</div>
		`;
	}

	private renderRuleBody(
		rule: AchievementRuleDraft,
		depth: number,
		scope: BuilderScope,
	): TemplateResult {
		switch (rule.type) {
		case 'all':
		case 'any':
			return html`
				<label>
					<span>Match mode</span>
					<select
						.value=${ rule.type }
						@change=${ (event: Event) => this.updateRule(rule.id, {
							type: (event.currentTarget as HTMLSelectElement).value as 'all' | 'any',
						}) }
					>
						<option value="all">All child blocks must match</option>
						<option value="any">At least one child block must match</option>
					</select>
				</label>
				<div class="nested-blocks">
					${ rule.children.map(child => this.renderRule(child, depth + 1, scope)) }
					${ this.renderAddBlock(rule.id, scope) }
				</div>
			`;
		case 'not':
			return this.renderRule(rule.child, depth + 1, scope);
		case 'round':
			return html`
				<div class="inline-fields">
					<label>
						<span>Rounds</span>
						<select
							.value=${ rule.quantifier }
							@change=${ (event: Event) => this.updateRule(rule.id, {
								quantifier: (event.currentTarget as HTMLSelectElement).value as 'any' | 'all',
							}) }
						>
							<option value="any">Any round</option>
							<option value="all">Every round</option>
						</select>
					</label>
					<label>
						<span>Allowed status</span>
						<select
							multiple
							@change=${ (event: Event) => this.updateRule(rule.id, {
								statuses: Array.from(
									(event.currentTarget as HTMLSelectElement).selectedOptions,
								).map(option => option.value) as typeof rule.statuses,
							}) }
						>
							${ [ 'valid', 'victory', 'overshoot', 'failedWinCondition' ].map(status => html`
								<option value=${ status } ?selected=${ rule.statuses.includes(status as never) }>
									${ status }
								</option>
							`) }
						</select>
					</label>
				</div>
				<div class="nested-blocks">
					${ this.renderRule(rule.condition, depth + 1, 'round') }
					${ this.renderAddBlock(rule.id, 'round') }
				</div>
			`;
		case 'throw':
			return html`
				<div class="inline-fields">
					<label>
						<span>Throws</span>
						<select
							.value=${ rule.quantifier }
							@change=${ (event: Event) => this.updateRule(rule.id, {
								quantifier: (event.currentTarget as HTMLSelectElement).value as 'any' | 'all',
							}) }
						>
							<option value="any">Any throw</option>
							<option value="all">Every throw</option>
						</select>
					</label>
					<label>
						<span>Scope</span>
						<select .value=${ rule.scope } disabled>
							<option value="currentRound">Current round</option>
						</select>
					</label>
					<label>
						<span>Multiplier/type</span>
						<select
							.value=${ rule.throwType }
							@change=${ (event: Event) => this.updateRule(rule.id, {
								throwType: (event.currentTarget as HTMLSelectElement).value as typeof rule.throwType,
							}) }
						>
							${ [ 'any', 'single', 'double', 'triple', 'rim', 'miss' ].map(type => html`
								<option value=${ type }>${ type }</option>
							`) }
						</select>
					</label>
				</div>
				<label>
					<span>Hit location</span>
					${ this.renderValueEditor(
						rule.hitLocation,
						value => this.updateRule(rule.id, { hitLocation: value }),
						'round',
					) }
				</label>
			`;
		case 'compare':
			return html`
				<div class="comparison-editor">
					${ this.renderValueEditor(
						rule.left,
						value => this.updateRule(rule.id, { left: value }),
						scope,
						'comparison-left',
					) }
					<select
						aria-label="Comparison operator"
						.value=${ rule.operator }
						@change=${ (event: Event) => this.updateRule(rule.id, {
							operator: (event.currentTarget as HTMLSelectElement).value as typeof rule.operator,
						}) }
					>
						<option value="equal">=</option>
						<option value="notEqual">!=</option>
						<option value="greaterThan">&gt;</option>
						<option value="greaterThanOrEqual">&gt;=</option>
						<option value="lessThan">&lt;</option>
						<option value="lessThanOrEqual">&lt;=</option>
					</select>
					${ this.renderValueEditor(
						rule.right,
						value => this.updateRule(rule.id, { right: value }),
						scope,
						'comparison-right',
					) }
				</div>
			`;
		case 'sequence':
			return html`
				<label>
					<span>Sequence scope</span>
					<select
						.value=${ rule.scope }
						disabled
					>
						<option value="sameRound">Same round</option>
					</select>
				</label>
				<div class="sequence-targets">
					${ rule.targets.map((target, index) => html`
						<div class="sequence-target">
							<strong>#${ index + 1 }</strong>
							${ this.renderValueEditor(target.hitLocation, value => this.updateRule(rule.id, {
								targets: rule.targets.map(item =>
									item.id === target.id ? { ...item, hitLocation: value } : item),
							}), 'round') }
							<select
								.value=${ target.throwType }
								@change=${ (event: Event) => this.updateRule(rule.id, {
									targets: rule.targets.map(item =>
										item.id === target.id
											? {
												...item,
												throwType: (event.currentTarget as HTMLSelectElement)
													.value as typeof target.throwType,
											}
											: item),
								}) }
							>
								${ [ 'anyScoring', 'single', 'double', 'triple', 'rim', 'miss' ].map(type => html`
									<option value=${ type }>${ type }</option>
								`) }
							</select>
							<button
								type="button"
								class="remove-button"
								@click=${ () => this.updateRule(rule.id, {
									targets: rule.targets.filter(item => item.id !== target.id),
								}) }
							>&times;</button>
						</div>
					`) }
					<button
						type="button"
						class="add-target"
						@click=${ () => this.updateRule(rule.id, {
							targets: [
								...rule.targets,
								{
									id: createAchievementBuilderId(),
									hitLocation: { source: 'constant', value: '1' },
									throwType: 'anyScoring',
								},
							],
						}) }
					>
						+ Add sequence target
					</button>
				</div>
			`;
		}
	}

	private renderDetails(): TemplateResult {
		return html`
			<section class="builder-panel form-grid">
				<div class="panel-intro">
					<h3>Achievement identity</h3>
					<p>Names and descriptions can use parameter tokens such as <code>{n}</code>.</p>
				</div>
				<div class="preset-row" aria-label="Achievement examples">
					<span>Start from an example:</span>
					<button type="button" @click=${ () => this.loadPreset('shanghai') }>
						Shanghai
					</button>
					<button type="button" @click=${ () => this.loadPreset('rangeKing') }>
						Range King
					</button>
					<button type="button" @click=${ () => this.loadPreset('perfectlyBalanced') }>
						Perfectly Balanced
					</button>
					<button type="button" @click=${ () => this.loadPreset('classic') }>
						Classic
					</button>
				</div>
				<label>
					<span>Name template</span>
					<input
						type="text"
						.value=${ this.draft.nameTemplate }
						@input=${ (event: InputEvent) => this.updateDraft({
							nameTemplate: (event.currentTarget as HTMLInputElement).value,
						}) }
						placeholder="Shanghai {n}"
					/>
				</label>
				<label>
					<span>Description template</span>
					<textarea
						rows="3"
						.value=${ this.draft.descriptionTemplate }
						@input=${ (event: InputEvent) => this.updateDraft({
							descriptionTemplate: (event.currentTarget as HTMLTextAreaElement).value,
						}) }
						placeholder="Hit {n}, D{n} and T{n} in the same round."
					></textarea>
				</label>
				<div class="inline-fields">
					<label>
						<span>Category</span>
						<input
							type="text"
							.value=${ this.draft.category }
							@input=${ (event: InputEvent) => this.updateDraft({
								category: (event.currentTarget as HTMLInputElement).value,
							}) }
						/>
					</label>
					<label>
						<span>Tier</span>
						<select
							.value=${ String(this.draft.tier) }
							@change=${ (event: Event) => this.updateDraft({
								tier: Number((event.currentTarget as HTMLSelectElement).value),
							}) }
						>
							${ Object.values(AchievementTier)
								.filter((tier): tier is number => typeof tier === 'number')
								.map(tier => html`
									<option value=${ tier }>${ AchievementTier[tier] }</option>
								`) }
						</select>
					</label>
					<label>
						<span>Achievement type</span>
						<select
							.value=${ this.draft.achievementScope }
							@change=${ (event: Event) => this.updateDraft({
								achievementScope: (event.currentTarget as HTMLSelectElement)
									.value as AchievementTemplateDraft['achievementScope'],
								progression:
									(event.currentTarget as HTMLSelectElement).value === 'progression'
										? this.draft.progression ?? {
											statuses: [ 'valid', 'victory' ],
											targets: [],
										}
										: this.draft.progression,
							}) }
						>
							<option value="session">Session achievement</option>
							<option value="progression">Progression achievement</option>
						</select>
					</label>
				</div>
			</section>
		`;
	}

	private renderParameters(): TemplateResult {
		return html`
			<section class="builder-panel">
				<div class="panel-intro panel-intro--actions">
					<div>
						<h3>Generation parameters</h3>
						<p>
							Parameters are optional. Add several to generate combinations, or use none
							for a single achievement such as Perfectly Balanced.
						</p>
					</div>
					<aa-button type="button" size="small" @click=${ this.addParameter }>
						Add parameter
					</aa-button>
				</div>
				${ this.draft.parameters.length === 0
					? html`
						<div class="empty-panel">
							This template creates one achievement because it has no parameters.
						</div>
					`
					: html`
						<div class="parameter-list">
							${ this.draft.parameters.map(parameter => html`
								<article class="parameter-card">
									<header>
										<strong>${ parameter.key || 'Unnamed parameter' }</strong>
										<button
											type="button"
											class="remove-button"
											aria-label="Remove parameter"
											@click=${ () => this.removeParameter(parameter.id) }
										>&times;</button>
									</header>
									<div class="inline-fields">
										<label>
											<span>Key</span>
											<input
												type="text"
												.value=${ parameter.key }
												@input=${ (event: InputEvent) => this.updateParameter(
													parameter.id,
													{ key: (event.currentTarget as HTMLInputElement).value },
												) }
											/>
										</label>
										<label>
											<span>Value type</span>
											<select
												.value=${ parameter.valueType }
												@change=${ (event: Event) => this.updateParameter(
													parameter.id,
													{
														valueType: (event.currentTarget as HTMLSelectElement)
															.value as AchievementParameterDraft['valueType'],
														generatorType:
															(event.currentTarget as HTMLSelectElement).value === 'integer'
																? parameter.generatorType
																: 'set',
													},
												) }
											>
												<option value="integer">Integer</option>
												<option value="string">Text / enum</option>
												<option value="boolean">Boolean</option>
											</select>
										</label>
										<label>
											<span>Generator</span>
											<select
												.value=${ parameter.generatorType }
												@change=${ (event: Event) => this.updateParameter(
													parameter.id,
													{
														generatorType: (event.currentTarget as HTMLSelectElement)
															.value as AchievementParameterDraft['generatorType'],
													},
												) }
											>
												<option value="range" ?disabled=${ parameter.valueType !== 'integer' }>
													Numeric range
												</option>
												<option value="set">Explicit values</option>
											</select>
										</label>
									</div>
									${ parameter.generatorType === 'range'
										? html`
											<div class="inline-fields">
												<label>
													<span>Minimum</span>
													<input
														type="number"
														.value=${ String(parameter.minimum ?? '') }
														@input=${ (event: InputEvent) => this.updateParameter(
															parameter.id,
															{ minimum: Number((event.currentTarget as HTMLInputElement).value) },
														) }
													/>
												</label>
												<label>
													<span>Maximum</span>
													<input
														type="number"
														.value=${ String(parameter.maximum ?? '') }
														@input=${ (event: InputEvent) => this.updateParameter(
															parameter.id,
															{ maximum: Number((event.currentTarget as HTMLInputElement).value) },
														) }
													/>
												</label>
												<label>
													<span>Step</span>
													<input
														type="number"
														min="1"
														.value=${ String(parameter.step ?? 1) }
														@input=${ (event: InputEvent) => this.updateParameter(
															parameter.id,
															{ step: Number((event.currentTarget as HTMLInputElement).value) },
														) }
													/>
												</label>
											</div>
										`
										: html`
											<label>
												<span>Values (one per line)</span>
												<textarea
													rows="4"
													.value=${ parameter.values.join('\n') }
													@input=${ (event: InputEvent) => this.updateParameter(
														parameter.id,
														{
															values: (event.currentTarget as HTMLTextAreaElement)
																.value.split('\n')
																.map(value => value.trim())
																.filter(Boolean),
														},
													) }
												></textarea>
											</label>
										` }
								</article>
							`) }
						</div>
					` }
			</section>
		`;
	}

	private renderLogic(): TemplateResult {
		if (this.draft.achievementScope === 'progression')
			return this.renderProgressionLogic();

		return html`
			<section class="builder-panel logic-builder">
				<div class="panel-intro">
					<h3>Achievement logic</h3>
					<p>
						Compose typed blocks. Nested round and throw blocks define scope; comparison
						and sequence blocks define the exact condition.
					</p>
				</div>
				<div class="root-add-blocks">
					${ this.getRuleTypes('root').map(ruleType => html`
						<button type="button" @click=${ () => this.addRootRule(ruleType.value) }>
							+ ${ ruleType.label }
						</button>
					`) }
				</div>
				<div class="logic-canvas">
					${ this.renderRule(this.draft.rule) }
				</div>
			</section>
		`;
	}

	private getParameterValues(
		parameter: AchievementParameterDraft,
		limit = 250,
	): (string | number | boolean)[] {
		if (parameter.generatorType === 'range') {
			const values: number[] = [];
			const minimum = parameter.minimum ?? 0;
			const maximum = parameter.maximum ?? minimum;
			const step = Math.max(parameter.step ?? 1, 1);
			for (let value = minimum; value <= maximum && values.length < limit; value += step)
				values.push(value);
			return values;
		}

		switch (parameter.valueType) {
		case 'integer':
			return parameter.values.map(Number).filter(Number.isFinite);
		case 'boolean':
			return parameter.values.map(value => value.toLowerCase() === 'true');
		default:
			return parameter.values;
		}
	}

	private getPreviews(limit = 24): AchievementTemplatePreview[] {
		const bindings: Record<string, string | number | boolean>[] = [ {} ];
		for (const parameter of this.draft.parameters) {
			const values = this.getParameterValues(parameter);
			const expanded: Record<string, string | number | boolean>[] = [];
			for (const binding of bindings) {
				for (const value of values) {
					expanded.push({ ...binding, [parameter.key]: value });
					if (expanded.length >= limit)
						break;
				}
				if (expanded.length >= limit)
					break;
			}
			bindings.splice(0, bindings.length, ...expanded);
		}

		const renderText = (
			template: string,
			binding: Record<string, string | number | boolean>,
		): string => Object.entries(binding).reduce(
			(result, [ key, value ]) =>
				result.replaceAll(`{${ key }}`, String(value)),
			template,
		);

		return bindings.map(binding => ({
			bindings: binding,
			name: renderText(this.draft.nameTemplate, binding),
			description: renderText(this.draft.descriptionTemplate, binding),
		}));
	}

	private getGeneratedCount(): number {
		if (this.draft.parameters.length === 0)
			return 1;

		return this.draft.parameters.reduce(
			(count, parameter) => {
				if (parameter.generatorType === 'range') {
					const minimum = parameter.minimum ?? 0;
					const maximum = parameter.maximum ?? minimum;
					const step = Math.max(parameter.step ?? 1, 1);
					return count * Math.max(0, Math.floor((maximum - minimum) / step) + 1);
				}

				return count * parameter.values.length;
			},
			1,
		);
	}

	private renderPreview(): TemplateResult {
		const previews = this.getPreviews();
		const count = this.getGeneratedCount();
		return html`
			<section class="builder-panel">
				<div class="panel-intro">
					<h3>Generated achievements</h3>
					<p>
						This template produces <strong>${ count }</strong> concrete achievement${ count === 1 ? '' : 's' }.
						The first ${ Math.min(count, previews.length) } are shown below.
					</p>
				</div>
				<div class="preview-list">
					${ previews.map(preview => html`
						<article class="preview-card">
							<strong>${ preview.name || 'Untitled achievement' }</strong>
							<p>${ preview.description || 'No description' }</p>
							${ Object.keys(preview.bindings).length
								? html`
									<div class="binding-list">
										${ Object.entries(preview.bindings).map(([ key, value ]) => html`
											<span>${ key }=${ String(value) }</span>
										`) }
									</div>
								`
								: html`<small>Single achievement - no parameters</small>` }
						</article>
					`) }
				</div>
			</section>
		`;
	}

	override render(): TemplateResult {
		return html`
			<div class="achievement-builder">
				<aa-tabs
					.items=${ tabs }
					.selected=${ this.selectedTab }
					label="Achievement builder sections"
					@tab-change=${ this.handleTabChange }
				></aa-tabs>
				${ this.errors.length > 0
					? html`
						<div class="error-list" role="alert">
							${ this.errors.map(error => html`<p>${ error }</p>`) }
						</div>
					`
					: nothing }
				<div class="builder-content">
					${ this.selectedTab === 'details'
						? this.renderDetails()
						: this.selectedTab === 'parameters'
							? this.renderParameters()
							: this.selectedTab === 'logic'
								? this.renderLogic()
								: this.renderPreview() }
				</div>
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(achievementBuilderStyles),
	];
}

declare global {
	interface HTMLElementTagNameMap {
		'aa-achievement-builder': AaAchievementBuilder;
	}

	interface HTMLElementEventMap {
		[achievementBuilderSaveEventName]: AchievementBuilderSaveEvent;
	}
}
