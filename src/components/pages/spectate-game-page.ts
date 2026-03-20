import '../aa-button-cmp.js';
import { customElement, state } from 'lit/decorators.js';
import { GamePage } from './game-page.js';
import { GameResult, GameTracker } from "../../models/schemas.js";
import { postGameTemplate } from "../../templates/dialogTemplates.js";

@customElement('spectate-game-page')
export class SpectateGamePage extends GamePage {
	@state() private gameId!:         string;
	private readonly spectateSubscriptionKey = 'spectate-game';
	private readonly onGameUpdated = (gameId: string, gameTracker: GameTracker) => this.HandleOnGameUpdated(gameId, gameTracker);
	private readonly onGameFinished = (gameId: string, gameResult: GameResult) => this.HandleOnGameFinished(gameId, gameResult);
	constructor() {
		super();
	}
	
	override async initialize(): Promise<void> {
		this.gameId = this.gameService.getCachedGameId() ?? "";
		await super.initialize();
	}

	override async disconnectedCallback(): Promise<void> {
		this.signalRService.off("OnGameUpdated", this.onGameUpdated);
		this.signalRService.off("OnGameFinished", this.onGameFinished);
		await super.disconnectedCallback();
	}

	protected override async registerSignalRSubscriptions(): Promise<void> {
		await super.registerSignalRSubscriptions();

		if (!this.gameId)
			return;

		this.signalRService.off("OnGameUpdated", this.onGameUpdated);
		this.signalRService.off("OnGameFinished", this.onGameFinished);
		this.signalRService.on<GameTracker>("OnGameUpdated", this.onGameUpdated);
		this.signalRService.on<GameResult>("OnGameFinished", this.onGameFinished);
		await this.signalRService.subscribe(
			this.spectateSubscriptionKey,
			"SubscribeSpectate",
			[ this.gameId ],
			"UnsubscribeSpectate",
		);
	}

	protected override async beforeSignalRStop(): Promise<void> {
		await this.signalRService.unsubscribe(this.spectateSubscriptionKey);

		await super.beforeSignalRStop();
	}
	private HandleOnGameUpdated(gameId: string, gameTracker: GameTracker): void {
		if (gameId !== this.gameId) {
			return;
		}
		this.updateGameState(gameTracker);
	}
	private async HandleOnGameFinished(gameId: string, gameResult: GameResult): Promise<void> {
		if (gameId !== this.gameId) {
			return;
		}
		const achievementDefinitions = await this.achievementService.getAchievementDefinitions();
		this.dialogService.open(postGameTemplate(gameResult, this.users, achievementDefinitions), { title: 'Game Summary' });
	}
}
