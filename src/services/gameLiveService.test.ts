import 'reflect-metadata';

import { container } from 'tsyringe';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAchievementInstance, testGameId, testPlayerId } from '../test/gameFixtures.js';
import { GameLiveService } from './gameLiveService.js';
import { SignalRService, type SignalRSubscriptionOptions } from './signalRService.js';

type AnyOptions = SignalRSubscriptionOptions<any>;

function createService(): { service: GameLiveService; handlerFor: (event: string) => (...args: unknown[]) => void; } {
	const registrations: AnyOptions[] = [];
	container.registerInstance(SignalRService, {
		registerSubscription: (options: AnyOptions) => {
			registrations.push(options);

			return { ready: Promise.resolve(), dispose: async () => {} };
		},
	} as unknown as SignalRService);

	return {
		service:    new GameLiveService(),
		handlerFor: event => registrations.find(options => options.event === event)!.handler,
	};
}

describe('GameLiveService', () => {
	afterEach(() => {
		container.clearInstances();
	});

	it('parses game updates and joins the spectate group', () => {
		const { service, handlerFor } = createService();
		const onUpdated = vi.fn();
		service.subscribeToGame(testGameId, { onUpdated, onDelta: vi.fn(), onFinished: vi.fn() }, vi.fn());

		handlerFor('OnGameUpdated')(testGameId, {
			id:            testGameId,
			started:       '2026-10-19T12:00:00Z',
			playersRounds: [],
		});

		expect(onUpdated).toHaveBeenCalledOnce();
		const tracker = onUpdated.mock.calls[0]![1];
		expect(tracker.started).toBeInstanceOf(Date);
		expect(tracker.revision).toBe(0);
	});

	it('drops invalid payloads instead of calling the handlers', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { service, handlerFor } = createService();
		const handlers = { onUpdated: vi.fn(), onDelta: vi.fn(), onFinished: vi.fn() };
		service.subscribeToGame(testGameId, handlers, vi.fn());

		handlerFor('OnGameUpdated')(testGameId, { id: 'not-a-uuid' });
		handlerFor('OnGameDelta')(testGameId, { gameId: testGameId, baseRevision: 1, revision: 3 });
		handlerFor('OnGameFinished')(testGameId, {});

		expect(handlers.onUpdated).not.toHaveBeenCalled();
		expect(handlers.onDelta).not.toHaveBeenCalled();
		expect(handlers.onFinished).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledTimes(3);
	});

	it('parses achievement projections', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { service, handlerFor } = createService();
		const handler = vi.fn();
		service.subscribeToV2Achievements(testGameId, handler);
		const instance = createAchievementInstance('7c2a4b5e-0d8c-4d3a-9e4f-5e6f7a8b9c03', 'Projected');

		handlerFor('OnV2AchievementProjectionAdded')(testGameId, testPlayerId, [ instance ]);
		handlerFor('OnV2AchievementProjectionAdded')(testGameId, testPlayerId, [ { id: 1 } ]);

		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith(testGameId, testPlayerId, [ instance ]);
	});
});
