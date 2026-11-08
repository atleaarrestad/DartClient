import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import {
	AchievementParameterDraft,
	AchievementRoundStatus,
	achievementRoundStatusLabels,
	AchievementRuleDraft,
	createDefaultAchievementRule,
	EditableAchievementRuleType,
} from '../../../models/achievementBuilder.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import { hidePopover, showPopoverAt } from '../../../ui/anchored-popover.js';
import { ParameterBinding, replaceRule, updateRule } from '../achievement-draft.js';
import { ruleChangeEventName, ruleHighlightEventName, ruleSelectEventName } from '../rule-events.js';
import { allRoundStatuses } from '../rule-text/rule-text-vocabulary.js';
import { describeLeaf } from '../rule-workspace/rule-readout.js';
import canvasStyles from './aa-sentence-canvas.css?inline';
import { CanvasController } from './canvas-controller.js';
import {
	addCondition,
	duplicateChild,
	getAddableTypes,
	moveChild,
	removeRule,
	setGroupType,
	toggleNegation,
} from './rule-edits.js';
import {
	buildRuleGraph,
	RuleGraph,
	RuleGraphLine,
	RuleGraphNode,
} from './rule-graph.js';
import { renderSentence } from './sentence-line.js';


/** Below this zoom the controls are too small to use, so nodes show plain phrases instead. */
const summaryZoom = 0.6;

const addLabels: Record<EditableAchievementRuleType, string> = {
	throw:        'A dart hits…',
	throwCount:   'Count darts on…',
	sequence:     'Darts in order…',
	compare:      'Compare a value…',
	round:        'In a round…',
	winningThrow: 'The winning dart…',
	all:          'A group: all of…',
	any:          'A group: any of…',
	not:          'Not…',
};

type MenuTarget =
	| { kind: 'line'; node: RuleGraphNode; line: RuleGraphLine; index: number; }
	| { kind: 'node'; node: RuleGraphNode; };

/** The pill on a node. A round's "one / every round" choice is right below it, so not repeated here. */
const nodeTitle = (node: RuleGraphNode): string => {
	if (node.kind === 'round')
		return 'Round';

	return node.kind === 'any' ? 'Any of these' : 'All of these';
};

const negationTitle = (node: RuleGraphNode): string => {
	if (node.kind === 'any')
		return 'None of these may happen';
	if (node.kind === 'all')
		return 'Not all of these may happen';

	return 'Must not happen';
};

/** "all must be true" under a node with more than one line. */
const joinerHint = (node: RuleGraphNode): string => {
	if (node.lines.length < 2)
		return '';

	return node.joiner === 'or' ? 'any one must be true' : 'all must be true';
};

/**
 * The unlock rule as sentence nodes on a pan-and-zoom canvas. Groups and rounds are nodes,
 * their conditions are sentence lines, and child groups branch out to the right.
 */
@customElement('aa-sentence-canvas')
export class AaSentenceCanvas extends LitElement {

	@property({ attribute: false }) rule:       AchievementRuleDraft = createDefaultAchievementRule();
	@property({ attribute: false }) parameters: readonly AchievementParameterDraft[] = [];
	@property({ attribute: false }) binding?:   ParameterBinding;
	@property({ type: Boolean }) readOnly = false;
	/** The rule to highlight, e.g. while its readout phrase or text is hovered. */
	@property({ type: String }) highlightedRuleId = '';

	@state() private collapsed:   Set<string> = new Set();
	@state() private menuTarget?: MenuTarget;
	@state() private addTarget?:  RuleGraphNode;

	@query('.graph') private graphElement?:      HTMLElement;
	@query('.menu') private menuElement?:        HTMLElement;
	@query('.add-menu') private addMenuElement?: HTMLElement;

	private graph:           RuleGraph = buildRuleGraph(this.rule);
	private resizeObserver?: ResizeObserver;

	private readonly canvas = new CanvasController(this, () => ({
		viewport: this.renderRoot.querySelector<HTMLElement>('.viewport') ?? undefined,
		graph:    this.graphElement,
	}));

	protected override willUpdate(changed: PropertyValues<this>): void {
		if (changed.has('rule'))
			this.graph = buildRuleGraph(this.rule);
	}

