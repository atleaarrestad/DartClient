import { injectable } from 'tsyringe';
import { z } from 'zod';

import {
	buildGetAllUsersUrl,
	buildGetUserByIdUrl,
	UserQueryOptions,
} from '../api/users.requests.js';
import { DartThrow } from '../models/dartThrowSchema.js';
import {
	AchievementDefinitionsResponse,
	AchievementDefinitionsResponseSchema,
	GameResult,
	GameResultSchema,
	GameTracker,
	GameTrackerSchema,
	type RuleDefinitionsResponse,
	RuleDefinitionsResponseSchema,
	Season,
	SeasonSchema,
	User,
	UserSchema,
} from '../models/schemas.js';
import { getErrorMessage } from '../helpers/getErrorMessage.js';

export type ApiResponse<T> =
	| { ok: true; data: T; }
	| { ok: false; status: number; statusText: string; body: unknown; };

@injectable()
export class DataService {
	private backendURL = import.meta.env.VITE_SERVER_URL;
	private abortTimeout = 500000;
	private addThrowQueue: Promise<unknown> = Promise.resolve();

	async Ping(): Promise<string> {
		const result = await this.get<string>('ping');

		if (result.ok) {
			return result.data;
		}

		throw new Error('Unable to reach server');
	}

	async GetRuleDefinitions(): Promise<RuleDefinitionsResponse> {
		const resp = await this.get<RuleDefinitionsResponse>('rule/definitions');

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch ruledefinitions: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return RuleDefinitionsResponseSchema.parse(resp.data);
		}
		catch {
			throw new Error('Invalid rule-definition data received from the API');
		}
	}

	async GetAchievementDefinitions(): Promise<AchievementDefinitionsResponse> {
		const resp = await this.get<AchievementDefinitionsResponse>('achievement/definitions');

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch achievement definitions: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return AchievementDefinitionsResponseSchema.parse(resp.data);
		}
		catch {
			throw new Error('Invalid achievement definition data received from the API');
		}
	}

	async RequestNewGame(): Promise<string> {
		const result = await this.post<undefined, string>('games/sessions/new', undefined);

		if (result.ok) {
			return result.data;
		}

		throw this.createApiError('Failed to create new game', result);
	}

	async getActiveGameSession(gameId: string): Promise<GameTracker | undefined> {
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
		catch {
			throw new Error('Invalid game tracker data received from the API');
		}
	}

	async getActiveGameSessions(): Promise<GameTracker[] | undefined> {
		const resp = await this.get<GameTracker[]>('games/sessions');

		if (!resp.ok && resp.status === 404) {
			return undefined;
		}

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch active games: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return z.array(GameTrackerSchema).parse(resp.data);
		}
		catch {
			throw new Error('Invalid game tracker data received from the API');
		}
	}

	async AddPlayerToGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		const result = await this.post<undefined, GameTracker>(
			`games/sessions/${gameId}/player/${playerId}`,
			undefined,
		);

		if (!result.ok) {
			throw this.createApiError('Failed to add player to active game', result);
		}

		try {
			return GameTrackerSchema.parse(result.data);
		}
		catch {
			throw new Error('Invalid game tracker data received from the API');
		}
	}

	async removePlayerFromGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		const result = await this.delete<GameTracker>(
			`games/sessions/${gameId}/player/${playerId}`,
		);

		if (!result.ok) {
			throw this.createApiError('Failed to remove player from active game', result);
		}

		try {
			return GameTrackerSchema.parse(result.data);
		}
		catch {
			throw new Error('Invalid game tracker data received from the API');
		}
	}

	private enqueueAddThrow<T>(task: () => Promise<T>): Promise<T> {
		const result = this.addThrowQueue.then(task, task);
		this.addThrowQueue = result.catch(() => {});

		return result;
	}

	async AddDartThrowToGameSession(
		gameId: string,
		playerId: string,
		roundNumber: number,
		dartThrow: DartThrow,
	): Promise<GameTracker> {
		return this.enqueueAddThrow(async () => {
			const request = {
				HitLocation: dartThrow.hitLocation,
				ThrowType: dartThrow.throwType,
			};

			const result = await this.post<object, GameTracker>(
				`games/sessions/${gameId}/player/${playerId}/round/${roundNumber}/throw/${dartThrow.throwIndex}`,
				request,
			);

			if (!result.ok) {
				throw this.createApiError('Failed to save dart throw', result);
			}

			try {
				return GameTrackerSchema.parse(result.data);
			}
			catch {
				throw new Error('Invalid game tracker data received from the API');
			}
		});
	}

	async getCurrentSeason(): Promise<Season> {
		const resp = await this.get<Season>('season/latest');

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch latest season from server: ${resp.status} ${resp.statusText}`,
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
				`Failed to fetch all seasons from server: ${resp.status} ${resp.statusText}`,
			);
		}

		try {
			return resp.data.map(season => SeasonSchema.parse(season));
		}
		catch {
			throw new Error('Not able to parse season from server');
		}
	}

	async verifySeasonManagementAccess(adminKey: string): Promise<void> {
		const response = await this.get<unknown>(
			'season/manage/access',
			this.getSeasonAdminHeaders(adminKey),
		);

		if (!response.ok)
			throw this.createApiError('Season management access denied', response);
	}

	async createSeason(
		request: unknown,
		adminKey: string,
	): Promise<Season> {
		const response = await this.post<unknown, Season>(
			'season',
			request,
			this.getSeasonAdminHeaders(adminKey),
		);

		if (!response.ok)
			throw this.createApiError('Failed to create season', response);

		return this.parseApiData(
			SeasonSchema,
			response.data,
			'Invalid season data received after creation',
		);
	}

	async updateSeason(
		request: unknown,
		adminKey: string,
	): Promise<Season> {
		const response = await this.put<unknown, Season>(
			'season',
			request,
			this.getSeasonAdminHeaders(adminKey),
		);

		if (!response.ok)
			throw this.createApiError('Failed to update season', response);

		return this.parseApiData(
			SeasonSchema,
			response.data,
			'Invalid season data received after update',
		);
	}

	async SubmitGame(gameId: string): Promise<GameResult> {
		const response = await this.post<undefined, GameResult>(
			`games/sessions/${gameId}`,
			undefined,
		);

		if (!response.ok) {
			throw this.createApiError('Failed to submit game', response);
		}

		try {
			return GameResultSchema.parse(response.data);
		}
		catch {
			throw new Error('Unable to parse game result from server');
		}
	}

	async addUser(name: string, alias: string): Promise<void> {
		const request = { name, alias };
		const resp = await this.post<object, undefined>('users/add', request);

		if (!resp.ok) {
			if (resp.status === 409) {
				throw new Error('A user with same name/alias already exists');
			}

			throw new Error('An error occured when creating a new user');
		}
	}

	async getAllUsers(options?: UserQueryOptions): Promise<User[]> {
		const url = buildGetAllUsersUrl(options);
		const resp = await this.get<User[]>(url);

		if (!resp.ok) {
			throw new Error(
				`Failed to fetch users from server: ${resp.status} ${resp.statusText}`,
			);
		}

		return this.parseApiData(
			z.array(UserSchema),
			resp.data,
			'Invalid user data received from the API',
		);
	}

	async getUserById(
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

		return this.parseApiData(
			UserSchema,
			resp.data,
			'Invalid user data received from the API',
		);
	}

	private parseApiData<T>(
		schema: z.ZodType<T>,
		payload: unknown,
		errorMessage: string,
	): T {
		const parsed = schema.safeParse(payload);
		if (!parsed.success) {
			const details = parsed.error.issues
				.slice(0, 3)
				.map(issue => `${issue.path.join('.') || 'response'}: ${issue.message}`)
				.join('; ');

			throw new Error(`${errorMessage} (${details})`, {
				cause: parsed.error,
			});
		}

		return parsed.data;
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit,
	): Promise<ApiResponse<T>> {
		const hasBody = options.body !== undefined && options.body !== null;
		const headers = {
			...(hasBody ? { 'Content-Type': 'application/json' } : {}),
			...(options.headers || {}),
		};

		let res: Response;
		try {
			res = await fetch(`${this.backendURL}${endpoint}`, {
				...options,
				headers,
				credentials: 'include',
				signal: this.createTimeoutSignal(this.abortTimeout),
			});
		}
		catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError')
				throw new Error('The server took too long to respond. Please try again.');

			throw new Error(getErrorMessage(error, 'Unable to reach the server. Check your connection and try again.'));
		}

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

	async post<Req, Res>(
		endpoint: string,
		body: Req,
		headers?: HeadersInit,
	): Promise<ApiResponse<Res>> {
		return this.request<Res>(endpoint, {
			method: 'POST',
			body: JSON.stringify(body),
			headers,
		});
	}

	async get<T>(endpoint: string, headers?: HeadersInit): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, { method: 'GET', headers });
	}

	async put<Req, Res>(
		endpoint: string,
		body: Req,
		headers?: HeadersInit,
	): Promise<ApiResponse<Res>> {
		return this.request<Res>(endpoint, {
			method: 'PUT',
			body: JSON.stringify(body),
			headers,
		});
	}

	async delete<T>(endpoint: string, headers?: HeadersInit): Promise<ApiResponse<T>> {
		return this.request<T>(endpoint, { method: 'DELETE', headers });
	}

	private getSeasonAdminHeaders(adminKey: string): HeadersInit {
		return { 'X-Season-Admin-Key': adminKey };
	}

	private createTimeoutSignal(timeout: number): AbortSignal {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), timeout);

		return controller.signal;
	}

	private createApiError<T>(
		prefix: string,
		response: Extract<ApiResponse<T>, { ok: false; }>,
	): Error {
		const detail = this.getApiErrorDetail(response.body);
		const statusText = `${ response.status } ${ response.statusText }`.trim();
		const suffix = detail ?? statusText;

		return new Error(`${ prefix }: ${ suffix }`);
	}

	private getApiErrorDetail(body: unknown): string | undefined {
		if (typeof body === 'string' && body.trim().length > 0)
			return body;

		if (body && typeof body === 'object') {
			const problem = body as {
				detail?:  unknown;
				message?: unknown;
				title?:   unknown;
			};

			for (const value of [ problem.detail, problem.message, problem.title ]) {
				if (typeof value === 'string' && value.trim().length > 0)
					return value;
			}
		}

		return undefined;
	}
}
