import { injectable, singleton } from 'tsyringe';


@singleton()
@injectable()
export class CacheService {

	private readonly gameIdKey = 'gameid';
	private readonly lastPlayedUserIdsKey = 'lastplayeduserids';
	SetGameId(gameId: string): void {
		window.localStorage.setItem(this.gameIdKey, gameId);
	}

	GetGameId(): string | undefined {
		const id = window.localStorage.getItem(this.gameIdKey);

		return id ?? undefined;
	}

	removeGameId(): void {
		window.localStorage.removeItem(this.gameIdKey);
	}

	setLastPlayedUserIds(userIds: string[]): void {
		window.localStorage.setItem(this.lastPlayedUserIdsKey, userIds.join(','));
	}

	getLastPlayedUserIds(): string[] {
		const value = window.localStorage.getItem(this.lastPlayedUserIdsKey);

		if (!value)
			return [];

		return value
			.split(',')
			.map(x => x.trim())
			.filter(x => x.length > 0);
	}

	removeLastPlayedUserIds(): void {
		window.localStorage.removeItem(this.lastPlayedUserIdsKey);
	}

}