	protected override firstUpdated(): void {
		void this.canvas.fit();
		this.resizeObserver = new ResizeObserver(() => this.drawWires());
		if (this.graphElement)
			this.resizeObserver.observe(this.graphElement);
	}

	protected override updated(changed: PropertyValues<this>): void {
		this.drawWires();
		// Unlocking a version adds "+ Add" rows, which changes the graph's size.
		if (changed.has('readOnly') && changed.get('readOnly') !== undefined)
			void this.canvas.fit();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.resizeObserver?.disconnect();
	}

	/** Fits the whole graph in view. */
	fit(): void {
		void this.canvas.fit();
	}

	focusViewport(): void {
		this.renderRoot.querySelector<HTMLElement>('.viewport')?.focus({ preventScroll: true });
	}

	// ── Events ──────────────────────────────────────────────────────────

	private emitRule(rule: AchievementRuleDraft): void {
		this.dispatchEvent(new CustomEvent(ruleChangeEventName, { detail: { rule }, bubbles: true, composed: true }));
	}

	private emitRuleId(name: string, ruleId: string): void {
		this.dispatchEvent(new CustomEvent<{ ruleId: string; }>(name, { detail: { ruleId }, bubbles: true, composed: true }));
	}

	private nodeById(id: string): RuleGraphNode | undefined {
		return this.graph.nodes.find(node => node.id === id);
	}

	private toggleCollapsed(nodeId: string): void {
		const next = new Set(this.collapsed);
		if (!next.delete(nodeId))
			next.add(nodeId);

		this.collapsed = next;
	}

	// ── Menus ───────────────────────────────────────────────────────────

	private async openMenu(target: MenuTarget, anchor: HTMLElement): Promise<void> {
		this.menuTarget = target;
		await this.updateComplete;
		if (this.menuElement)
			showPopoverAt(this.menuElement, anchor);
	}

	private async openAddMenu(node: RuleGraphNode, anchor: HTMLElement): Promise<void> {
		this.addTarget = node;
		await this.updateComplete;
		if (this.addMenuElement)
			showPopoverAt(this.addMenuElement, anchor);
	}

	private runMenuAction(action: () => AchievementRuleDraft): void {
		hidePopover(this.menuElement);
		this.emitRule(action());
	}

	private addCondition(type: EditableAchievementRuleType): void {
		const node = this.addTarget;
		hidePopover(this.addMenuElement);
		if (!node)
			return;

		const { rule, addedId } = addCondition(this.rule, node, type);
		this.emitRule(rule);
		this.emitRuleId(ruleHighlightEventName, addedId);
	}

	private renderMenu(): TemplateResult {
		const target = this.menuTarget;
		const item = (label: string, action: () => AchievementRuleDraft, danger = false): TemplateResult => html`
			<button type="button" class=${ danger ? 'danger' : '' } @click=${ () => this.runMenuAction(action) }>${ label }</button>
		`;
		let items: TemplateResult[] = [];

		if (target?.kind === 'line') {
			const { node, line, index } = target;
			const groupId = node.childGroupId;
			const negated = line.negationIds.length > 0;
			items = [
				item(negated ? 'Remove “not”' : 'Negate (must not happen)', () => toggleNegation(this.rule, {
					outerId:     line.outerId,
					inner:       line.rule,
					negationIds: line.negationIds,
				})),
				...groupId && index > 0 ? [ item('Move up', () => moveChild(this.rule, groupId, line.outerId, -1)) ] : [],
				...groupId && index < node.lines.length - 1
					? [ item('Move down', () => moveChild(this.rule, groupId, line.outerId, 1)) ]
					: [],
				...groupId ? [ item('Duplicate', () => duplicateChild(this.rule, groupId, line.outerId)) ] : [],
				item('Remove', () => removeRule(this.rule, line.outerId), true),
			];
		}
		else if (target?.kind === 'node' && target.node.rule) {
			const { node } = target;
			const rule = node.rule!;
			if (rule.type === 'all' || rule.type === 'any') {
				const other = rule.type === 'all' ? 'any' : 'all';
				items.push(item(`Switch to “${ other } of these”`, () => setGroupType(this.rule, rule.id, other)));
			}

			const roundGroup = rule.type === 'round' ? rule.condition : undefined;
			if (roundGroup && node.lines.length > 1 && (roundGroup.type === 'all' || roundGroup.type === 'any')) {
				const other = roundGroup.type === 'all' ? 'any' : 'all';
				items.push(item(`Switch to “${ other } of these”`, () => setGroupType(this.rule, roundGroup.id, other)));
			}
			if (node.parentLineId)
				items.push(item('Remove this block', () => removeRule(this.rule, node.parentLineId!), true));

			else if (node.id === this.rule.id)
				items.push(item('Clear the whole rule', () => replaceRule(this.rule, this.rule.id), true));
		}

		return html`
			<div class="menu popover-menu" popover="auto" role="menu" @keydown=${ (event: KeyboardEvent) => {
				if (event.key === 'Escape')
					hidePopover(this.menuElement);
			} }>${ items }</div>
		`;
	}

