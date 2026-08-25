import { container, injectable } from 'tsyringe';

import {
	combineSignalRSubscriptions,
	SignalRService,
	SignalRSubscription,
} from './signalRService.js';

@injectable()
export class ActiveGamesLiveService {
	private readonly signalRService: SignalRService;

	constructor() {
		this.signalRService = container.resolve(SignalRService);
	}

	subscribe(
		onGamesChanged: () => void,
		onSynchronized: () => void | Promise<void>,
		onListeningChanged: (listening: boolean) => void,
	): SignalRSubscription {
		const gamesSubscription = this.signalRService.registerSubscription({
			event:         'OnActiveGamesChanged',
			handler:       onGamesChanged,
			onGroupJoined: async () => {
				onListeningChanged(true);
				await onSynchronized();
			},
			group:         {
				join:  'SubscribeActiveGames',
				leave: 'UnsubscribeActiveGames',
				args:  [],
			},
		});
		const removeStatusListener = this.signalRService.addStatusListener(status => {
			if (status !== 'connected')
				onListeningChanged(false);
		});
		const statusSubscription: SignalRSubscription = {
			ready: Promise.resolve(),
			async dispose(): Promise<void> {
				removeStatusListener();
				onListeningChanged(false);
			},
		};

		return combineSignalRSubscriptions([ gamesSubscription, statusSubscription ]);
	}
}
