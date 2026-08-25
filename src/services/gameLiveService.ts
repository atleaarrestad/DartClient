import { container, injectable } from 'tsyringe';

import type { SessionAchievement } from '../models/enums.js';
import type { GameResult, GameTracker } from '../models/schemas.js';
import {
	combineSignalRSubscriptions,
	SignalRService,
	SignalRSubscription,
} from './signalRService.js';

@injectable()
export class GameLiveService {
	private readonly signalRService: SignalRService;

	constructor() {
		this.signalRService = container.resolve(SignalRService);
	}

	subscribeToAchievements(
		gameId: string,
		handler: (
			gameId: string,
			playerId: string,
			sessionAchievements: SessionAchievement[],
		) => void,
	): SignalRSubscription {
		return this.signalRService.registerSubscription({
			event: 'OnSessionAchievementUnlocked',
			handler,
			group: {
				join:  'SubscribeAchievement',
				leave: 'UnsubscribeAchievement',
				args:  [ gameId ],
			},
		});
	}

	subscribeToGame(
		gameId: string,
		handlers: {
			onUpdated: (gameId: string, gameTracker: GameTracker) => void;
			onFinished: (gameId: string, gameResult: GameResult) => void;
		},
		onSynchronized: () => void | Promise<void>,
	): SignalRSubscription {
		return combineSignalRSubscriptions([
			this.signalRService.registerSubscription({
				event:         'OnGameUpdated',
				handler:       handlers.onUpdated,
				onGroupJoined: onSynchronized,
				group:         {
					join:  'SubscribeSpectate',
					leave: 'UnsubscribeSpectate',
					args:  [ gameId ],
				},
			}),
			this.signalRService.registerSubscription({
				event:   'OnGameFinished',
				handler: handlers.onFinished,
				group:   {
					join:  'SubscribeSpectate',
					leave: 'UnsubscribeSpectate',
					args:  [ gameId ],
				},
			}),
		]);
	}
}
