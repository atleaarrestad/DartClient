import { NotificationElement } from 'src/components/aa-notification-cmp.js';
import { injectable } from 'tsyringe';

@injectable()
export class NotificationService {
    addNotification(message: string, type: 'success' | 'danger' | 'info' = 'info', promise?: Promise<any>): void {
        let container = document.querySelector('aa-notification-container-cmp');

        if (!container) {
            container = document.createElement('aa-notification-container-cmp');
            document.body.appendChild(container);
        }

        const notification = document.createElement('aa-notification-cmp') as NotificationElement;
        notification.message = message;
        notification.type = type;

        if (promise) {
            notification.promise = promise;
        }

        container.appendChild(notification);
    }
}