import { onChange } from '../../../index.js';
import { diningRoom, mBathroom } from '../devices.js';

// 监听主卫人在传感器区域1有人无人变化
onChange(
    () => mBathroom.occupySensor.area1Occupied, // 区域1有人无人状态
    (area1Occupied) => {
        if (area1Occupied) {
            // 如果有人则开灯
            diningRoom.pendant.on = true;
        } else {
            // 如果无人则关灯
            diningRoom.pendant.on = false;
        }
    }
);
