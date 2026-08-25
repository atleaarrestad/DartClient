import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { GameResult, GameTracker } from '../../../models/schemas.js';
import { SignalRSubscription } from '../../../services/signalRService.js';
import { postGameTemplate } from '../../../templates/dialogTemplates.js';
import { GamePage } from '../game-page/game-page.js';

@customElement('spectate-game-page')
export class SpectateGamePage extends GamePage {

	@state() private gameId!: string;
	private spectateSubscription?: SignalRSubscription;
	private readonly onGameUpdated = (gameId: string, gameTracker: GameTracker) => this.HandleOnGameUpdated(gameId, gameTracker);
	private readonly onGameFinished = (gameId: string, gameResult: GameResult) => this.HandleOnGameFinished(gameId, gameResult);
	constructor() {
		super();
	}

	override async initialize(generation: number): Promise<void> {
		this.gameId = this.gameService.getCachedGameId() ?? '';
		await super.initialize(generation);
	}

	protected override renderTopContent(): unknown {
		return html`
			<div class="sync-status sync-status--connected" role="note" aria-label="You are spectating this game">
				<span class="sync-status__dot" aria-hidden="true"></span>
				<div class="sync-status__copy">
					<span class="sync-status__title">Spectating</span>
				</div>
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
		const gameTracker = await this.gameService.getActiveGame(this.gameId);
		if (gameTracker) {
			this.updateGameState(gameTracker);
			return;
		}

		if (!this.isConnected)
			return;

		this.notificationService.addNotification({
			type:    'info',
			message: 'This game is no longer active. Returning to active games.',
		});
		this.gameService.removeCachedGameId();
		history.pushState({}, '', `${ getAbsoluteBase() }sessions`);
		window.dispatchEvent(new PopStateEvent('popstate'));
	}

	private HandleOnGameUpdated(gameId: string, gameTracker: GameTracker): void {
		if (gameId !== this.gameId)
			return;

		this.updateGameState(gameTracker);
	}

	private async HandleOnGameFinished(gameId: string, gameResult: GameResult): Promise<void> {
		if (gameId !== this.gameId)
			return;

		const achievementDefinitions = await this.achievementService.getAchievementDefinitions();
		this.dialogService.open(postGameTemplate(gameResult, this.users, achievementDefinitions), { title: 'Game Summary' });
	}

}
