import 'reflect-metadata';

import { container } from 'tsyringe';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAchievementInstance, testGameId, testPlayerId } from '../test/gameFixtures.js';
import { GameLiveService } from './gameLiveService.js';
import { SignalRService, type SignalRSubscriptionOptions } from './signalRService.js';

type AnyOptions = SignalRSubscriptionOptions<any>;

function createService(answer?: unknown): {
	service:          GameLiveService;
	handlerFor:       (event: string) => (...args: unknown[]) => void;
	optionsFor:       (event: string) => AnyOptions;
	invokeWithResult: ReturnType<typeof vi.fn>;
} {
	const registrations: AnyOptions[] = [];
	const invokeWithResult = vi.fn(async () => answer);
	container.registerInstance(SignalRService, {
		registerSubscription: (options: AnyOptions) => {
			registrations.push(options);

			return { ready: Promise.resolve(), dispose: async () => {} };
		},
		invokeWithResult,
	} as unknown as SignalRService);

	const optionsFor = (event: string) => registrations.find(options => options.event === event)!;

	return {
		service:    new GameLiveService(),
		handlerFor: event => optionsFor(event).handler,
		optionsFor,
		invokeWithResult,
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

	it('parses reactions and the crowd, both on the reactions group', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { service, handlerFor, optionsFor } = createService();
		const onReaction = vi.fn();
		const onSpectators = vi.fn();
		const onJoined = vi.fn();
		service.subscribeToReactions(testGameId, { onReaction, onSpectators }, onJoined);

		handlerFor('OnSpectatorReaction')(testGameId, { reaction: 'fire', animal: 'giraffe' });
		handlerFor('OnSpectatorReaction')(testGameId, { reaction: 'fire' });
		handlerFor('OnSpectatorReaction')(testGameId, { reaction: 'x'.repeat(200), animal: 'giraffe' });
		handlerFor('OnSpectatorsChanged')(testGameId, { version: 4, animals: [ 'giraffe', 'otter' ] });
		handlerFor('OnSpectatorsChanged')(testGameId, { version: 'new', animals: [] });

		expect(onReaction).toHaveBeenCalledOnce();
		expect(onReaction).toHaveBeenCalledWith(testGameId, { reaction: 'fire', animal: 'giraffe' });
		expect(onSpectators).toHaveBeenCalledOnce();
		expect(onSpectators).toHaveBeenCalledWith(testGameId, { version: 4, animals: [ 'giraffe', 'otter' ] });
		const reactionsGroup = { join: 'SubscribeReactions', leave: 'UnsubscribeReactions', args: [ testGameId ] };
		expect(optionsFor('OnSpectatorReaction').group).toEqual(reactionsGroup);
		expect(optionsFor('OnSpectatorsChanged').group).toEqual(reactionsGroup);
		expect(optionsFor('OnSpectatorReaction').onGroupJoined).toBe(onJoined);
	});

	it('fetches the crowd', async () => {
		const { service, invokeWithResult } = createService({ version: 7, animals: [ 'otter' ] });

		expect(await service.getSpectators(testGameId)).toEqual({ version: 7, animals: [ 'otter' ] });
		expect(invokeWithResult).toHaveBeenCalledWith('GetSpectators', testGameId);
	});

	it('claims a spectator name, or none for a game that is gone', async () => {
		const named = createService('otter');
		expect(await named.service.claimSpectatorName(testGameId)).toBe('otter');
		expect(named.invokeWithResult).toHaveBeenCalledWith('ClaimSpectatorName', testGameId);

		container.clearInstances();
		const gone = createService(null);
		expect(await gone.service.claimSpectatorName(testGameId)).toBeUndefined();
	});

	it('sends a reaction and parses the answer', async () => {
		const { service, invokeWithResult } = createService({ accepted: true, animal: 'otter' });

		expect(await service.sendSpectatorReaction(testGameId, 'clap')).toEqual({ accepted: true, animal: 'otter' });
		expect(invokeWithResult).toHaveBeenCalledWith('SendSpectatorReaction', testGameId, 'clap');
	});
});
