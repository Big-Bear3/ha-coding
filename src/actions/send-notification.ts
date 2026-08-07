import { HAWebsocketService } from '../services/ha-websocket-service.js';
import { MiRouter } from '../services/mi/mi-router.js';
import { MiTranslator } from '../services/mi/mi-translator.js';
import { parseEntityId } from '../services/mi/entity-id-parser.js';
import { logger } from '../services/logger-service.js';

export interface NotificationInfo {
    entityId: string;
    content: string;
}

export function sendNotification(notificationInfo: NotificationInfo): void {
    // 小米直连设备：走 MIoT action
    if (MiRouter.instance.usesMiGateway(notificationInfo.entityId)) {
        const parsedEntity = parseEntityId(notificationInfo.entityId);
        if (parsedEntity?.did && parsedEntity.siid != null && parsedEntity.aiid != null) {
            MiTranslator.instance
                .execNotify(parsedEntity.did, parsedEntity.siid, parsedEntity.aiid, notificationInfo.content)
                .catch((error) => {
                    logger.printError(error);
                });
            return;
        }
        logger.printError(`[sendNotification] 无法解析直连 entityId，指令丢弃: ${notificationInfo.entityId}`);
        return;
    }

    // Home Assistant
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

