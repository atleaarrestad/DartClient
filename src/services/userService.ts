import { injectable, container } from "tsyringe";
import { User } from "../models/schemas.js";
import { DataService } from "./dataService.js";

@injectable()
export class UserService {
	private users?: User[];
	private usersPromise?: Promise<User[]>;
	private dataService: DataService;

	constructor() {
		this.dataService = container.resolve(DataService);
	}

	public async getAllUsers(forceGetFromDatabase: boolean = false): Promise<User[]> {
		if (!forceGetFromDatabase && this.users) {
			return this.users;
		}

		if (!forceGetFromDatabase && this.usersPromise) {
			return this.usersPromise;
		}

		this.usersPromise = this.dataService.GetAllUsers()
			.then((users) => {
				this.users = users;
				return users;
			})
			.finally(() => {
				this.usersPromise = undefined;
			});

		return this.usersPromise;
	}

	public async getUserWithHistoricData(userId: string): Promise<User> {
		return this.dataService.getUserWithHistoricData(userId);
	}
}
