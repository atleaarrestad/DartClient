import { NotificationElement } from 'src/components/aa-notification-cmp.js';
import { injectable } from 'tsyringe';

type NotificationType = 'success' | 'danger' | 'info' | 'achievement';

interface BaseNotificationOptions {
	type?: Exclude<NotificationType, 'achievement'>;
	promise?: Promise<unknown>;
	timeout?: number;
	message?: string;
}

interface AchievementNotificationOptions {
	type: 'achievement';
	achievementNames: string[];
	promise?: Promise<unknown>;
	timeout?: number;
	message?: string;
}

type NotificationOptions = BaseNotificationOptions | AchievementNotificationOptions;

@injectable()
export class NotificationService {

	addNotification(options: NotificationOptions): void {
		let container = document.querySelector('aa-notification-container-cmp');

		if (!container) {
			container = document.createElement('aa-notification-container-cmp');
			document.body.appendChild(container);
		}

		const notification = document.createElement('aa-notification-cmp') as NotificationElement;
		notification.message = options.message ?? '';
		notification.type = options.type ?? 'info';
		notification.timeout = options.timeout ?? 3000;

		if (options.promise)
			notification.promise = options.promise;

		if (options.type === 'achievement')
			notification.achievementNames = options.achievementNames;

		container.appendChild(notification);
	}

}