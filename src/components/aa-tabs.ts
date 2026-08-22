import { css, html, LitElement, TemplateResult } from 'lit';
import { customElement, property, queryAll } from 'lit/decorators.js';

import { sharedStyles } from '../styles.js';

export interface AaTabItem {
	id:       string;
	label:    string;
	count?:   string;
	iconSrc?: string;
	iconAlt?: string;
}

@customElement('aa-tabs')
export class AaTabs extends LitElement {

	@property({ attribute: false }) items: AaTabItem[] = [];
	@property({ type: String }) selected = '';
	@property({ type: String }) label = 'Tabs';

	@queryAll('button') private tabButtons!: NodeListOf<HTMLButtonElement>;

	private selectTab(id: string): void {
		if (id === this.selected)
			return;

		this.selected = id;
		this.dispatchEvent(new CustomEvent<{ id: string; }>('tab-change', {
			bubbles:  true,
			composed: true,
			detail:   { id },
		}));
	}

	private async handleKeyDown(event: KeyboardEvent, currentIndex: number): Promise<void> {
		if (![ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes(event.key))
			return;

		event.preventDefault();

		let nextIndex = currentIndex;
		switch (event.key) {
		case 'ArrowLeft':
			nextIndex = (currentIndex - 1 + this.items.length) % this.items.length;
			break;
		case 'ArrowRight':
			nextIndex = (currentIndex + 1) % this.items.length;
			break;
		case 'Home':
			nextIndex = 0;
			break;
		case 'End':
			nextIndex = this.items.length - 1;
			break;
		}

		const nextTab = this.items[nextIndex];
		if (!nextTab)
			return;

		this.selectTab(nextTab.id);
		await this.updateComplete;
		this.tabButtons[nextIndex]?.focus();
	}

	override render(): TemplateResult {
		const selected = this.items.some(item => item.id === this.selected)
			? this.selected
			: this.items[0]?.id ?? '';

		return html`
			<div class="tabs" role="tablist" aria-label=${ this.label }>
				${ this.items.map((item, index) => {
					const isSelected = item.id === selected;

					return html`
						<button
							type="button"
							role="tab"
							aria-selected=${ isSelected ? 'true' : 'false' }
							tabindex=${ isSelected ? 0 : -1 }
							@click=${ () => this.selectTab(item.id) }
							@keydown=${ (event: KeyboardEvent) => this.handleKeyDown(event, index) }
						>
							${ item.iconSrc
								? html`
									<img
										src=${ item.iconSrc }
										alt=${ item.iconAlt ?? '' }
										aria-hidden=${ item.iconAlt ? 'false' : 'true' }
									/>
								`
								: null }
							<span>${ item.label }</span>
							${ item.count ? html`<strong>${ item.count }</strong>` : null }
						</button>
					`;
				}) }
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
				min-width: 0;
			}

			.tabs {
				display: flex;
				flex-wrap: wrap;
				gap: 0.45rem;
				padding: 0 0.2rem 0.3rem;
			}

			button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 0.4rem;
				flex: 0 0 auto;
				min-height: 40px;
				padding: 0.4rem 0.7rem;
				background: #fffefb;
				border: 2px solid #000;
				border-radius: 12px 12px 6px 6px;
				box-shadow: 3px 3px 0 #000;
				color: #000;
				font: inherit;
				font-size: 0.82rem;
				font-weight: 900;
				cursor: pointer;
			}

			button[aria-selected='true'] {
				background: #7df9ff;
				transform: translate(2px, 2px);
				box-shadow: 1px 1px 0 #000;
			}

			button:focus-visible {
				outline: 3px solid #ff8c00;
				outline-offset: 2px;
			}

			img {
				width: 20px;
				height: 20px;
				object-fit: contain;
			}

			strong {
				padding: 0.08rem 0.38rem;
				background: rgba(255, 255, 255, 0.76);
				border: 1.5px solid #000;
				border-radius: 999px;
				font-size: 0.68rem;
			}

			@media (prefers-reduced-motion: reduce) {
				button {
					scroll-behavior: auto;
				}
			}
		`,
	];

}
