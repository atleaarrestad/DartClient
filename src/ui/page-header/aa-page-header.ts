import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { slotHasContent } from '../slot-utils.js';
import pageHeaderStyles from './aa-page-header.css?inline';

@customElement('aa-page-header')
export class AaPageHeader extends LitElement {

	@property({ type: Boolean, reflect: true }) centered = false;
	@state() private hasTitle = false;
	@state() private hasDescription = false;
	@state() private hasMetadata = false;
	@state() private hasActions = false;

	override render(): TemplateResult {
		return html`
			<header class="page-header">
				<div class="main">
					<h1 ?hidden=${ !this.hasTitle }>
						<slot name="title" @slotchange=${ this.handleTitleSlotChange }></slot>
					</h1>
					<div class="description" ?hidden=${ !this.hasDescription }>
						<slot
							name="description"
							@slotchange=${ this.handleDescriptionSlotChange }
						></slot>
					</div>
					<div class="metadata" ?hidden=${ !this.hasMetadata }>
						<slot name="metadata" @slotchange=${ this.handleMetadataSlotChange }></slot>
					</div>
				</div>
				<div class="actions" ?hidden=${ !this.hasActions }>
					<slot name="actions" @slotchange=${ this.handleActionsSlotChange }></slot>
				</div>
			</header>
		`;
	}

	private handleTitleSlotChange(event: Event): void {
		this.hasTitle = slotHasContent(event);
	}

	private handleDescriptionSlotChange(event: Event): void {
		this.hasDescription = slotHasContent(event);
	}

	private handleMetadataSlotChange(event: Event): void {
		this.hasMetadata = slotHasContent(event);
	}

	private handleActionsSlotChange(event: Event): void {
		this.hasActions = slotHasContent(event);
	}


	static override styles = unsafeCSS(pageHeaderStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-page-header': AaPageHeader;
	}
}