	private renderAddMenu(): TemplateResult {
		const node = this.addTarget;

		return html`
			<div class="add-menu popover-menu" popover="auto" role="menu">
				<span class="popover-menu__title">${ node?.scope === 'round' ? 'Add to this round' : 'Add a condition' }</span>
				${ node
					? getAddableTypes(node.scope).map(type => html`
						<button type="button" @click=${ () => this.addCondition(type) }>${ addLabels[type] }</button>
					`)
					: nothing }
			</div>
		`;
	}

	// ── Nodes and lines ─────────────────────────────────────────────────

	private isLit(...ids: (string | undefined)[]): boolean {
		return !!this.highlightedRuleId && ids.includes(this.highlightedRuleId);
	}

	/** How a node reads in a sentence: "in one victory round", "any of these". */
	private nodePhrase(node: RuleGraphNode): string {
		if (node.kind !== 'round')
			return node.kind === 'any' ? 'any of these' : 'all of these';

		const round = node.rule?.type === 'round' ? node.rule : undefined;
		const statuses = round && !allRoundStatuses.every(status => round.statuses.includes(status))
			? ` ${ round.statuses.map(status => achievementRoundStatusLabels[status].toLowerCase()).join(' or ') }`
			: '';

		return `in ${ round?.quantifier === 'all' ? 'every' : 'one' }${ statuses } round`;
	}

	/**
	 * A folded block's line reads out what the block holds. An unfolded block is shown right
	 * next to its line, so the line stays empty instead of repeating it.
	 */
	private branchSummary(line: Extract<RuleGraphLine, { kind: 'branch'; }>): string {
		const node = this.nodeById(line.nodeId);
		if (!node || !this.collapsed.has(node.id))
			return '';

		const phrases = node.lines.map(child => {
			if (child.kind === 'leaf')
				return describeLeaf(child.rule, this.binding);

			const childNode = this.nodeById(child.nodeId);

			return childNode ? `${ this.nodePhrase(childNode) } …` : '…';
		});

		return `${ this.nodePhrase(node) }: ${ phrases.join(node.joiner === 'or' ? ', or ' : ', ') }`;
	}

	private renderLine(node: RuleGraphNode, line: RuleGraphLine, index: number): TemplateResult {
		const negated = line.negationIds.length > 0;
		const lit = this.isLit(line.outerId, line.rule.id);
		const summary = this.canvas.scale < summaryZoom;

		const content = line.kind === 'leaf'
			? summary
				? html`<span>${ describeLeaf(line.rule, this.binding) }</span>`
				: renderSentence(line.rule, {
					parameters: this.parameters,
					binding:    this.binding,
					scope:      line.scope,
					readOnly:   this.readOnly,
					update:     rule => this.emitRule(updateRule(this.rule, rule.id, rule)),
				})
			: html`<span class="branch-summary">${ this.branchSummary(line) }</span>`;

		return html`
			<div
				class="sline ${ line.kind === 'branch' ? 'sline--branch' : '' } ${ lit ? 'sline--lit' : '' }"
				data-line-id=${ line.outerId }
				data-wire-to=${ line.kind === 'branch' && !this.collapsed.has(line.nodeId) ? line.nodeId : nothing }
				@mouseenter=${ () => this.emitRuleId(ruleHighlightEventName, line.outerId) }
				@mouseleave=${ () => this.emitRuleId(ruleHighlightEventName, '') }
				@click=${ (event: MouseEvent) => {
					if (!(event.target as Element).closest('button, select, input, aa-hit-target-chip'))
						this.emitRuleId(ruleSelectEventName, line.outerId);
				} }
			>
				<span class="conj">${ index > 0 ? node.joiner : '' }</span>
				<span class="say">
					${ negated ? html`<span class="not-flag">not</span>` : nothing }
					${ content }
				</span>
				<span class="line-actions">
					${ line.kind === 'branch'
						? html`
							<button
								type="button"
								class="icon-button"
								aria-expanded=${ String(!this.collapsed.has(line.nodeId)) }
								aria-label=${ this.collapsed.has(line.nodeId) ? 'Show this block' : 'Fold this block away' }
								title=${ this.collapsed.has(line.nodeId) ? 'Show' : 'Fold away' }
								@click=${ () => this.toggleCollapsed(line.nodeId) }
							>${ this.collapsed.has(line.nodeId) ? '▸' : '◂' }</button>
						`
						: nothing }
					${ this.readOnly
						? nothing
						: html`
							<button
								type="button"
								class="icon-button menu-button"
								aria-label="Line actions"
								aria-haspopup="menu"
								@click=${ (event: MouseEvent) =>
									void this.openMenu({ kind: 'line', node, line, index }, event.currentTarget as HTMLElement) }
							>⋯</button>
						` }
				</span>
			</div>
		`;
	}

