import { container, injectable } from 'tsyringe';

import { DartThrow } from '../models/dartThrowSchema.js';
import { GameResult, GameTracker, GameTrackerDelta } from '../models/schemas.js';
import { CacheService } from './cacheService.js';
import { DataService } from './dataService.js';


@injectable()
export class GameService {

	private dataService:  DataService;
	private cacheService: CacheService;

	constructor() {
		this.dataService = container.resolve(DataService);
		this.cacheService = container.resolve(CacheService);
	}

	async requestNewGame(): Promise<string> {
		const gameId = await this.dataService.RequestNewGame();
		this.cacheService.SetGameId(gameId);

		return gameId;
	}

	async removePlayer(gameId: string, playerId: string): Promise<GameTracker> {
		return this.dataService.removePlayerFromGameSession(gameId, playerId);
	}

	async addPlayerToGame(gameId: string, playerId: string): Promise<GameTracker> {
		return await this.dataService.AddPlayerToGameSession(gameId, playerId);
	}

	async addDartThrowToGame(
		gameId: string,
		playerId: string,
		roundNumber: number,
		dartThrow: DartThrow,
	): Promise<GameTracker | GameTrackerDelta> {
		return this.dataService.AddDartThrowToGameSession(gameId, playerId, roundNumber, dartThrow);
	}

	/** Waits for pending dart-throw saves before finalizing the game. */
	submitGame(gameId: string): Promise<GameResult> {
		return this.dataService.SubmitGame(gameId);
	}

	async getActiveGame(gameId: string): Promise<GameTracker | undefined> {
		return await this.dataService.getActiveGameSession(gameId);
	}

	async getActiveGames(): Promise<GameTracker[]> {
		return this.dataService.getActiveGameSessions();
	}

	getCachedGameId(): string | undefined {
		return this.cacheService.GetGameId();
	}

	removeCachedGameId(): void {
		return this.cacheService.removeGameId();
	}

}
