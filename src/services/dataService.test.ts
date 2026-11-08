import 'reflect-metadata';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataService } from './dataService.js';

const jsonResponse = (status: number, body: unknown = {}): Response =>
	new Response(JSON.stringify(body), { status, statusText: `Status ${ status }` });

const createService = (): DataService => new DataService({ submitRetryDelayMs: 0 });

describe('DataService.SubmitGame', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('retries server errors and lost connections, then reports the final failure', async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(jsonResponse(500))
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(jsonResponse(503));
		vi.stubGlobal('fetch', fetchMock);

		await expect(createService().SubmitGame('game')).rejects.toThrow(/Failed to submit game/);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('does not retry client errors', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404));
		vi.stubGlobal('fetch', fetchMock);

		await expect(createService().SubmitGame('game')).rejects.toThrow(/Failed to submit game/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('stops retrying once a retry reaches the server', async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(jsonResponse(500))
			.mockResolvedValueOnce(jsonResponse(409));
		vi.stubGlobal('fetch', fetchMock);

		await expect(createService().SubmitGame('game')).rejects.toThrow(/Failed to submit game/);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('DataService throw saves before SubmitGame', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const dartThrow = { throwIndex: 0, hitLocation: 20, throwType: 1 } as Parameters<DataService['AddDartThrowToGameSession']>[3];
	const deferred = (): { promise: Promise<Response>; resolve: (response: Response) => void; } => {
		let resolve!: (response: Response) => void;
		const promise = new Promise<Response>(res => resolve = res);

		return { promise, resolve };
	};

	it('waits for an in-flight save and refuses to submit when it fails', async () => {
		const save = deferred();
		const fetchMock = vi.fn().mockReturnValueOnce(save.promise);
		vi.stubGlobal('fetch', fetchMock);
		const service = createService();

		const saving = service.AddDartThrowToGameSession('game', 'player', 0, dartThrow);
		const submitting = service.SubmitGame('game');
		save.resolve(jsonResponse(500));

		await expect(saving).rejects.toThrow(/Failed to save dart throw/);
		await expect(submitting).rejects.toThrow(/Failed to save dart throw/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('does not block a later submit on a save failure that was already reported', async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(jsonResponse(500))
			.mockResolvedValueOnce(jsonResponse(404));
		vi.stubGlobal('fetch', fetchMock);
		const service = createService();

		await expect(service.AddDartThrowToGameSession('game', 'player', 0, dartThrow)).rejects.toThrow();
		await expect(service.SubmitGame('game')).rejects.toThrow(/Failed to submit game/);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not wait for saves that belong to another game', async () => {
		const save = deferred();
		const fetchMock = vi.fn()
			.mockReturnValueOnce(save.promise)
			.mockResolvedValueOnce(jsonResponse(404));
		vi.stubGlobal('fetch', fetchMock);
		const service = createService();

		const saving = service.AddDartThrowToGameSession('other-game', 'player', 0, dartThrow);
		await expect(service.SubmitGame('game')).rejects.toThrow(/Failed to submit game/);
		save.resolve(jsonResponse(500));
		await expect(saving).rejects.toThrow();
	});

	it('sends queued saves one at a time', async () => {
		const first = deferred();
		const fetchMock = vi.fn()
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce(jsonResponse(500));
		vi.stubGlobal('fetch', fetchMock);
		const service = createService();

		const firstSave = service.AddDartThrowToGameSession('game', 'player', 0, dartThrow);
		const secondSave = service.AddDartThrowToGameSession('game', 'player', 0, { ...dartThrow, throwIndex: 1 });
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		first.resolve(jsonResponse(500));
		await expect(firstSave).rejects.toThrow();
		await expect(secondSave).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe('DataService requests', () => {
	const stubFetch = (response: () => Response): ReturnType<typeof vi.fn> => {
		const fetchMock = vi.fn().mockImplementation(async () => response());
		vi.stubGlobal('fetch', fetchMock);

		return fetchMock;
	};

	it('encodes ids used in paths', async () => {
		const fetchMock = stubFetch(() => jsonResponse(404));

		await createService().getActiveGameSession('a/b?c');

		expect(fetchMock.mock.calls[0]![0]).toBe('http://test.invalid/games/sessions/a%2Fb%3Fc');
	});

	it('returns an empty list or undefined when the server answers 404', async () => {
		stubFetch(() => jsonResponse(404));
		const service = createService();

		await expect(service.getActiveGameSessions()).resolves.toEqual([]);
		await expect(service.getActiveGameSession('game')).resolves.toBeUndefined();
		await expect(service.getUserById('user')).resolves.toBeNull();
	});

	it('reports a missing active season clearly for 204 and 404', async () => {
		for (const response of [ () => new Response(null, { status: 204 }), () => jsonResponse(404) ]) {
			stubFetch(response);

			await expect(createService().getCurrentSeason()).rejects.toThrow('No active season');
		}
	});

	it('keeps the error prefix and adds the server detail', async () => {
		stubFetch(() => jsonResponse(400, { title: 'Bad', detail: 'Season is locked' }));

		await expect(createService().getAchievementBuilderCatalog())
			.rejects.toThrow('Failed to load achievement builder catalog: Season is locked');
	});

	it('falls back to the status when the body has no detail', async () => {
		stubFetch(() => jsonResponse(500, {}));

		await expect(createService().GetAllSeasons())
			.rejects.toThrow('Failed to fetch all seasons from server: 500 Status 500');
	});

	it('flattens validation errors', async () => {
		stubFetch(() => jsonResponse(400, {
			title:  'One or more validation errors occurred.',
			errors: { Name: [ 'Name is required.' ], Goal: [ 'Goal must be positive.' ] },
		}));

		await expect(createService().createSeason({}, 'key'))
			.rejects.toThrow('Failed to create season: Name: Name is required.; Goal: Goal must be positive.');
	});

	it('reads a problem nested under value', async () => {
		stubFetch(() => jsonResponse(409, { value: { title: 'Conflict', detail: 'Already published' } }));

		await expect(createService().publishAchievementBuilderTemplate('template', 'key'))
			.rejects.toThrow('Failed to publish achievement template: Already published');
	});

	it('uses a status-specific message when one is configured', async () => {
		stubFetch(() => jsonResponse(409));

		await expect(createService().addUser('Name', 'Alias'))
			.rejects.toThrow('A user with same name/alias already exists');
	});

	it('reports a body that does not match the schema', async () => {
		stubFetch(() => jsonResponse(200, [ { id: 'not-a-season' } ]));

		await expect(createService().GetAllSeasons()).rejects.toThrow(/^Not able to parse season from server \(/);
	});

	it('asks for last-dart hints, with no content meaning none', async () => {
		const hints = {
			roundIndex: 2,
			totalCount: 1,
			hints:       [ { id: '8d3b5c6f-1e9d-4e4b-8f5a-6f7a8b9c0d14', name: 'Hinted', tier: 1, hits: [ 'T20' ] } ],
			victoryHits: [ 'D20' ],
		};
		const fetchMock = stubFetch(() => jsonResponse(200, hints));

		await expect(createService().getLastDartHints('game', 'player')).resolves.toEqual(hints);
		expect(fetchMock.mock.calls[0]![0]).toBe('http://test.invalid/games/sessions/game/player/player/last-dart-hints');

		for (const response of [ () => new Response(null, { status: 204 }), () => jsonResponse(404) ]) {
			stubFetch(response);

			await expect(createService().getLastDartHints('game', 'player')).resolves.toBeNull();
		}
	});

	it('lets the caller cancel a request, which then rejects as aborted rather than failed', async () => {
		vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
			init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
		})));
		const controller = new AbortController();

		const request = createService().getLastDartHints('game', 'player', controller.signal);
		controller.abort();

		await expect(request).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('sends a JSON body with the admin key', async () => {
		const fetchMock = stubFetch(() => new Response(null, { status: 204 }));

		await createService().deleteAchievementCategory('category', 'key');
		await createService().addUser('Name', 'Alias');

		const [ deleteUrl, deleteInit ] = fetchMock.mock.calls[0] as [ string, RequestInit ];
		expect(deleteUrl).toBe('http://test.invalid/achievement-builder/categories/category');
		expect(deleteInit).toMatchObject({ method: 'DELETE', headers: { 'X-Season-Admin-Key': 'key' } });
		expect(deleteInit.body).toBeUndefined();

		const [ , addInit ] = fetchMock.mock.calls[1] as [ string, RequestInit ];
		expect(addInit).toMatchObject({
			method:  'POST',
			body:    JSON.stringify({ name: 'Name', alias: 'Alias' }),
			headers: { 'Content-Type': 'application/json' },
		});
	});
});
