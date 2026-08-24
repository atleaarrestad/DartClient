import { html, LitElement, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { faIcons } from '../../faIcons.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import notificationStyles from './aa-notification-cmp.css?inline';


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
		case 'success': return 'var(--color-status-success)';
		case 'danger': return 'var(--color-status-danger)';
		case 'info': return 'var(--color-status-info)';
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
		sharedStyles,
		faIcons,
		unsafeCSS(notificationStyles),
	];
}
