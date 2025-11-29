import { container, injectable } from 'tsyringe';

import { UserQueryOptions } from '../api/users.requests.js';
import { User } from '../models/schemas.js';
import { DataService } from './dataService.js';


@injectable()
export class UserService {

	private users?:        User[];
	private usersPromise?: Promise<User[]>;
	private dataService:   DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	async getAllUsers(
		forceGetFromDatabase: boolean = false,
	): Promise<User[]> {
		if (!forceGetFromDatabase && this.users)
			return this.users;


		if (!forceGetFromDatabase && this.usersPromise)
			return this.usersPromise;


		this.usersPromise = (async () => {
			const users = await this.dataService.getAllUsers();
			this.users = users;

			return users;
		})().finally(() => {
			this.usersPromise = undefined;
		});

		return this.usersPromise;
	}

	async getUserById(
		userId: string,
		options?: UserQueryOptions,
	): Promise<User | null> {
		return this.dataService.getUserById(userId, options);
	}

	async addUser(name: string, alias: string): Promise<void> {
		return this.dataService.addUser(name, alias);
	}

}
