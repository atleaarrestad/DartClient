import '../aa-button-cmp.js';
import { container } from 'tsyringe';
import { customElement, state } from 'lit/decorators.js';
import { GamePage } from './game-page.js';
import { signalRService } from "../../services/signalRService.js";
import { GameResult, GameTracker } from "../../models/schemas.js";
import { postGameTemplate } from "../../templates/dialogTemplates.js";

@customElement('spectate-game-page')
export class SpectateGamePage extends GamePage {

	protected signalRService:            signalRService;
	@state() private gameId!:         string;
	constructor() {
		super();

		this.signalRService = container.resolve(signalRService);
		this.signalRService.buildHubConnection("hubs/spectate");
	}
	
	override async initialize(): Promise<void> {
		await super.initialize();
		this.gameId = this.gameService.getCachedGameId() ?? "";

		this.signalRService.on<GameTracker>("OnGameUpdated", (gameId, gameTracker) => this.HandleOnGameUpdated(gameId, gameTracker));
		this.signalRService.on<GameResult>("OnGameFinished", (gameId, gameResult) => this.HandleOnGameFinished(gameId, gameResult));

		await this.signalRService.start();
		await this.signalRService.invoke<void>("Subscribe", this.gameId);
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.signalRService.stop();
	}
	private HandleOnGameUpdated(gameId: string, gameTracker: GameTracker): void {
		if (gameId !== this.gameId) {
			return;
		}
		this.updateGameState(gameTracker);
	}
	private HandleOnGameFinished(gameId: string, gameResult: GameResult): void {
		if (gameId !== this.gameId) {
			return;
		}
		this.dialogService.open(postGameTemplate(gameResult, this.users), { title: 'Game Summary' });
	}
}
