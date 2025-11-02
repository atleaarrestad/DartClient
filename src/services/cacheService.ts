import { injectable, singleton } from "tsyringe";

@singleton()
@injectable()
export class CacheService {
	private readonly gameIdKey = "gameid";

	public SetGameId(gameId: string) {
		window.localStorage.setItem(this.gameIdKey, gameId);
	}

	public GetGameId(): string | undefined {
		const id = window.localStorage.getItem(this.gameIdKey);
		return id ?? undefined;
	}

	public removeGameId(){
		window.localStorage.removeItem(this.gameIdKey);
	}
}
