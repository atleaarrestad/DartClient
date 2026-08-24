import '../../ui/badge/aa-badge.js';
import '../../ui/button/aa-button.js';
import '../../ui/card/aa-card.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import seasonRulesSummaryStyles from './season-rules-summary.css?inline';

export type SeasonRulesSummaryAction = 'score-modifiers' | 'win-conditions';

export interface SeasonRulesSummaryCard {
	action:       SeasonRulesSummaryAction;
	title:        string;
	buttonLabel:  string;
	count:        number;
	previewNames: string[];
	extraCount:   number;
}

export type SeasonRulesSummaryActionEvent = CustomEvent<SeasonRulesSummaryAction>;

export const seasonRulesSummaryActionEventName = 'season-rules-summary-action';

@customElement('aa-season-rules-summary')
export class SeasonRulesSummary extends LitElement {

	@property({ attribute: false }) cards: SeasonRulesSummaryCard[] = [];

	private requestAction(action: SeasonRulesSummaryAction): void {
		this.dispatchEvent(new CustomEvent<SeasonRulesSummaryAction>(seasonRulesSummaryActionEventName, {
			bubbles:  true,
			composed: true,
			detail:   action,
		}));
	}

	override render(): TemplateResult | typeof nothing {
		if (!this.cards.length)
			return nothing;

		return html`
			<section class="season-rules-overview-section" aria-labelledby="season-rules-title">
				<div class="section-heading-row">
					<h3 id="season-rules-title" class="section-title">Season rules</h3>
				</div>

				<div class="season-rules-summary-grid">
					${ this.cards.map(card => html`
						<aa-card class="rules-summary-card">
							<div class="rules-summary-top">
								<h3 class="rules-summary-title">${ card.title }</h3>
								<aa-badge class="rules-summary-count">${ card.count }</aa-badge>
							</div>

							<div class="rules-summary-preview">
								${ card.previewNames.map(name => html`
									<aa-badge class="rules-summary-chip" pill>${ name }</aa-badge>
								`) }
								${ card.extraCount > 0
									? html`
										<aa-badge class="rules-summary-chip muted" pill>
											+${ card.extraCount } more
										</aa-badge>
									`
									: nothing }
							</div>

							<div class="rules-summary-actions">
								<aa-button
									class="rules-summary-button"
									variant="secondary"
									@click=${ () => this.requestAction(card.action) }
								>
									${ card.buttonLabel }
								</aa-button>
							</div>
						</aa-card>
					`) }
				</div>
			</section>
		`;
	}

	static override styles = unsafeCSS(seasonRulesSummaryStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-season-rules-summary': SeasonRulesSummary;
	}

	interface HTMLElementEventMap {
		[seasonRulesSummaryActionEventName]: SeasonRulesSummaryActionEvent;
	}
}
