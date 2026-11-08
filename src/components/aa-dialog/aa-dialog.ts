import { html, LitElement, nothing, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';

import {
	containsComposed,
	getDeepActiveElement,
	getTabbableElements,
} from '../../ui/focus-utils.js';
import { slotHasContent } from '../../ui/slot-utils.js';
import dialogStyles from './aa-dialog.css?inline';

const footerSlotNames = [
	'footer',
	'footer-tools',
	'footer-tertiary',
	'footer-secondary',
	'footer-primary',
];

@customElement('aa-dialog')
export class AaDialog extends LitElement {

	@property({ type: String }) heading = '';
	@property({ type: Boolean, reflect: true }) closeOnBackdrop = true;
	@property({ type: Boolean, reflect: true, attribute: 'fixed-height' }) fixedHeight = false;
	@property({ type: Boolean, reflect: true }) large = false;
	/** A narrow dialog for a short form or question. */
	@property({ type: Boolean, reflect: true }) compact = false;
	/** Return false to keep the dialog open when the user tries to dismiss it. */
	@property({ attribute: false }) canClose?: () => boolean;

	@state() private hasHeaderActions = false;
	@state() private hasFooter = false;

	@query('#dialog') private dialogElement?: HTMLElement;

	/** The element that had focus when the dialog opened; focus returns there on close. */
	private opener?: HTMLElement;

	override connectedCallback(): void {
		super.connectedCallback();

		const active = getDeepActiveElement();
		this.opener = active instanceof HTMLElement ? active : undefined;

		window.addEventListener('keydown', this.onKeyDown);
		this.addEventListener('pointerdown', this.onBackdropPointerDown);
		queueMicrotask(() => this.dialogElement?.focus());
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();

		window.removeEventListener('keydown', this.onKeyDown);
		this.removeEventListener('pointerdown', this.onBackdropPointerDown);

		const opener = this.opener;
		this.opener = undefined;
		if (opener?.isConnected)
			opener.focus({ preventScroll: true });
	}

	private onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			this.close();
		}
		else if (e.key === 'Tab') {
			this.trapTab(e);
		}
	};

	/** Keeps Tab and Shift+Tab cycling inside the dialog. */
	private trapTab(e: KeyboardEvent): void {
		const dialog = this.dialogElement;
		if (!dialog)
			return;

		const tabbables = getTabbableElements(dialog);
		const first = tabbables[0];
		const last = tabbables.at(-1);
		const active = getDeepActiveElement();

		if (!first || !last) {
			e.preventDefault();
			dialog.focus();

			return;
		}

		const outside = active === dialog || !containsComposed(this, active);
		if (e.shiftKey && (outside || active === first)) {
			e.preventDefault();
			last.focus();
		}
		else if (!e.shiftKey && (outside || active === last)) {
			e.preventDefault();
			first.focus();
		}
	}

	private onBackdropPointerDown = () => {
		if (this.closeOnBackdrop)
			this.close();
	};

	private hasAssigned(name: string): boolean {
		const slot = this.shadowRoot?.querySelector(`slot[name="${ name }"]`) as HTMLSlotElement | null;

		return !!slot && slot.assignedNodes({ flatten: true }).length > 0;
	}

	private onHeaderActionsSlotChange = (event: Event): void => {
		this.hasHeaderActions = slotHasContent(event);
	};

	private onFooterSlotChange = (): void => {
		this.hasFooter = footerSlotNames.some(slotName => this.hasAssigned(slotName));
	};

	close(result?: unknown): void {
		if (this.canClose && !this.canClose())
			return;

		this.dispatchEvent(
			new CustomEvent('dialog-closed', {
				bubbles:  true,
				composed: true,
				detail:   { result },
			}),
		);
	}

	override render(): unknown {
		const hasCustomHeader = this.hasAssigned('header');

		return html`
      <div
        id="dialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby=${ hasCustomHeader ? nothing : 'dialog-title' }
        aria-label=${ hasCustomHeader && this.heading ? this.heading : nothing }
        tabindex="-1"
        @pointerdown=${ (e: Event) => e.stopPropagation() }
        @click=${ (e: Event) => e.stopPropagation() }
      >
        <slot name="header" @slotchange=${ this.requestUpdate }></slot>
        ${ when(!hasCustomHeader, () => html`
			<div class="bar">
				<div class="title" id="dialog-title">
					<slot name="title">${ this.heading }</slot>
				</div>
				<div class="header-actions" ?hidden=${ !this.hasHeaderActions }>
					<slot name="actions" @slotchange=${ this.onHeaderActionsSlotChange }></slot>
				</div>
				<button
					type="button"
					aria-label="Close dialog"
					class="btn close-btn"
					@click=${ () => this.close() }
				>
					<span aria-hidden="true">x</span>
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
