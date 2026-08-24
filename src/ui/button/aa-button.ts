import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import buttonStyles from './aa-button.css?inline';

export type AaButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type AaButtonSize = 'small' | 'medium' | 'large';
export type AaButtonType = 'button' | 'submit' | 'reset';

@customElement('aa-button')
export class AaButton extends LitElement {

	static formAssociated = true;

	@property({ type: String, reflect: true }) variant:                    AaButtonVariant = 'primary';
	@property({ type: String, reflect: true }) size:                       AaButtonSize = 'medium';
	@property({ type: String }) type:                                      AaButtonType = 'button';
	@property({ type: Boolean, reflect: true }) disabled = false;
	@property({ type: Boolean, reflect: true }) loading = false;
	@property({ type: String, attribute: 'aria-label' }) accessibleLabel?: string;
	@property({ type: String, attribute: 'aria-pressed' }) pressed?:       string;
	@property({ type: String, attribute: 'aria-expanded' }) expanded?:     string;
	@property({ type: String, attribute: 'aria-controls' }) controls?:     string;

	private readonly internals = this.attachInternals();
	private formDisabled = false;

	formDisabledCallback(disabled: boolean): void {
		this.formDisabled = disabled;
		this.requestUpdate();
	}

	override focus(options?: FocusOptions): void {
		this.renderRoot.querySelector('button')?.focus(options);
	}

	private handleClick(event: MouseEvent): void {
		if (this.disabled || this.loading || this.formDisabled) {
			event.preventDefault();

			return;
		}

		if (this.type === 'submit') {
			event.preventDefault();
			this.internals.form?.requestSubmit();
		}
		else if (this.type === 'reset') {
			event.preventDefault();
			this.internals.form?.reset();
		}
	}

	override render(): TemplateResult {
		const unavailable = this.disabled || this.loading || this.formDisabled;

		return html`
			<button
				type="button"
				part="button"
				data-size=${ this.size }
				data-variant=${ this.variant }
				?disabled=${ unavailable }
				aria-busy=${ this.loading ? 'true' : 'false' }
				aria-label=${ ifDefined(this.accessibleLabel) }
				aria-pressed=${ ifDefined(this.pressed) }
				aria-expanded=${ ifDefined(this.expanded) }
				aria-controls=${ ifDefined(this.controls) }
				@click=${ this.handleClick }
			>
				${ this.loading ? html`<span class="spinner" aria-hidden="true"></span>` : null }
				<slot></slot>
			</button>
		`;
	}

	static override styles = unsafeCSS(buttonStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-button': AaButton;
	}
}
