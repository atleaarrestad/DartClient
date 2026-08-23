import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import playerChipStyles from './aa-player-chip.css?inline';

@customElement('aa-player-chip')
export class AaPlayerChip extends LitElement {

	@property({ type: Boolean, reflect: true }) compact = false;
	@property({ type: Boolean, reflect: true }) empty = false;

	override render(): TemplateResult {
		return html`<span class="chip"><slot></slot></span>`;
	}

	static override styles = unsafeCSS(playerChipStyles);

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-player-chip': AaPlayerChip;
	}
}
