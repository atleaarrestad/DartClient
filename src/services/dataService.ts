import { injectable } from "tsyringe";
import { GameResult, GameResultSchema, GameTracker, GameTrackerSchema, PlayerRounds, PlayerRoundsScema, Season, SeasonSchema, User, UserSchema } from "../models/schemas.js";
import { GameSubmission } from "src/models/schemas.js";
import { UserQueryOptions, buildGetUserByIdUrl } from "../api/users.requests.js";
import { DartThrow } from "../models/dartThrowSchema.js";

export type ApiResponse<T> =
	| { ok: true; data: T }
	| { ok: false; status: number; statusText: string; body: unknown };

@injectable()
export class DataService {
	private baseUrl = "https://localhost:7117/api/";// NOT DOCKER BACKEND
	// private baseUrl = "http://localhost:8080/api/"; // DOCKER BACKEND
	private abortTimeout = 500000;

	public async Ping(): Promise<string> {
		const result = await this.get<string>("ping");
		if (result.ok) {
			return result.data;
		}
		else {
			throw new Error("Unable to reach server");
		}
	}

	public async RequestNewGame(): Promise<string> {
		const result = await this.post<undefined, string>("games/sessions/new", undefined);
		if (result.ok) {
			return result.data;
		}
		else {
			throw new Error("Failed to create new game");
		}
	}

	public async getActiveGameSession(
		gameId: string,
	): Promise<GameTracker | undefined> {
		const resp = await this.get<GameTracker>(`games/sessions/${gameId}`);

		if (!resp.ok && resp.status === 404) {
			return undefined;
		}

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch active game: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return GameTrackerSchema.parse(resp.data);
		}
		catch(e) {
			throw new Error("Invalid game tracker data received from the API");
		}
	}

	public async AddPlayerToGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		const result = await this.post<undefined, GameTracker>(`games/sessions/${gameId}/player/${playerId}`, undefined);
		if (!result.ok) {
			throw new Error(
				`Failed to add player to active game: ${result.status} ${result.statusText}`,
			);
		}
		else {
			try {
				return GameTrackerSchema.parse(result.data);
			}
			catch {
				throw new Error("Invalid game tracker data received from the API");
			}
		}
	}

	public async removePlayerFromGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		const result = await this.delete<GameTracker>(`games/sessions/${gameId}/player/${playerId}`);
		if (!result.ok) {
			throw new Error(
				`Failed to delete player from active game: ${result.status} ${result.statusText}`,
			);
		}
		else {
			try {
				return GameTrackerSchema.parse(result.data);
			}
			catch {
				throw new Error("Invalid game tracker data received from the API");
			}
		}
	}

	public async AddDartThrowToGameSession(gameId: string, playerId: string, roundNumber: number, dartThrow: DartThrow): Promise<GameTracker>{
		const request = {
			HitLocation: dartThrow.hitLocation,
			ThrowType: dartThrow.throwType
		}
		const result = await this.post<object, PlayerRounds>(`games/sessions/${gameId}/player/${playerId}/round/${roundNumber}/throw/${dartThrow.throwIndex}`, request);
		if (!result.ok) {
			throw new Error(
				`Failed to add player to active game: ${result.status} ${result.statusText}`,
			);
		}
		else {
			try {
				return GameTrackerSchema.parse(result.data);
			}
			catch {
				throw new Error("Invalid game tracker data received from the API");
			}
		}
	}

	public async getCurrentSeason(): Promise<Season> {
		const resp = await this.get<Season>("season/latest");

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch latest season from server: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return SeasonSchema.parse(resp.data);
		}
		catch {
			throw new Error("Not able to parse season from server");
		}
	}

	public async GetAllSeasons(): Promise<Season[]> {
		const resp = await this.get<Season[]>("season/all");

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch all seasons from server: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return resp.data.map(season => SeasonSchema.parse(season));
		}
		catch {
			throw new Error("Not able to parse season from server");
		}
	}

	public async SubmitGame(gameId: string): Promise<GameResult> {
		const response = await this.post<undefined, GameResult>(`games/sessions/${gameId}`, undefined);
		if (!response.ok){
			throw new Error(
				`Failed to submit game! ${response.status} ${response.statusText}`,
			);
		}
		try	{
			return GameResultSchema.parse(response.data);
		}
		catch (error) {
			throw new Error("Unable to parse game result from server");
		}
	}

	public async getAllUsers(): Promise<User[]> {
		const resp = await this.get<User[]>("users/getall");

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch users from server: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return resp.data.map(u => UserSchema.parse(u));
		}
		catch {
			throw new Error("Invalid user data received from the API");
		}
	}

	public async getUserById(
		userId: string,
		options?: UserQueryOptions,
	): Promise<User | null> {
		const url = buildGetUserByIdUrl(userId, options);
		const resp = await this.get<User>(url);

		if (!resp.ok && resp.status === 404) {
			return null;
		}

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch user from server: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return UserSchema.parse(resp.data);
		}
		catch {
			throw new Error("Invalid user data received from the API");
		}
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit,
	): Promise<ApiResponse<T>> {
		const res = await fetch(`${this.baseUrl}${endpoint}`, {
			...options,
			headers: { "Content-Type": "application/json", ...(options.headers || {}) },
			signal: this.createTimeoutSignal(this.abortTimeout),
		});

		const text = await res.text();
		let body: unknown;
		try {
			body = JSON.parse(text);
		}
		catch {
			body = text;
		}

		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				statusText: res.statusText,
				body,
			};
		}

		return {
			ok: true,
			data: body as T,
		};
	}

	public async post<Req, Res>(
		endpoint: string,
		body: Req,
	): Promise<ApiResponse<Res>> {
		return this.request<Res>(endpoint, {
			method: "POST",
			body: JSON.stringify(body),
		});
	}

	public async get<T>(endpoint: string): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, { method: "GET" });
	}

	public async put<Req, Res>(
		endpoint: string,
		body: Req,
	): Promise<ApiResponse<Res>> {
		return this.request<Res>(endpoint, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	}

	public async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, { method: "DELETE" });
	}

	private createTimeoutSignal(timeout: number): AbortSignal {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), timeout);
		return controller.signal;
	}
}
