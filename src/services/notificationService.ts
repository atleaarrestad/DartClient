import { NotificationElement } from 'src/components/aa-notification-cmp.js';
import { injectable } from 'tsyringe';

@injectable()
export class NotificationService {
    addNotification(message: string, title: string, type: 'success' | 'danger' | 'info'): void {
        let container = document.querySelector('aa-notification-container-cmp');
    
        if (!container) {
          container = document.createElement('aa-notification-container-cmp');
          document.body.appendChild(container);
        }
    
        const notification = document.createElement('aa-notification-cmp') as NotificationElement;
        notification.message = message;
        notification.title = title;
        notification.type = type;
    
        container.appendChild(notification);
      }
}
