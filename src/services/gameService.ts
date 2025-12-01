import { container, injectable } from 'tsyringe';

import { DartThrow } from '../models/dartThrowSchema.js';
import { GameTracker } from '../models/schemas.js';
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

	async addDartThrowToGame(gameId: string, playerId: string, roundNumber: number, dartThrow: DartThrow): Promise<GameTracker> {
		return this.dataService.AddDartThrowToGameSession(gameId, playerId, roundNumber, dartThrow);
	}

	async getActiveGame(gameId: string): Promise<GameTracker | undefined> {
		return await this.dataService.getActiveGameSession(gameId);
	}

	async getActiveGames(): Promise<GameTracker[] | undefined> {
		return this.dataService.getActiveGameSessions();
	}

	getCachedGameId(): string | undefined {
		return this.cacheService.GetGameId();
	}

	setCachedGameId(gameId: string): void {
		return this.cacheService.SetGameId(gameId);
	}

	removeCachedGameId(): void {
		return this.cacheService.removeGameId();
	}

}
