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
import {
	formatAchievementRule,
	formatSequenceTarget,
} from './achievement-rule-presentation.js';

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
interface CanvasDragState {
	pointerId: number;
	startX: number;
	startY: number;
	originX: number;
	originY: number;
}

@customElement('aa-achievement-builder')
export class AaAchievementBuilder extends LitElement {

	@property({ type: String }) seasonId = '';
	@property({ attribute: false }) initialDraft?: AchievementTemplateDraft;
	@property({ type: Number }) maximumGeneratedInstances = 500;

	@state() private selectedTab = 'details';
	@state() private draft: AchievementTemplateDraft = createEmptyAchievementTemplate('');
	@state() private errors: string[] = [];
	@state() private logicCanvasScale = 1;
	@state() private logicCanvasX = 24;
	@state() private logicCanvasY = 24;
	@state() private logicCanvasDragging = false;
	@state() private openAddControlId = '';
	@state() private expandedRuleId = '';
	@state() private expandedSequenceTargetId = '';

	private logicCanvasDrag?: CanvasDragState;

	override firstUpdated(): void {
		this.resetDraft();
	}

	private resetDraft(): void {
		this.draft = structuredClone(
			this.initialDraft ?? createEmptyAchievementTemplate(this.seasonId),
		);
		this.selectedTab = 'details';
		this.errors = [];
		this.openAddControlId = '';
		this.expandedRuleId = '';
		this.expandedSequenceTargetId = '';
		this.resetLogicCanvas();
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
		if (this.selectedTab === 'logic')
			void this.fitLogicCanvas();
	}

	private resetLogicCanvas(): void {
		this.logicCanvasScale = 1;
		this.logicCanvasX = 24;
		this.logicCanvasY = 24;
	}

	private setLogicCanvasZoom(
		scale: number,
		focusX?: number,
		focusY?: number,
	): void {
		const nextScale = Math.min(1.5, Math.max(0.35, scale));
		const viewport = this.shadowRoot?.querySelector<HTMLElement>('.logic-canvas__viewport');
		const x = focusX ?? (viewport?.clientWidth ?? 0) / 2;
		const y = focusY ?? (viewport?.clientHeight ?? 0) / 2;
		const worldX = (x - this.logicCanvasX) / this.logicCanvasScale;
		const worldY = (y - this.logicCanvasY) / this.logicCanvasScale;

		this.logicCanvasX = x - worldX * nextScale;
		this.logicCanvasY = y - worldY * nextScale;
		this.logicCanvasScale = nextScale;
	}

	private handleLogicCanvasWheel(event: WheelEvent): void {
		event.preventDefault();
		const viewport = event.currentTarget as HTMLElement;
		const bounds = viewport.getBoundingClientRect();
		const factor = Math.exp(-event.deltaY * 0.0015);
		this.setLogicCanvasZoom(
			this.logicCanvasScale * factor,
			event.clientX - bounds.left,
			event.clientY - bounds.top,
		);
	}

