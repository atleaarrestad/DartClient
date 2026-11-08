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
	LastDartHints,
	LastDartHintsSchema,
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
	| { ok: true; status: number; data: T; }
	| { ok: false; status: number; statusText: string; body: unknown; };

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface SendOptions<T, F> {
	/** Prefix of the error thrown for a failed response. */
	error:         string;
	/** Parses the response body. Without it the body is ignored. */
	schema?:       z.ZodType<T>;
	/** Prefix of the error thrown when the body does not match the schema. */
	invalid?:      string;
	body?:         unknown;
	headers?:      HeadersInit;
	/** Result for 404 and 204 responses, instead of an error. */
	whenMissing?:  () => F;
	/** Messages that replace the generic error for specific statuses. */
	statusErrors?: Partial<Record<number, string>>;
	/** Cancels the request; it then rejects with an AbortError, not a timeout message. */
	signal?:       AbortSignal;
}

export interface DataServiceOptions {
	/** Base delay between submit retries; the n-th retry waits n times this. */
	submitRetryDelayMs?: number;
}

/** Template tag that URL-encodes every interpolated value of an endpoint path. */
const path = (strings: TemplateStringsArray, ...values: (string | number)[]): string =>
	strings.reduce((result, part, index) =>
		result + encodeURIComponent(String(values[index - 1])) + part);

@injectable()
export class DataService {
	private backendURL = import.meta.env.VITE_SERVER_URL;
	private requestTimeoutMs = 30_000;
	private submitAttempts = 3;
	private submitRetryDelayMs: number;
	private addThrowQueue: Promise<unknown> = Promise.resolve();
	private pendingThrowSaves = new Map<string, Set<Promise<unknown>>>();

	constructor(options: DataServiceOptions = {}) {
		this.submitRetryDelayMs = options.submitRetryDelayMs ?? 750;
	}

	Ping(): Promise<string> {
		return this.send('GET', 'ping', {
			error:   'Unable to reach server',
			schema:  z.string(),
			invalid: 'Invalid ping response received from the API',
		});
	}

	GetRuleDefinitions(): Promise<RuleDefinitionsResponse> {
		return this.send('GET', 'rule/definitions', {
			error:   'Failed to fetch ruledefinitions',
			schema:  RuleDefinitionsResponseSchema,
			invalid: 'Invalid rule-definition data received from the API',
		});
	}

	RequestNewGame(): Promise<string> {
		return this.send('POST', 'games/sessions/new', {
			error:   'Failed to create new game',
			schema:  z.string(),
			invalid: 'Invalid game id received from the API',
		});
	}

	getActiveGameSession(gameId: string): Promise<GameTracker | undefined> {
		return this.send('GET', path`games/sessions/${ gameId }`, {
			error:       'Failed to fetch active game',
			schema:      GameTrackerSchema,
			invalid:     'Invalid game tracker data received from the API',
			whenMissing: () => undefined,
		});
	}

	getActiveGameSessions(): Promise<GameTracker[]> {
		return this.send('GET', 'games/sessions', {
			error:       'Failed to fetch active games',
			schema:      z.array(GameTrackerSchema),
			invalid:     'Invalid game tracker data received from the API',
			whenMissing: () => [],
		});
	}

	AddPlayerToGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		return this.send('POST', path`games/sessions/${ gameId }/player/${ playerId }`, {
			error:   'Failed to add player to active game',
			schema:  GameTrackerSchema,
			invalid: 'Invalid game tracker data received from the API',
		});
	}

	removePlayerFromGameSession(gameId: string, playerId: string): Promise<GameTracker> {
		return this.send('DELETE', path`games/sessions/${ gameId }/player/${ playerId }`, {
			error:   'Failed to remove player from active game',
			schema:  GameTrackerSchema,
			invalid: 'Invalid game tracker data received from the API',
		});
	}

	/**
	 * Saves run one at a time. Each save is tracked per game until it settles, so
	 * SubmitGame can wait for in-flight saves and refuse to finalize if one of them fails.
	 * Earlier failures were already reported to (and resynced by) the caller.
	 */
	private enqueueAddThrow<T>(gameId: string, task: () => Promise<T>): Promise<T> {
		const result = this.addThrowQueue.then(task, task);
		this.addThrowQueue = result.catch(() => undefined);

		const pending = this.pendingThrowSaves.get(gameId) ?? new Set<Promise<unknown>>();
		this.pendingThrowSaves.set(gameId, pending);
		pending.add(result);
		const settle = (): void => {
			pending.delete(result);
			if (pending.size === 0 && this.pendingThrowSaves.get(gameId) === pending)
				this.pendingThrowSaves.delete(gameId);
		};
		result.then(settle, settle);

		return result;
	}

	AddDartThrowToGameSession(
		gameId: string,
		playerId: string,
		roundNumber: number,
		dartThrow: DartThrow,
	): Promise<GameTracker | GameTrackerDelta> {
		return this.enqueueAddThrow(gameId, () => this.send(
			'POST',
			path`games/sessions/${ gameId }/player/${ playerId }/round/${ roundNumber }/throw/${ dartThrow.throwIndex }`,
			{
				error:  'Failed to save dart throw',
				body:   {
					HitLocation: dartThrow.hitLocation,
					ThrowType:   dartThrow.throwType,
				},
				// The full tracker is only sent by older servers; current ones always send a delta.
				schema:  z.union([ GameTrackerDeltaSchema, GameTrackerSchema ]),
				invalid: 'Invalid game state received from the API',
			},
		));
	}

	/** Throws `No active season` when the server has no season running. */
	getCurrentSeason(): Promise<Season> {
		return this.send('GET', 'season/latest', {
			error:       'Failed to fetch latest season from server',
			schema:      SeasonSchema,
			invalid:     'Not able to parse season from server',
			whenMissing: () => {
				throw new Error('No active season');
			},
		});
	}

	GetAllSeasons(): Promise<Season[]> {
		return this.send('GET', 'season/all', {
			error:       'Failed to fetch all seasons from server',
			schema:      z.array(SeasonSchema),
			invalid:     'Not able to parse season from server',
		});
	}

	verifySeasonManagementAccess(adminKey: string): Promise<void> {
		return this.send('GET', 'season/manage/access', {
			error:   'Season management access denied',
			headers: this.getSeasonAdminHeaders(adminKey),
		});
	}

	createSeason(
		request: unknown,
		adminKey: string,
	): Promise<Season> {
		return this.send('POST', 'season', {
			error:   'Failed to create season',
			body:    request,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  SeasonSchema,
			invalid: 'Invalid season data received after creation',
		});
	}

	updateSeason(
		request: unknown,
		adminKey: string,
	): Promise<Season> {
		return this.send('PUT', 'season', {
			error:   'Failed to update season',
			body:    request,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  SeasonSchema,
			invalid: 'Invalid season data received after update',
		});
	}

	getAchievementBuilderCatalog(): Promise<AchievementBuilderCatalog> {
		return this.send('GET', 'achievement-builder/catalog', {
			error:   'Failed to load achievement builder catalog',
			schema:  AchievementBuilderCatalogSchema,
			invalid: 'Invalid achievement builder catalog received from the API',
		});
	}

	/** Draft versions are only included when a season admin key is sent. */
	getAchievementBuilderTemplates(
		seasonId: string,
		adminKey?: string,
	): Promise<AchievementTemplateResponse[]> {
		return this.send('GET', path`achievement-builder/templates?seasonId=${ seasonId }`, {
			error:       'Failed to load achievement templates',
			headers:     adminKey ? this.getSeasonAdminHeaders(adminKey) : undefined,
			schema:      z.array(AchievementTemplateResponseSchema),
			invalid:     'Invalid achievement templates received from the API',
		});
	}

	getAchievementCategories(
		seasonId: string,
	): Promise<AchievementCategoryResponse[]> {
		return this.send('GET', path`achievement-builder/categories?seasonId=${ seasonId }`, {
			error:       'Failed to load achievement categories',
			schema:      z.array(AchievementCategoryResponseSchema),
			invalid:     'Invalid achievement categories received from the API',
		});
	}

	createAchievementCategory(
		request: CreateAchievementCategoryRequest,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		return this.send('POST', 'achievement-builder/categories', {
			error:   'Failed to create achievement category',
			body:    request,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementCategoryResponseSchema,
			invalid: 'Invalid achievement category received after creation',
		});
	}

	updateAchievementCategory(
		categoryId: string,
		request: UpdateAchievementCategoryRequest,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		return this.send('PUT', path`achievement-builder/categories/${ categoryId }`, {
			error:   'Failed to update achievement category',
			body:    request,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementCategoryResponseSchema,
			invalid: 'Invalid achievement category received after update',
		});
	}

	reorderAchievementCategories(
		request: ReorderAchievementCategoriesRequest,
		adminKey: string,
	): Promise<AchievementCategoryResponse[]> {
		return this.send('PUT', 'achievement-builder/categories/order', {
			error:   'Failed to reorder achievement categories',
			body:    request,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  z.array(AchievementCategoryResponseSchema),
			invalid: 'Invalid achievement categories received after reordering',
		});
	}

	archiveAchievementCategory(
		categoryId: string,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		return this.send('POST', path`achievement-builder/categories/${ categoryId }/archive`, {
			error:   'Failed to archive achievement category',
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementCategoryResponseSchema,
			invalid: 'Invalid achievement category received after archiving',
		});
	}

	restoreAchievementCategory(
		categoryId: string,
		adminKey: string,
	): Promise<AchievementCategoryResponse> {
		return this.send('POST', path`achievement-builder/categories/${ categoryId }/restore`, {
			error:   'Failed to restore achievement category',
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementCategoryResponseSchema,
			invalid: 'Invalid achievement category received after restoring',
		});
	}

	async deleteAchievementCategory(
		categoryId: string,
		adminKey: string,
	): Promise<boolean> {
		await this.send('DELETE', path`achievement-builder/categories/${ categoryId }`, {
			error:   'Failed to delete achievement category',
			headers: this.getSeasonAdminHeaders(adminKey),
		});

		return true;
	}

	getAchievementBuilderInstances(
		seasonId: string,
	): Promise<AchievementInstanceResponse[]> {
		return this.send('GET', path`achievement-builder/instances?seasonId=${ seasonId }`, {
			error:       'Failed to load achievement instances',
			schema:      z.array(AchievementInstanceResponseSchema),
			invalid:     'Invalid achievement instances received from the API',
		});
	}

	createAchievementBuilderTemplate(
		request: UpsertAchievementTemplateRequest,
		adminKey: string,
	): Promise<AchievementTemplateResponse> {
		return this.send('POST', 'achievement-builder/templates', {
			error:   'Failed to create achievement template',
			body:    request,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementTemplateResponseSchema,
			invalid: 'Invalid achievement template received after creation',
		});
	}

	updateAchievementBuilderTemplate(
		templateId: string,
		request: UpsertAchievementTemplateRequest,
		adminKey: string,
	): Promise<AchievementTemplateResponse> {
		return this.send('PUT', path`achievement-builder/templates/${ templateId }`, {
			error:   'Failed to update achievement template',
			body:    request,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementTemplateResponseSchema,
			invalid: 'Invalid achievement template received after update',
		});
	}

	validateAchievementBuilderTemplate(
		templateId: string,
		adminKey: string,
	): Promise<AchievementValidationResponse> {
		return this.send('POST', path`achievement-builder/templates/${ templateId }/validate`, {
			error:   'Failed to validate achievement template',
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementValidationResponseSchema,
			invalid: 'Invalid achievement validation response received from the API',
		});
	}

	publishAchievementBuilderTemplate(
		templateId: string,
		adminKey: string,
	): Promise<AchievementTemplateResponse> {
		return this.send('POST', path`achievement-builder/templates/${ templateId }/publish`, {
			error:   'Failed to publish achievement template',
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementTemplateResponseSchema,
			invalid: 'Invalid achievement template received after publishing',
		});
	}

	/** Disabling stops evaluation and rewards; enabling restores them. Built-ins can be disabled too. */
	setAchievementTemplateDisabled(
		templateId: string,
		disabled: boolean,
		adminKey: string,
	): Promise<AchievementTemplateResponse> {
		const action = disabled ? 'disable' : 'enable';

		return this.send('POST', path`achievement-builder/templates/${ templateId }/${ action }`, {
			error:   `Failed to ${ action } the achievement template`,
			headers: this.getSeasonAdminHeaders(adminKey),
			schema:  AchievementTemplateResponseSchema,
			invalid: 'Invalid achievement template received from the API',
		});
	}

	predictAchievementThrows(
		request: PredictAchievementThrowsRequest,
	): Promise<PredictAchievementThrowsResponse> {
		return this.send('POST', 'achievement-builder/predict-next-throw', {
			error:   'Failed to predict achievement throws',
			body:    request,
			schema:  PredictAchievementThrowsResponseSchema,
			invalid: 'Invalid achievement prediction received from the API',
		});
	}

	async SubmitGame(gameId: string): Promise<GameResult> {
		const pendingSaves = [ ...this.pendingThrowSaves.get(gameId) ?? [] ];
		const failedSave = (await Promise.allSettled(pendingSaves))
			.find(result => result.status === 'rejected');
		if (failedSave)
			throw failedSave.reason;

		// A repeated submit returns the stored result instead of saving the game twice, so a
		// server error or a lost connection (e.g. a finalize that lost a race) is retried.
		for (let attempt = 1; ; attempt++) {
			const isLastAttempt = attempt >= this.submitAttempts;
			let response: ApiResponse<unknown>;
			try {
				response = await this.request('POST', path`games/sessions/${ gameId }`);
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

			if (!response.ok)
				throw this.createApiError('Failed to submit game', response);

			return this.parseApiData(
				GameResultSchema,
				response.data,
				'Unable to parse game result from server',
			);
		}
	}

	private delay(milliseconds: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, milliseconds));
	}

	addUser(name: string, alias: string): Promise<void> {
		return this.send('POST', 'users/add', {
			error:        'An error occured when creating a new user',
			body:         { name, alias },
			statusErrors: { 409: 'A user with same name/alias already exists' },
		});
	}

	getAllUsers(options?: UserQueryOptions): Promise<User[]> {
		return this.send('GET', buildGetAllUsersUrl(options), {
			error:       'Failed to fetch users from server',
			schema:      z.array(UserSchema),
			invalid:     'Invalid user data received from the API',
		});
	}

	getUserById(
		userId: string,
		options?: UserQueryOptions,
	): Promise<User | null> {
		return this.send('GET', buildGetUserByIdUrl(userId, options), {
			error:       'Failed to fetch user from server',
			schema:      UserSchema,
			invalid:     'Invalid user data received from the API',
			whenMissing: () => null,
		});
	}

	/**
	 * What the player can unlock with the last dart of their current round, or null when that
	 * dart isn't up or nothing is in reach. Cancel it with `signal` when the player moves on.
	 */
	async getLastDartHints(gameId: string, playerId: string, signal?: AbortSignal): Promise<LastDartHints | null> {
		return this.send('GET', path`games/sessions/${ gameId }/player/${ playerId }/last-dart-hints`, {
			error:       'Failed to fetch last-dart hints',
			schema:      LastDartHintsSchema,
			invalid:     'Invalid last-dart hints received from the API',
			whenMissing: () => null,
			signal,
		});
	}

	/**
	 * Sends a request and turns the response into data or an error:
	 * a failed status throws `${error}: <server detail or status>`, and a body that
	 * does not match `schema` throws `${invalid} (<zod issues>)`.
	 */
	private async send<T = void, F = never>(
		method: HttpMethod,
		endpoint: string,
		options: SendOptions<T, F>,
	): Promise<T | F> {
		const response = await this.request(method, endpoint, options.body, options.headers, options.signal);

		if (options.whenMissing && (response.status === 404 || response.status === 204))
			return options.whenMissing();

		if (!response.ok) {
			const statusError = options.statusErrors?.[response.status];
			if (statusError)
				throw new Error(statusError);

			throw this.createApiError(options.error, response);
		}

		if (!options.schema)
			return undefined as T;

		return this.parseApiData(
			options.schema,
			response.data,
			options.invalid ?? 'Invalid data received from the API',
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

	private async request(
		method: HttpMethod,
		endpoint: string,
		body?: unknown,
		extraHeaders?: HeadersInit,
		signal?: AbortSignal,
	): Promise<ApiResponse<unknown>> {
		const hasBody = body !== undefined && body !== null;
		const headers = {
			...(hasBody ? { 'Content-Type': 'application/json' } : {}),
			...(extraHeaders || {}),
		};

		let res: Response;
		let text: string;
		try {
			res = await fetch(`${this.backendURL}${endpoint}`, {
				method,
				body:        hasBody ? JSON.stringify(body) : undefined,
				headers,
				credentials: 'include',
				signal:      signal
					? AbortSignal.any([ signal, AbortSignal.timeout(this.requestTimeoutMs) ])
					: AbortSignal.timeout(this.requestTimeoutMs),
			});
			text = await res.text();
		}
		catch (error) {
			// Cancelled by the caller: let it see the abort, there is nothing to report.
			if (signal?.aborted)
				throw signal.reason instanceof Error ? signal.reason : new DOMException('Cancelled', 'AbortError');

			if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError'))
				throw new Error('The server took too long to respond. Please try again.');

			throw new Error(getErrorMessage(error, 'Unable to reach the server. Check your connection and try again.'));
		}

		let data: unknown;

		try {
			data = JSON.parse(text);
		}
		catch {
			data = text;
		}

		if (!res.ok) {
			return {
				ok:         false,
				status:     res.status,
				statusText: res.statusText,
				body:       data,
			};
		}

		return {
			ok:     true,
			status: res.status,
			data,
		};
	}

	private getSeasonAdminHeaders(adminKey: string): HeadersInit {
		return { 'X-Season-Admin-Key': adminKey };
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

	/**
	 * Reads a plain-text body or a ProblemDetails object, including the field errors of
	 * an ASP.NET ValidationProblemDetails and a problem nested under `value`.
	 */
	private getApiErrorDetail(body: unknown): string | undefined {
		if (typeof body === 'string')
			return body.trim().length > 0 ? body : undefined;

		if (!body || typeof body !== 'object')
			return undefined;

		const problem = body as {
			detail?:  unknown;
			message?: unknown;
			title?:   unknown;
			errors?:  unknown;
			value?:   unknown;
		};

		for (const value of [ problem.detail, problem.message ]) {
			if (typeof value === 'string' && value.trim().length > 0)
				return value;
		}

		return this.getValidationErrors(problem.errors)
			?? (typeof problem.value === 'object' ? this.getApiErrorDetail(problem.value) : undefined)
			?? (typeof problem.title === 'string' && problem.title.trim().length > 0 ? problem.title : undefined);
	}

	/** Flattens `{ field: [ message, … ] }` into `field: message; …`. */
	private getValidationErrors(errors: unknown): string | undefined {
		if (!errors || typeof errors !== 'object' || Array.isArray(errors))
			return undefined;

		const messages = Object.entries(errors).flatMap(([ field, fieldErrors ]) =>
			(Array.isArray(fieldErrors) ? fieldErrors : [ fieldErrors ])
				.filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
				.map(message => field ? `${ field }: ${ message }` : message));

		return messages.length > 0 ? messages.join('; ') : undefined;
	}
}
