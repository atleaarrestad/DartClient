import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { getAchievementTierIcon } from '../../../helpers/achievementHelper.js';
import { formatTierLabel } from '../../../helpers/achievementVariantRules.js';
import type { AchievementTemplatePreview } from '../../../models/achievementBuilder.js';
import { ruleHighlightEventName } from '../rule-events.js';
import ruleReadoutStyles from './aa-rule-readout.css?inline';
import type { Readout, ReadoutItem } from './rule-readout.js';

export const readoutPreviewChangeEventName = 'readout-preview-change';

/**
 * The unlock rule written out in plain language for one generated achievement, with a picker
 * for which one. Hovering a phrase highlights its rule on the canvas, and the other way round.
 */
@customElement('aa-rule-readout')
export class AaRuleReadout extends LitElement {

	@property({ attribute: false }) readout:  Readout = { intro: '', items: [] };
	@property({ attribute: false }) previews: readonly AchievementTemplatePreview[] = [];
	@property({ type: Number }) previewIndex = 0;
	@property({ type: String }) highlightedRuleId = '';

	private choosePreview(index: number): void {
		const count = this.previews.length;
		if (count === 0)
			return;

		this.dispatchEvent(new CustomEvent<number>(readoutPreviewChangeEventName, {
			detail:   (index + count) % count,
			bubbles:  true,
			composed: true,
		}));
	}

	private highlight(ruleId: string): void {
		this.dispatchEvent(new CustomEvent(ruleHighlightEventName, { detail: { ruleId }, bubbles: true, composed: true }));
	}

	private renderItems(items: readonly ReadoutItem[]): TemplateResult {
		return html`
			<ul>
				${ items.map(item => html`
					<li>
						<span
							class=${ item.ruleId && item.ruleId === this.highlightedRuleId ? 'lit' : '' }
							@mouseenter=${ () => this.highlight(item.ruleId) }
							@mouseleave=${ () => this.highlight('') }
						>${ item.text }</span>
						${ item.children.length > 0 ? this.renderItems(item.children) : nothing }
					</li>
				`) }
			</ul>
		`;
	}

	private renderPicker(): TemplateResult | typeof nothing {
		if (this.previews.length < 2)
			return nothing;

		return html`
			<div class="picker" role="group" aria-label="Preview achievement">
				<button type="button" aria-label="Previous achievement" @click=${ () => this.choosePreview(this.previewIndex - 1) }>
					‹
				</button>
				<select
					aria-label="Achievement to read"
					@change=${ (event: Event) => this.choosePreview(Number((event.currentTarget as HTMLSelectElement).value)) }
				>
					${ this.previews.map((preview, index) => html`
						<option value=${ index } ?selected=${ index === this.previewIndex }>
							${ preview.name || `Achievement ${ index + 1 }` }
						</option>
					`) }
				</select>
				<button type="button" aria-label="Next achievement" @click=${ () => this.choosePreview(this.previewIndex + 1) }>
					›
				</button>
			</div>
		`;
	}

	override render(): TemplateResult {
		const preview = this.previews[this.previewIndex];
		const name = preview?.name || 'this achievement';

		return html`
			<section class="readout" aria-label="The rule in words">
				<div class="top">
					<p class="lead">
						Unlocks
						${ preview
							? html`<img
								class="tier"
								src=${ getAchievementTierIcon(preview.tier) }
								alt=${ formatTierLabel(preview.tier) }
								title=${ formatTierLabel(preview.tier) }
							/>`
							: nothing }
						<b>${ name }</b> ${ this.readout.intro }
					</p>
					${ this.renderPicker() }
				</div>
				${ this.readout.items.length > 0
					? this.renderItems(this.readout.items)
					: html`<p class="muted">No conditions yet.</p>` }
			</section>
		`;
	}

	static override styles = unsafeCSS(ruleReadoutStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-rule-readout': AaRuleReadout;
	}
}
