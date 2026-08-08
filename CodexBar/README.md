# CodexBar

CodexBar 是 OpenGit Codex + 飞书能力的轻量 macOS 状态栏客户端。它不提供聊天输入框，只负责配置、运行状态和会话控制。

## 能力

- 多飞书机器人、别名、启停和连接状态
- 按机器人与飞书 `chat_id` 自动隔离 Codex 会话
- 项目识别、会话复用、忙时排队和项目绑定
- Codex 订阅状态、默认目录、沙箱和审批策略
- 锁屏自动监控、飞书主动通知和断线恢复
- 状态栏快捷查看执行中/排队会话
- 后台日志和 Codex/飞书连接重启

飞书 App Secret 存入 macOS Keychain。其他配置保存在：

```text
~/Library/Application Support/CodexBar/store.json
```

第一次启动会从 OpenGit 的本机配置迁移机器人、会话与监控状态。

## 开发

```bash
cd CodexBar
swift run
```

CodexBar 使用本机 Node.js 启动后台宿主，并复用仓库中的 OpenGit Codex 模块。

## 构建应用

```bash
bash CodexBar/scripts/build-app.sh
open CodexBar/dist/CodexBar.app
```

产物会内置 OpenGit Codex 运行模块和飞书 Node 依赖，但仍使用本机 Node.js 与 Codex CLI，因此不引入 Electron、Chromium 或 ffmpeg。
