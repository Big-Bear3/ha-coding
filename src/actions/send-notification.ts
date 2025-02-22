import { HAWebsocketService } from '../services/ha-websocket-service.js';

export interface NotificationInfo {
    entityId: string;
    content: string;
}

export function sendNotification(notificationInfo: NotificationInfo): void {
    const haWebsocketService = HAWebsocketService.instance;
    haWebsocketService.send({
        id: haWebsocketService.newMsgId,
        type: 'execute_script',
        sequence: {
            action: 'notify.send_message',
            target: {
                entity_id: notificationInfo.entityId
            },
            data: {
                message: notificationInfo.content
            },
            metadata: {}
        }
    });
}
