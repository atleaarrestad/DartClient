import { container, injectable } from 'tsyringe';

import { UserQueryOptions } from '../api/users.requests.js';
import { User } from '../models/schemas.js';
import { DataService } from './dataService.js';

export interface GetAllUsersOptions {
	forceRefresh?: boolean;
	query?: UserQueryOptions;
}

@injectable()
export class UserService {
	private usersCache = new Map<string, User[]>();
	private usersPromiseCache = new Map<string, Promise<User[]>>();
	private dataService: DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	async getAllUsers(
		options?: GetAllUsersOptions,
	): Promise<User[]> {
		const forceRefresh = options?.forceRefresh ?? false;
		const query = options?.query;
		const cacheKey = this.getUsersCacheKey(query);

		if (!forceRefresh) {
			const cachedUsers = this.usersCache.get(cacheKey);
			if (cachedUsers) {
				return cachedUsers;
			}

			const existingPromise = this.usersPromiseCache.get(cacheKey);
			if (existingPromise) {
				return existingPromise;
			}
		}

		const promise = (async () => {
			const users = await this.dataService.getAllUsers(query);
			this.usersCache.set(cacheKey, users);

			return users;
		})().finally(() => {
			this.usersPromiseCache.delete(cacheKey);
		});

		this.usersPromiseCache.set(cacheKey, promise);

		return promise;
	}

	async getUserById(
		userId: string,
		options?: UserQueryOptions,
	): Promise<User | null> {
		return this.dataService.getUserById(userId, options);
	}

	async addUser(name: string, alias: string): Promise<void> {
		await this.dataService.addUser(name, alias);
		this.clearUsersCache();
	}

	private clearUsersCache(): void {
		this.usersCache.clear();
		this.usersPromiseCache.clear();
	}

	private getUsersCacheKey(options?: UserQueryOptions): string {
		return JSON.stringify({
			includeSeasonStatistics: options?.includeSeasonStatistics ?? false,
			includeMatchSnapshots: options?.includeMatchSnapshots ?? false,
			includeHitCounts: options?.includeHitCounts ?? false,
			includeFinishCounts: options?.includeFinishCounts ?? false,
			limitToSeasonId: options?.limitToSeasonId ?? null,
		});
	}
}