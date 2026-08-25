import * as signalR from '@microsoft/signalr';
import { injectable } from 'tsyringe';

import type { SessionAchievement } from '../models/enums.js';
import type { GameResult, GameTracker } from '../models/schemas.js';

export type SignalRConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SignalRClientEvents {
	OnActiveGamesChanged: [];
	OnGameUpdated: [gameId: string, gameTracker: GameTracker];
	OnGameFinished: [gameId: string, gameResult: GameResult];
	OnSessionAchievementUnlocked: [
		gameId: string,
		playerId: string,
		sessionAchievements: SessionAchievement[],
	];
}

interface SignalRHubMethods {
	SubscribeActiveGames: [];
	UnsubscribeActiveGames: [];
	SubscribeSpectate: [gameId: string];
	UnsubscribeSpectate: [gameId: string];
	SubscribeAchievement: [gameId: string];
	UnsubscribeAchievement: [gameId: string];
}

type SignalREventName = keyof SignalRClientEvents;
type SignalRHubMethodName = keyof SignalRHubMethods;

export type SignalRGroupSubscription =
	| {
		join: 'SubscribeActiveGames';
		leave: 'UnsubscribeActiveGames';
		args: [];
	}
	| {
		join: 'SubscribeSpectate';
		leave: 'UnsubscribeSpectate';
		args: [gameId: string];
	}
	| {
		join: 'SubscribeAchievement';
		leave: 'UnsubscribeAchievement';
		args: [gameId: string];
	};

export interface SignalRSubscription {
	readonly ready: Promise<void>;
	dispose(): Promise<void>;
}

export interface SignalRSubscriptionOptions<EventName extends SignalREventName> {
	event: EventName;
	handler: (...args: SignalRClientEvents[EventName]) => void;
	group?: SignalRGroupSubscription;
	onGroupJoined?: () => void | Promise<void>;
}

export function combineSignalRSubscriptions(
	subscriptions: SignalRSubscription[],
): SignalRSubscription {
	return {
		ready: Promise.all(subscriptions.map(subscription => subscription.ready)).then(() => undefined),
		async dispose(): Promise<void> {
			await Promise.all(subscriptions.map(subscription => subscription.dispose()));
		},
	};
}

interface ManagedGroup {
	join: SignalRHubMethodName;
	leave: SignalRHubMethodName;
	args: readonly unknown[];
	references: number;
	joined: boolean;
	joinPromise?: Promise<void>;
	joinedListeners: Set<() => void | Promise<void>>;
}

@injectable()
export class SignalRService {
	private connection?: signalR.HubConnection;
	private hubUrl = '';
	private startPromise?: Promise<void>;
	private retryTimeout?: ReturnType<typeof setTimeout>;
	private groupRestoreRetryTimeout?: ReturnType<typeof setTimeout>;
	private status: SignalRConnectionStatus = 'disconnected';
	private statusListeners: Set<(status: SignalRConnectionStatus, error?: Error) => void> = new Set();
	private groups: Map<string, ManagedGroup> = new Map();
	private allowReconnect = true;

	async ensureConnected(hubUrl = 'hubs/main'): Promise<void> {
		const connection = await this.ensureConnection(hubUrl);
		if (this.startPromise)
			return this.startPromise;

		if (connection.state === signalR.HubConnectionState.Connected)
			return;

		if (connection.state === signalR.HubConnectionState.Connecting
			|| connection.state === signalR.HubConnectionState.Reconnecting)
			return this.waitForConnected();

		this.allowReconnect = true;
		this.clearRetry();
		this.setStatus('connecting');

		this.startPromise = connection.start()
			.then(async () => {
				console.log('[SignalR] connected');
				await this.restoreGroups();
				this.setStatus('connected');
			})
			.catch((error) => {
				const normalizedError = this.toError(
					error,
					'Unable to connect to live updates. Retrying automatically...',
				);
				console.error('[SignalR] connection error', normalizedError);
				this.setStatus('disconnected', normalizedError);
				this.scheduleRetry();
				throw normalizedError;
			})
			.finally(() => {
				this.startPromise = undefined;
			});

		return this.startPromise;
	}

