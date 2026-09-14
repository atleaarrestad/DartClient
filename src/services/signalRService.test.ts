import 'reflect-metadata';

import * as signalR from '@microsoft/signalr';
import { describe, expect, it, vi } from 'vitest';

import { SignalRService } from './signalRService.js';

type ReconnectingHandler = (error?: Error) => void;
type ReconnectedHandler = (connectionId?: string) => void | Promise<void>;
type CloseHandler = (error?: Error) => void;

class FakeHubConnection {
	state = signalR.HubConnectionState.Disconnected;
	startFailures = 0;
	readonly invocations: { method: string; args: unknown[]; }[] = [];
	readonly invokeFailures = new Map<string, number>();
	private readonly eventHandlers = new Map<string, Set<(...args: any[]) => void>>();
	private readonly invocationBlocks = new Map<string, Promise<void>>();
	private reconnectingHandler?: ReconnectingHandler;
	private reconnectedHandler?: ReconnectedHandler;
	private closeHandler?: CloseHandler;

	async start(): Promise<void> {
		this.state = signalR.HubConnectionState.Connecting;
		await Promise.resolve();

		if (this.startFailures > 0) {
			this.startFailures--;
			this.state = signalR.HubConnectionState.Disconnected;
			throw new Error('Connection failed');
		}

		this.state = signalR.HubConnectionState.Connected;
	}

	async stop(): Promise<void> {
		this.state = signalR.HubConnectionState.Disconnected;
	}

	async invoke(method: string, ...args: unknown[]): Promise<void> {
		this.invocations.push({ method, args });

		const remainingFailures = this.invokeFailures.get(method) ?? 0;
		if (remainingFailures > 0) {
			this.invokeFailures.set(method, remainingFailures - 1);
			throw new Error(`${ method } failed`);
		}

		await this.invocationBlocks.get(method);
	}

	on(method: string, handler: (...args: any[]) => void): void {
		const handlers = this.eventHandlers.get(method) ?? new Set();
		handlers.add(handler);
		this.eventHandlers.set(method, handlers);
	}

	off(method: string, handler: (...args: any[]) => void): void {
		this.eventHandlers.get(method)?.delete(handler);
	}

	onreconnecting(handler: ReconnectingHandler): void {
		this.reconnectingHandler = handler;
	}

	onreconnected(handler: ReconnectedHandler): void {
		this.reconnectedHandler = handler;
	}

	onclose(handler: CloseHandler): void {
		this.closeHandler = handler;
	}

	emit(method: string, ...args: unknown[]): void {
		for (const handler of this.eventHandlers.get(method) ?? [])
			handler(...args);
	}

	triggerReconnecting(): void {
		this.state = signalR.HubConnectionState.Reconnecting;
		this.reconnectingHandler?.(new Error('Interrupted'));
	}

	async triggerReconnected(): Promise<void> {
		this.state = signalR.HubConnectionState.Connected;
		await this.reconnectedHandler?.('connection-id');
	}

	triggerClosed(): void {
		this.state = signalR.HubConnectionState.Disconnected;
		this.closeHandler?.();
	}

	blockInvocation(method: string): () => void {
		let release!: () => void;
		const promise = new Promise<void>(resolve => {
			release = resolve;
		});
		this.invocationBlocks.set(method, promise);

		return () => {
			this.invocationBlocks.delete(method);
			release();
		};
	}
}

class TestSignalRService extends SignalRService {
	constructor(private readonly fakeConnection: FakeHubConnection) {
		super();
	}

	protected override createConnection(_hubUrl: string): signalR.HubConnection {
		return this.fakeConnection as unknown as signalR.HubConnection;
	}
}

function countInvocations(connection: FakeHubConnection, method: string): number {
	return connection.invocations.filter(invocation => invocation.method === method).length;
}

