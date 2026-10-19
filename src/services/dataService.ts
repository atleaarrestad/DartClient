import { injectable } from 'tsyringe';
import { z } from 'zod';

import {
	buildGetAllUsersUrl,
	buildGetUserByIdUrl,
	UserQueryOptions,
} from '../api/users.requests.js';
import { DartThrow } from '../models/dartThrowSchema.js';
import {
	AchievementCategoryResponse,
	AchievementCategoryResponseSchema,
	AchievementBuilderCatalog,
	AchievementBuilderCatalogSchema,
	AchievementInstanceResponse,
	AchievementInstanceResponseSchema,
	AchievementTemplateResponse,
	AchievementTemplateResponseSchema,
	AchievementValidationResponse,
	AchievementValidationResponseSchema,
	CreateAchievementCategoryRequest,
	PredictAchievementThrowsRequest,
	PredictAchievementThrowsResponse,
	PredictAchievementThrowsResponseSchema,
	ReorderAchievementCategoriesRequest,
	UpdateAchievementCategoryRequest,
	UpsertAchievementTemplateRequest,
} from '../models/achievementBuilderApi.js';
import {
	GameResult,
	GameResultSchema,
	GameTracker,
	GameTrackerDelta,
	GameTrackerDeltaSchema,
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
	private submitAttempts = 3;
	private submitRetryDelayMs = 750;
	private addThrowQueue: Promise<unknown> = Promise.resolve();
	private addThrowFailure?: unknown;

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
		this.addThrowQueue = result.then(
			() => undefined,
			error => {
				this.addThrowFailure ??= error;
			},
		);

		return result;
	}

	async AddDartThrowToGameSession(
		gameId: string,
		playerId: string,
		roundNumber: number,
		dartThrow: DartThrow,
	): Promise<GameTracker | GameTrackerDelta> {
		return this.enqueueAddThrow(async () => {
			const request = {
				HitLocation: dartThrow.hitLocation,
				ThrowType: dartThrow.throwType,
			};

			const result = await this.post<object, GameTracker | GameTrackerDelta>(
				`games/sessions/${gameId}/player/${playerId}/round/${roundNumber}/throw/${dartThrow.throwIndex}`,
				request,
			);

			if (!result.ok) {
				throw this.createApiError('Failed to save dart throw', result);
			}

			const delta = GameTrackerDeltaSchema.safeParse(result.data);
			if (delta.success)
				return delta.data;
			const tracker = GameTrackerSchema.safeParse(result.data);
			if (tracker.success)
				return tracker.data;

			throw new Error('Invalid game state received from the API');
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

	async getAchievementBuilderCatalog(): Promise<AchievementBuilderCatalog> {
		const response = await this.get<unknown>('achievement-builder/catalog');
		if (!response.ok)
			throw this.createApiError('Failed to load achievement builder catalog', response);

		return this.parseApiData(
			AchievementBuilderCatalogSchema,
			response.data,
			'Invalid achievement builder catalog received from the API',
		);
	}

	/** Draft versions are only included when a season admin key is sent. */
	async getAchievementBuilderTemplates(
		seasonId: string,
		adminKey?: string,
	): Promise<AchievementTemplateResponse[]> {
		const response = await this.get<unknown>(
			`achievement-builder/templates?seasonId=${ encodeURIComponent(seasonId) }`,
			adminKey ? this.getSeasonAdminHeaders(adminKey) : undefined,
		);
		if (!response.ok)
			throw this.createApiError('Failed to load achievement templates', response);

		return this.parseApiData(
			z.array(AchievementTemplateResponseSchema),
			response.data,
			'Invalid achievement templates received from the API',
		);
	}

	async getAchievementCategories(
		seasonId: string,
	): Promise<AchievementCategoryResponse[]> {
		const response = await this.get<unknown>(
			`achievement-builder/categories?seasonId=${ encodeURIComponent(seasonId) }`,
		);
		if (!response.ok)
			throw this.createApiError('Failed to load achievement categories', response);

		return this.parseApiData(
			z.array(AchievementCategoryResponseSchema),
			response.data,
			'Invalid achievement categories received from the API',
		);
	}

	async createAchievementCategory(
		request: CreateAchievementCategoryRequest,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		const response = await this.post<CreateAchievementCategoryRequest, unknown>(
			'achievement-builder/categories',
			request,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to create achievement category', response);

		return this.parseApiData(
			AchievementCategoryResponseSchema,
			response.data,
			'Invalid achievement category received after creation',
		);
	}

	async updateAchievementCategory(
		categoryId: string,
		request: UpdateAchievementCategoryRequest,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		const response = await this.put<UpdateAchievementCategoryRequest, unknown>(
			`achievement-builder/categories/${ encodeURIComponent(categoryId) }`,
			request,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to update achievement category', response);

		return this.parseApiData(
			AchievementCategoryResponseSchema,
			response.data,
			'Invalid achievement category received after update',
		);
	}

	async reorderAchievementCategories(
		request: ReorderAchievementCategoriesRequest,
		adminKey: string,
	): Promise<AchievementCategoryResponse[]> {
		const response = await this.put<ReorderAchievementCategoriesRequest, unknown>(
			'achievement-builder/categories/order',
			request,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to reorder achievement categories', response);

		return this.parseApiData(
			z.array(AchievementCategoryResponseSchema),
			response.data,
			'Invalid achievement categories received after reordering',
		);
	}

	async archiveAchievementCategory(
		categoryId: string,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		const response = await this.post<undefined, unknown>(
			`achievement-builder/categories/${ encodeURIComponent(categoryId) }/archive`,
			undefined,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to archive achievement category', response);

		return this.parseApiData(
			AchievementCategoryResponseSchema,
			response.data,
			'Invalid achievement category received after archiving',
		);
	}

	async restoreAchievementCategory(
		categoryId: string,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		const response = await this.post<undefined, unknown>(
			`achievement-builder/categories/${ encodeURIComponent(categoryId) }/restore`,
			undefined,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to restore achievement category', response);

		return this.parseApiData(
			AchievementCategoryResponseSchema,
			response.data,
			'Invalid achievement category received after restoring',
		);
	}

	async deleteAchievementCategory(
		categoryId: string,
		adminKey: string,
	): Promise<boolean> {
		const response = await this.delete<unknown>(
			`achievement-builder/categories/${ encodeURIComponent(categoryId) }`,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to delete achievement category', response);

		return true;
	}

	async getAchievementBuilderInstances(
		seasonId: string,
	): Promise<AchievementInstanceResponse[]> {
		const response = await this.get<unknown>(
			`achievement-builder/instances?seasonId=${ encodeURIComponent(seasonId) }`,
		);
		if (!response.ok)
			throw this.createApiError('Failed to load achievement instances', response);

		return this.parseApiData(
			z.array(AchievementInstanceResponseSchema),
			response.data,
			'Invalid achievement instances received from the API',
		);
	}

	async createAchievementBuilderTemplate(
		request: UpsertAchievementTemplateRequest,
		adminKey: string,
	): Promise<AchievementTemplateResponse> {
		const response = await this.post<UpsertAchievementTemplateRequest, unknown>(
			'achievement-builder/templates',
			request,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to create achievement template', response);

		return this.parseApiData(
			AchievementTemplateResponseSchema,
			response.data,
			'Invalid achievement template received after creation',
		);
	}

	async updateAchievementBuilderTemplate(
		templateId: string,
		request: UpsertAchievementTemplateRequest,
		adminKey: string,
	): Promise<AchievementTemplateResponse> {
		const response = await this.put<UpsertAchievementTemplateRequest, unknown>(
			`achievement-builder/templates/${ encodeURIComponent(templateId) }`,
			request,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to update achievement template', response);

		return this.parseApiData(
			AchievementTemplateResponseSchema,
			response.data,
			'Invalid achievement template received after update',
		);
	}

	async validateAchievementBuilderTemplate(
		templateId: string,
	): Promise<AchievementValidationResponse> {
		const response = await this.post<undefined, unknown>(
			`achievement-builder/templates/${ encodeURIComponent(templateId) }/validate`,
			undefined,
		);
		if (!response.ok)
			throw this.createApiError('Failed to validate achievement template', response);

		return this.parseApiData(
			AchievementValidationResponseSchema,
			response.data,
			'Invalid achievement validation response received from the API',
		);
	}

	async publishAchievementBuilderTemplate(
		templateId: string,
		adminKey: string,
	): Promise<AchievementTemplateResponse> {
		const response = await this.post<undefined, unknown>(
			`achievement-builder/templates/${ encodeURIComponent(templateId) }/publish`,
			undefined,
			this.getSeasonAdminHeaders(adminKey),
		);
		if (!response.ok)
			throw this.createApiError('Failed to publish achievement template', response);

		return this.parseApiData(
			AchievementTemplateResponseSchema,
			response.data,
			'Invalid achievement template received after publishing',
		);
	}

	async predictAchievementThrows(
		request: PredictAchievementThrowsRequest,
	): Promise<PredictAchievementThrowsResponse> {
		const response = await this.post<PredictAchievementThrowsRequest, unknown>(
			'achievement-builder/predict-next-throw',
			request,
		);
		if (!response.ok)
			throw this.createApiError('Failed to predict achievement throws', response);

		return this.parseApiData(
			PredictAchievementThrowsResponseSchema,
			response.data,
			'Invalid achievement prediction received from the API',
		);
	}

	async SubmitGame(gameId: string): Promise<GameResult> {
		await this.addThrowQueue;
		if (this.addThrowFailure !== undefined) {
			const failure = this.addThrowFailure;
			this.addThrowFailure = undefined;
			throw failure;
		}

		// A repeated submit returns the stored result instead of saving the game twice, so a
		// server error or a lost connection (e.g. a finalize that lost a race) is retried.
		for (let attempt = 1; ; attempt++) {
			const isLastAttempt = attempt >= this.submitAttempts;
			let response: ApiResponse<GameResult>;
			try {
				response = await this.post<undefined, GameResult>(
					`games/sessions/${gameId}`,
					undefined,
				);
			}
			catch (error) {
				if (isLastAttempt)
					throw error;

				await this.delay(this.submitRetryDelayMs * attempt);
				continue;
			}

			if (!response.ok && response.status >= 500 && !isLastAttempt) {
				await this.delay(this.submitRetryDelayMs * attempt);
				continue;
			}

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
	}

	private delay(milliseconds: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, milliseconds));
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
