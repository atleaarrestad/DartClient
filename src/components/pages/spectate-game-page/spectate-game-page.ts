import { Router } from '@vaadin/router';
import { html, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { faIcons } from '../../../faIcons.js';
import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { GameResult, GameTracker, GameTrackerDelta } from '../../../models/schemas.js';
import { SignalRSubscription } from '../../../services/signalRService.js';
import { postGameTemplate } from '../../../templates/dialogTemplates.js';
import { GamePage } from '../game-page/game-page.js';
import spectateGamePageStyles from './spectate-game-page.css?inline';

@customElement('spectate-game-page')
export class SpectateGamePage extends GamePage {

	@state() private gameId!: string;
	private spectateSubscription?: SignalRSubscription;
	private readonly onGameUpdated = (gameId: string, gameTracker: GameTracker) => this.HandleOnGameUpdated(gameId, gameTracker);
	private readonly onGameDelta = (gameId: string, delta: GameTrackerDelta) => void this.HandleOnGameDelta(gameId, delta);
	private readonly onGameFinished = (gameId: string, gameResult: GameResult) => this.HandleOnGameFinished(gameId, gameResult);
	private synchronizationPromise?: Promise<void>;

	override async initialize(generation: number): Promise<void> {
		// The spectated game never goes into the player's cached game id, which belongs to
		// the game they play on the index page.
		this.gameId = this.getGameIdFromRoute() ?? '';

		await super.initialize(generation);
	}

	protected override getInitialGameId(): string | undefined {
		return this.gameId || undefined;
	}

	protected override handleInitialGameMissing(): void {
		this.returnToActiveGames();
	}

	private getGameIdFromRoute(): string | undefined {
		const routePrefix = `${ getAbsoluteBase() }spectate/`;
		const gameId = window.location.pathname
			.slice(routePrefix.length)
			.split('/')[0];

		return gameId ? decodeURIComponent(gameId) : undefined;
	}

	protected override renderPlayerHeaderContent(): unknown {
		return html`
			<div class="spectator-game-header" role="status">
				<span class="spectator-game-header__label">
					<i class="fa-solid fa-eye" aria-hidden="true"></i>
					Spectator mode
				</span>
				<a class="spectator-game-header__join" href=${ getAbsoluteBase() }>Join game</a>
			</div>
		`;
	}

	protected override async registerSignalRSubscriptions(): Promise<void> {
		const baseSubscriptionsReady = super.registerSignalRSubscriptions();

		if (!this.gameId) {
			await baseSubscriptionsReady;
			return;
		}

		this.spectateSubscription = this.gameLiveService.subscribeToGame(
			this.gameId,
			{
				onUpdated:  this.onGameUpdated,
				onDelta:    this.onGameDelta,
				onFinished: this.onGameFinished,
			},
			() => this.synchronizeGameState(),
		);

		await Promise.all([
			baseSubscriptionsReady,
			this.spectateSubscription.ready,
		]);
	}

	protected override async cleanupSignalRSubscriptions(): Promise<void> {
		const subscription = this.spectateSubscription;
		this.spectateSubscription = undefined;
		await subscription?.dispose();

		await super.cleanupSignalRSubscriptions();
	}

	private async synchronizeGameState(): Promise<void> {
		this.synchronizationPromise ??= this.fetchAndApplyGameState()
			.finally(() => {
				this.synchronizationPromise = undefined;
			});

		await this.synchronizationPromise;
	}

	private async fetchAndApplyGameState(): Promise<void> {
		const gameTracker = await this.gameService.getActiveGame(this.gameId);
		if (gameTracker) {
			this.updateGameState(gameTracker);
			return;
		}

		if (!this.isConnected)
			return;

		this.returnToActiveGames();
	}

	private returnToActiveGames(): void {
		this.notificationService.addNotification({
			type:    'info',
			message: 'This game is no longer active. Returning to active games.',
		});
		Router.go(`${ getAbsoluteBase() }sessions`);
	}

	private HandleOnGameUpdated(gameId: string, gameTracker: GameTracker): void {
		if (gameId !== this.gameId)
			return;

		this.updateGameState(gameTracker);
	}

	private async HandleOnGameDelta(gameId: string, delta: GameTrackerDelta): Promise<void> {
		if (gameId !== this.gameId)
			return;

		let status = this.applyGameDelta(delta);
		if (status !== 'gap' && status !== 'invalid')
			return;

		await this.synchronizeGameState();
		status = this.applyGameDelta(delta);
		if (status === 'gap' || status === 'invalid')
			await this.synchronizeGameState();
	}

	private async HandleOnGameFinished(gameId: string, gameResult: GameResult): Promise<void> {
		if (gameId !== this.gameId)
			return;

		this.dialogService.open(
			postGameTemplate(gameResult, this.users),
			{ title: 'Game Summary' },
		);
	}

	static override styles = [ ...GamePage.styles, faIcons, unsafeCSS(spectateGamePageStyles) ];

}
