# OpenGit

OpenGit 是一个桌面端 Git 项目管理工具，基于 Electron + Vue 3 构建。

## 核心功能
- 本地仓库统一管理与状态查看
- 分支、提交、变基、合并、stash 等常用 Git 操作
- 内置终端（已修复 PATH 兜底，支持 `docker` 等系统命令）
- MR/远端仓库辅助能力（按项目现有实现）
- 项目级构建配置与发布辅助

## 快速开始
```bash
npm ci
npm run electron:dev
```

## 打包
```bash
npm run dist
```

产物目录：`dist-electron/`

## GitHub Tag 自动构建发布
已内置工作流：`.github/workflows/release.yml`

触发方式：
1. 提交并推送代码到 `main`
2. 打 tag（示例 `v2.0.1`）
3. 推送 tag：
```bash
git tag v2.0.1
git push origin v2.0.1
```

工作流会：
- 按 tag 同步 `package.json` 版本
- 构建 macOS / Windows / Linux 包
- 自动创建 GitHub Release 并上传产物

## 仓库地址
- GitHub: https://github.com/TerraRoot3/OpenGit

## 许可证
MIT
