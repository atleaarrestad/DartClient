import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { slotHasContent } from '../slot-utils.js';
import emptyStateStyles from './aa-empty-state.css?inline';

@customElement('aa-empty-state')
export class AaEmptyState extends LitElement {

	@property({ type: Boolean, reflect: true }) compact = false;
	@state() private hasIcon = false;
	@state() private hasTitle = false;
	@state() private hasContent = false;
	@state() private hasActions = false;

	override render(): TemplateResult {
		return html`
			<section
				class="empty-state"
				aria-labelledby=${ ifDefined(this.hasTitle ? 'empty-state-title' : undefined) }
			>
				<div class="icon" aria-hidden="true" ?hidden=${ !this.hasIcon }>
					<slot name="icon" @slotchange=${ this.handleIconSlotChange }></slot>
				</div>
				<h2 id="empty-state-title" ?hidden=${ !this.hasTitle }>
					<slot name="title" @slotchange=${ this.handleTitleSlotChange }></slot>
				</h2>
				<div class="content" ?hidden=${ !this.hasContent }>
					<slot @slotchange=${ this.handleContentSlotChange }></slot>
				</div>
				<div class="actions" ?hidden=${ !this.hasActions }>
					<slot name="actions" @slotchange=${ this.handleActionsSlotChange }></slot>
				</div>
			</section>
		`;
	}

	private handleIconSlotChange(event: Event): void {
		this.hasIcon = slotHasContent(event);
	}

	private handleTitleSlotChange(event: Event): void {
		this.hasTitle = slotHasContent(event);
	}

	private handleContentSlotChange(event: Event): void {
		this.hasContent = slotHasContent(event);
	}

	private handleActionsSlotChange(event: Event): void {
		this.hasActions = slotHasContent(event);
	}


	static override styles = unsafeCSS(emptyStateStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-empty-state': AaEmptyState;
	}
}
