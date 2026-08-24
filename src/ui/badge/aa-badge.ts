import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import badgeStyles from './aa-badge.css?inline';

export type AaBadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

@customElement('aa-badge')
export class AaBadge extends LitElement {

	@property({ type: String, reflect: true }) variant: AaBadgeVariant = 'neutral';
	@property({ type: Boolean, reflect: true }) pill = false;

	override render(): TemplateResult {
		return html`
			<span class="badge" data-variant=${ this.variant } part="badge">
				<slot></slot>
			</span>
		`;
	}

	static override styles = unsafeCSS(badgeStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-badge': AaBadge;
	}
}
