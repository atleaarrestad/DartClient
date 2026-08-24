import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { getRankDisplayValue, getRankIcon, Rank } from '../../models/rank.js';
import rankDisplayStyles from './aa-rank-display.css?inline';

export type AaRankDisplayOrientation = 'horizontal' | 'vertical';

@customElement('aa-rank-display')
export class AaRankDisplay extends LitElement {

	@property({ type: Number }) rank?:                      Rank;
	@property({ type: String, attribute: 'context-label' }) contextLabel = '';
	@property({ type: String, attribute: 'empty-text' }) emptyText = '—';
	@property({ type: String, reflect: true }) orientation: AaRankDisplayOrientation = 'horizontal';
	@property({ type: Boolean, reflect: true }) compact = false;
	@property({ type: Boolean, attribute: 'icon-only', reflect: true }) iconOnly = false;

	override render(): TemplateResult {
		const name = getRankDisplayValue(this.rank);
		const displayName = this.rank === undefined ? this.emptyText : name;

		return html`
			<span class="rank-display" title=${ name }>
				<img class="rank-icon" src=${ getRankIcon(this.rank) } alt=${ name } />
				<span class="rank-copy">
					${ this.contextLabel
						? html`<span class="context-label">${ this.contextLabel }</span>`
						: null }
					<span class="rank-name">${ displayName }</span>
					<slot></slot>
				</span>
			</span>
		`;
	}

	static override styles = unsafeCSS(rankDisplayStyles);

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-rank-display': AaRankDisplay;
	}
}
