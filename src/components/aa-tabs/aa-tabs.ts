import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { sharedStyles } from '../../styles/shared-styles.js';
import tabsStyles from './aa-tabs.css?inline';

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
		unsafeCSS(tabsStyles),
	];

}
