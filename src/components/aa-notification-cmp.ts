import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { faIcons } from '../faIcons.js';
import { sharedStyles } from '../styles.js';


@customElement('aa-notification-cmp')
export class NotificationElement extends LitElement {

	@property() message:                  string = '';
	@property() type:                     'success' | 'danger' | 'info' = 'success';
	@property({ type: Boolean }) visible: boolean = true;
	@property({ type: Object }) promise:  Promise<unknown> | null = null;

	override firstUpdated(): void {
		if (this.promise) {
			this.promise.finally(() => {
				setTimeout(() => {
					this.visible = false;
					this.remove();
				}, 600);
			});
		}
		else {
			setTimeout(() => {
				this.visible = false;
				setTimeout(() => {
					this.remove();
				}, 300);
			}, 3000);
		}
	}

	override updated(changedProperties: Map<string, unknown>): void {
		super.updated(changedProperties);
		if (changedProperties.has('visible') && !this.visible)
			this.setAttribute('hidden', '');

		else
			this.removeAttribute('hidden');
	}

	private getIconClass() {
		if (this.promise != undefined)
			return 'fas fa-spinner fa-spin info';

		switch (this.type) {
		case 'success': return 'fas fa-check-circle success';
		case 'danger': return 'fas fa-exclamation-triangle danger';
		case 'info': return 'fas fa-info-circle info';
		default: return 'fas fa-info-circle info';
		}
	}

	private getBackgroundColor() {
		switch (this.type) {
		case 'success': return 'var(--color-success)';
		case 'danger': return 'var(--color-danger)';
		case 'info': return 'var(--color-info)';
		default: return '#333';
		}
	}

	override render(): unknown {
		const styles = {
			backgroundColor: this.getBackgroundColor(),
		};

		return html`
		<div class="notification" style=${ styleMap(styles) }>
			<div class="icon">
				<i class="${ this.getIconClass() }"></i>
			</div>
			<div class="content">
				<div class="message">${ this.message }</div>
			</div>
		</div>
    	`;
	}

	static override styles = [
		sharedStyles, faIcons, css`
		:host([hidden]) {
			opacity: 0;
			transform: translateY(-20px);
		}

		.icon {
			font-size: 1rem;
			padding-right: 1rem;
			height: fit-content;
			width: fit-content;
		}

		.content {
			flex-grow: 1;
		}

		.title {
			font-size: 1.25rem;
			margin-bottom: 5px;
		}

		.message {
			font-size: 1rem;
			word-wrap: break-word;
			white-space: normal;
			font-family: var(--font-family-second);
		}
		.notification {
			display: grid;
			grid-template-columns: auto 1fr;
			align-items: center;
			padding: 12px 20px;
			width: 300px;
			border: 2px solid black;
			border-radius: 5px;
			font-weight: bold;
			text-align: left;
			opacity: 1;
			transform: translateY(-10px);
			transition: opacity 0.3s, transform 0.3s;
			pointer-events: none;
			color: black;
			box-shadow: 2px 2px 0px 0px black;
		}
	`,
	];

}
