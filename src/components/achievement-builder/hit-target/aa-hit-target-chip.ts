import './aa-hit-target-picker.js';
import '../../../ui/dartboard/aa-dartboard.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import type { AchievementParameterDraft } from '../../../models/achievementBuilder.js';
import { hidePopover, showPopoverAt } from '../../../ui/anchored-popover.js';
import type { ParameterBinding } from '../achievement-draft.js';
import hitTargetChipStyles from './aa-hit-target-chip.css?inline';
import { hitTargetChangeEventName } from './aa-hit-target-picker.js';
import {
	describeTarget,
	formatTargetLabel,
	getTargetBoardZones,
	HitTarget,
	HitTargetContextId,
} from './hit-target.js';

const hoverDelay = 300;

/**
 * A hit location in a sentence line. Hovering (or focusing) shows where it is on a small
 * board; clicking opens the board picker.
 */
@customElement('aa-hit-target-chip')
export class AaHitTargetChip extends LitElement {

	@property({ attribute: false }) target:     HitTarget = { throwType: 'any' };
	@property({ type: String }) context:        HitTargetContextId = 'throw';
	@property({ attribute: false }) parameters: readonly AchievementParameterDraft[] = [];
	@property({ attribute: false }) binding?:   ParameterBinding;
	@property({ type: Boolean }) readOnly = false;
	@property({ type: Boolean }) removable = false;

	@query('.chip') private chip?:       HTMLButtonElement;
	@query('.preview') private preview?: HTMLElement;
	@query('.picker') private picker?:   HTMLElement;

	private hoverTimer?: number;

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		window.clearTimeout(this.hoverTimer);
	}

	private showPreview(): void {
		window.clearTimeout(this.hoverTimer);
		this.hoverTimer = window.setTimeout(() => {
			if (this.preview && this.chip && !this.picker?.matches(':popover-open'))
				showPopoverAt(this.preview, this.chip);
		}, hoverDelay);
	}

	private hidePreview(): void {
		window.clearTimeout(this.hoverTimer);
		hidePopover(this.preview);
	}

	private openPicker(): void {
		this.hidePreview();
		if (this.readOnly || !this.picker || !this.chip)
			return;

		showPopoverAt(this.picker, this.chip);
	}

	/** The picker grows and shrinks with its content, so keep it next to the chip. */
	private handlePickerChange(): void {
		void this.updateComplete.then(() => {
			if (this.picker?.matches(':popover-open') && this.chip)
				showPopoverAt(this.picker, this.chip);
		});
	}

	override render(): TemplateResult {
		const label = formatTargetLabel(this.target);

		return html`
			<button
				type="button"
				class="chip"
				aria-haspopup=${ this.readOnly ? 'false' : 'dialog' }
				aria-label=${ `${ label }: ${ describeTarget(this.target, this.binding) }` }
				@click=${ this.openPicker }
				@mouseenter=${ this.showPreview }
				@mouseleave=${ this.hidePreview }
				@focus=${ this.showPreview }
				@blur=${ this.hidePreview }
			>
				<span class="icon" aria-hidden="true"></span>
				${ label }
			</button>
			<div class="preview" popover="manual" aria-hidden="true">
				<aa-dartboard .zones=${ getTargetBoardZones(this.target, this.binding) }></aa-dartboard>
				<span><b>${ describeTarget(this.target, this.binding) }</b></span>
			</div>
			<div
				class="picker"
				popover="auto"
				role="dialog"
				aria-label="Pick a target"
				@hit-target-done=${ () => hidePopover(this.picker) }
				@hit-target-remove=${ () => hidePopover(this.picker) }
				@hit-target-change=${ this.handlePickerChange }
			>
				<aa-hit-target-picker
					.target=${ this.target }
					.context=${ this.context }
					.parameters=${ this.parameters }
					.binding=${ this.binding }
					?removable=${ this.removable }
				></aa-hit-target-picker>
			</div>
		`;
	}

	static override styles = unsafeCSS(hitTargetChipStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-hit-target-chip': AaHitTargetChip;
	}

	interface HTMLElementEventMap {
		[hitTargetChangeEventName]: CustomEvent<HitTarget>;
	}
}
