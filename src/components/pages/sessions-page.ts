import '../aa-loading-state.js';

import { css, html, TemplateResult } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAbsoluteBase } from '../../getAbsoluteBase.js';
import { RoundStatus } from '../../models/enums.js';
import { GameTracker, User } from '../../models/schemas.js';
import { GameService } from '../../services/gameService.js';
import { NotificationService } from '../../services/notificationService.js';
import { UserService } from '../../services/userService.js';
import { sharedStyles } from '../../styles.js';

const base = getAbsoluteBase();

@customElement('sessions-page')
export class SessionsPage extends LitElement {

	private notificationService: NotificationService;
	private gameService:         GameService;
	private userService:         UserService;

	@property({ type: Array }) gameTrackers: GameTracker[] = [];
	@property({ type: Array }) users:        User[] = [];
	@state() private loading = true;

	constructor() {
		super();
		this.notificationService = container.resolve(NotificationService);
		this.gameService = container.resolve(GameService);
		this.userService = container.resolve(UserService);
	}

	onBeforeEnter(_location: Location): void {}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		await this.loadGames();
	}

	private async loadGames(): Promise<void> {
		try {
			this.loading = true;

			const [ result, users ] = await Promise.all([
				this.gameService.getActiveGames(),
				this.userService.getAllUsers(),
			]);

			this.gameTrackers = result ?? [];
			this.users = users ?? [];
		}
		catch (err) {
			console.error(err);
			this.notificationService.addNotification({ message: "Couldn't load active games", type: 'danger' });
		}
		finally {
			this.loading = false;
		}
	}

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

		const years = Math.floor(days / 365);

		return `${ years }y ago`;
	}

	private playerCount(gameTracker: GameTracker): number {
		return gameTracker.playersRounds?.length ?? 0;
	}

	private totalRounds(gameTracker: GameTracker): number {
		return Math.max(
			0,
			...gameTracker.playersRounds.flatMap(pr =>
				(pr.rounds ?? [])
					.filter(r => r.roundStatus !== RoundStatus.Unplayed)
					.map(r => r.roundIndex + 1)),
		);
	}

	private getPlayerNames(gameTracker: GameTracker): string[] {
		return gameTracker.playersRounds.map((player, index) => {
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

	private handleOnGameSelected(gameTracker: GameTracker): void {
		this.gameService.setCachedGameId(gameTracker.id);
		history.pushState({}, '', `${ base }spectate/${ gameTracker.id }`);
		window.dispatchEvent(new PopStateEvent('popstate'));
	}

	override render(): TemplateResult {
		return html`
			<aa-loading-state
				?loading=${ this.loading }
				label="Finding active games"
			>
				${ this.loading ? null : this.renderContent() }
			</aa-loading-state>
		`;
	}

	private renderContent(): TemplateResult {
		return html`
			<section class="page-shell">
				<header class="page-head">
					<h2>Active games</h2>
				</header>

				${ this.gameTrackers.length === 0
					? html`
						<section class="empty">
							<div class="empty-target" aria-hidden="true">◎</div>
							<div>
								<h3>The oche is quiet</h3>
								<p>Active matches will appear here as soon as somebody starts playing.</p>
							</div>
						</section>
					`
					: html`
						<ul class="cards" role="list">
							${ this.gameTrackers.map((tracker, index) => {
								const started = tracker.started as Date;
								const startedAgo = this.timeAgo(started);
								const players = this.playerCount(tracker);
								const rounds = this.totalRounds(tracker);
								const playerNames = this.getPlayerNames(tracker);

								return html`
									<li>
										<button
											class="card"
											type="button"
											aria-label="Spectate ${ this.getMatchTitle(playerNames) }, started ${ startedAgo }"
											@click=${ () => this.handleOnGameSelected(tracker) }
										>
											<div class="card__top">
												<span class="match-number">Match ${ String(index + 1).padStart(2, '0') }</span>
												<span class="live-badge">
													<span class="live-dot" aria-hidden="true"></span>
													Live
												</span>
											</div>

											<div class="match-copy">
												<h3>${ this.getMatchTitle(playerNames) }</h3>
												<span class="ago" title=${ started.toLocaleString() }>Started ${ startedAgo }</span>
											</div>

											<div class="players" aria-label="Players">
												${ playerNames.length
													? playerNames.map(name => html`<span class="player-chip">@${ name }</span>`)
													: html`<span class="player-chip player-chip--empty">Waiting for the first player</span>` }
											</div>

											<div class="card__bottom">
												<div class="stats">
													<div class="stat">
														<span>Players</span>
														<strong>${ players }</strong>
													</div>
													<div class="stat">
														<span>Rounds</span>
														<strong>${ rounds }</strong>
													</div>
												</div>

												<span class="watch">
													Watch live
													<span aria-hidden="true">→</span>
												</span>
											</div>

											<span class="game-id">#${ tracker.id.toString().slice(0, 8) }</span>
										</button>
									</li>
								`;
							}) }
						</ul>
					` }
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
				box-sizing: border-box;
				height: 100%;
				min-height: 0;
				padding: 1rem;
				background: transparent;
				color: inherit;
			}

			aa-loading-state {
				--aa-loading-height: 100%;
				--aa-loading-min-height: 0;
			}

			.page-shell {
				display: grid;
				gap: 1.25rem;
				max-width: 1400px;
				margin: 0 auto;
			}

			.page-head {
				display: grid;
				justify-items: center;
				padding: 0.9rem 0 0.45rem;
			}

			.live-badge {
				display: inline-flex;
				align-items: center;
			}

			.page-head h2 {
				margin: 0;
				font-size: clamp(1.55rem, 3vw, 2.1rem);
				line-height: 1;
			}

			.live-badge {
				gap: 0.4rem;
				font-size: 0.78rem;
				font-weight: 900;
				letter-spacing: 0.08em;
				text-transform: uppercase;
			}

			.live-dot {
				width: 0.7rem;
				height: 0.7rem;
				flex: 0 0 auto;
				border: 2px solid #000;
				border-radius: 50%;
				background: #62f38d;
				box-shadow: 1px 1px 0 #000;
				animation: live-pulse 1.8s ease-out infinite;
			}

			.card:focus-visible {
				outline: 4px solid #ff8c00;
				outline-offset: 3px;
			}

			.cards {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 400px));
				justify-content: center;
				gap: 1.25rem;
				margin: 0;
				padding: 0 0.45rem 0.45rem 0;
			}

			.card {
				position: relative;
				display: grid;
				gap: 1rem;
				width: 100%;
				min-height: 290px;
				padding: 1.1rem;
				overflow: hidden;
				background: #e8f0ff;
				border: 3px solid #000;
				border-radius: 22px;
				box-shadow: 8px 8px 0 #000;
				color: #000;
				font: inherit;
				text-align: left;
				cursor: pointer;
				transition: transform 120ms ease, box-shadow 120ms ease;
			}

			li:nth-child(3n + 2) .card {
				background: #ffe5ef;
			}

			li:nth-child(3n + 3) .card {
				background: #e8f8df;
			}

			.card:hover {
				transform: translate(-3px, -3px);
				box-shadow: 11px 11px 0 #000;
			}

			.card:active {
				transform: translate(3px, 3px);
				box-shadow: 5px 5px 0 #000;
			}

			.card__top,
			.card__bottom {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
			}

			.match-number {
				font-size: 0.78rem;
				font-weight: 900;
				letter-spacing: 0.08em;
				text-transform: uppercase;
				opacity: 0.66;
			}

			.live-badge {
				padding: 0.25rem 0.55rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 999px;
				box-shadow: 2px 2px 0 #000;
			}

			.match-copy h3 {
				margin: 0;
				font-size: 1.45rem;
				line-height: 1.1;
			}

			.ago {
				display: block;
				margin-top: 0.3rem;
				font-size: 0.88rem;
				font-weight: 700;
				opacity: 0.65;
			}

			.players {
				display: flex;
				flex-wrap: wrap;
				align-content: flex-start;
				gap: 0.45rem;
				min-height: 2.15rem;
			}

			.player-chip {
				display: inline-flex;
				align-items: center;
				padding: 0.32rem 0.6rem;
				background: #fffaf3;
				border: 2px solid #000;
				border-radius: 999px;
				box-shadow: 2px 2px 0 #000;
				font-size: 0.82rem;
				font-weight: 900;
			}

			.player-chip--empty {
				opacity: 0.7;
			}

			.card__bottom {
				align-self: end;
				padding-top: 0.85rem;
				border-top: 3px solid #000;
			}

			.stats {
				display: flex;
				gap: 1rem;
			}

			.stat {
				display: grid;
				gap: 0.05rem;
			}

			.stat span {
				font-size: 0.72rem;
				font-weight: 800;
				text-transform: uppercase;
				opacity: 0.62;
			}

			.stat strong {
				font-size: 1.2rem;
				line-height: 1;
			}

			.watch {
				display: inline-flex;
				align-items: center;
				gap: 0.45rem;
				font-weight: 900;
			}

			.watch span {
				font-size: 1.3rem;
				transition: transform 120ms ease;
			}

			.card:hover .watch span {
				transform: translateX(4px);
			}

			.game-id {
				position: absolute;
				right: 0.8rem;
				bottom: 0.25rem;
				font-family: monospace;
				font-size: 0.65rem;
				opacity: 0.35;
			}

			.empty {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 1.25rem;
				min-height: 300px;
				padding: 2rem;
				background: #f5f3ff;
				border: 3px dashed #000;
				border-radius: 22px;
				text-align: left;
			}

			.empty-target {
				display: grid;
				place-items: center;
				width: 84px;
				height: 84px;
				flex: 0 0 auto;
				background: #dff362;
				border: 3px solid #000;
				border-radius: 50%;
				box-shadow: 5px 5px 0 #000;
				font-size: 3rem;
				font-weight: 900;
			}

			.empty h3 {
				margin: 0;
				font-size: 1.35rem;
			}

			.empty p {
				max-width: 480px;
				margin: 0.3rem 0 0;
				font-weight: 650;
				opacity: 0.7;
			}

			@keyframes live-pulse {
				0% {
					box-shadow: 1px 1px 0 #000, 0 0 0 0 rgba(98, 243, 141, 0.8);
				}
				70% {
					box-shadow: 1px 1px 0 #000, 0 0 0 7px rgba(98, 243, 141, 0);
				}
				100% {
					box-shadow: 1px 1px 0 #000, 0 0 0 0 rgba(98, 243, 141, 0);
				}
			}

			@media (max-width: 720px) {
				:host {
					padding: 0.75rem;
				}

				.card {
					min-height: 270px;
				}
			}

			@media (max-width: 460px) {
				.card__bottom,
				.empty {
					align-items: stretch;
					flex-direction: column;
				}

				.empty {
					text-align: center;
				}

				.empty-target {
					align-self: center;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.live-dot {
					animation: none;
				}

				.card,
				.watch span {
					transition: none;
				}
			}
		`,
	];

}
