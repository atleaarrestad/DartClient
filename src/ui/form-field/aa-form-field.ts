import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { slotHasContent } from '../slot-utils.js';
import formFieldStyles from './aa-form-field.css?inline';

const labelableControlSelector = 'input, select, textarea';

@customElement('aa-form-field')
export class AaFormField extends LitElement {

	@property({ type: String }) label = '';
	@property({ type: String }) help = '';
	@property({ type: String }) error = '';
	@state() private hasLabelSlot = false;
	@state() private hasHelpSlot = false;
	@state() private hasErrorSlot = false;

	@query('slot:not([name])') private controlSlot?: HTMLSlotElement;
	@query('slot[name="label"]') private labelSlot?: HTMLSlotElement;

	/**
	 * Controls this field gave an aria-label. The wrapping <label> can't label
	 * slotted controls across the shadow boundary, so the label text is copied
	 * onto them unless the consumer labelled them already.
	 */
	private readonly labelledControls = new WeakSet<Element>();

	override updated(): void {
		this.syncControlLabels();
	}

	override render(): TemplateResult {
		const hasLabel = Boolean(this.label) || this.hasLabelSlot;
		const hasHelp = Boolean(this.help) || this.hasHelpSlot;
		const hasError = Boolean(this.error) || this.hasErrorSlot;

		return html`
			<label class="field">
				<span class="label" ?hidden=${ !hasLabel } @click=${ this.focusControl }>
					<slot name="label" @slotchange=${ this.handleLabelSlotChange }>
						${ this.label }
					</slot>
				</span>
				<span class="control">
					<slot @slotchange=${ this.syncControlLabels }></slot>
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

	private getControls(): HTMLElement[] {
		return (this.controlSlot?.assignedElements({ flatten: true }) ?? [])
			.filter((element): element is HTMLElement =>
				element instanceof HTMLElement && element.matches(labelableControlSelector));
	}

	private getLabelText(): string {
		const label = this.label.trim();
		if (label || !this.hasLabelSlot)
			return label;

		return (this.labelSlot?.assignedNodes({ flatten: true }) ?? [])
			.map(node => node.textContent ?? '')
			.join(' ')
			.replace(/\s+/gu, ' ')
			.trim();
	}

	private syncControlLabels(): void {
		const labelText = this.getLabelText();

		for (const control of this.getControls()) {
			const ownLabel = !this.labelledControls.has(control)
				&& (control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby'));
			if (ownLabel)
				continue;

			if (labelText) {
				control.setAttribute('aria-label', labelText);
				this.labelledControls.add(control);
			}
			else if (this.labelledControls.has(control)) {
				control.removeAttribute('aria-label');
				this.labelledControls.delete(control);
			}
		}
	}

	private focusControl(): void {
		this.getControls()[0]?.focus();
	}

	private handleLabelSlotChange(event: Event): void {
		this.hasLabelSlot = slotHasContent(event);
	}

	private handleHelpSlotChange(event: Event): void {
		this.hasHelpSlot = slotHasContent(event);
	}

	private handleErrorSlotChange(event: Event): void {
		this.hasErrorSlot = slotHasContent(event);
	}


	static override styles = unsafeCSS(formFieldStyles);

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-form-field': AaFormField;
	}
}
