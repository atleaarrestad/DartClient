import { Router } from '@vaadin/router';
import { css, html } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';
import { container } from 'tsyringe';

import { sharedStyles } from '../../../styles.js';
import { getAbsoluteBase } from '../../getAbsoluteBase.js';
import { RoundStatus } from '../../models/enums.js';
import { GameTracker, PlayerRounds, Round, User } from '../../models/schemas.js';
import { DialogService } from '../../services/dialogService.js';
import { GameService } from '../../services/gameService.js';
import { NotificationService } from '../../services/notificationService.js';
import { SeasonService } from '../../services/seasonService.js';
import { UserService } from '../../services/userService.js';

const base = getAbsoluteBase();

@customElement('sessions-page')
export class SessionsPage extends LitElement {

	private notificationService: NotificationService;
	private gameService:         GameService;

	@property({ type: Array }) gameTrackers: GameTracker[] = [];
	@property({ type: Array }) users:        User[] = [];
	@state() private loading = true;

	constructor() {
		super();
		this.notificationService = container.resolve(NotificationService);
		this.gameService = container.resolve(GameService);
	}

	onBeforeEnter(_location: Location): void {}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		await this.refresh();
	}

	private async refresh(): Promise<void> {
		try {
			this.loading = true;
			const result = await this.gameService.getActiveGames();
			this.gameTrackers = result ?? [];
		}
		catch (err) {
			console.error(err);
			this.notificationService.addNotification("Couldn't load active games", 'danger');
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

	private handleOnGameSelected(gameTracker: GameTracker): void {
		this.gameService.setCachedGameId(gameTracker.id);
		Router.go(base);
	}

	private onCardKeydown(e: KeyboardEvent, tracker: GameTracker) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			this.handleOnGameSelected(tracker);
		}
	}

	override render() {
		if (this.loading)
			return html`<div class="loading">loading active games…</div>`;

		if (!this.gameTrackers.length) {
			return html`
				<section class="empty">
					<div class="empty-card">
						<h3>No active games</h3>
						<p>when a match starts, it’ll show up here.</p>
						<button class="btn" @click=${ this.refresh }>Refresh</button>
					</div>
				</section>
			`;
		}

		return html`
			<header class="page-head">
				<h2>Active games</h2>
				<button class="btn" @click=${ this.refresh }>Refresh</button>
			</header>

			<ul class="cards" role="list">
				${ map(this.gameTrackers, (tracker: GameTracker) => {
					const started = tracker.started as Date;
					const startedAgo = this.timeAgo(started);
					const players = this.playerCount(tracker);
					const rounds = this.totalRounds(tracker);

					return html`
						<li
							class="card"
							role="button"
							tabindex="0"
							aria-label="Open game started ${ startedAgo } with ${ players } players"
							@click=${ () => this.handleOnGameSelected(tracker) }
							@keydown=${ (e: KeyboardEvent) => this.onCardKeydown(e, tracker) }
						>
							<div class="card__top">
								<span class="badge">Active</span>
								<span class="ago" title=${ started.toLocaleString() }>Started ${ startedAgo }</span>
							</div>

							<h3 class="card__title">Game #${ (tracker.id ?? '').toString().slice(0, 8) }</h3>

							<div class="meta">
								<div class="pill">
									<span class="pill__label">Players</span>
									<span class="pill__value">${ players }</span>
								</div>
								<div class="pill">
									<span class="pill__label">Rounds</span>
									<span class="pill__value">${ rounds }</span>
								</div>
							</div>

							<div class="cta">
								<span class="cta__hint">Open session</span>
								<span class="arrow" aria-hidden="true">➜</span>
							</div>
						</li>
					`;
				}) }
			</ul>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host,
			:host * {
				width: auto;
				height: auto;
			}

			/* basic page layout */
			:host {
				display: block;
				padding: 1rem;
				background: transparent;
				color: inherit;
			}
			header,
			section,
			ul,
			li,
			div,
			h2,
			h3,
			p,
			span,
			button {
				display: revert;
			}
			ul {
				list-style: none;
				padding: 0;
				margin: 0;
			}

			.page-head {
				display: flex;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 1rem;
			}
			h2 {
				margin: 0;
				font-size: 1.4rem;
			}

			.loading {
				padding: 2rem 0.5rem;
			}

			.empty {
				display: grid;
				place-items: center;
				min-height: 40vh;
			}
			.empty-card {
				background: #f5f3ff;
				border: 2px solid #000;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 18px;
				padding: 1.25rem 1.5rem;
				box-shadow: 6px 6px 0 #000;
				text-align: center;
				max-width: 480px;
			}
			.empty-card h3 {
				margin-bottom: 0.25rem;
			}
			.empty-card p {
				margin-bottom: 0.75rem;
				opacity: 0.8;
			}

			.btn {
				appearance: none;
				background: #fff;
				border: 2px solid #000;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 14px;
				padding: 0.5rem 0.9rem;
				font-weight: 700;
				cursor: pointer;
				box-shadow: 4px 4px 0 #000;
			}
			.btn:active {
				transform: translate(2px, 2px);
				box-shadow: 2px 2px 0 #000;
			}

			.cards {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
				gap: 1rem;
			}

			.card {
				background: #e8f0ff;
				border: 2px solid #000;
				border-right-width: 6px; /* thicker on right */
				border-bottom-width: 6px; /* thicker on bottom */
				border-radius: 22px;
				padding: 1rem;
				box-shadow: 8px 8px 0 #000; /* neo-brutalism shadow */
				cursor: pointer;
				user-select: none;
				transition: transform 0.05s ease-in-out;
				outline: none;
			}
			.card:hover {
				transform: translate(-1px, -1px);
			}
			.card:focus-visible {
				box-shadow: 8px 8px 0 #000, 0 0 0 3px #000 inset;
			}

			.card__top {
				display: flex;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 0.5rem;
			}
			.badge {
				background: #fff;
				border: 2px solid #000;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 999px;
				padding: 0.15rem 0.55rem;
				font-size: 0.8rem;
				font-weight: 800;
				letter-spacing: 0.02em;
			}
			.ago {
				font-size: 0.9rem;
				opacity: 0.8;
			}

			.card__title {
				margin: 0 0 0.75rem 0;
				font-size: 1.15rem;
				line-height: 1.2;
			}

			.meta {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 0.5rem;
				margin-bottom: 0.75rem;
			}
			.pill {
				background: #fff;
				border: 2px solid #000;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 14px;
				padding: 0.5rem 0.6rem;
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
			}
			.pill__label {
				font-size: 0.8rem;
				opacity: 0.75;
			}
			.pill__value {
				font-weight: 900;
				font-size: 1rem;
			}

			.cta {
				display: flex;
				align-items: center;
				justify-content: flex-end;
				gap: 0.5rem;
				font-weight: 800;
			}
			.arrow {
				transform: translateY(1px);
			}
		`,
	];

}
