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
