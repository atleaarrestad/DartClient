import './aa-rule-readout.js';
import '../progression/aa-progression-board-editor.js';
import '../rule-text/aa-rule-text-editor.js';
import '../sentence-canvas/aa-sentence-canvas.js';
import '../variant-rules/aa-variant-rules-editor.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import type { AchievementTemplatePreview } from '../../../models/achievementBuilder.js';
import {
	AchievementParameterDraft,
	AchievementProgressionDraft,
	AchievementRuleDraft,
	AchievementScope,
	AchievementSkipRuleDraft,
	AchievementTierRuleDraft,
	createDefaultAchievementProgression,
	createDefaultAchievementRule,
} from '../../../models/achievementBuilder.js';
import type { AaRuleTextEditor } from '../rule-text/aa-rule-text-editor.js';
import type { AaSentenceCanvas } from '../sentence-canvas/aa-sentence-canvas.js';
import ruleWorkspaceStyles from './aa-rule-workspace.css?inline';
import { buildProgressionReadout, buildRuleReadout, Readout } from './rule-readout.js';

type ViewMode = 'blocks' | 'split' | 'text';

const viewModes: readonly { id: ViewMode; label: string; }[] = [
	{ id: 'blocks', label: 'Blocks' },
	{ id: 'split', label: 'Split' },
	{ id: 'text', label: 'Text' },
];

const readoutStorageKey = 'aa-rule-workspace:readout-open';

const readStorage = (key: string): string | null => {
	try {
		return localStorage.getItem(key);
	}
	catch {
		return null;
	}
};

const writeStorage = (key: string, value: string): void => {
	try {
		localStorage.setItem(key, value);
	}
	catch {
		// The choice is a convenience; without storage it resets next time.
	}
};

/**
 * Where the unlock rule and the tiers are edited: the readout, then blocks, text or both side
 * by side. The blocks side has the tier panel above the rule; the text has them as `tier` and
 * `skip` lines. Owns which generated achievement is previewed and which rule is highlighted;
 * every view reports edits with the builder's `achievement-logic-change` event.
 */
@customElement('aa-rule-workspace')
export class AaRuleWorkspace extends LitElement {

	@property({ attribute: false }) rule:         AchievementRuleDraft = createDefaultAchievementRule();
	@property({ attribute: false }) progression?: AchievementProgressionDraft;
	@property({ attribute: false }) parameters:   readonly AchievementParameterDraft[] = [];
	@property({ attribute: false }) previews:     readonly AchievementTemplatePreview[] = [];
	@property({ type: String }) achievementScope: AchievementScope = 'session';
	@property({ type: Number }) tier = 1;
	@property({ attribute: false }) tierRules:    readonly AchievementTierRuleDraft[] = [];
	@property({ attribute: false }) skipRules:    readonly AchievementSkipRuleDraft[] = [];
	@property({ type: Boolean }) readOnly = false;

	/** Opens in Split: blocks to add structure, text to tweak values. */
	@state() private viewMode: ViewMode = 'split';
	@state() private readoutOpen = readStorage(readoutStorageKey) !== 'false';
	@state() private previewIndex = 0;
	@state() private highlightedRuleId = '';

	@query('aa-rule-text-editor') private textEditor?: AaRuleTextEditor;
	@query('aa-sentence-canvas') private canvas?:      AaSentenceCanvas;

	/** Moves keyboard focus into the rule, e.g. after clicking a rule error. */
	focusEditor(): void {
		if (this.canvas)
			this.canvas.focusViewport();
		else
			this.textEditor?.focus();
	}

	protected override willUpdate(changed: PropertyValues<this>): void {
		if (changed.has('previews') && this.previewIndex >= this.previews.length)
			this.previewIndex = 0;
	}

	private get isProgression(): boolean {
		return this.achievementScope === 'progression';
	}

	private get binding(): AchievementTemplatePreview['bindings'] | undefined {
		return this.previews[this.previewIndex]?.bindings;
	}