	registerSubscription<EventName extends SignalREventName>(
		options: SignalRSubscriptionOptions<EventName>,
	): SignalRSubscription {
		const connection = this.getOrCreateConnection('hubs/main');
		const handler = options.handler as (...args: any[]) => void;
		connection.on(options.event, handler);

		const onGroupJoined = options.onGroupJoined
			? () => options.onGroupJoined?.()
			: undefined;
		const group = options.group
			? this.retainGroup(options.group, onGroupJoined)
			: undefined;
		const notifyWhenReady = group?.joined ?? false;
		let disposed = false;

		const dispose = async (): Promise<void> => {
			if (disposed)
				return;

			disposed = true;
			connection.off(options.event, handler);
			if (group)
				await this.releaseGroup(group, onGroupJoined);
		};

		const ready = this.ensureConnected()
			.then(async () => {
				if (!disposed && group) {
					await this.joinGroup(group);

					if (notifyWhenReady && onGroupJoined)
						await this.notifyGroupJoined([ onGroupJoined ]);
				}
			})
			.catch(error => {
				if (group && this.isConnected())
					this.scheduleGroupRestoreRetry();

				throw error;
			});

		return { ready, dispose };
	}

	addStatusListener(listener: (status: SignalRConnectionStatus, error?: Error) => void): () => void {
		this.statusListeners.add(listener);
		listener(this.status);
		return () => this.statusListeners.delete(listener);
	}

	isConnected(): boolean {
		return this.connection?.state === signalR.HubConnectionState.Connected;
	}

	async stop(): Promise<void> {
		this.allowReconnect = false;
		this.clearRetry();
		this.clearGroupRestoreRetry();

		const connection = this.connection;
		if (!connection)
			return;

		if (connection.state !== signalR.HubConnectionState.Disconnected)
			await connection.stop();

		this.markGroupsDisconnected();
		this.setStatus('disconnected');
	}

	protected createConnection(hubUrl: string): signalR.HubConnection {
		return new signalR.HubConnectionBuilder()
			.withUrl(hubUrl, { withCredentials: true })
			.withAutomaticReconnect({
				nextRetryDelayInMilliseconds: () => 5000,
			})
			.configureLogging(signalR.LogLevel.Information)
			.build();
	}

	private async ensureConnection(hubUrl: string): Promise<signalR.HubConnection> {
		const absoluteHubUrl = `${ import.meta.env.VITE_SERVER_URL }${ hubUrl }`;
		if (this.connection && this.hubUrl === absoluteHubUrl)
			return this.connection;

		if (this.connection)
			await this.stop();

		return this.configureConnection(absoluteHubUrl);
	}

	private getOrCreateConnection(hubUrl: string): signalR.HubConnection {
		const absoluteHubUrl = `${ import.meta.env.VITE_SERVER_URL }${ hubUrl }`;
		if (this.connection && this.hubUrl === absoluteHubUrl)
			return this.connection;

		if (this.connection)
			throw new Error('Live sync is already configured for another hub.');

		return this.configureConnection(absoluteHubUrl);
	}

	private configureConnection(hubUrl: string): signalR.HubConnection {
		const connection = this.createConnection(hubUrl);

		connection.onreconnecting(error => {
			this.markGroupsDisconnected();
			this.setStatus(
				'reconnecting',
				this.toError(error, 'Live sync was interrupted. Trying to reconnect...'),
			);
		});

		connection.onreconnected(async () => {
			await this.restoreGroups();
			this.setStatus('connected');
		});

		connection.onclose(error => {
			this.markGroupsDisconnected();
			this.setStatus(
				'disconnected',
				error ? this.toError(error, 'Live sync disconnected.') : undefined,
			);

			if (this.allowReconnect)
				this.scheduleRetry();
		});

		this.connection = connection;
		this.hubUrl = hubUrl;
		this.allowReconnect = true;
		this.setStatus('disconnected');

		return connection;
	}

	private retainGroup(
		group: SignalRGroupSubscription,
		onGroupJoined?: () => void | Promise<void>,
	): ManagedGroup {
		const key = this.getGroupKey(group);
		const existingGroup = this.groups.get(key);
		if (existingGroup) {
			existingGroup.references++;
			if (onGroupJoined)
				existingGroup.joinedListeners.add(onGroupJoined);
			return existingGroup;
		}

		const managedGroup: ManagedGroup = {
			join:       group.join,
			leave:      group.leave,
			args:       group.args,
			references: 1,
			joined:     false,
			joinedListeners: new Set(onGroupJoined ? [ onGroupJoined ] : []),
		};
		this.groups.set(key, managedGroup);
		return managedGroup;
	}