	private renderRoundControls(node: RuleGraphNode): TemplateResult | typeof nothing {
		const round = node.rule?.type === 'round' ? node.rule : undefined;
		if (!round)
			return nothing;

		const toggleStatus = (status: AchievementRoundStatus): void => this.emitRule(updateRule(this.rule, round.id, {
			statuses: round.statuses.includes(status)
				? round.statuses.filter(item => item !== status)
				: allRoundStatuses.filter(item => item === status || round.statuses.includes(item)),
		}));

		return html`
			<div class="round-controls" ?inert=${ this.readOnly }>
				<select
					class="chip-select"
					aria-label="Which rounds"
					@change=${ (event: Event) => this.emitRule(updateRule(this.rule, round.id, {
						quantifier: (event.currentTarget as HTMLSelectElement).value as 'any' | 'all',
					})) }
				>
					<option value="any" ?selected=${ round.quantifier === 'any' }>one round</option>
					<option value="all" ?selected=${ round.quantifier === 'all' }>every round</option>
				</select>
				<span class="muted">that is</span>
				<span class="status-toggles" role="group" aria-label="Round statuses">
					${ allRoundStatuses.map(status => html`
						<button
							type="button"
							aria-pressed=${ String(round.statuses.includes(status)) }
							@click=${ () => toggleStatus(status) }
						>${ achievementRoundStatusLabels[status] }</button>
					`) }
				</span>
			</div>
		`;
	}

	private renderNode(node: RuleGraphNode): TemplateResult {
		const negated = node.negationIds.length > 0;
		const lit = this.isLit(node.id, node.parentLineId);

		return html`
			<article
				class="snode snode--${ node.kind } ${ negated ? 'snode--negated' : '' } ${ lit ? 'snode--lit' : '' }"
				data-node-id=${ node.id }
			>
				${ negated ? html`<div class="notbar">${ negationTitle(node) }</div>` : nothing }
				<header>
					<span class="gtag gtag--${ node.kind }">${ nodeTitle(node) }</span>
					<span class="sp"></span>
					${ !this.readOnly && node.rule
						? html`
							<button
								type="button"
								class="icon-button menu-button"
								aria-label="Block actions"
								aria-haspopup="menu"
								@click=${ (event: MouseEvent) =>
									void this.openMenu({ kind: 'node', node }, event.currentTarget as HTMLElement) }
							>⋯</button>
						`
						: nothing }
				</header>
				${ this.renderRoundControls(node) }
				<div class="lines">
					${ node.lines.length > 0
						? node.lines.map((line, index) => this.renderLine(node, line, index))
						: html`<p class="empty">${ this.readOnly ? 'No conditions.' : 'Add the first condition.' }</p>` }
				</div>
				${ this.readOnly
					? nothing
					: html`
						<div class="foot">
							<button
								type="button"
								class="add-button"
								aria-haspopup="menu"
								@click=${ (event: MouseEvent) => void this.openAddMenu(node, event.currentTarget as HTMLElement) }
							>+ Add condition</button>
							<span class="muted">${ joinerHint(node) }</span>
						</div>
					` }
			</article>
		`;
	}

