import * as signalR from "@microsoft/signalr";
import { injectable } from "tsyringe";

export type SignalRConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type ManagedSubscription = {
	subscribeMethod: string;
	unsubscribeMethod?: string;
	args: unknown[];
};

@injectable()
export class signalRService {
	private connection?: signalR.HubConnection;
	private hubUrl = '';
	private startPromise?: Promise<void>;
	private retryTimeout?: number;
	private status: SignalRConnectionStatus = 'disconnected';
	private statusListeners = new Set<(status: SignalRConnectionStatus, error?: Error) => void>();
	private subscriptions = new Map<string, ManagedSubscription>();

	async buildHubConnection(hubUrl: string) {
		await this.stop();
		this.hubUrl = `${import.meta.env.VITE_SERVER_URL}${hubUrl}`;

		const connection = new signalR.HubConnectionBuilder()
			.withUrl(this.hubUrl, {withCredentials: true})
			.withAutomaticReconnect({
				nextRetryDelayInMilliseconds() {
					return 5000;
			}
			})
			.configureLogging(signalR.LogLevel.Information)
			.build();

		connection.onreconnecting(error => {
			this.setStatus(
				'reconnecting',
				this.toError(error, 'Live sync was interrupted. Trying to reconnect...'),
			);
		});

		connection.onreconnected(async () => {
			this.setStatus('connected');

			await this.restoreSubscriptions();
		});

		connection.onclose(error => {
			this.setStatus(
				'disconnected',
				error ? this.toError(error, 'Live sync disconnected.') : undefined,
			);
		});

		this.connection = connection;
		this.setStatus('disconnected');
	}

	async start() {
		const connection = this.getConnection();
		if (connection.state === signalR.HubConnectionState.Connected
			|| connection.state === signalR.HubConnectionState.Connecting
			|| connection.state === signalR.HubConnectionState.Reconnecting)
			return;

		if (this.startPromise)
			return this.startPromise;

		this.clearRetry();
		this.setStatus('connecting');

		this.startPromise = connection.start()
			.then(() => {
				console.log("[SignalR] connected");
				this.setStatus('connected');
			})
			.catch((error) => {
				const normalizedError = this.toError(
					error,
					'Unable to connect to live updates. Retrying automatically...',
				);
				console.error("[SignalR] connection error", normalizedError);
				this.setStatus('disconnected', normalizedError);
				this.scheduleRetry();
				throw normalizedError;
			})
			.finally(() => {
				this.startPromise = undefined;
			});

		return this.startPromise;
	}

	on<T>(method: string, handler: (...args: any[]) => void) {
		this.getConnection().on(method, handler);
	}

	off(method: string, handler?: (...args: any[]) => void) {
		const connection = this.getConnection();
		if (handler) {
			connection.off(method, handler);
			return;
		}

		connection.off(method);
	}

	async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
		const connection = this.getConnection();
		if (connection.state === signalR.HubConnectionState.Disconnected)
			await this.start();

		if (connection.state !== signalR.HubConnectionState.Connected)
			throw new Error('Live sync is temporarily unavailable. Please try again in a moment.');

		try {
			return await connection.invoke(method, ...args);
		}
		catch (error) {
			throw this.toError(error, `Live sync action failed: ${ method }`);
		}
	}

	async stop() {
		this.clearRetry();
		const connection = this.connection;
		if (!connection)
			return;

		if (connection.state === signalR.HubConnectionState.Disconnected) {
			this.setStatus('disconnected');
			return;
		}

		await connection.stop();
		this.setStatus('disconnected');
	}

	addStatusListener(listener: (status: SignalRConnectionStatus, error?: Error) => void): () => void {
		this.statusListeners.add(listener);
		listener(this.status);
		return () => this.statusListeners.delete(listener);
	}

	async subscribe(
		key: string,
		subscribeMethod: string,
		args: unknown[] = [],
		unsubscribeMethod?: string,
	): Promise<void> {
		this.subscriptions.set(key, { subscribeMethod, unsubscribeMethod, args });
		await this.invoke<void>(subscribeMethod, ...args);
	}

	async unsubscribe(key: string): Promise<void> {
		const subscription = this.subscriptions.get(key);
		if (!subscription)
			return;

		this.subscriptions.delete(key);
		if (!subscription.unsubscribeMethod || !this.isConnected())
			return;

		await this.invoke<void>(subscription.unsubscribeMethod, ...subscription.args);
	}

	isConnected(): boolean {
		return this.connection?.state === signalR.HubConnectionState.Connected;
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

	private async restoreSubscriptions(): Promise<void> {
		for (const [ key, subscription ] of this.subscriptions) {
			try {
				await this.invoke<void>(subscription.subscribeMethod, ...subscription.args);
			}
			catch (error) {
				console.error(`[SignalR] failed to restore subscription "${ key }"`, error);
			}
		}
	}

	private scheduleRetry(): void {
		if (this.retryTimeout)
			return;

		this.retryTimeout = window.setTimeout(() => {
			this.retryTimeout = undefined;
			void this.start();
		}, 5000);
	}

	private clearRetry(): void {
		if (!this.retryTimeout)
			return;

		window.clearTimeout(this.retryTimeout);
		this.retryTimeout = undefined;
	}

	private toError(error: unknown, fallback: string): Error {
		return error instanceof Error ? error : new Error(fallback);
	}
}