	private async releaseGroup(
		group: ManagedGroup,
		onGroupJoined?: () => void | Promise<void>,
	): Promise<void> {
		group.references--;
		if (onGroupJoined)
			group.joinedListeners.delete(onGroupJoined);

		if (group.references > 0)
			return;

		if (group.joinPromise) {
			try {
				await group.joinPromise;
			}
			catch {
				if (group.references === 0)
					this.groups.delete(this.getGroupKey(group));

				return;
			}
		}

		if (group.references > 0)
			return;

		this.groups.delete(this.getGroupKey(group));
		if (!group.joined || !this.isConnected())
			return;

		await this.invokeHubMethod(group.leave, group.args);
		group.joined = false;
	}

	private async joinGroup(group: ManagedGroup): Promise<void> {
		if (group.references === 0 || group.joined)
			return;

		if (group.joinPromise)
			return group.joinPromise;

		group.joinPromise = this.invokeHubMethod(group.join, group.args)
			.then(async () => {
				group.joined = true;
				await this.notifyGroupJoined(group.joinedListeners);
			})
			.finally(() => {
				group.joinPromise = undefined;
			});

		return group.joinPromise;
	}

	private async notifyGroupJoined(
		listeners: Iterable<() => void | Promise<void>>,
	): Promise<void> {
		await Promise.all([ ...listeners ].map(async listener => {
			try {
				await listener();
			}
			catch (error) {
				console.error('[SignalR] failed to synchronize a joined group', error);
			}
		}));
	}

	private async invokeHubMethod(
		method: SignalRHubMethodName,
		args: readonly unknown[],
	): Promise<void> {
		const connection = this.getConnection();
		if (connection.state !== signalR.HubConnectionState.Connected)
			throw new Error('Live sync is temporarily unavailable. Please try again in a moment.');

		try {
			await connection.invoke(method, ...args);
		}
		catch (error) {
			throw this.toError(error, `Live sync action failed: ${ method }`);
		}
	}

	private getConnection(): signalR.HubConnection {
		if (!this.connection)
			throw new Error('Live sync connection has not been configured.');

		return this.connection;
	}

	private setStatus(status: SignalRConnectionStatus, error?: Error): void {
		this.status = status;
		for (const listener of this.statusListeners)
			listener(status, error);
	}

	private async restoreGroups(): Promise<void> {
		let failed = false;
		await Promise.all([ ...this.groups.values() ].map(async group => {
				try {
					await this.joinGroup(group);
				}
				catch (error) {
					failed = true;
					console.error(`[SignalR] failed to restore group "${ group.join }"`, error);
				}
			}));

		if (failed && this.isConnected())
			this.scheduleGroupRestoreRetry();
		else
			this.clearGroupRestoreRetry();
	}

	private markGroupsDisconnected(): void {
		this.clearGroupRestoreRetry();
		for (const group of this.groups.values()) {
			group.joined = false;
			group.joinPromise = undefined;
		}
	}

	private getGroupKey(group: Pick<ManagedGroup, 'join' | 'args'>): string {
		return `${ group.join }:${ JSON.stringify(group.args) }`;
	}

	private scheduleRetry(): void {
		if (this.retryTimeout || !this.allowReconnect)
			return;

		this.retryTimeout = globalThis.setTimeout(() => {
			this.retryTimeout = undefined;
			void this.ensureConnected().catch(() => {});
		}, 5000);
	}

	private scheduleGroupRestoreRetry(): void {
		if (this.groupRestoreRetryTimeout)
			return;

		this.groupRestoreRetryTimeout = globalThis.setTimeout(() => {
			this.groupRestoreRetryTimeout = undefined;
			if (this.isConnected())
				void this.restoreGroups();
		}, 5000);
	}

	private clearRetry(): void {
		if (!this.retryTimeout)
			return;

		globalThis.clearTimeout(this.retryTimeout);
		this.retryTimeout = undefined;
	}

	private clearGroupRestoreRetry(): void {
		if (!this.groupRestoreRetryTimeout)
			return;

		globalThis.clearTimeout(this.groupRestoreRetryTimeout);
		this.groupRestoreRetryTimeout = undefined;
	}

	private waitForConnected(): Promise<void> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const listenerState: { remove?: () => void; } = {};
			const removeListener = this.addStatusListener((status, error) => {
				if (status === 'connected') {
					settled = true;
					listenerState.remove?.();
					resolve();
				}
				else if (status === 'disconnected' && !this.allowReconnect) {
					settled = true;
					listenerState.remove?.();
					reject(error ?? new Error('Live sync was stopped.'));
				}
			});
			listenerState.remove = removeListener;

			if (settled)
				removeListener();
		});
	}

	private toError(error: unknown, fallback: string): Error {
		return error instanceof Error ? error : new Error(fallback);
	}
}
