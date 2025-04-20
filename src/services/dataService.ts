import { injectable } from "tsyringe";
import { GameResult, GameResultSchema, RoundSchema, Season, SeasonSchema, User, UserSchema } from "../models/schemas.js";
import { GameSubmission, Round } from "src/models/schemas.js";
import { z } from "zod";

@injectable()
export class DataService {
	private baseUrl = "https://localhost:7117/api/";// NOT DOCKER BACKEND
	// private baseUrl = "http://localhost:8080/api/"; // DOCKER BACKEND
	private abortTimeout = 500000;

	public async Ping(): Promise<string> {
		const result = await this.get<string>("ping");
		if (result === undefined || result === null) {
			throw new Error("Unable to reach server");
		}
		else {
			return result;
		}
	}

	public async GetCurrentSeason(): Promise<Season> {
		const result = await this.get<Season>("season/latest");

		if (result) {
			try {
				return SeasonSchema.parse(result);
			}
			catch {
				throw new Error("Not able to parse season from server");
			}
		}
		throw new Error("Failed to fetch latest season from server");
	}

	public async SubmitGame(GameSubmission: GameSubmission): Promise<GameResult> {
		const result = await this.post<GameSubmission, GameResult>("games/add", GameSubmission);
		try	{
			return GameResultSchema.parse(result);
		}
		catch (error) {
			console.log(error);
			throw new Error("Unable to parse game result from server");
		}
	}

	public async ValidateRounds(rounds: Round[]): Promise<Round[]> {
		const result = await this.post<Round[], Round[]>("validate/player/rounds", rounds);
		return z.array(RoundSchema).parse(result);
	}

	public async GetAllUsers(): Promise<User[]> {
		const result = await this.get<User[]>("users/getall");

		if (result) {
			try {
				return result.map(user => UserSchema.parse(user));
			}
			catch {
				throw new Error("Invalid user data received from the API");
			}
		}
		throw new Error("Failed to fetch users from server");
	}

	public async getUserWithHistoricData(userid: string): Promise<User> {
		const result = await this.get<User>(`users/GetById/${userid}`);

		if (result) {
			try {
				UserSchema.parse(result);
				return result;
			}
			catch {
				throw new Error("Invalid user data received from the API");
			}
		}
		throw new Error("Failed to fetch user from server");
	}

	private async request<TResponse>(
		endpoint: string,
		options: RequestInit,
	): Promise<TResponse | null> {
		try {
			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				...options,
				headers: {
					"Content-Type": "application/json",
					...options.headers,
				},
				signal: this.createTimeoutSignal(this.abortTimeout),
			});

			if (!response.ok) {
				console.error(
					`${options.method} request to ${endpoint} failed with status: ${response.status}`,
				);
				return null;
			}

			const data: TResponse = await response.json();
			return data;
		}
		catch (error) {
			console.error(`${options.method} request to ${endpoint} failed:`, error);
			return null;
		}
	}

	private async post<TRequest, TResponse>(
		endpoint: string,
		body: TRequest,
	): Promise<TResponse | null> {
		return this.request<TResponse>(endpoint, {
			method: "POST",
			body: JSON.stringify(body),
		});
	}

	private async get<TResponse>(endpoint: string): Promise<TResponse | null> {
		return this.request<TResponse>(endpoint, {
			method: "GET",
		});
	}

	private async put<TRequest, TResponse>(
		endpoint: string,
		body: TRequest,
	): Promise<TResponse | null> {
		return this.request<TResponse>(endpoint, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	}

	private async delete<TResponse>(endpoint: string): Promise<TResponse | null> {
		return this.request<TResponse>(endpoint, {
			method: "DELETE",
		});
	}

	private createTimeoutSignal(timeout: number): AbortSignal {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), timeout);
		return controller.signal;
	}
}
