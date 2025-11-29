import * as signalR from "@microsoft/signalr";
import { getCookie } from "../utils/cookie.js"
import { injectable } from "tsyringe";

@injectable()
export class signalRService {
	private connection!: signalR.HubConnection;
	private hubUrl : string;

	async buildHubConnection(hubUrl: string) {
		this.hubUrl = hubUrl;
		
		const anonymousId = getCookie("anonymous-id");
		if (!anonymousId) {
			return;
		}

		this.connection = new signalR.HubConnectionBuilder()
			.withUrl(`${this.hubUrl}?anonymousId=${encodeURIComponent(anonymousId)}`)
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

	on<T>(method: string, handler: (data: T) => void) {
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
