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
