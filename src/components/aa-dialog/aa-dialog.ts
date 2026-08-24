import { html, LitElement, type PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';

import dialogStyles from './aa-dialog.css?inline';

@customElement('aa-dialog')
export class AaDialog extends LitElement {

	@property({ type: String }) override title: string = '';
	@property({ type: Boolean, reflect: true }) closeOnBackdrop = true;
	@property({ type: Boolean, reflect: true, attribute: 'fixed-height' }) fixedHeight = false;
	@property({ type: Boolean, reflect: true }) large = false;

	@state() private hasHeaderActions = false;
	@state() private hasFooter = false;

	private _prevOverflow?: string;

	override connectedCallback(): void {
		super.connectedCallback();

		window.addEventListener('keydown', this.onKeyDown);
		this._prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		queueMicrotask(() => this.shadowRoot?.getElementById('dialog')?.focus());
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();

		window.removeEventListener('keydown', this.onKeyDown);
		document.body.style.overflow = this._prevOverflow ?? '';
	}

	override firstUpdated(changedProperties: PropertyValues): void {
		super.firstUpdated(changedProperties);

		this.addEventListener('click', this.onBackdropClick);
	}

	private onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			this.close();
		}
	};

	private onBackdropClick = () => {
		if (this.closeOnBackdrop)
			this.close();
	};

	private hasAssigned(name: string): boolean {
		const slot = this.shadowRoot?.querySelector(`slot[name="${ name }"]`) as HTMLSlotElement | null;

		return !!slot && slot.assignedNodes({ flatten: true }).length > 0;
	}

	private onHeaderActionsSlotChange = (event: Event): void => {
		const slot = event.currentTarget as HTMLSlotElement;
		this.hasHeaderActions = slot.assignedNodes({ flatten: true }).length > 0;
	};

	private onFooterSlotChange = (): void => {
		this.hasFooter = [
			'footer',
			'footer-tools',
			'footer-tertiary',
			'footer-secondary',
			'footer-primary',
		].some(slotName => this.hasAssigned(slotName));
	};

	close(result?: unknown): void {
		this.dispatchEvent(
			new CustomEvent('dialog-closed', {
				bubbles:  true,
				composed: true,
				detail:   { result },
			}),
		);
	}

	override render(): unknown {
		return html`
      <div
        id="dialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @click=${ (e: Event) => e.stopPropagation() }
      >
        <slot name="header" @slotchange=${ this.requestUpdate }></slot>
        ${ when(!this.hasAssigned('header'), () => html`
			<div class="bar">
				<div class="title">
					<slot name="title">${ this.title }</slot>
				</div>
				<div class="header-actions" ?hidden=${ !this.hasHeaderActions }>
					<slot name="actions" @slotchange=${ this.onHeaderActionsSlotChange }></slot>
				</div>
				<button
					aria-label="Close dialog"
					class="btn close-btn"
					@click=${ this.close }
				>
					x
				</button>
			</div>
			`) }

        <div class="content" @click=${ (e: Event) => e.stopPropagation() }>
          <slot></slot>
        </div>

        <div class="footer" ?hidden=${ !this.hasFooter }>
			<div class="footer-tools">
				<slot name="footer-tools" @slotchange=${ this.onFooterSlotChange }></slot>
			</div>
			<div class="footer-actions">
				<slot name="footer" @slotchange=${ this.onFooterSlotChange }></slot>
				<slot name="footer-tertiary" @slotchange=${ this.onFooterSlotChange }></slot>
				<slot name="footer-secondary" @slotchange=${ this.onFooterSlotChange }></slot>
				<slot name="footer-primary" @slotchange=${ this.onFooterSlotChange }></slot>
			</div>
		</div>
      </div>
    `;
	}

	static override styles = unsafeCSS(dialogStyles);

}
