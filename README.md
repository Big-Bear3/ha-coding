## 面向Home Assistant，使用TypeScript编写全平台自动化！更自由，更灵活！
## 用法风格概览
```ts
// 监听卫生间人在传感器有人无人变化
onChange(
    () => bathroom.occupySensor.occupied, // 有人无人状态
    (occupied) => {
        if (occupied) {
            // 如果有人则开灯
            bathroom.lamp.on = true;
        } else {
            // 如果无人则关灯
            bathroom.lamp.on = false;
        }
    }
);
```
## 快速上手
**前提：**
1. 已经安装好 [Home Assistant](https://www.home-assistant.io/) 以及相关集成。
2. 已经安装好 [Nodejs](https://nodejs.org/zh-cn) 环境。
3. 已经安装好 [VS Code](https://code.visualstudio.com/) 开发工具。

**下载项目模版：**
[下载页面](https://github.com/Big-Bear3/ha-coding/blob/main/my-home.zip)  （进入页面后点击下载按钮下载）

**安装：**
解压项目模板文件并在终端中打开，执行以下命令：
```bash
cd my-home
npm install
npm install ha-coding
```
**配置项目：**
用VS Code打开项目，打开根目录下的config.js文件，并配置成你的Home Assistant的相关配置
```ts
export default {
    /** HomeAssistant后台ip地址:端口号，如：192.168.31.156:8123 */
    IP_ADDRESS_PORT: '',
    /** HomeAssistant用户名 */
    HA_USER_NAME: '',
    /** HomeAssistant密码 */
    HA_PASSWORD: ''
};
```
**启动项目：**
在终端中执行以下命令：
```bash
npm start
```
等待几秒后控制台打印 “HA Coding 启动成功！”，则证明启动成功。如果控制台报错，则为启动失败。
## 使用说明
**定义设备：**
<br>定义设备是为了告知系统每个设备是如何与Home Assistant交互的，推荐在项目的devices-def文件夹下定义
```ts
@Device()
export class MiLight implements DeviceDef {
    $entityIds: { light: string };

    @State(function (this: MiLight, value: MiLight['on']) {
        return { service: value ? 'turn_on' : 'turn_off', entityId: this.$entityIds.light };
    })
    on: boolean;

    @State(function (this: MiLight, value: MiLight['brightness']) {
        return {
            service: 'turn_on',
            serviceData: {
                brightness_pct: value
            },
            entityId: this.$entityIds.light
        };
    })
    brightness: number;

    @State(function (this: MiLight, value: MiLight['colorTemperature']) {
        return {
            service: 'turn_on',
            serviceData: {
                color_temp_kelvin: value
            },
            entityId: this.$entityIds.light
        };
    })
    colorTemperature: number;

    $onEvent({ a, s }: MiLightEvent, entityId: string): void {
        if (entityId !== this.$entityIds.light) return;

        if (s === 'on') {
            this.on = true;
        } else if (s === 'off') {
            this.on = false;
        }

        if (a.brightness !== undefined && a.brightness !== null) {
            this.brightness = Math.round((a.brightness * 100) / 255);
        }

        if (a.color_temp_kelvin !== undefined && a.color_temp_kelvin !== null) {
            this.colorTemperature = a.color_temp_kelvin;
        }
    }
}
```
如上定义了一个米家智能灯设备：
1. 创建一个 MiLight 类并实现 DeviceDef 接口，并使用 @Device() 装饰器装饰 MiLight 类。
2. 创建 $entityIds 成员变量，用于存放该设备下的实体id。
3. 定义设备的属性 on（开关状态）、brightness（亮度）、colorTemperature（色温），并使用 @State() 装饰器装饰。@State() 装饰器中的参数回调方法需返回发送信息来告知系统当该属性发生变化时，如何发送到Home Assistant上。
4. 定义 $onEvent 方法，当 Home Assistant 产生事件时会调用该方法，将事件信息映射到设备的属性上。

事件信息和发送信息可以在 Home Assistant 网页上使用 F12 查看 WebSocket 记录查询到。

**创建设备实例：**
<br>在定义好设备后，我们需要创建这些设备的实例，以便在后续为这些设备编写自动化，推荐在项目的devices文件夹下创建
```ts
export const bathroom = {
    lamp: createDevice(MiLight, { light: 'your entity id' }),
    occupySensor: createDevice(MiTrio, {
        allArea: 'your entity id',
        illumination: 'your entity id',
        area1: 'your entity id',
        area2: 'your entity id'
    })
};
```
如上使用 createDevice() 方法定义了卫生间的一个米家智能灯设备和一个Trio人在传感器设备，createDevice() 方法的第一个参数为设备的定义类，第二个参数为该设备下的实体id。

