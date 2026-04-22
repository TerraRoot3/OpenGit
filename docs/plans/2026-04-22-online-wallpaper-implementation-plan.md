# 在线壁纸实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为首页背景设置增加可扩展的在线壁纸能力，支持本地缓存和可选自动更新。

**Architecture:** 通过 provider 注册表抽象在线壁纸来源，主进程负责拉取和缓存，渲染层负责设置 UI 和最终配置写入。首页继续通过统一背景配置渲染，不直接依赖远程 URL。

**Tech Stack:** Vue 3、Electron IPC、electron-store、Node 文件系统、现有 `HomePage` 设置抽屉

---

### Task 1: 扩展背景配置模型

**Files:**
- Modify: `src/components/HomePage.vue`

**Step 1: 兼容旧配置读取**

在 `loadSettings()` 中兼容两种结构：
- 旧结构：`{ image, overlayOpacity, blurAmount }`
- 新结构：`{ mode, image, online, ... }`

**Step 2: 扩展保存结构**

让 `saveSettings()` 支持保存完整背景配置对象，而不是只写死旧字段。

**Step 3: 保留现有渲染兼容**

继续使用 `backgroundImage` 作为首页最终背景来源，避免首页渲染逻辑大改。

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

### Task 2: 新增在线壁纸 provider 注册表

**Files:**
- Create: `src/components/home/wallpaperProviders/registry.mjs`
- Create: `src/components/home/wallpaperProviders/bing.mjs`

**Step 1: 定义 provider 接口**

导出 provider 列表和根据 `providerId` 取 provider 的方法。

**Step 2: 实现 Bing provider 元数据**

先实现标准化逻辑和字段映射，不在渲染层写死接口格式。

**Step 3: 验证**

Run: `npm run build`
Expected: PASS

### Task 3: 新增主进程 wallpaper IPC

**Files:**
- Create: `electron/ipc/wallpaper.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`

**Step 1: 暴露 wallpaper IPC**

增加：
- `listOnlineWallpaperProviders`
- `getOnlineWallpaperList`
- `downloadOnlineWallpaper`
- `refreshOnlineWallpaperIfNeeded`

**Step 2: 实现缓存目录**

缓存目录放在：
- `app.getPath('userData')/wallpapers/<providerId>/`

**Step 3: 实现下载逻辑**

主进程下载原图到本地缓存，并返回：
- `cachedFilePath`
- `cachedDataUrl`

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

### Task 4: 扩展 HomePage 背景设置 UI

**Files:**
- Modify: `src/components/HomePage.vue`

**Step 1: 增加来源切换**

背景设置里增加：
- 本地图片
- 在线壁纸

**Step 2: 增加 provider 选择与在线列表**

展示：
- provider 下拉或按钮组
- 在线壁纸卡片列表
- 当前选中态

**Step 3: 增加自动更新开关**

仅当 provider 支持自动更新时显示。

**Step 4: 接入下载并应用**

选中在线壁纸后：
- 请求主进程下载
- 更新 `backgroundImage`
- 保存新配置

**Step 5: 验证**

Run: `npm run build`
Expected: PASS

### Task 5: 接入自动更新检查

**Files:**
- Modify: `src/components/HomePage.vue`
- Modify: `electron/ipc/wallpaper.js`

**Step 1: 定义按天去重规则**

配置里记录：
- `lastAutoUpdateDate`

**Step 2: 在两个时机触发检查**

- 首页 `onMounted`
- 应用启动后首次进入首页

**Step 3: 仅在满足条件时更新**

条件：
- 当前为在线模式
- 开启自动更新
- 今日尚未成功更新

**Step 4: 失败回退**

自动更新失败时不清空现有背景。

**Step 5: 验证**

Run: `npm run build`
Expected: PASS

### Task 6: 兼容与稳定性处理

**Files:**
- Modify: `src/components/HomePage.vue`
- Modify: `electron/ipc/wallpaper.js`

**Step 1: 处理缓存丢失**

若缓存文件缺失：
- 尝试重新下载
- 失败则保留默认主题背景

**Step 2: 保证旧配置不报错**

旧用户升级后无需手动重设背景。

**Step 3: 验证**

Run: `npm run build`
Expected: PASS

### Task 7: 手工验证

**Files:**
- No code changes required

**Step 1: 验证本地图片模式**

检查：
- 选择图片
- 清除图片
- 重启后仍生效

**Step 2: 验证在线壁纸模式**

检查：
- 加载列表
- 选择壁纸
- 应用成功
- 重启后仍显示缓存图

**Step 3: 验证自动更新**

检查：
- 开关保存
- 启动时/首页打开时会检查
- 同一天不重复拉取

**Step 4: 最终验证**

Run: `npm run build`
Expected: PASS

