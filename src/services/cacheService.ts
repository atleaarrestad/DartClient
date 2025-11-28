import { injectable, singleton } from 'tsyringe';

@singleton()
@injectable()
export class CacheService {

	private readonly gameIdKey = 'gameid';

	SetGameId(gameId: string) {
		window.localStorage.setItem(this.gameIdKey, gameId);
	}

	GetGameId(): string | undefined {
		const id = window.localStorage.getItem(this.gameIdKey);

		return id ?? undefined;
	}

	removeGameId() {
		window.localStorage.removeItem(this.gameIdKey);
	}

}
