import '../../../ui/dartboard/aa-dartboard.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import {
	AchievementParameterDraft,
	AchievementProgressionDraft,
	AchievementRuleDraft,
	AchievementScope,
	createDefaultAchievementProgression,
	createDefaultAchievementRule,
} from '../../../models/achievementBuilder.js';
import type { ParameterBinding } from '../achievement-draft.js';
import { describeTarget, getTargetBoardZones } from '../hit-target/hit-target.js';
import { ruleChangeEventName, ruleHighlightEventName } from '../rule-events.js';
import ruleTextEditorStyles from './aa-rule-text-editor.css?inline';
import {
	collectRawRules,
	isSameStructure,
	reconcileRuleIds,
	reconcileTargetIds,
} from './rule-structure.js';
import type { RuleTextEditorHandle } from './rule-text-codemirror.js';
import { getRuleTextCompletions } from './rule-text-completions.js';
import {
	hasErrors,
	parseProgressionText,
	parseRuleText,
	parseTargetText,
	RuleTextDiagnostic,
} from './rule-text-parser.js';
import { printProgressionText, printRuleText, RuleTextRange } from './rule-text-printer.js';

const parseDelay = 250;
const targetAtPattern = /(?:DBull|Bull|[SDT]?(?:\d+|\{[^}\n]*\}))/g;

/**
 * Rule text in a code editor, in two-way sync with the rule tree. Typing is parsed after a
 * short pause; text with errors never replaces the rule, and a clean parse only emits a change
 * when the rule really differs. Edits made elsewhere (the canvas) are printed back.
 */
@customElement('aa-rule-text-editor')
export class AaRuleTextEditor extends LitElement {

	@property({ attribute: false }) rule:         AchievementRuleDraft = createDefaultAchievementRule();
	@property({ attribute: false }) progression?: AchievementProgressionDraft;
	@property({ type: String }) achievementScope: AchievementScope = 'session';
	@property({ attribute: false }) parameters:   readonly AchievementParameterDraft[] = [];
	@property({ attribute: false }) binding?:     ParameterBinding;
	@property({ type: Boolean }) readOnly = false;

	@state() private diagnostics: readonly RuleTextDiagnostic[] = [];
	@state() private loadError = '';
	@state() private copied = false;

	@query('.editor-host') private host?: HTMLElement;

	private editor?:      RuleTextEditorHandle;
	private ranges:       Map<string, RuleTextRange> = new Map();
	/** The rule or progression this editor emitted last; its echo must not reprint the text. */
	private lastEmitted?: unknown;
	private parseTimer?:  number;

	private get isProgression(): boolean {
		return this.achievementScope === 'progression';
	}

	private get currentProgression(): AchievementProgressionDraft {
		return this.progression ?? createDefaultAchievementProgression();
	}

	/** Advanced progression logic has no text form. */
	private get isRawProgression(): boolean {
		return this.isProgression && !!this.currentProgression.raw;
	}

	private print(): string {
		if (this.isRawProgression)
			return 'Advanced progression logic can\'t be shown as text.';

		const result = this.isProgression
			? printProgressionText(this.currentProgression)
			: printRuleText(this.rule);
		this.ranges = result.ranges;

		return result.text;
	}

	protected override async firstUpdated(): Promise<void> {
		try {
			const { createRuleTextEditor } = await import('./rule-text-codemirror.js');
			if (!this.host || !this.shadowRoot)
				return;

			this.editor = createRuleTextEditor(this.host, this.shadowRoot, {
				text:     this.print(),
				readOnly: this.readOnly || this.isRawProgression,
			}, {
				onTextChange: text => this.scheduleParse(text),
				onCursor:     position => this.highlightAt(position),
				complete:     (text, position) => getRuleTextCompletions(text, position, {
					parameters:   this.parameters,
					documentKind: this.isProgression ? 'progression' : 'rule',
				}),
				hover: (text, position) => this.targetTooltip(text, position),
			});
		}
		catch (error) {
			this.loadError = error instanceof Error ? error.message : 'The text editor could not be loaded.';
		}
	}

	protected override updated(changed: PropertyValues<this>): void {
		if (!this.editor)
			return;

		if (changed.has('readOnly') || changed.has('progression') || changed.has('achievementScope'))
			this.editor.setReadOnly(this.readOnly || this.isRawProgression);

		const source = this.isProgression ? this.progression : this.rule;
		const sourceChanged = changed.has('rule') || changed.has('progression') || changed.has('achievementScope');
		if (sourceChanged && source !== this.lastEmitted) {
			window.clearTimeout(this.parseTimer);
			this.diagnostics = [];
			this.editor.setText(this.print());
			this.editor.setDiagnostics([]);
		}
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		window.clearTimeout(this.parseTimer);
		this.editor?.destroy();
		this.editor = undefined;
	}

	/** Selects where a rule is written, e.g. when its line is clicked on the canvas. */
	revealRule(ruleId: string): void {
		const range = this.ranges.get(ruleId);
		if (range)
			this.editor?.select(range.from, range.to);
	}

	private scheduleParse(text: string): void {
		window.clearTimeout(this.parseTimer);
		this.parseTimer = window.setTimeout(() => this.parse(text), parseDelay);
	}

