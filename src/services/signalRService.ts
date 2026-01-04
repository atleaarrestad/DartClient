import * as signalR from "@microsoft/signalr";
import { injectable } from "tsyringe";

@injectable()
export class signalRService {
	private connection!: signalR.HubConnection;
	private hubUrl : string;

	async buildHubConnection(hubUrl: string) {
		
		this.hubUrl = `${import.meta.env.VITE_SERVER_URL}${hubUrl}`;

		this.connection = new signalR.HubConnectionBuilder()
			.withUrl(this.hubUrl, {withCredentials: true})
			.withAutomaticReconnect({
				nextRetryDelayInMilliseconds() {
					return 5000;
			}
			})
			.configureLogging(signalR.LogLevel.Information)
			.build();
	}

	async start() {
		if (this.connection.state === signalR.HubConnectionState.Connected ||
			this.connection.state === signalR.HubConnectionState.Connecting) {
			return;
		}

		try {
			await this.connection.start();
			console.log("[SignalR] connected");
		} catch (err) {
			console.error("[SignalR] connection error", err);
			setTimeout(() => this.start(), 5000);
		}
	}

	on<T>(method: string, handler: (...args: any[]) => void) {
		this.connection.on(method, handler);
	}

	off(method: string) {
		this.connection.off(method);
	}

	invoke<T>(method: string, ...args: unknown[]): Promise<T> {
		return this.connection.invoke(method, ...args);
	}

	stop() {
		return this.connection.stop();
	}
}