	private renderBranch(node: RuleGraphNode): TemplateResult {
		const children = node.lines
			.filter((line): line is Extract<RuleGraphLine, { kind: 'branch'; }> => line.kind === 'branch')
			.filter(line => !this.collapsed.has(line.nodeId))
			.map(line => this.nodeById(line.nodeId))
			.filter((child): child is RuleGraphNode => !!child);

		return html`
			<div class="branch">
				${ this.renderNode(node) }
				${ children.length > 0
					? html`<div class="children">${ children.map(child => this.renderBranch(child)) }</div>`
					: nothing }
			</div>
		`;
	}

	// ── Wires ───────────────────────────────────────────────────────────

	/** Draws a wire from each branch line to its node, in unscaled graph coordinates. */
	private drawWires(): void {
		const graph = this.graphElement;
		const layer = graph?.querySelector<SVGSVGElement>('svg.wires');
		if (!graph || !layer)
			return;

		const origin = graph.getBoundingClientRect();
		const scale = this.canvas.scale || 1;
		const paths: string[] = [];
		graph.querySelectorAll<HTMLElement>('[data-wire-to]').forEach(line => {
			const target = graph.querySelector<HTMLElement>(`[data-node-id="${ CSS.escape(line.dataset['wireTo'] ?? '') }"]`);
			const header = target?.querySelector('header');
			if (!target || !header)
				return;

			const from = line.getBoundingClientRect();
			const to = header.getBoundingClientRect();
			const x1 = (from.right - origin.left) / scale;
			const y1 = (from.top + from.height / 2 - origin.top) / scale;
			const x2 = (target.getBoundingClientRect().left - origin.left) / scale;
			const y2 = (to.top + to.height / 2 - origin.top) / scale;
			const middle = (x1 + x2) / 2;
			paths.push(`M${ x1 } ${ y1 } C${ middle } ${ y1 } ${ middle } ${ y2 } ${ x2 } ${ y2 }`);
		});

		layer.setAttribute('width', String(graph.offsetWidth));
		layer.setAttribute('height', String(graph.offsetHeight));
		layer.innerHTML = paths.map(path => `<path d="${ path }"></path>`).join('');
	}

	// ── Canvas ──────────────────────────────────────────────────────────

	private handlePointerDown(event: PointerEvent): void {
		if (event.button !== 0)
			return;

		const onControl = event.composedPath()
			.some(item => item instanceof Element && item.matches('button, select, input, aa-hit-target-chip, .snode'));
		if (!onControl)
			this.canvas.startDrag(event);
	}

	override render(): TemplateResult {
		const root = this.nodeById(this.graph.rootId);

		return html`
			<div
				class="viewport ${ this.canvas.dragging ? 'viewport--dragging' : '' }"
				tabindex="0"
				aria-label="Unlock rule canvas"
				@wheel=${ this.canvas.handleWheel }
				@pointerdown=${ this.handlePointerDown }
				@pointermove=${ this.canvas.handlePointerMove }
				@pointerup=${ this.canvas.handlePointerUp }
				@pointercancel=${ this.canvas.handlePointerUp }
				@lostpointercapture=${ this.canvas.handlePointerUp }
			>
				<div class="stage" style="transform: ${ this.canvas.transform };">
					<div class="graph ${ this.canvas.scale < summaryZoom ? 'graph--summary' : '' }">
						<svg class="wires" aria-hidden="true"></svg>
						${ root ? this.renderBranch(root) : nothing }
					</div>
				</div>
				<div class="zoom" aria-label="Zoom">
					<button type="button" aria-label="Zoom out" @click=${ () => this.canvas.zoomBy(-0.1) }>−</button>
					<output>${ Math.round(this.canvas.scale * 100) }%</output>
					<button type="button" aria-label="Zoom in" @click=${ () => this.canvas.zoomBy(0.1) }>+</button>
					<button type="button" @click=${ () => this.fit() }>Fit</button>
				</div>
			</div>
			${ this.renderMenu() }
			${ this.renderAddMenu() }
		`;
	}

	static override styles = [ sharedStyles, unsafeCSS(canvasStyles) ];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-sentence-canvas': AaSentenceCanvas;
	}
}
