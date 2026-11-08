import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { slotHasContent } from '../slot-utils.js';
import errorStateStyles from './aa-error-state.css?inline';

@customElement('aa-error-state')
export class AaErrorState extends LitElement {

	@property({ type: String }) heading = 'Something went wrong';
	@property({ type: String }) message = '';
	@state() private hasActions = false;

	override render(): TemplateResult {
		return html`
			<section class="error-state" role="alert">
				<div class="icon" aria-hidden="true">
					<slot name="icon">!</slot>
				</div>
				<h2>${ this.heading }</h2>
				<div class="message">
					${ this.message ? html`<p>${ this.message }</p>` : nothing }
					<slot></slot>
				</div>
				<div class="actions" ?hidden=${ !this.hasActions }>
					<slot name="actions" @slotchange=${ this.handleActionsSlotChange }></slot>
				</div>
			</section>
		`;
	}

	private handleActionsSlotChange(event: Event): void {
		this.hasActions = slotHasContent(event);
	}

	static override styles = unsafeCSS(errorStateStyles);

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-error-state': AaErrorState;
	}
}