describe('SignalRService', () => {
	it('registers and disposes an event and group together', async () => {
		const connection = new FakeHubConnection();
		const service = new TestSignalRService(connection);
		const handler = vi.fn();
		const subscription = service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler,
			group: {
				join:  'SubscribeActiveGames',
				leave: 'UnsubscribeActiveGames',
				args:  [],
			},
		});

		await subscription.ready;
		connection.emit('OnActiveGamesChanged');

		expect(handler).toHaveBeenCalledOnce();
		expect(countInvocations(connection, 'SubscribeActiveGames')).toBe(1);

		await subscription.dispose();
		connection.emit('OnActiveGamesChanged');

		expect(handler).toHaveBeenCalledOnce();
		expect(countInvocations(connection, 'UnsubscribeActiveGames')).toBe(1);
	});

	it('rejects duplicate callback registration for the same event', async () => {
		const connection = new FakeHubConnection();
		const service = new TestSignalRService(connection);
		const handler = vi.fn();
		const first = service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler,
		});

		expect(() => service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler,
		})).toThrow('SignalR handler is already registered');

		await first.ready;
		await first.dispose();

		const replacement = service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler,
		});
		await replacement.ready;
		await replacement.dispose();
	});

	it('reference-counts consumers that share a group', async () => {
		const connection = new FakeHubConnection();
		const service = new TestSignalRService(connection);
		const first = service.registerSubscription({
			event: 'OnGameUpdated',
			handler: vi.fn(),
			group: {
				join:  'SubscribeSpectate',
				leave: 'UnsubscribeSpectate',
				args:  [ 'game-id' ],
			},
		});
		const second = service.registerSubscription({
			event: 'OnGameFinished',
			handler: vi.fn(),
			group: {
				join:  'SubscribeSpectate',
				leave: 'UnsubscribeSpectate',
				args:  [ 'game-id' ],
			},
		});

		await Promise.all([ first.ready, second.ready ]);

		expect(countInvocations(connection, 'SubscribeSpectate')).toBe(1);

		await first.dispose();
		expect(countInvocations(connection, 'UnsubscribeSpectate')).toBe(0);

		await second.dispose();
		expect(countInvocations(connection, 'UnsubscribeSpectate')).toBe(1);
	});

	it('waits for the shared cold-start connection before joining groups', async () => {
		const connection = new FakeHubConnection();
		const service = new TestSignalRService(connection);
		const first = service.registerSubscription({
			event: 'OnGameUpdated',
			handler: vi.fn(),
			group: {
				join:  'SubscribeSpectate',
				leave: 'UnsubscribeSpectate',
				args:  [ 'game-id' ],
			},
		});
		const second = service.registerSubscription({
			event: 'OnV2AchievementProjectionAdded',
			handler: vi.fn(),
			group: {
				join:  'SubscribeAchievement',
				leave: 'UnsubscribeAchievement',
				args:  [ 'game-id' ],
			},
		});

		await Promise.all([ first.ready, second.ready ]);

		expect(countInvocations(connection, 'SubscribeSpectate')).toBe(1);
		expect(countInvocations(connection, 'SubscribeAchievement')).toBe(1);

		await Promise.all([ first.dispose(), second.dispose() ]);
	});

	it('retains registrations across an initial connection failure', async () => {
		const connection = new FakeHubConnection();
		connection.startFailures = 1;
		const service = new TestSignalRService(connection);
		const handler = vi.fn();
		const subscription = service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler,
			group: {
				join:  'SubscribeActiveGames',
				leave: 'UnsubscribeActiveGames',
				args:  [],
			},
		});

		await expect(subscription.ready).rejects.toThrow('Connection failed');
		await service.ensureConnected();
		connection.emit('OnActiveGamesChanged');

		expect(countInvocations(connection, 'SubscribeActiveGames')).toBe(1);
		expect(handler).toHaveBeenCalledOnce();

		await subscription.dispose();
	});

	it('rejoins active groups after reconnecting', async () => {
		const connection = new FakeHubConnection();
		const service = new TestSignalRService(connection);
		const subscription = service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler: vi.fn(),
			group: {
				join:  'SubscribeActiveGames',
				leave: 'UnsubscribeActiveGames',
				args:  [],
			},
		});

		await subscription.ready;
		connection.triggerReconnecting();
		await connection.triggerReconnected();

		expect(countInvocations(connection, 'SubscribeActiveGames')).toBe(2);

		await subscription.dispose();
	});

	it('leaves a group when disposed during an in-flight join', async () => {
		const connection = new FakeHubConnection();
		const releaseJoin = connection.blockInvocation('SubscribeActiveGames');
		const service = new TestSignalRService(connection);
		const subscription = service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler: vi.fn(),
			group: {
				join:  'SubscribeActiveGames',
				leave: 'UnsubscribeActiveGames',
				args:  [],
			},
		});

		await vi.waitFor(() => {
			expect(countInvocations(connection, 'SubscribeActiveGames')).toBe(1);
		});
		const disposePromise = subscription.dispose();
		releaseJoin();

		await Promise.all([ subscription.ready, disposePromise ]);

		expect(countInvocations(connection, 'UnsubscribeActiveGames')).toBe(1);
	});

	it('retries a group that fails to restore after reconnecting', async () => {
		vi.useFakeTimers();

		try {
			const connection = new FakeHubConnection();
			const service = new TestSignalRService(connection);
			const onGroupJoined = vi.fn();
			const subscription = service.registerSubscription({
				event: 'OnActiveGamesChanged',
				handler: vi.fn(),
				onGroupJoined,
				group: {
					join:  'SubscribeActiveGames',
					leave: 'UnsubscribeActiveGames',
					args:  [],
				},
			});

			await subscription.ready;
			connection.invokeFailures.set('SubscribeActiveGames', 1);
			connection.triggerReconnecting();
			await connection.triggerReconnected();
			await vi.advanceTimersByTimeAsync(5000);

			expect(countInvocations(connection, 'SubscribeActiveGames')).toBe(3);
			expect(onGroupJoined).toHaveBeenCalledTimes(2);

			await subscription.dispose();
		}
		finally {
			vi.useRealTimers();
		}
	});

	it('retains and retries a registration when its initial group join fails', async () => {
		vi.useFakeTimers();

		try {
			const connection = new FakeHubConnection();
			const service = new TestSignalRService(connection);
			await service.ensureConnected();
			connection.invokeFailures.set('SubscribeActiveGames', 1);
			const handler = vi.fn();
			const subscription = service.registerSubscription({
				event: 'OnActiveGamesChanged',
				handler,
				group: {
					join:  'SubscribeActiveGames',
					leave: 'UnsubscribeActiveGames',
					args:  [],
				},
			});

			await expect(subscription.ready).rejects.toThrow('SubscribeActiveGames failed');
			await vi.advanceTimersByTimeAsync(5000);
			connection.emit('OnActiveGamesChanged');

			expect(countInvocations(connection, 'SubscribeActiveGames')).toBe(2);
			expect(handler).toHaveBeenCalledOnce();

			await subscription.dispose();
		}
		finally {
			vi.useRealTimers();
		}
	});

	it('does not restore disposed groups', async () => {
		const connection = new FakeHubConnection();
		const service = new TestSignalRService(connection);
		const subscription = service.registerSubscription({
			event: 'OnActiveGamesChanged',
			handler: vi.fn(),
			group: {
				join:  'SubscribeActiveGames',
				leave: 'UnsubscribeActiveGames',
				args:  [],
			},
		});

		await subscription.ready;
		await subscription.dispose();
		connection.triggerReconnecting();
		await connection.triggerReconnected();

		expect(countInvocations(connection, 'SubscribeActiveGames')).toBe(1);
	});
});
