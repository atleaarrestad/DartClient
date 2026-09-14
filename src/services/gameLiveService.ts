import { container, injectable } from 'tsyringe';

import type { AchievementInstanceResponse } from '../models/achievementBuilderApi.js';
import type { GameResult, GameTracker, GameTrackerDelta } from '../models/schemas.js';
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

	subscribeToV2Achievements(
		gameId: string,
		handler: (
			gameId: string,
			playerId: string,
			achievements: AchievementInstanceResponse[],
		) => void,
	): SignalRSubscription {
		return this.signalRService.registerSubscription({
			event: 'OnV2AchievementProjectionAdded',
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
			onDelta: (gameId: string, delta: GameTrackerDelta) => void;
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
				event:   'OnGameDelta',
				handler: handlers.onDelta,
				group:   {
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
