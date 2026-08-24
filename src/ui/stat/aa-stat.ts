import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import statStyles from './aa-stat.css?inline';

@customElement('aa-stat')
export class AaStat extends LitElement {

	@property({ type: String }) label = '';
	@property({ type: String }) value = '';
	@property({ type: Boolean, reflect: true }) compact = false;

	override render(): TemplateResult {
		return html`
			<dl class="stat" part="stat">
				<dt part="label">
					<slot name="label">${ this.label }</slot>
				</dt>
				<dd part="value">
					<slot name="value">${ this.value }</slot>
				</dd>
			</dl>
		`;
	}

	static override styles = unsafeCSS(statStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-stat': AaStat;
	}
}
