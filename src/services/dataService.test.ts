import 'reflect-metadata';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataService } from './dataService.js';

const jsonResponse = (status: number, body: unknown = {}): Response =>
	new Response(JSON.stringify(body), { status, statusText: `Status ${ status }` });

const createService = (): DataService => {
	const service = new DataService();
	(service as unknown as { submitRetryDelayMs: number; }).submitRetryDelayMs = 0;

	return service;
};

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
