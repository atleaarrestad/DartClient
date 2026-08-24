import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { Season, SeasonStatistics, User } from '../../models/schemas.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import '../rank-display/aa-rank-display.js';
import userSeasonSummaryStyles from './aa-user-season-summary.css?inline';

export const userSeasonChangedEventName = 'user-season-changed';

export type UserSeasonChangedEvent = CustomEvent<Season>;

@customElement('aa-user-season-summary')
export class AaUserSeasonSummary extends LitElement {

	@property({ attribute: false }) user?: User;
	@property({ attribute: false }) seasons: Season[] = [];
	@property({ attribute: false }) selectedSeason?: Season;
	@property({ attribute: false }) statistics?: SeasonStatistics;
	@property({ type: Boolean }) loading = false;

	private handleSeasonChange(event: Event): void {
		const seasonId = (event.target as HTMLSelectElement).value;
		const season = this.seasons.find(candidate => candidate.id === seasonId);

		if (!season || season.id === this.selectedSeason?.id)
			return;

		this.dispatchEvent(new CustomEvent<Season>(userSeasonChangedEventName, {
			detail:   season,
			bubbles:  true,
			composed: true,
		}));
	}

	override render(): TemplateResult {
		const stats = this.statistics;
		if (!this.user || !this.selectedSeason || !stats)
			return html``;

		const highestMmr = Math.max(stats.mmr, ...stats.matchSnapshots.map(snapshot => snapshot.mmr));
		const totalFinishes = stats.finishCount.reduce((total, finish) => total + finish.count, 0);

		return html`
			<section class="hero-panel" part="hero-panel">
				<div class="hero-row">
					<div class="identity-line">
						<h2>${this.user.name}</h2>
						<span class="alias">@${this.user.alias}</span>
					</div>

					<label class="season-picker">
						<span>Season</span>
						<select @change=${this.handleSeasonChange} ?disabled=${this.loading}>
							${this.seasons.map(
								season => html`
									<option
										value=${season.id}
										?selected=${season.id === this.selectedSeason?.id}
									>
										${season.name}
									</option>
								`,
							)}
						</select>
					</label>
				</div>

				<div class="summary-board">
					<div class="summary-cell summary-cell--rank">
						<aa-rank-display
							.rank=${stats.currentRank}
							context-label="Current rank"
						></aa-rank-display>
					</div>

					<div class="summary-cell summary-cell--rank">
						<aa-rank-display
							.rank=${stats.highestAchievedRank}
							context-label="Highest rank"
						></aa-rank-display>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Current MMR</span>
							<strong class="summary-value">${stats.mmr}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest MMR</span>
							<strong class="summary-value">${highestMmr}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest round score</span>
							<strong class="summary-value">${stats.highestRoundScore}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest raw round score</span>
							<strong class="summary-value">${stats.highestRoundScoreNoSeasonRules}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Highest finishing score</span>
							<strong class="summary-value">${stats.highestRoundScoreForVictory}</strong>
						</div>
					</div>

					<div class="summary-cell">
						<div class="summary-copy">
							<span class="summary-label">Finishes</span>
							<strong class="summary-value">${totalFinishes}</strong>
						</div>
					</div>
				</div>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(userSeasonSummaryStyles),
	];
}

declare global {

	interface HTMLElementTagNameMap {
		'aa-user-season-summary': AaUserSeasonSummary;
	}

	interface HTMLElementEventMap {
		'user-season-changed': UserSeasonChangedEvent;
	}
}
