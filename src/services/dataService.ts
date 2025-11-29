import { injectable } from 'tsyringe';
import { z } from 'zod';

import { buildGetUserByIdUrl, UserQueryOptions } from '../api/users.requests.js';
import { DartThrow } from '../models/dartThrowSchema.js';
import {
	GameResult, GameResultSchema, GameTracker, GameTrackerSchema, PlayerRounds,
	type RuleDefinitionsResponse, RuleDefinitionsResponseSchema, Season, SeasonSchema, User, UserSchema,
} from '../models/schemas.js';


export type ApiResponse<T> =
	| { ok: true; data: T; }
	| { ok: false; status: number; statusText: string; body: unknown; };


@injectable()
export class DataService {

	private backendURL = import.meta.env.VITE_SERVER_URL;
	private abortTimeout = 500000;

	async Ping(): Promise<string> {
		const result = await this.get<string>('ping');
		if (result.ok)
			return result.data;

		else
			throw new Error('Unable to reach server');
	}

	async GetRuleDefinitions(): Promise<RuleDefinitionsResponse> {
		const resp = await this.get<RuleDefinitionsResponse>(`rule/definitions`);

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch ruledefinitions: ${ resp.status } ${ resp.statusText }`,
			);
		}

		try {
			return RuleDefinitionsResponseSchema.parse(resp.data);
		}
		catch (e) {
			throw new Error('Invalid rule-definition data received from the API');
		}
	}

	async RequestNewGame(): Promise<string> {
		const result = await this.post<undefined, string>('games/sessions/new', undefined);
		if (result.ok)
			return result.data;

		else
			throw new Error('Failed to create new game');
	}

	async getActiveGameSession(
		gameId: string,
	): Promise<GameTracker | undefined> {
		const resp = await this.get<GameTracker>(`games/sessions/${ gameId }`);

		if (!resp.ok && resp.status === 404)
			return undefined;


		if (!resp.ok) {
			throw new Error(
				`Failed to fetch active game: ${ resp.status } ${ resp.statusText }`,
			);
		}

		try {
			return GameTrackerSchema.parse(resp.data);
		}
		catch (e) {
			throw new Error('Invalid game tracker data received from the API');
		}
	}

	async getActiveGameSessions(
	): Promise<GameTracker[] | undefined> {
		const resp = await this.get<GameTracker[]>(`games/sessions`);

		if (!resp.ok && resp.status === 404)
			return undefined;


		if (!resp.ok) {
			throw new Error(
				`Failed to fetch active games: ${ resp.status } ${ resp.statusText }`,
			);
		}

		try {
			return z.array(GameTrackerSchema).parse(resp.data);
		}
		catch (e) {
			throw new Error('Invalid game tracker data received from the API');
		}
	}

	async AddPlayerToGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		const result = await this.post<undefined, GameTracker>(`games/sessions/${ gameId }/player/${ playerId }`, undefined);
		if (!result.ok) {
			throw new Error(
				`Failed to add player to active game: ${ result.status } ${ result.statusText }`,
			);
		}
		else {
			try {
				return GameTrackerSchema.parse(result.data);
			}
			catch {
				throw new Error('Invalid game tracker data received from the API');
			}
		}
	}

	async removePlayerFromGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		const result = await this.delete<GameTracker>(`games/sessions/${ gameId }/player/${ playerId }`);
		if (!result.ok) {
			throw new Error(
				`Failed to delete player from active game: ${ result.status } ${ result.statusText }`,
			);
		}
		else {
			try {
				return GameTrackerSchema.parse(result.data);
			}
			catch {
				throw new Error('Invalid game tracker data received from the API');
			}
		}
	}

	async AddDartThrowToGameSession(
		gameId: string,
		playerId: string,
		roundNumber: number,
		dartThrow: DartThrow,
	): Promise<GameTracker> {
		const request = {
			HitLocation: dartThrow.hitLocation,
			ThrowType:   dartThrow.throwType,
		};
		const result = await this.post<object, PlayerRounds>(
			`games/sessions/${ gameId }/player/${ playerId }/round/${ roundNumber }/throw/${ dartThrow.throwIndex }`,
			request,
		);

		if (!result.ok) {
			throw new Error(
				`Failed to add player to active game: ${ result.status } ${ result.statusText }`,
			);
		}
		else {
			try {
				return GameTrackerSchema.parse(result.data);
			}
			catch {
				throw new Error('Invalid game tracker data received from the API');
			}
		}
	}

	async getCurrentSeason(): Promise<Season> {
		const resp = await this.get<Season>('season/latest');

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch latest season from server: ${ resp.status } ${ resp.statusText }`,
			);
		}

		try {
			return SeasonSchema.parse(resp.data);
		}
		catch {
			throw new Error('Not able to parse season from server');
		}
	}

	async GetAllSeasons(): Promise<Season[]> {
		const resp = await this.get<Season[]>('season/all');

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch all seasons from server: ${ resp.status } ${ resp.statusText }`,
			);
		}

		try {
			return resp.data.map(season => SeasonSchema.parse(season));
		}
		catch {
			throw new Error('Not able to parse season from server');
		}
	}

	async SubmitGame(gameId: string): Promise<GameResult> {
		const response = await this.post<undefined, GameResult>(`games/sessions/${ gameId }`, undefined);
		if (!response.ok) {
			throw new Error(
				`Failed to submit game! ${ response.status } ${ response.statusText }`,
			);
		}

		try	{
			return GameResultSchema.parse(response.data);
		}
		catch (error) {
			throw new Error('Unable to parse game result from server');
		}
	}

	async addUser(name: string, alias: string): Promise<void> {
		const request = { name: name, alias: alias };
		const resp = await this.post<object, undefined>('users/add', request);

		if (!resp.ok) {
			if (resp.status == 409)
				throw new Error('A user with same name/alias already exists');

			throw new Error('An error occured when creating a new user');
		}
	}

	async getAllUsers(): Promise<User[]> {
		const resp = await this.get<User[]>('users/getall');

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch users from server: ${ resp.status } ${ resp.statusText }`,
			);
		}

		try {
			return resp.data.map(u => UserSchema.parse(u));
		}
		catch {
			throw new Error('Invalid user data received from the API');
		}
	}

	async getUserById(
		userId: string,
		options?: UserQueryOptions,
	): Promise<User | null> {
		const url = buildGetUserByIdUrl(userId, options);
		const resp = await this.get<User>(url);

		if (!resp.ok && resp.status === 404)
			return null;


		if (!resp.ok) {
			throw new Error(
				`Failed to fetch user from server: ${ resp.status } ${ resp.statusText }`,
			);
		}

		try {
			return UserSchema.parse(resp.data);
		}
		catch {
			throw new Error('Invalid user data received from the API');
		}
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit,
	): Promise<ApiResponse<T>> {
		// Build headers conditionally (MINIMAL CHANGE)
		const hasBody = options.body !== undefined && options.body !== null;
		const headers = {
			...(hasBody ? { 'Content-Type': 'application/json' } : {}),
			...(options.headers || {}),
		};

		const res = await fetch(`${ this.backendURL }${ endpoint }`, {
			...options,
			headers,
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
				ok:         false,
				status:     res.status,
				statusText: res.statusText,
				body,
			};
		}

		return {
			ok:   true,
			data: body as T,
		};
	}

	async post<Req, Res>(
		endpoint: string,
		body: Req,
	): Promise<ApiResponse<Res>> {
		return this.request<Res>(endpoint, {
			method: 'POST',
			body:   JSON.stringify(body),
		});
	}

	async get<T>(endpoint: string): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, { method: 'GET' });
	}

	async put<Req, Res>(
		endpoint: string,
		body: Req,
	): Promise<ApiResponse<Res>> {
		return this.request<Res>(endpoint, {
			method: 'PUT',
			body:   JSON.stringify(body),
		});
	}

	async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, { method: 'DELETE' });
	}

	private createTimeoutSignal(timeout: number): AbortSignal {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), timeout);

		return controller.signal;
	}

}
