import { container, injectable } from 'tsyringe';

import { SignalRService, SignalRSubscription } from './signalRService.js';

@injectable()
export class ActiveGamesLiveService {
	private readonly signalRService: SignalRService;

	constructor() {
		this.signalRService = container.resolve(SignalRService);
	}

	subscribe(
		onGamesChanged: () => void,
		onSynchronized: () => void | Promise<void>,
	): SignalRSubscription {
		return this.signalRService.registerSubscription({
			event:         'OnActiveGamesChanged',
			handler:       onGamesChanged,
			onGroupJoined: onSynchronized,
			group:         {
				join:  'SubscribeActiveGames',
				leave: 'UnsubscribeActiveGames',
				args:  [],
			},
		});
	}
}