	private handleLogicCanvasPointerDown(event: PointerEvent): void {
		if (event.button !== 0)
			return;

		const eventPath = event.composedPath();
		const clickedAddControl = eventPath.some(item =>
			item instanceof Element && item.classList.contains('logic-add-control'));
		if (this.openAddControlId && !clickedAddControl)
			this.openAddControlId = '';

		const isInteractive = eventPath.some(item =>
			item instanceof Element
			&& item.matches('button, input, select, textarea, .logic-node'));
		if (isInteractive)
			return;

		const viewport = event.currentTarget as HTMLElement;
		viewport.setPointerCapture(event.pointerId);
		this.logicCanvasDrag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: this.logicCanvasX,
			originY: this.logicCanvasY,
		};
		this.logicCanvasDragging = true;
	}

	private handleLogicCanvasPointerMove(event: PointerEvent): void {
		if (!this.logicCanvasDrag || this.logicCanvasDrag.pointerId !== event.pointerId)
			return;

		this.logicCanvasX = this.logicCanvasDrag.originX + event.clientX - this.logicCanvasDrag.startX;
		this.logicCanvasY = this.logicCanvasDrag.originY + event.clientY - this.logicCanvasDrag.startY;
	}

	private handleLogicCanvasPointerUp(event: PointerEvent): void {
		if (!this.logicCanvasDrag || this.logicCanvasDrag.pointerId !== event.pointerId)
			return;

		const viewport = event.currentTarget as HTMLElement;
		if (viewport.hasPointerCapture(event.pointerId))
			viewport.releasePointerCapture(event.pointerId);

		this.logicCanvasDrag = undefined;
		this.logicCanvasDragging = false;
	}

	private async fitLogicCanvas(): Promise<void> {
		await this.updateComplete;
		const viewport = this.shadowRoot?.querySelector<HTMLElement>('.logic-canvas__viewport');
		const graph = this.shadowRoot?.querySelector<HTMLElement>('.logic-canvas__graph');
		if (!viewport || !graph)
			return;

		const padding = 48;
		const scale = Math.min(
			1,
			(viewport.clientWidth - padding) / graph.offsetWidth,
			(viewport.clientHeight - padding) / graph.offsetHeight,
		);
		this.logicCanvasScale = Math.max(0.35, scale);
		this.logicCanvasX = Math.max(24, (viewport.clientWidth - graph.offsetWidth * this.logicCanvasScale) / 2);
		this.logicCanvasY = Math.max(24, (viewport.clientHeight - graph.offsetHeight * this.logicCanvasScale) / 2);
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

		const child = this.createRule(type, scope);
		if (parent.type === 'all' || parent.type === 'any') {
			this.updateRule(parent.id, {
				children: [ ...parent.children, child ],
			});
		}
		else if (parent.type === 'round') {
			const condition = parent.condition.type === 'all'
				? parent.condition
				: { ...createDefaultAchievementRule(), children: [ parent.condition ] };
			this.updateRule(parent.id, {
				condition: {
					...condition,
					children: [ ...condition.children, child ],
				},
			});
		}
		else if (
			parent.type === 'not'
			&& (parent.child.type === 'all' || parent.child.type === 'any')
		) {
			this.updateRule(parent.id, {
				child: {
					...parent.child,
					children: [ ...parent.child.children, child ],
				},
			});
		}
		this.expandedRuleId = child.id;
		this.expandedSequenceTargetId = '';
	}

	private removeRule(id: string): void {
		if (this.expandedRuleId === id)
			this.expandedRuleId = '';
		this.updateDraft({ rule: this.replaceRule(this.draft.rule, id) });
	}

	private getValueEditorChoice(value: AchievementValueDraft): string {
		if (
			value.source === 'parameter'
			|| value.source === 'board.leftNeighbor'
			|| value.source === 'board.rightNeighbor'
		)
			return `${ value.source }:${ value.value }`;
		return value.source;
	}

	private parseValueEditorChoice(
		choice: string,
		current: AchievementValueDraft,
	): AchievementValueDraft {
		const separator = choice.indexOf(':');
		if (separator >= 0) {
			return {
				source: choice.slice(0, separator) as AchievementValueSource,
				value: choice.slice(separator + 1),
			};
		}
		return {
			source: choice as AchievementValueSource,
			value: choice === 'constant' ? current.value || '0' : '',
		};
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
					aria-label="Value"
					.value=${ this.getValueEditorChoice(value) }
					@change=${ (event: Event) => onChange(this.parseValueEditorChoice(
						(event.currentTarget as HTMLSelectElement).value,
						value,
					)) }
				>
					${ availableSources
						.filter(source =>
							source.value !== 'parameter'
							&& source.value !== 'board.leftNeighbor'
							&& source.value !== 'board.rightNeighbor')
						.map(source => html`
							<option value=${ source.value }>
								${ source.value === 'constant' ? 'Number' : source.label }
							</option>
						`) }
					${ this.draft.parameters.length > 0
						? html`
							<optgroup label="Achievement values">
								${ this.draft.parameters.map(parameter => html`
									<option value=${ `parameter:${ parameter.key }` }>
										${ parameter.key }
									</option>
								`) }
							</optgroup>
							<optgroup label="Dartboard neighbors">
								${ this.draft.parameters
									.filter(parameter => parameter.valueType === 'integer')
									.flatMap(parameter => [
										html`
											<option value=${ `board.leftNeighbor:${ parameter.key }` }>
												Left of ${ parameter.key }
											</option>
										`,
										html`
											<option value=${ `board.rightNeighbor:${ parameter.key }` }>
												Right of ${ parameter.key }
											</option>
										`,
									]) }
							</optgroup>
						`
						: nothing }
				</select>
				${ value.source === 'constant'
					? html`
						<input
							type="number"
							aria-label="Number"
							.value=${ value.value }
							@input=${ (event: InputEvent) => onChange({
								...value,
								value: (event.currentTarget as HTMLInputElement).value,
							}) }
						/>
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
		if (rule.type === 'not') {
			return html`
				<article class="logic-node logic-node--not logic-node--compact">
					<strong>NOT</strong>
					${ canRemove
						? html`
							<button
								type="button"
								class="logic-node__compact-remove"
								aria-label="Remove NOT block"
								@click=${ () => this.removeRule(rule.id) }
							>&times;</button>
						`
						: nothing }
				</article>
			`;
		}

		if (rule.type === 'all' || rule.type === 'any') {
			return html`
				<article class="logic-node logic-node--group">
					<div class="logic-node--group__header">
						${ depth === 0
							? html`<span class="logic-node__scope">Start</span>`
							: scope === 'round'
								? html`<span class="logic-node__scope">Round</span>`
								: nothing }
						${ canRemove
							? html`
								<button
									type="button"
									class="logic-node__compact-remove"
									aria-label="Remove condition group"
									@click=${ () => this.removeRule(rule.id) }
								>&times;</button>
							`
							: nothing }
					</div>
					${ rule.children.length > 1
						? html`
							<div class="logic-group-mode" role="group" aria-label="Condition match mode">
								<button
									type="button"
									class=${ rule.type === 'all' ? 'logic-group-mode__active' : '' }
									aria-pressed=${ rule.type === 'all' }
									@click=${ () => this.updateRule(rule.id, { type: 'all' }) }
								>ALL</button>
								<button
									type="button"
									class=${ rule.type === 'any' ? 'logic-group-mode__active' : '' }
									aria-pressed=${ rule.type === 'any' }
									@click=${ () => this.updateRule(rule.id, { type: 'any' }) }
								>ANY</button>
							</div>
						`
						: html`
							<strong class="logic-group-single">
								${ rule.children.length === 0 ? 'Add a condition' : '1 condition' }
							</strong>
						` }
					<small>
						${ rule.children.length } condition${ rule.children.length === 1 ? '' : 's' }
					</small>
				</article>
			`;
		}

		const canCollapse = rule.type !== 'round';
		const isExpanded = !canCollapse || this.expandedRuleId === rule.id;
		if (!isExpanded) {
			return html`
				<article class="logic-node logic-node--${ rule.type } logic-node--summary">
					<button
						type="button"
						class="logic-node__summary-button"
						aria-label=${ `Edit ${ formatAchievementRule(rule) }` }
						@click=${ () => {
							this.expandedRuleId = rule.id;
							this.expandedSequenceTargetId = '';
						} }
					>
						<strong class="logic-node__type">
							${ ruleTypes.find(item => item.value === rule.type)?.label }
						</strong>
						<span>${ formatAchievementRule(rule) }</span>
					</button>
					${ canRemove
						? html`
							<button
								type="button"
								class="logic-node__compact-remove"
								aria-label="Remove logic block"
								@click=${ () => this.removeRule(rule.id) }
							>&times;</button>
						`
						: nothing }
				</article>
			`;
		}

		return html`
			<article class="logic-node logic-node--${ rule.type } logic-node--expanded">
				<header>
					<div class="logic-node__heading">
						${ depth === 0
							? html`<span class="logic-node__scope">Start</span>`
							: nothing }
						<strong class="logic-node__type">
							${ ruleTypes.find(item => item.value === rule.type)?.label }
						</strong>
						${ rule.type === 'round' || rule.type === 'compare'
							? nothing
							: html`<small>${ this.getRuleDescription(rule) }</small>` }
					</div>
					<div class="logic-node__actions">
						${ canCollapse
							? html`
								<button
									type="button"
									class="logic-node__collapse"
									aria-label="Collapse logic block"
									@click=${ () => {
										this.expandedRuleId = '';
										this.expandedSequenceTargetId = '';
									} }
								>-</button>
							`
							: nothing }
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
					</div>
				</header>
				<div class="logic-node__body">
					${ this.renderRuleBody(rule, scope) }
				</div>
			</article>
		`;
	}

	private getRuleDescription(rule: AchievementRuleDraft): string {
		switch (rule.type) {
		case 'all':
			return `${ rule.children.length } connected condition${ rule.children.length === 1 ? '' : 's' } must match`;
		case 'any':
			return `${ rule.children.length } connected condition${ rule.children.length === 1 ? '' : 's' }; one must match`;
		case 'not':
			return 'Inverts the connected condition';
		case 'round':
			return 'Finds matching rounds, then checks their condition';
		case 'throw':
			return 'Checks throws inside the connected round';
		case 'compare':
			return 'Compares two values';
		case 'sequence':
			return 'Matches an ordered three-throw pattern';
		}
	}

	private getRuleChildren(
		rule: AchievementRuleDraft,
		scope: BuilderScope,
	): { rule: AchievementRuleDraft; scope: BuilderScope; }[] {
		const unwrapStructuralGroup = (
			child: AchievementRuleDraft,
			childScope: BuilderScope,
		): { rule: AchievementRuleDraft; scope: BuilderScope; }[] => {
			if (
				(child.type === 'all' || child.type === 'any')
				&& child.children.length <= 1
			) {
				return child.children.map(item => ({
					rule: item,
					scope: childScope,
				}));
			}
			return [ { rule: child, scope: childScope } ];
		};

		switch (rule.type) {
		case 'all':
		case 'any':
			return rule.children.map(child => ({ rule: child, scope }));
		case 'not':
			return unwrapStructuralGroup(rule.child, scope);
		case 'round':
			return unwrapStructuralGroup(rule.condition, 'round');
		default:
			return [];
		}
	}

	private canAddRuleChildren(rule: AchievementRuleDraft): boolean {
		if (rule.type === 'all' || rule.type === 'any' || rule.type === 'round')
			return true;
		return rule.type === 'not'
			&& (rule.child.type === 'all' || rule.child.type === 'any')
			&& rule.child.children.length === 0;
	}

	private getDirectChildCount(rule: AchievementRuleDraft): number {
		switch (rule.type) {
		case 'all':
		case 'any':
			return rule.children.length;
		case 'round':
			return rule.condition.type === 'all' || rule.condition.type === 'any'
				? rule.condition.children.length
				: 1;
		case 'not':
			return rule.child.type === 'all' || rule.child.type === 'any'
				? rule.child.children.length
				: 1;
		default:
			return 0;
		}
	}

	private renderRuleAddControl(
		rule: AchievementRuleDraft,
		scope: BuilderScope,
	): TemplateResult {
		return html`
			<div
				class="logic-add-control ${ this.openAddControlId === rule.id
					? 'logic-add-control--open'
					: '' }"
				@keydown=${ (event: KeyboardEvent) => {
					if (event.key === 'Escape')
						this.openAddControlId = '';
				} }
			>
				<button
					type="button"
					class="logic-add-control__trigger"
					aria-label="Add connected condition"
					aria-haspopup="true"
					aria-expanded=${ this.openAddControlId === rule.id }
					@click=${ (event: MouseEvent) => {
						event.stopPropagation();
						this.openAddControlId = this.openAddControlId === rule.id
							? ''
							: rule.id;
					} }
				>+</button>
				<div class="logic-add-control__popover">
					<strong>Add connected condition</strong>
					<span>
						${ rule.type === 'round'
							? 'This condition runs inside each matching round.'
							: 'Choose the next condition type.' }
					</span>
					${ this.renderAddBlock(
						rule,
						rule.type === 'round' ? 'round' : scope,
					) }
				</div>
			</div>
		`;
	}

	private renderRuleBranch(
		rule: AchievementRuleDraft,
		depth = 0,
		scope: BuilderScope = 'root',
	): TemplateResult {
		const children = this.getRuleChildren(rule, scope);
		const canAddChildren = this.canAddRuleChildren(rule);
		if (
			depth > 0
			&& (rule.type === 'all' || rule.type === 'any')
			&& children.length === 1
		) {
			const child = children[0];
			const childIsTransparentGroup = (
				child.rule.type === 'all' || child.rule.type === 'any'
			) && child.rule.children.length === 1;
			return html`
				<div class="logic-branch logic-branch--transparent-single ${
					this.openAddControlId === rule.id ? 'logic-branch--menu-open' : ''
				}">
					${ this.renderRuleBranch(child.rule, depth, child.scope) }
					${ childIsTransparentGroup
						? nothing
						: this.renderRuleAddControl(rule, scope) }
				</div>
			`;
		}

		const childLayout = children.length === 0
			? 'empty'
			: children.length === 1
				? 'single'
				: 'multiple';
		const showJunctionAdd = childLayout === 'multiple' && canAddChildren;
		return html`
			<div class="logic-branch ${ children.length > 0 || canAddChildren
				? 'logic-branch--has-children'
				: '' } ${ this.openAddControlId === rule.id
					? 'logic-branch--menu-open'
					: '' }">
				<div class="logic-branch__node">
					${ this.renderRule(rule, depth, scope) }
					${ showJunctionAdd
						? this.renderRuleAddControl(rule, scope)
						: nothing }
				</div>
				${ children.length > 0 || canAddChildren
					? html`
						<div class="logic-branch__children logic-branch__children--${ childLayout }">
							${ children.map(child =>
								this.renderRuleBranch(child.rule, depth + 1, child.scope)) }
							${ canAddChildren && !showJunctionAdd
								? this.renderRuleAddControl(rule, scope)
								: nothing }
						</div>
					`
					: nothing }
			</div>
		`;
	}

	private getRuleTypes(
		scope: BuilderScope,
		parent: AchievementRuleDraft,
	): typeof ruleTypes {
		const directChildCount = this.getDirectChildCount(parent);
		return ruleTypes.filter(ruleType => {
			if (
				directChildCount === 0
				&& (ruleType.value === 'all' || ruleType.value === 'any')
			)
				return false;
			if (parent.type === 'not' && ruleType.value === 'not')
				return false;
			return (
				scope === 'round'
					? ruleType.value !== 'round'
					: ruleType.value !== 'throw' && ruleType.value !== 'sequence'
			);
		});
	}

	private renderAddBlock(parent: AchievementRuleDraft, scope: BuilderScope): TemplateResult {
		return html`
			<div class="add-block-row">
				${ this.getRuleTypes(scope, parent).map(ruleType => html`
					<button
						type="button"
						@click=${ (event: MouseEvent) => {
							this.openAddControlId = '';
							this.addChildRule(parent.id, ruleType.value, scope);
							(event.currentTarget as HTMLButtonElement).blur();
						} }
					>
						+ ${ ruleType.label }
					</button>
				`) }
			</div>
		`;
	}

	private renderRuleBody(
		rule: AchievementRuleDraft,
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
			`;
		case 'not':
			return html`
				<p class="logic-node__summary">
					The connected condition must <strong>not</strong> match.
				</p>
			`;
		case 'round':
			return html`
				<div class="round-editor">
					<div>
						<span class="logic-field-label">Match rounds</span>
						<div class="logic-round-mode" role="group" aria-label="Round match mode">
							<button
								type="button"
								class=${ rule.quantifier === 'any' ? 'logic-round-mode__active' : '' }
								aria-pressed=${ rule.quantifier === 'any' }
								@click=${ () => this.updateRule(rule.id, { quantifier: 'any' }) }
							>ANY</button>
							<button
								type="button"
								class=${ rule.quantifier === 'all' ? 'logic-round-mode__active' : '' }
								aria-pressed=${ rule.quantifier === 'all' }
								@click=${ () => this.updateRule(rule.id, { quantifier: 'all' }) }
							>EVERY</button>
						</div>
					</div>
					<div>
						<span class="logic-field-label">Allowed status</span>
						<div class="round-statuses">
							${ [
								[ 'valid', 'Valid' ],
								[ 'victory', 'Victory' ],
								[ 'overshoot', 'Overshoot' ],
								[ 'failedWinCondition', 'Failed win' ],
							].map(([ status, label ]) => {
								const selected = rule.statuses.includes(status as never);
								return html`
									<button
										type="button"
										class=${ selected ? 'round-statuses__active' : '' }
										aria-pressed=${ selected }
										@click=${ () => this.updateRule(rule.id, {
											statuses: selected
												? rule.statuses.filter(item => item !== status)
												: [ ...rule.statuses, status ] as typeof rule.statuses,
										}) }
									>${ label }</button>
								`;
							}) }
						</div>
					</div>
				</div>
			`;
		case 'throw':
			return html`
				<div class="throw-editor">
					<div class="throw-editor__sentence">
						<select
							aria-label="Throw match mode"
							.value=${ rule.quantifier }
							@change=${ (event: Event) => this.updateRule(rule.id, {
								quantifier: (event.currentTarget as HTMLSelectElement).value as 'any' | 'all',
							}) }
						>
							<option value="any">Any throw</option>
							<option value="all">Every throw</option>
						</select>
						<span>hits</span>
						${ this.renderValueEditor(
							rule.hitLocation,
							value => this.updateRule(rule.id, { hitLocation: value }),
							'round',
						) }
					</div>
					${ rule.throwType === 'any'
						? html`
							<button
								type="button"
								class="logic-secondary-action"
								@click=${ () => this.updateRule(rule.id, { throwType: 'single' }) }
							>+ Add type filter</button>
						`
						: html`
							<div class="throw-editor__filter">
								<span class="logic-field-label">Throw type</span>
								<div class="throw-editor__filter-controls">
									<select
										aria-label="Throw type"
										.value=${ rule.throwType }
										@change=${ (event: Event) => this.updateRule(rule.id, {
											throwType: (event.currentTarget as HTMLSelectElement)
												.value as typeof rule.throwType,
										}) }
									>
										${ [ 'single', 'double', 'triple', 'rim', 'miss' ].map(type => html`
											<option value=${ type }>${ type }</option>
										`) }
									</select>
									<button
										type="button"
										class="logic-secondary-action"
										@click=${ () => this.updateRule(rule.id, { throwType: 'any' }) }
									>Clear</button>
								</div>
							</div>
						` }
				</div>
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
				<div class="sequence-progress">${ rule.targets.length } of 3 steps</div>
				<div class="sequence-targets">
					${ rule.targets.map((target, index) => {
						const expanded = this.expandedSequenceTargetId === target.id;
						return html`
							<div class="sequence-target ${ expanded ? 'sequence-target--expanded' : '' }">
								<div class="sequence-target__header">
									<button
										type="button"
										class="sequence-target__summary"
										aria-expanded=${ expanded }
										@click=${ () => {
											this.expandedSequenceTargetId = expanded ? '' : target.id;
										} }
									>
										<strong>${ index + 1 }.</strong>
										<span>${ formatSequenceTarget(target) }</span>
									</button>
									<button
										type="button"
										class="remove-button"
										aria-label=${ `Remove sequence step ${ index + 1 }` }
										@click=${ () => {
											if (this.expandedSequenceTargetId === target.id)
												this.expandedSequenceTargetId = '';
											this.updateRule(rule.id, {
												targets: rule.targets.filter(item => item.id !== target.id),
											});
										} }
									>&times;</button>
								</div>
								${ expanded
									? html`
										<div class="sequence-target__editor">
											${ this.renderValueEditor(
												target.hitLocation,
												value => this.updateRule(rule.id, {
													targets: rule.targets.map(item =>
														item.id === target.id
															? { ...item, hitLocation: value }
															: item),
												}),
												'round',
											) }
											<select
												aria-label=${ `Sequence step ${ index + 1 } throw type` }
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
												${ [
													[ 'anyScoring', 'Any scoring' ],
													[ 'single', 'Single' ],
													[ 'double', 'Double' ],
													[ 'triple', 'Triple' ],
													[ 'rim', 'Rim' ],
													[ 'miss', 'Miss' ],
												].map(([ type, label ]) => html`
													<option value=${ type }>${ label }</option>
												`) }
											</select>
										</div>
									`
									: nothing }
							</div>
						`;
					}) }
					${ rule.targets.length < 3
						? html`
							<button
								type="button"
								class="add-target"
								@click=${ () => {
									const target = {
										id: createAchievementBuilderId(),
										hitLocation: { source: 'constant' as const, value: '1' },
										throwType: 'anyScoring' as const,
									};
									this.expandedSequenceTargetId = target.id;
									this.updateRule(rule.id, {
										targets: [ ...rule.targets, target ],
									});
								} }
							>
								+ Add step
							</button>
						`
						: nothing }
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
				<div class="logic-builder__header">
					<div class="panel-intro">
						<h3>Achievement logic</h3>
						<p>
							Follow the connectors from left to right. Drag empty canvas space to move;
							scroll to zoom.
						</p>
					</div>
					<div class="logic-canvas__controls" aria-label="Canvas controls">
						<button
							type="button"
							aria-label="Zoom out"
							@click=${ () => this.setLogicCanvasZoom(this.logicCanvasScale - 0.1) }
						>&minus;</button>
						<output>${ Math.round(this.logicCanvasScale * 100) }%</output>
						<button
							type="button"
							aria-label="Zoom in"
							@click=${ () => this.setLogicCanvasZoom(this.logicCanvasScale + 0.1) }
						>+</button>
						<button type="button" @click=${ () => void this.fitLogicCanvas() }>Fit</button>
					</div>
				</div>
				<div
					class="logic-canvas__viewport ${ this.logicCanvasDragging
						? 'logic-canvas__viewport--dragging'
						: '' }"
					tabindex="0"
					aria-label="Achievement logic canvas"
					@wheel=${ this.handleLogicCanvasWheel }
					@pointerdown=${ this.handleLogicCanvasPointerDown }
					@pointermove=${ this.handleLogicCanvasPointerMove }
					@pointerup=${ this.handleLogicCanvasPointerUp }
					@pointercancel=${ this.handleLogicCanvasPointerUp }
					@lostpointercapture=${ this.handleLogicCanvasPointerUp }
				>
					<div
						class="logic-canvas__stage"
						style="transform: translate(${ this.logicCanvasX }px, ${ this.logicCanvasY }px)
							scale(${ this.logicCanvasScale });"
					>
						<div class="logic-canvas__graph">
							${ this.renderRuleBranch(this.draft.rule) }
						</div>
					</div>
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
											<span>${ `${ key }=${ String(value) }` }</span>
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
