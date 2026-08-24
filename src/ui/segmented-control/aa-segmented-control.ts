import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import segmentedControlStyles from './aa-segmented-control.css?inline';

export interface SegmentedControlItem {
	value: string;
	label: string;
}

export type SegmentedControlChangeEvent = CustomEvent<string>;

export const segmentedControlChangeEventName = 'segmented-control-change';

@customElement('aa-segmented-control')
export class AaSegmentedControl extends LitElement {

	@property({ attribute: false }) items: SegmentedControlItem[] = [];
	@property({ type: String }) selected = '';
	@property({ type: String }) label = 'View';

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
				${ this.items.map(item => html`
					<button
						type="button"
						aria-pressed=${ item.value === this.selected }
						@click=${ () => this.select(item.value) }
					>
						${ item.label }
					</button>
				`) }
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
