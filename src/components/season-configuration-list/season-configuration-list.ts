import '../../ui/button/aa-button.js';
import '../../ui/card/aa-card.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { sharedStyles } from '../../styles/shared-styles.js';
import seasonConfigurationListStyles from './season-configuration-list.css?inline';

export type SeasonConfigurationItemId =
	| 'score-modifiers'
	| 'win-conditions'
	| 'game-constraints'
	| 'rank-thresholds'
	| 'achievement-rewards'
	| 'mmr-calculation';

export interface SeasonConfigurationPreviewImage {
	src:  string;
	alt?: string;
}

export interface SeasonConfigurationListItem {
	id:             SeasonConfigurationItemId;
	title:          string;
	summary:        string;
	activateLabel:  string;
	previewImages?: SeasonConfigurationPreviewImage[];
}

export type SeasonConfigurationItemActivateEvent = CustomEvent<SeasonConfigurationItemId>;

export const seasonConfigurationItemActivateEventName = 'season-configuration-item-activate';

@customElement('aa-season-configuration-list')
export class SeasonConfigurationList extends LitElement {

	@property({ attribute: false }) items: SeasonConfigurationListItem[] = [];

	private configurationPanel?: HTMLElement;
	private readonly configurationPanelResizeObserver = new ResizeObserver(() =>
		this.updateColumnCount());

	override disconnectedCallback(): void {
		this.configurationPanelResizeObserver.disconnect();
		this.configurationPanel = undefined;
		super.disconnectedCallback();
	}

	override updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties);

		const configurationPanel =
			this.renderRoot.querySelector<HTMLElement>('.configuration-panel');
		if (configurationPanel !== this.configurationPanel) {
			this.configurationPanelResizeObserver.disconnect();
			this.configurationPanel = configurationPanel;

			if (configurationPanel)
				this.configurationPanelResizeObserver.observe(configurationPanel);
		}

		this.updateColumnCount();
	}

	private updateColumnCount(): void {
		const panel = this.configurationPanel;
		if (!panel || panel.clientWidth === 0 || this.items.length === 0)
			return;

		const styles = getComputedStyle(panel);
		const minimumItemWidth =
			Number.parseFloat(styles.getPropertyValue('--configuration-item-min-width'))
			|| 220;
		const gap = Number.parseFloat(styles.columnGap) || 0;
		const maximumColumns = Math.max(
			1,
			Math.floor((panel.clientWidth + gap) / (minimumItemWidth + gap)),
		);
		const rowCount = Math.ceil(this.items.length / maximumColumns);
		const balancedColumns = Math.ceil(this.items.length / rowCount);
		const columnCount = String(Math.max(1, balancedColumns));

		if (panel.style.getPropertyValue('--configuration-columns') !== columnCount)
			panel.style.setProperty('--configuration-columns', columnCount);
	}

	private activateItem(id: SeasonConfigurationItemId): void {
		this.dispatchEvent(new CustomEvent<SeasonConfigurationItemId>(
			seasonConfigurationItemActivateEventName,
			{
				detail:   id,
				bubbles:  true,
				composed: true,
			},
		));
	}

	override render(): TemplateResult | typeof nothing {
		if (!this.items.length)
			return nothing;

		return html`
			<section class="editor-section">
				<div class="section-heading">
					<h3>Season settings</h3>
				</div>

				<div class="configuration-panel">
					${ this.items.map(item => html`
						<aa-card
							class="configuration-item
								${ item.previewImages?.length ? 'configuration-item--with-icon' : '' }"
						>
							${ item.previewImages?.length
								? html`
									<div class="configuration-item__icon" aria-hidden="true">
										<div class="configuration-item__icons">
											${ item.previewImages.map(image => html`
												<img src=${ image.src } alt=${ image.alt ?? '' } />
											`) }
										</div>
									</div>
								`
								: nothing }
							<div class="configuration-item__copy">
								<strong>${ item.title }</strong>
								${ item.summary ? html`<small>${ item.summary }</small>` : nothing }
							</div>
							<aa-button
								class="settings-button"
								type="button"
								variant="secondary"
								size="small"
								.accessibleLabel=${ item.activateLabel }
								title=${ item.activateLabel }
								@click=${ () => this.activateItem(item.id) }
							>
								<svg aria-hidden="true" viewBox="0 0 24 24">
									<path
										d="
											M19.14 12.94a7.4 7.4 0 0 0 .05-.94 7.4 7.4 0 0 0-.05-.94l2.03-1.58
											-1.92-3.32-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.87 3h-3.84l-.36 3.18
											c-.58.24-1.12.56-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58a7.4 7.4 0 0 0-.05.94
											c0 .32.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.38 1.05.7 1.63.94
											l.36 3.18h3.84l.36-3.18c.58-.24 1.12-.56 1.63-.94l2.39.96 1.92-3.32
											-2.03-1.58ZM12.95 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z
										"
									></path>
								</svg>
							</aa-button>
						</aa-card>
					`) }
				</div>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(seasonConfigurationListStyles),
	];

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-season-configuration-list': SeasonConfigurationList;
	}

	interface HTMLElementEventMap {
		[seasonConfigurationItemActivateEventName]: SeasonConfigurationItemActivateEvent;
	}

}
