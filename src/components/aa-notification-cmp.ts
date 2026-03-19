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
		case 'achievement': return 'linear-gradient(135deg, #f7d8ff 0%, #dff1ff 100%)';
		default: return '#333';
		}
	}

	private renderContent() {
		if (this.type === 'achievement') {
			const achievementCount = this.achievementNames.length || 1;

			return html`
				<div class="content achievement-content">
					<div class="achievement-eyebrow">Session achievement</div>
					<div class="achievement-header">
						<div class="title">Achievement Unlocked</div>
						<div class="achievement-count">${achievementCount}</div>
					</div>

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
			grid-template-columns: auto 1fr;
			width: 420px;
			padding: 18px 22px 20px;
			border-width: 3px;
			border-color: black;
			color: black;
			box-shadow: 6px 6px 0 0 black;
		}

		.achievement-notification .icon {
			position: relative;
			display: grid;
			place-items: center;
			align-self: start;
			width: 64px;
			height: 64px;
			margin-right: 1rem;
			padding: 0;
			border: 3px solid black;
			border-radius: 50%;
			font-size: 1.75rem;
			color: #4a2a00;
			background: #ffe69b;
			box-shadow: 4px 4px 0 0 black;
		}

		.achievement-notification .icon::before,
		.achievement-notification .icon::after {
			position: absolute;
			color: #ff79c6;
			font-size: 0.85rem;
		}

		.achievement-notification .icon::before {
			content: '✦';
			top: 2px;
			right: -2px;
		}

		.achievement-notification .icon::after {
			content: '✦';
			bottom: 6px;
			left: -6px;
		}

		.achievement-content {
			display: flex;
			flex-direction: column;
			gap: 0.4rem;
		}

		.achievement-eyebrow {
			width: fit-content;
			padding: 0.2rem 0.6rem;
			border: 2px solid black;
			border-radius: 999px;
			background: #fff7b8;
			color: black;
			font-size: 0.68rem;
			font-weight: 900;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			box-shadow: 2px 2px 0 0 black;
		}

		.achievement-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.75rem;
		}

		.achievement-count {
			flex-shrink: 0;
			min-width: 2rem;
			padding: 0.18rem 0.55rem;
			border-radius: 999px;
			background: #c9f0ff;
			border: 2px solid black;
			color: black;
			font-size: 0.85rem;
			font-weight: 900;
			text-align: center;
			box-shadow: 2px 2px 0 0 black;
		}

		.achievement-subtitle {
			color: #3c3351;
			font-size: 0.92rem;
			font-family: var(--font-family-second);
		}

		.achievement-list {
			margin: 0;
			display: flex;
			flex-wrap: wrap;
			gap: 0.45rem;
			font-family: var(--font-family-second);
		}

		.achievement-item {
			max-width: 100%;
			padding: 0.45rem 0.75rem;
			border: 2px solid black;
			border-radius: 999px;
			background: #fffefb;
			color: black;
			font-size: 0.9rem;
			line-height: 1.25;
			box-shadow: 2px 2px 0 0 black;
			overflow-wrap: anywhere;
		}

		.progress-track {
			position: absolute;
			left: 0;
			right: 0;
			bottom: 0;
			height: 6px;
			background: rgba(0, 0, 0, 0.12);
		}

		.achievement-notification .progress-track {
			height: 8px;
			background: rgba(255, 255, 255, 0.55);
			border-top: 2px solid black;
		}

		.progress-bar {
			height: 100%;
			width: 100%;
			background: rgba(58, 254, 104, 0.95);
			transform: scaleX(1);
			transform-origin: left;
		}

		.achievement-notification .progress-bar {
			background: linear-gradient(90deg, #ff9ecb 0%, #ffd37a 45%, #b7f0c2 100%);
		}

		.progress-bar.active {
			transform: scaleX(0);
			transition-property: transform;
			transition-timing-function: linear;
		}
	`];
}
