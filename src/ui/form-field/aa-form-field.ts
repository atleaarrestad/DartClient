import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import formFieldStyles from './aa-form-field.css?inline';

@customElement('aa-form-field')
export class AaFormField extends LitElement {

	@property({ type: String }) label = '';
	@property({ type: String }) help = '';
	@property({ type: String }) error = '';
	@state() private hasLabelSlot = false;
	@state() private hasHelpSlot = false;
	@state() private hasErrorSlot = false;

	override render(): TemplateResult {
		const hasLabel = Boolean(this.label) || this.hasLabelSlot;
		const hasHelp = Boolean(this.help) || this.hasHelpSlot;
		const hasError = Boolean(this.error) || this.hasErrorSlot;

		return html`
			<label class="field">
				<span class="label" ?hidden=${ !hasLabel }>
					<slot name="label" @slotchange=${ this.handleLabelSlotChange }>
						${ this.label }
					</slot>
				</span>
				<span class="control">
					<slot></slot>
				</span>
				<span class="help" ?hidden=${ !hasHelp }>
					<slot name="help" @slotchange=${ this.handleHelpSlotChange }>
						${ this.help }
					</slot>
				</span>
				<span class="error" role="alert" ?hidden=${ !hasError }>
					<slot name="error" @slotchange=${ this.handleErrorSlotChange }>
						${ this.error }
					</slot>
				</span>
			</label>
		`;
	}

	private handleLabelSlotChange(event: Event): void {
		this.hasLabelSlot = this.slotHasContent(event);
	}

	private handleHelpSlotChange(event: Event): void {
		this.hasHelpSlot = this.slotHasContent(event);
	}

	private handleErrorSlotChange(event: Event): void {
		this.hasErrorSlot = this.slotHasContent(event);
	}

	private slotHasContent(event: Event): boolean {
		const slot = event.currentTarget as HTMLSlotElement;

		return slot.assignedNodes({ flatten: true })
			.some(node => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
	}

	static override styles = unsafeCSS(formFieldStyles);

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-form-field': AaFormField;
	}
}