	private get readout(): Readout {
		if (this.isProgression) {
			const progression = this.progression ?? createDefaultAchievementProgression();

			return buildProgressionReadout(progression.statuses, progression.targets, this.binding);
		}

		return buildRuleReadout(this.rule, this.binding);
	}

	private setViewMode(mode: ViewMode): void {
		this.viewMode = mode;
	}

	private toggleReadout(): void {
		this.readoutOpen = !this.readoutOpen;
		writeStorage(readoutStorageKey, String(this.readoutOpen));
	}

	private handleHighlight(event: CustomEvent<{ ruleId: string; }>): void {
		event.stopPropagation();
		this.highlightedRuleId = event.detail.ruleId;
	}

	private handleSelect(event: CustomEvent<{ ruleId: string; }>): void {
		event.stopPropagation();
		this.textEditor?.revealRule(event.detail.ruleId);
	}

	private renderLogicBlocks(): TemplateResult {
		if (this.isProgression) {
			return html`
				<aa-progression-board-editor
					class="logic"
					.progression=${ this.progression }
					.parameters=${ this.parameters }
					.binding=${ this.binding }
					?readOnly=${ this.readOnly }
				></aa-progression-board-editor>
			`;
		}

		return html`
			<aa-sentence-canvas
				class="logic"
				.rule=${ this.rule }
				.parameters=${ this.parameters }
				.binding=${ this.binding }
				.highlightedRuleId=${ this.highlightedRuleId }
				?readOnly=${ this.readOnly }
				@rule-select=${ this.handleSelect }
			></aa-sentence-canvas>
		`;
	}

	private renderBlocks(): TemplateResult {
		return html`
			<div class="pane blocks">
				<aa-variant-rules-editor
					.tier=${ this.tier }
					.tierRules=${ this.tierRules }
					.skipRules=${ this.skipRules }
					.parameters=${ this.parameters }
					?readOnly=${ this.readOnly }
				></aa-variant-rules-editor>
				${ this.renderLogicBlocks() }
			</div>
		`;
	}

	private renderText(): TemplateResult {
		return html`
			<aa-rule-text-editor
				class="pane"
				.rule=${ this.rule }
				.progression=${ this.progression }
				.achievementScope=${ this.achievementScope }
				.parameters=${ this.parameters }
				.binding=${ this.binding }
				.tier=${ this.tier }
				.tierRules=${ this.tierRules }
				.skipRules=${ this.skipRules }
				?readOnly=${ this.readOnly }
			></aa-rule-text-editor>
		`;
	}

	override render(): TemplateResult {
		return html`
			<div class="workspace" @rule-highlight=${ this.handleHighlight }>
				<header class="toolbar">
					<slot name="toolbar-start"></slot>
					<h3>${ this.isProgression ? 'Targets to collect' : 'Unlock rule' }</h3>
					<button
						type="button"
						class="toggle"
						aria-pressed=${ String(this.readoutOpen) }
						title="Show the rule written out in words"
						@click=${ this.toggleReadout }
					>In words</button>
					<span class="sp"></span>
					<div class="modes" role="group" aria-label="Show the rule as">
						${ viewModes.map(mode => html`
							<button
								type="button"
								aria-pressed=${ String(mode.id === this.viewMode) }
								@click=${ () => this.setViewMode(mode.id) }
							>${ mode.label }</button>
						`) }
					</div>
				</header>
				${ this.readoutOpen
					? html`
						<aa-rule-readout
							.readout=${ this.readout }
							.previews=${ this.previews }
							.previewIndex=${ this.previewIndex }
							.highlightedRuleId=${ this.highlightedRuleId }
							@readout-preview-change=${ (event: CustomEvent<number>) => {
								this.previewIndex = event.detail;
							} }
						></aa-rule-readout>
					`
					: nothing }
				<div class="body body--${ this.viewMode }">
					${ this.viewMode === 'blocks' ? nothing : this.renderText() }
					${ this.viewMode === 'text' ? nothing : this.renderBlocks() }
				</div>
			</div>
		`;
	}

	static override styles = unsafeCSS(ruleWorkspaceStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-rule-workspace': AaRuleWorkspace;
	}
}
