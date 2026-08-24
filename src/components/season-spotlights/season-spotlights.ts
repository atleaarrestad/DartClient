import '../../ui/badge/aa-badge.js';
import '../../ui/card/aa-card.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { faIcons } from '../../faIcons.js';
import seasonSpotlightsStyles from './season-spotlights.css?inline';

export type SeasonSpotlightAction =
	| 'bull-specialist'
	| 'biggest-grinder'
	| 'biggest-group-player'
	| 'smallest-group-player'
	| 'twenty-master'
	| 'nineteen-master'
	| 'sixteen-master'
	| 'fourteen-master'
	| 'finisher'
	| 'achievement-hunter'
	| 'power-player'
	| 'clean-power-player'
	| 'range-king'
	| 'rim-king'
	| 'cleanest-thrower'
	| 'earliest-finisher';

export interface SeasonSpotlightQualification {
	iconClass:   string;
	label:       string;
	explanation: string;
}

export interface SeasonSpotlightCard {
	action:         SeasonSpotlightAction;
	title:          string;
	iconClass:      string;
	alias:          string;
	value:          string;
	subtext:        string;
	qualification?: SeasonSpotlightQualification;
}

export type SeasonSpotlightActionEvent = CustomEvent<SeasonSpotlightAction>;

export const seasonSpotlightActionEventName = 'season-spotlight-action';

@customElement('aa-season-spotlights')
export class SeasonSpotlights extends LitElement {

	@property({ attribute: false }) spotlights: SeasonSpotlightCard[] = [];
	@property({ type: Boolean, reflect: true }) embedded = false;

	private requestAction(action: SeasonSpotlightAction): void {
		this.dispatchEvent(new CustomEvent<SeasonSpotlightAction>(seasonSpotlightActionEventName, {
			bubbles:  true,
			composed: true,
			detail:   action,
		}));
	}

	private handleKeydown(event: KeyboardEvent, action: SeasonSpotlightAction): void {
		if (event.key !== 'Enter' && event.key !== ' ')
			return;

		event.preventDefault();
		this.requestAction(action);
	}

	override render(): TemplateResult | typeof nothing {
		if (!this.spotlights.length)
			return nothing;

		return html`
			<section class="spotlights" aria-label="Season spotlights">
				${ this.spotlights.map(spotlight => html`
					<aa-card
						class="spotlight-card"
						tabindex="0"
						role="button"
						aria-label=${ `Open ${ spotlight.title } top 10` }
						title="Open top 10"
						@click=${ () => this.requestAction(spotlight.action) }
						@keydown=${ (event: KeyboardEvent) => this.handleKeydown(event, spotlight.action) }
					>
						<div class="spotlight-card-top">
							<div class="spotlight-header">
								<span class="spotlight-icon" aria-hidden="true">
									<i class=${ spotlight.iconClass }></i>
								</span>
								<div>
									<h3>${ spotlight.title }</h3>
									<p>${ spotlight.alias }</p>
								</div>
							</div>

							${ spotlight.qualification
								? html`
									<aa-badge
										class="qualification-badge"
										pill
										title=${ spotlight.qualification.explanation }
										aria-label=${ spotlight.qualification.explanation }
									>
										<i class=${ spotlight.qualification.iconClass } aria-hidden="true"></i>
										<span>${ spotlight.qualification.label }</span>
									</aa-badge>
								`
								: nothing }
						</div>

						<div class="spotlight-value">${ spotlight.value }</div>
						<div class="spotlight-sub">${ spotlight.subtext }</div>
					</aa-card>
				`) }
			</section>
		`;
	}

	static override styles = [ faIcons, unsafeCSS(seasonSpotlightsStyles) ];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-season-spotlights': SeasonSpotlights;
	}

	interface HTMLElementEventMap {
		[seasonSpotlightActionEventName]: SeasonSpotlightActionEvent;
	}
}
