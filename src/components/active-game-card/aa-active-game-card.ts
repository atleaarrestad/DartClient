import '../player-chip/aa-player-chip.js';
import '../../ui/badge/aa-badge.js';
import '../../ui/stat/aa-stat.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { RoundStatus } from '../../models/enums.js';
import { GameTracker, User } from '../../models/schemas.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import activeGameCardStyles from './aa-active-game-card.css?inline';

export const gameSelectedEventName = 'game-selected';

@customElement('aa-active-game-card')
export class ActiveGameCard extends LitElement {

	@property({ attribute: false }) gameTracker!: GameTracker;
	@property({ attribute: false }) users:        User[] = [];
	@property({ type: Number }) matchNumber = 1;

	private timeAgo(date: Date): string {
		const diffMs = Date.now() - date.getTime();
		const sec = Math.max(0, Math.floor(diffMs / 1000));
		if (sec < 60)
			return `${ sec }s ago`;

		const min = Math.floor(sec / 60);
		if (min < 60)
			return `${ min }m ago`;

		const hrs = Math.floor(min / 60);
		if (hrs < 24)
			return `${ hrs }h ago`;

		const days = Math.floor(hrs / 24);
		if (days < 7)
			return `${ days }d ago`;

		const weeks = Math.floor(days / 7);
		if (weeks < 5)
			return `${ weeks }w ago`;

		const months = Math.floor(days / 30);
		if (months < 12)
			return `${ months }mo ago`;

		return `${ Math.floor(days / 365) }y ago`;
	}

	private get playerCount(): number {
		return this.gameTracker.playersRounds.length;
	}

	private get totalRounds(): number {
		return Math.max(
			0,
			...this.gameTracker.playersRounds.flatMap(player =>
				player.rounds
					.filter(round => round.roundStatus !== RoundStatus.Unplayed)
					.map(round => round.roundIndex + 1)),
		);
	}

	private get playerNames(): string[] {
		return this.gameTracker.playersRounds.map((player, index) => {
			const user = this.users.find(candidate => candidate.id === player.playerId);

			return user?.alias || user?.name || `Player ${ index + 1 }`;
		});
	}

	private getMatchTitle(playerNames: string[]): string {
		if (playerNames.length === 0)
			return 'Waiting for players';

		if (playerNames.length === 1)
			return `${ playerNames[0] } is warming up`;

		if (playerNames.length === 2)
			return `${ playerNames[0] } vs ${ playerNames[1] }`;

		return `${ playerNames[0] }, ${ playerNames[1] } + ${ playerNames.length - 2 } more`;
	}

	private selectGame(): void {
		this.dispatchEvent(new CustomEvent<GameTracker>(gameSelectedEventName, {
			bubbles:  true,
			composed: true,
			detail:   this.gameTracker,
		}));
	}

	override render(): TemplateResult {
		const started = this.gameTracker.started;
		const startedAgo = this.timeAgo(started);
		const playerNames = this.playerNames;
		const matchTitle = this.getMatchTitle(playerNames);
		const colorVariant = (this.matchNumber - 1) % 3;

		return html`
			<button
				class="card card--${ colorVariant }"
				type="button"
				aria-label="Spectate ${ matchTitle }, started ${ startedAgo }"
				@click=${ this.selectGame }
			>
				<div class="card__top">
					<span class="match-number">Match ${ String(this.matchNumber).padStart(2, '0') }</span>
					<aa-badge variant="success" pill>
						<span class="live-dot" aria-hidden="true"></span>
						Live
					</aa-badge>
				</div>

				<div class="match-copy">
					<h3>${ matchTitle }</h3>
					<span class="ago" title=${ started.toLocaleString() }>Started ${ startedAgo }</span>
				</div>

				<div class="players" aria-label="Players">
					${ playerNames.length
						? playerNames.map(name => html`<aa-player-chip>@${ name }</aa-player-chip>`)
						: html`<aa-player-chip empty>Waiting for the first player</aa-player-chip>` }
				</div>

				<div class="card__bottom">
					<div class="stats">
						<aa-stat compact label="Players" value=${ this.playerCount }></aa-stat>
						<aa-stat compact label="Rounds" value=${ this.totalRounds }></aa-stat>
					</div>

					<span class="watch">
						Watch live
						<span aria-hidden="true">→</span>
					</span>
				</div>

				<span class="game-id">#${ this.gameTracker.id.slice(0, 8) }</span>
			</button>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(activeGameCardStyles),
	];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-active-game-card': ActiveGameCard;
	}
}
