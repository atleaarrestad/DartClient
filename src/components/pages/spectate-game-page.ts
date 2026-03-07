import '../aa-button-cmp.js';
import { container } from 'tsyringe';
import { customElement, state } from 'lit/decorators.js';
import { GamePage } from './game-page.js';
import { signalRService } from "../../services/signalRService.js";
import { GameResult, GameTracker } from "../../models/schemas.js";
import { postGameTemplate } from "../../templates/dialogTemplates.js";

@customElement('spectate-game-page')
export class SpectateGamePage extends GamePage {
	@state() private gameId!:         string;
	constructor() {
		super();
	}
	
	override async initialize(): Promise<void> {
		await super.initialize();
		this.gameId = this.gameService.getCachedGameId() ?? "";

		this.signalRService.on<GameTracker>("OnGameUpdated", (gameId, gameTracker) => this.HandleOnGameUpdated(gameId, gameTracker));
		this.signalRService.on<GameResult>("OnGameFinished", (gameId, gameResult) => this.HandleOnGameFinished(gameId, gameResult));
		await this.signalRService.invoke<void>("SubscribeSpectate", this.gameId);
	}

	override async disconnectedCallback(): Promise<void> {
		super.disconnectedCallback();
		await this.signalRService.invoke<void>("UnsubscribeSpectate", this.gameId);
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
