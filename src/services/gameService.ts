import { injectable, container } from "tsyringe";
import { DataService } from "./dataService.js";
import { CacheService } from "./cacheService.js";
import { GameTracker } from "../models/schemas.js";
import { DartThrow } from "../models/dartThrowSchema.js";

@injectable()
export class GameService {
	private dataService: DataService;
	private cacheService: CacheService;

	constructor() {
		this.dataService = container.resolve(DataService);
		this.cacheService = container.resolve(CacheService);
	}

	public async requestNewGame(): Promise<string> {
		debugger;
		const gameId = await this.dataService.RequestNewGame();
		this.cacheService.SetGameId(gameId);

		return gameId;
	}

	public async removePlayer(gameId: string, playerId: string): Promise<GameTracker> {
		return this.dataService.removePlayerFromGameSession(gameId, playerId)
	}

	public async addPlayerToGame(gameId: string, playerId: string): Promise<GameTracker> {
		return await this.dataService.AddPlayerToGameSession(gameId, playerId);
	}

	public async addDartThrowToGame(gameId: string, playerId: string, roundNumber: number, dartThrow: DartThrow): Promise<GameTracker>{
		return this.dataService.AddDartThrowToGameSession(gameId, playerId, roundNumber, dartThrow)
	}

	public async getActiveGame(gameId: string): Promise<GameTracker | undefined> {
		return await this.dataService.getActiveGameSession(gameId);
	}

	public getCachedGameId(): string | undefined {
		return this.cacheService.GetGameId()
	}

	public setCachedGameId(gameId: string): void {
		return this.cacheService.SetGameId(gameId)
	}
}
