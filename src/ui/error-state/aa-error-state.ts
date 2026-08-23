import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import errorStateStyles from './aa-error-state.css?inline';

@customElement('aa-error-state')
export class AaErrorState extends LitElement {

	@property({ type: String }) override title = 'Something went wrong';
	@property({ type: String }) message = '';
	@state() private hasActions = false;

	override render(): TemplateResult {
		return html`
			<section class="error-state" role="alert">
				<div class="icon" aria-hidden="true">
					<slot name="icon">!</slot>
				</div>
				<h2>${ this.title }</h2>
				<div class="message">
					<slot>${ this.message }</slot>
				</div>
				<div class="actions" ?hidden=${ !this.hasActions }>
					<slot name="actions" @slotchange=${ this.handleActionsSlotChange }></slot>
				</div>
			</section>
		`;
	}

	private handleActionsSlotChange(event: Event): void {
		const slot = event.currentTarget as HTMLSlotElement;
		this.hasActions = slot.assignedNodes({ flatten: true })
			.some(node => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
	}

	static override styles = unsafeCSS(errorStateStyles);

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-error-state': AaErrorState;
	}
}
