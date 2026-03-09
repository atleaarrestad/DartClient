import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { faIcons } from '../faIcons.js';
import { sharedStyles } from '../styles.js';


@customElement('aa-notification-cmp')
export class NotificationElement extends LitElement {

	@property() message: string = '';
	@property() type: 'success' | 'danger' | 'info' | 'achievement' = 'success';
	@property({ type: Boolean }) visible: boolean = true;
	@property({ type: Object }) promise: Promise<unknown> | null = null;
	@property({ type: Array }) achievementNames: string[] = [];
	@property({ type: Number }) timeout: number = 3000;
	@property({ type: Boolean }) progressActive: boolean = false;

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
			requestAnimationFrame(() => {
				this.progressActive = true;
			});

			setTimeout(() => {
				this.visible = false;
				setTimeout(() => {
					this.remove();
				}, 300);
			}, this.timeout);
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
		if (this.promise)
			return 'fas fa-spinner fa-spin info';

		switch (this.type) {
		case 'success': return 'fas fa-check-circle success';
		case 'danger': return 'fas fa-exclamation-triangle danger';
		case 'info': return 'fas fa-info-circle info';
		case 'achievement': return 'fas fa-trophy achievement';
		default: return 'fas fa-info-circle info';
		}
	}

	private getBackgroundColor() {
		switch (this.type) {
		case 'success': return 'var(--color-success)';
		case 'danger': return 'var(--color-danger)';
		case 'info': return 'var(--color-info)';
		case 'achievement': return 'linear-gradient(135deg, #ffe082 0%, #ffca28 100%)';
		default: return '#333';
		}
	}

	private renderContent() {
		if (this.type === 'achievement') {
			return html`
				<div class="content achievement-content">
					<div class="title">Achievement Unlocked</div>

					${this.achievementNames.length > 0
						? html`
							<ul class="achievement-list">
								${this.achievementNames.map(name => html`
									<li class="achievement-item">${name}</li>
								`)}
							</ul>
						`
						: html`<div class="message">${this.message}</div>`
					}
				</div>
			`;
		}

		return html`
			<div class="content">
				<div class="message">${this.message}</div>
			</div>
		`;
	}

	override render(): unknown {
		const styles = {
			background: this.getBackgroundColor(),
		};

		const progressStyles = {
			transitionDuration: `${this.timeout}ms`,
		};

		return html`
			<div class="notification ${this.type === 'achievement' ? 'achievement-notification' : ''}" style=${styleMap(styles)}>
				<div class="icon">
					<i class="${this.getIconClass()}"></i>
				</div>

				${this.renderContent()}

				${!this.promise ? html`
					<div class="progress-track">
						<div
							class="progress-bar ${this.progressActive ? 'active' : ''}"
							style=${styleMap(progressStyles)}>
						</div>
					</div>
				` : ''}
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
			font-size: 1.1rem;
			margin-bottom: 6px;
			font-weight: 900;
			letter-spacing: 0.03em;
			text-transform: uppercase;
		}

		.message {
			font-size: 1rem;
			word-wrap: break-word;
			white-space: normal;
			font-family: var(--font-family-second);
		}

		.notification {
			position: relative;
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
			overflow: hidden;
		}

		.achievement-notification {
			width: 360px;
			padding: 14px 20px;
			border-width: 3px;
			box-shadow: 4px 4px 0px 0px black;
		}

		.achievement-notification .icon {
			font-size: 1.5rem;
			align-self: start;
			padding-top: 2px;
		}

		.achievement-content {
			display: flex;
			flex-direction: column;
		}

		.achievement-list {
			margin: 0;
			padding-left: 1.2rem;
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			font-family: var(--font-family-second);
		}

		.achievement-item {
			font-size: 0.95rem;
			line-height: 1.3;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.progress-track {
			position: absolute;
			left: 0;
			right: 0;
			bottom: 0;
			height: 6px;
			background: rgba(0, 0, 0, 0.12);
		}

		.progress-bar {
			height: 100%;
			width: 100%;
			background: rgba(58, 254, 104, 0.95);
			transform: scaleX(1);
			transform-origin: left;
		}

		.progress-bar.active {
			transform: scaleX(0);
			transition-property: transform;
			transition-timing-function: linear;
		}
	`];
}