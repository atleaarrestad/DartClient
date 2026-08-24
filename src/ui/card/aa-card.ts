import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import cardStyles from './aa-card.css?inline';

export type AaCardVariant = 'flat' | 'raised' | 'interactive';

@customElement('aa-card')
export class AaCard extends LitElement {

	@property({ type: String, reflect: true }) variant: AaCardVariant = 'flat';
	@state() private hasHeader = false;
	@state() private hasFooter = false;

	override render(): TemplateResult {
		return html`
			<article class="card" data-variant=${ this.variant } part="card">
				<header ?hidden=${ !this.hasHeader }>
					<slot name="header" @slotchange=${ this.handleHeaderSlotChange }></slot>
				</header>
				<div class="content" part="content">
					<slot></slot>
				</div>
				<footer ?hidden=${ !this.hasFooter }>
					<slot name="footer" @slotchange=${ this.handleFooterSlotChange }></slot>
				</footer>
			</article>
		`;
	}

	private handleHeaderSlotChange(event: Event): void {
		this.hasHeader = this.slotHasContent(event);
	}

	private handleFooterSlotChange(event: Event): void {
		this.hasFooter = this.slotHasContent(event);
	}

	private slotHasContent(event: Event): boolean {
		const slot = event.currentTarget as HTMLSlotElement;

		return slot.assignedNodes({ flatten: true })
			.some(node => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
	}

	static override styles = unsafeCSS(cardStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-card': AaCard;
	}
}
