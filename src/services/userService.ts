import { injectable, container } from "tsyringe";
import { User, UserSchema } from "../models/schemas.js";
import { DataService } from "./dataService.js";
import { UserQueryOptions } from "../api/users.requests.js";

@injectable()
export class UserService {
	private users?: User[];
	private usersPromise?: Promise<User[]>;
	private dataService: DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	public async getAllUsers(
		forceGetFromDatabase: boolean = false,
	): Promise<User[]> {
		if (!forceGetFromDatabase && this.users) {
			return this.users;
		}

		if (!forceGetFromDatabase && this.usersPromise) {
			return this.usersPromise;
		}

		this.usersPromise = (async () => {
			const users = await this.dataService.getAllUsers();
			this.users = users;
			return users;
		})().finally(() => {
			this.usersPromise = undefined;
		});

		return this.usersPromise;
	}

	public async getUserById(
		userId: string,
		options?: UserQueryOptions,
	): Promise<User | null> {
		return this.dataService.getUserById(userId, options);
	}

	public async addUser(name: string, alias: string){
		return this.dataService.addUser(name, alias);
	}
}
