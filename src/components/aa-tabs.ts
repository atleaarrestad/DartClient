import { css, html, LitElement, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { sharedStyles } from '../styles.js';

export interface AaTabItem {
	id:       string;
	label:    string;
	count?:   string;
	iconSrc?: string;
	iconAlt?: string;
}

type TabLevel = 'parent' | 'child';

@customElement('aa-tabs')
export class AaTabs extends LitElement {

	@property({ attribute: false }) items:       AaTabItem[] = [];
	@property({ type: String }) selected = '';
	@property({ type: String }) label = 'Tabs';
	@property({ attribute: false }) parentItems: AaTabItem[] = [];
	@property({ type: String }) parentSelected = '';
	@property({ type: String }) parentLabel = 'Tab groups';

	private selectTab(id: string, level: TabLevel): void {
		const selected = level === 'parent' ? this.parentSelected : this.selected;
		if (id === selected)
			return;

		if (level === 'parent')
			this.parentSelected = id;
		else
			this.selected = id;

		const eventName = level === 'parent' ? 'parent-tab-change' : 'tab-change';
		this.dispatchEvent(new CustomEvent<{ id: string; }>(eventName, {
			bubbles:  true,
			composed: true,
			detail:   { id },
		}));
	}

	private async handleKeyDown(
		event: KeyboardEvent,
		currentIndex: number,
		items: AaTabItem[],
		level: TabLevel,
	): Promise<void> {
		if (![ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes(event.key))
			return;

		event.preventDefault();

		let nextIndex = currentIndex;
		switch (event.key) {
		case 'ArrowLeft':
			nextIndex = (currentIndex - 1 + items.length) % items.length;
			break;
		case 'ArrowRight':
			nextIndex = (currentIndex + 1) % items.length;
			break;
		case 'Home':
			nextIndex = 0;
			break;
		case 'End':
			nextIndex = items.length - 1;
			break;
		}

		const nextTab = items[nextIndex];
		if (!nextTab)
			return;

		this.selectTab(nextTab.id, level);
		await this.updateComplete;
		this.shadowRoot
			?.querySelector<HTMLButtonElement>(
				`button[data-level="${ level }"][data-index="${ nextIndex }"]`,
			)
			?.focus();
	}

	private renderTabs(
		items: AaTabItem[],
		selectedId: string,
		label: string,
		level: TabLevel,
	): TemplateResult {
		const selected = items.some(item => item.id === selectedId)
			? selectedId
			: items[0]?.id ?? '';

		return html`
			<div class="${ level }-tabs" role="tablist" aria-label=${ label }>
				${ items.map((item, index) => {
					const isSelected = item.id === selected;

					return html`
						<button
							type="button"
							role="tab"
							data-level=${ level }
							data-index=${ index }
							aria-selected=${ isSelected ? 'true' : 'false' }
							tabindex=${ isSelected ? 0 : -1 }
							@click=${ () => this.selectTab(item.id, level) }
							@keydown=${ (event: KeyboardEvent) =>
								this.handleKeyDown(event, index, items, level) }
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

	override render(): TemplateResult {
		return html`
			<div class="tabset ${ this.parentItems.length > 0 ? 'tabset--nested' : '' }">
				${ this.parentItems.length > 0
					? this.renderTabs(
						this.parentItems,
						this.parentSelected,
						this.parentLabel,
						'parent',
					)
					: null }
				${ this.renderTabs(this.items, this.selected, this.label, 'child') }
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

			.tabset {
				display: grid;
				gap: 0.2rem;
				min-width: 0;
				padding: 0 0.15rem 0.35rem;
			}

			.parent-tabs,
			.child-tabs {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				background: transparent;
			}

			.parent-tabs {
				flex: 0 0 auto;
				justify-self: start;
			}

			.child-tabs {
				width: 100%;
				min-width: 0;
				padding-top: 0.15rem;
				border-top: 1px solid rgba(0, 0, 0, 0.22);
			}

			.tabset:not(.tabset--nested) .child-tabs {
				padding-top: 0;
				border-top: 0;
			}

			button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 0.4rem;
				flex: 0 0 auto;
				min-height: 32px;
				padding: 0.28rem 0.58rem;
				background: transparent;
				border: 0;
				border-right: 1px solid rgba(0, 0, 0, 0.28);
				border-bottom: 3px solid transparent;
				border-radius: 6px 6px 0 0;
				box-shadow: none;
				color: #000;
				font: inherit;
				font-size: 0.78rem;
				font-weight: 900;
				cursor: pointer;
			}

			.parent-tabs button:last-child,
			.child-tabs button:last-child {
				border-right: 0;
			}

			button[aria-selected='true'] {
				background: rgba(125, 249, 255, 0.28);
				border-bottom-color: #00aeba;
			}

			.parent-tabs button {
				min-height: 27px;
				padding: 0.18rem 0.55rem;
				font-size: 0.72rem;
			}

			.parent-tabs button[aria-selected='true'] {
				background: rgba(125, 249, 255, 0.28);
				border-bottom-color: #00aeba;
			}

			button:focus-visible {
				outline: 2px solid #ff8c00;
				outline-offset: -2px;
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