	private parse(text: string): void {
		const context = { parameters: this.parameters, rawRules: collectRawRules(this.rule) };
		if (this.isProgression) {
			const result = parseProgressionText(text, context);
			this.applyDiagnostics(result.diagnostics);
			if (!result.value || hasErrors(result.diagnostics))
				return;

			this.ranges = result.ranges;
			const current = this.currentProgression;
			const targets = reconcileTargetIds(current.targets, result.value.targets);
			const before = { statuses: current.statuses, targets: current.targets };
			if (isSameStructure(before, { statuses: result.value.statuses, targets }))
				return;

			this.emit({ progression: { ...current, statuses: result.value.statuses, targets } });

			return;
		}

		const result = parseRuleText(text, context);
		this.applyDiagnostics(result.diagnostics);
		if (!result.value || hasErrors(result.diagnostics))
			return;

		const rule = reconcileRuleIds(this.rule, result.value);
		this.ranges = reconcileRanges(result.ranges, result.value, rule);
		if (!isSameStructure(rule, this.rule))
			this.emit({ rule });
	}

	private applyDiagnostics(diagnostics: RuleTextDiagnostic[]): void {
		this.diagnostics = diagnostics;
		this.editor?.setDiagnostics(diagnostics);
	}

	private emit(detail: { rule?: AchievementRuleDraft; progression?: AchievementProgressionDraft; }): void {
		this.lastEmitted = detail.rule ?? detail.progression;
		this.dispatchEvent(new CustomEvent(ruleChangeEventName, { detail, bubbles: true, composed: true }));
	}

	/** Highlights the innermost rule written at the cursor. */
	private highlightAt(position: number): void {
		let best: { id: string; size: number; } | undefined;
		this.ranges.forEach((range, id) => {
			const size = range.to - range.from;
			if (position >= range.from && position <= range.to && id !== this.rule.id && (!best || size < best.size))
				best = { id, size };
		});
		this.dispatchEvent(new CustomEvent(ruleHighlightEventName, {
			detail:   { ruleId: best?.id ?? '' },
			bubbles:  true,
			composed: true,
		}));
	}

	/** A small board for the target under the pointer, such as T{n} or D16. */
	private targetTooltip(text: string, position: number): { from: number; to: number; dom: HTMLElement; } | undefined {
		for (const match of text.matchAll(targetAtPattern)) {
			const from = match.index;
			const to = from + match[0].length;
			if (position < from || position > to)
				continue;

			const { target } = parseTargetText(match[0], this.isProgression ? 'progression' : 'throw', this.parameters);
			if (!target)
				return undefined;

			const dom = document.createElement('div');
			dom.style.cssText = 'display:grid;gap:4px;justify-items:center;padding:8px;width:196px;font-size:13px';
			const board = document.createElement('aa-dartboard');
			board.style.width = '180px';
			board.zones = getTargetBoardZones(target, this.binding);
			const caption = document.createElement('b');
			caption.textContent = describeTarget(target, this.binding);
			dom.append(board, caption);

			return { from, to, dom };
		}

		return undefined;
	}

	private async copyText(): Promise<void> {
		try {
			await navigator.clipboard.writeText(this.print());
			this.copied = true;
			window.setTimeout(() => {
				this.copied = false;
			}, 1500);
		}
		catch {
			this.copied = false;
		}
	}

	private renderSyncState(): TemplateResult {
		const plural = (count: number, noun: string): string => `${ count } ${ noun }${ count === 1 ? '' : 's' }`;
		const errors = this.diagnostics.filter(diagnostic => diagnostic.severity === 'error').length;
		const warnings = this.diagnostics.length - errors;

		if (this.readOnly)
			return html`<span>Read-only</span>`;
		if (errors > 0)
			return html`<span class="bad">${ plural(errors, 'error') } · the blocks show the last valid version</span>`;
		if (warnings > 0)
			return html`<span class="warn">✓ In sync · ${ plural(warnings, 'warning') }</span>`;

		return html`<span class="ok">✓ In sync</span>`;
	}

	private renderStatus(): TemplateResult {
		return html`
			<div class="status">
				${ this.renderSyncState() }
				<span class="sp"></span>
				<button type="button" @click=${ () => void this.copyText() }>${ this.copied ? 'Copied' : 'Copy text' }</button>
			</div>
		`;
	}

	override render(): TemplateResult {
		return html`
			<div class="frame">
				${ this.loadError
					? html`<p class="load-error" role="alert">${ this.loadError }</p>`
					: nothing }
				<div class="editor-host"></div>
				${ this.renderStatus() }
			</div>
		`;
	}

	static override styles = unsafeCSS(ruleTextEditorStyles);

}

/**
 * The parser records ranges under the ids it generated; after `reconcileRuleIds` copied the
 * previous ids onto the tree, the same ranges are keyed by those ids instead.
 */
const reconcileRanges = (
	ranges: Map<string, RuleTextRange>,
	parsed: AchievementRuleDraft,
	reconciled: AchievementRuleDraft,
): Map<string, RuleTextRange> => {
	const result: Map<string, RuleTextRange> = new Map();
	const walk = (left: AchievementRuleDraft, right: AchievementRuleDraft): void => {
		const range = ranges.get(left.id);
		if (range)
			result.set(right.id, range);

		const children = (rule: AchievementRuleDraft): AchievementRuleDraft[] => {
			switch (rule.type) {
			case 'all':
			case 'any':
				return rule.children;
			case 'not':
				return [ rule.child ];
			case 'round':
				return [ rule.condition ];
			default:
				return [];
			}
		};
		const rightChildren = children(right);
		children(left).forEach((child, index) => {
			const match = rightChildren[index];
			if (match)
				walk(child, match);
		});
	};
	walk(parsed, reconciled);

	return result;
};

declare global {
	interface HTMLElementTagNameMap {
		'aa-rule-text-editor': AaRuleTextEditor;
	}
}
