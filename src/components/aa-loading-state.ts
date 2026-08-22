import { css, html, LitElement, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { sharedStyles } from '../styles.js';

@customElement('aa-loading-state')
export class AaLoadingState extends LitElement {

	@property({ type: Boolean }) loading = true;
	@property({ type: String }) label = 'Loading...';

	override render(): TemplateResult {
		return html`
			<div
				class="frame"
				?data-loading=${ this.loading }
				aria-busy=${ this.loading ? 'true' : 'false' }
			>
				<div
					class="content"
					aria-hidden=${ this.loading ? 'true' : 'false' }
					?inert=${ this.loading }
				>
					<slot></slot>
				</div>

				<div
					class="loader-layer"
					role="status"
					aria-live="polite"
					aria-hidden=${ this.loading ? 'false' : 'true' }
				>
					<div class="spinner" aria-hidden="true">
						<div class="target"></div>
						<div class="orbit">
							<div class="dart"></div>
						</div>
					</div>
					<span class="visually-hidden">${ this.label }</span>
				</div>
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
				min-height: var(--aa-loading-min-height, calc(100dvh - 6rem));
				height: var(--aa-loading-height, auto);
			}

			.frame {
				display: grid;
				min-height: inherit;
				height: 100%;
			}

			.content,
			.loader-layer {
				grid-area: 1 / 1;
				min-width: 0;
				min-height: 0;
			}

			.content {
				height: 100%;
				opacity: 1;
				transform: translateY(0) scale(1);
				visibility: visible;
				transition:
					opacity 240ms ease-out,
					transform 240ms ease-out,
					visibility 0s linear 0s;
			}

			.frame[data-loading] .content {
				opacity: 0;
				transform: translateY(10px) scale(0.99);
				visibility: hidden;
				pointer-events: none;
				transition:
					opacity 180ms ease-in,
					transform 180ms ease-in,
					visibility 0s linear 180ms;
			}

			.loader-layer {
				z-index: 1;
				display: grid;
				place-items: center;
				padding: 1.5rem;
				opacity: 0;
				transform: scale(0.96);
				visibility: hidden;
				pointer-events: none;
				transition:
					opacity 180ms ease-in,
					transform 180ms ease-in,
					visibility 0s linear 180ms;
			}

			.frame[data-loading] .loader-layer {
				opacity: 1;
				transform: scale(1);
				visibility: visible;
				transition:
					opacity 220ms ease-out,
					transform 220ms ease-out,
					visibility 0s linear 0s;
			}

			.spinner {
				position: relative;
				width: 88px;
				height: 88px;
			}

			.target {
				position: absolute;
				top: 50%;
				left: 50%;
				width: 48px;
				height: 48px;
				border: 4px solid #000;
				border-radius: 50%;
				background:
					radial-gradient(
						circle,
						#ed807f 0 12%,
						#000 13% 20%,
						#dff362 21% 39%,
						#000 40% 47%,
						#fffaf3 48%
					);
				box-shadow: 4px 4px 0 #000;
				transform: translate(-50%, -50%);
			}

			.orbit {
				position: absolute;
				inset: 0;
				animation: orbit 1.1s linear infinite;
			}

			.dart {
				position: absolute;
				top: 0;
				left: 50%;
				width: 18px;
				height: 36px;
				transform: translateX(-50%) rotate(18deg);
			}

			.dart::before {
				content: '';
				position: absolute;
				left: 7px;
				bottom: 0;
				width: 5px;
				height: 28px;
				background: #000;
				clip-path: polygon(0 0, 100% 0, 100% 76%, 50% 100%, 0 76%);
			}

			.dart::after {
				content: '';
				position: absolute;
				inset: 0 0 auto;
				width: 18px;
				height: 15px;
				background: #7df9ff;
				clip-path: polygon(50% 28%, 100% 0, 78% 100%, 50% 75%, 22% 100%, 0 0);
				filter: drop-shadow(2px 2px 0 #000);
			}

			.visually-hidden {
				position: absolute;
				width: 1px;
				height: 1px;
				padding: 0;
				margin: -1px;
				overflow: hidden;
				clip: rect(0, 0, 0, 0);
				white-space: nowrap;
				border: 0;
			}

			@keyframes orbit {
				to {
					transform: rotate(360deg);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.content,
				.loader-layer,
				.frame[data-loading] .content,
				.frame[data-loading] .loader-layer {
					transition-duration: 0.01ms;
				}

				.orbit {
					animation: none;
				}

				.target {
					animation: pulse 1.4s ease-in-out infinite alternate;
				}
			}

			@keyframes pulse {

				to {
					transform: translate(-50%, -50%) scale(1.05);
				}

			}
		`,
	];

}
