import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';


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

	static override styles = css`
		:host {
			position: fixed;
			inset: 0;
			display: grid;
			place-items: center;
			background: rgba(0, 0, 0, 0.35);
			z-index: 1000;
			padding: 1rem;
		}
		.dialog {
			background: #f5f3ff;
			border: 2px solid #000;
			border-right-width: 6px;
			border-bottom-width: 6px;
			border-radius: 22px;
			box-shadow: 10px 10px 0 #000;
			max-width: min(1000px, 92vw);
			max-height: min(86vh, 1000px);
			width: 100%;
			display: grid;
			grid-template-rows: auto 1fr auto;
			outline: none;
		}
		:host([fixed-height]) .dialog {
			height: min(78vh, 780px);
		}
		:host([large]) .dialog {
			max-width: min(1400px, 96vw);
			max-height: min(94vh, 1100px);
		}
		:host([large][fixed-height]) .dialog {
			height: min(92vh, 1020px);
		}
		.bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
			padding: 0.75rem 0.9rem;
			border-bottom: 2px solid #000;
			background: #fff;
			border-top-left-radius: 20px;
			border-top-right-radius: 20px;
		}
		.title {
			font-weight: 900;
			font-size: 1.1rem;
			display: inline-flex;
			gap: 0.5rem;
			align-items: center;
		}
		.header-actions {
			display: flex;
			align-items: center;
			gap: 0;
			overflow: hidden;
			background: #fffefb;
			border: 2px solid #000;
			border-radius: 12px;
			box-shadow: 3px 3px 0 #000;
		}
		.header-actions {
			margin-left: auto;
		}
		.header-actions[hidden],
		.footer[hidden] {
			display: none;
		}
		::slotted([slot='actions']) {
			appearance: none;
			box-sizing: border-box;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 68px !important;
			min-height: 36px !important;
			padding: 0.48rem 1rem !important;
			background: transparent;
			border: none;
			border-left: 2px solid #000;
			border-radius: 0;
			box-shadow: none;
			color: #000;
			font: inherit;
			font-size: 0.78rem !important;
			font-weight: 900 !important;
			line-height: 1.1 !important;
			cursor: pointer;
			white-space: nowrap;
		}
		::slotted([slot='actions']:first-of-type) {
			border-left: none;
		}
		::slotted([slot='actions'][aria-pressed='true']) {
			background: #7df9ff;
		}
		::slotted([slot='actions']:focus-visible) {
			outline: 3px solid #ff8c00;
			outline-offset: -3px;
		}
		.footer-tools,
		.footer-actions {
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 0.65rem;
		}
		.footer-actions {
			justify-content: flex-end;
			margin-left: auto;
		}
		::slotted([slot='footer']),
		::slotted([slot='footer-tools']),
		::slotted([slot='footer-tertiary']),
		::slotted([slot='footer-secondary']),
		::slotted([slot='footer-primary']) {
			appearance: none;
			box-sizing: border-box;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: auto !important;
			min-height: 38px !important;
			padding: 0.42rem 1.2rem !important;
			background: #fff;
			border: 2px solid #000;
			border-radius: 10px;
			box-shadow: 3px 3px 0 #000;
			color: #000;
			font: inherit;
			font-size: 0.82rem !important;
			font-weight: 900 !important;
			line-height: 1.1 !important;
			cursor: pointer;
			white-space: nowrap;
		}
		::slotted([slot='footer-primary']) {
			background: #7df9ff;
		}
		::slotted([slot='footer-tertiary']) {
			background: #fffaf3;
			box-shadow: 2px 2px 0 #000;
		}
		::slotted([slot='footer-tools'][aria-pressed='true']) {
			background: #7df9ff;
		}
		::slotted([slot='footer']:disabled),
		::slotted([slot='footer-tools']:disabled),
		::slotted([slot='footer-tertiary']:disabled),
		::slotted([slot='footer-secondary']:disabled),
		::slotted([slot='footer-primary']:disabled) {
			opacity: 0.45;
			cursor: not-allowed;
		}
		::slotted([slot='footer']:not(:disabled):active),
		::slotted([slot='footer-tools']:not(:disabled):active),
		::slotted([slot='footer-tertiary']:not(:disabled):active),
		::slotted([slot='footer-secondary']:not(:disabled):active),
		::slotted([slot='footer-primary']:not(:disabled):active) {
			transform: translate(2px, 2px);
			box-shadow: 1px 1px 0 #000;
		}
		::slotted([slot='footer']:focus-visible),
		::slotted([slot='footer-tools']:focus-visible),
		::slotted([slot='footer-tertiary']:focus-visible),
		::slotted([slot='footer-secondary']:focus-visible),
		::slotted([slot='footer-primary']:focus-visible) {
			outline: 3px solid #ff8c00;
			outline-offset: 2px;
		}
		.content {
			overflow: auto;
			padding: 1rem;
			background: transparent;
		}
		:host([fixed-height]) .content {
			min-height: 0;
			overflow: hidden;
		}
		:host([large][fixed-height]) .content {
			overflow: auto;
		}
		.content ::slotted(*) {
			width: auto !important;
			height: auto !important;
			box-sizing: border-box;
		}
		:host([fixed-height]) .content ::slotted(*) {
			height: 100% !important;
			min-height: 0;
		}
		.footer {
			padding: 0.8rem 0.95rem;
			border-top: 2px dashed #000;
			background: #fff;
			border-bottom-left-radius: 20px;
			border-bottom-right-radius: 20px;
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 0.5rem;
			justify-content: space-between;
		}
		.btn {
			appearance: none;
			background: #fff;
			border: 2px solid #000;
			border-right-width: 4px;
			border-bottom-width: 4px;
			border-radius: 14px;
			padding: 0.45rem 0.8rem;
			font-weight: 800;
			cursor: pointer;
			box-shadow: 4px 4px 0 #000;
		}
		.btn:active {
			transform: translate(2px, 2px);
			box-shadow: 2px 2px 0 #000;
		}
		.close-btn {
			line-height: 1;
		}
		@media (max-width: 600px) {
			.footer-tools,
			.footer-actions {
				width: 100%;
			}
			.footer-actions {
				justify-content: flex-end;
			}
		}
	`;

}
