import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import segmentedControlStyles from './aa-segmented-control.css?inline';

export interface SegmentedControlItem {
	value:  string;
	label:  string;
	/** Optional image shown above the label. */
	icon?:  string;
	title?: string;
}

export type SegmentedControlSize = 'small' | 'medium';

export type SegmentedControlChangeEvent = CustomEvent<string>;

export const segmentedControlChangeEventName = 'segmented-control-change';

@customElement('aa-segmented-control')
export class AaSegmentedControl extends LitElement {

	@property({ attribute: false }) items:           SegmentedControlItem[] = [];
	@property({ type: String }) selected = '';
	@property({ type: String }) label = 'View';
	@property({ type: String, reflect: true }) size: SegmentedControlSize = 'small';
	/** Fill the available width with equally sized segments. */
	@property({ type: Boolean, reflect: true }) stretch = false;
	/** Show only the icons; labels become tooltips and accessible names. */
	@property({ type: Boolean, reflect: true, attribute: 'icon-only' }) iconOnly = false;

	private select(value: string): void {
		if (value === this.selected)
			return;

		this.dispatchEvent(new CustomEvent<string>(segmentedControlChangeEventName, {
			bubbles:  true,
			composed: true,
			detail:   value,
		}));
	}

	override render(): TemplateResult {
		return html`
			<div class="segmented-control" role="group" aria-label=${ this.label }>
				${ this.items.map(item => {
					const iconOnly = this.iconOnly && !!item.icon;

					return html`
						<button
							type="button"
							title=${ item.title ?? (iconOnly ? item.label : nothing) }
							aria-label=${ iconOnly ? item.label : nothing }
							aria-pressed=${ item.value === this.selected }
							@click=${ () => this.select(item.value) }
						>
							${ item.icon ? html`<img src=${ item.icon } alt="" />` : nothing }
							${ iconOnly ? nothing : html`<span>${ item.label }</span>` }
						</button>
					`;
				}) }
			</div>
		`;
	}

	static override styles = unsafeCSS(segmentedControlStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-segmented-control': AaSegmentedControl;
	}

	interface HTMLElementEventMap {
		[segmentedControlChangeEventName]: SegmentedControlChangeEvent;
	}
}
