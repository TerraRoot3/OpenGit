# 在线壁纸设计

**日期：** 2026-04-22

## 目标

为首页背景设置增加“在线壁纸”能力，在保留现有本地图片背景的同时，支持：
- 从在线源浏览和选择壁纸
- 将选中的在线壁纸下载到本地缓存后作为背景使用
- 可选开启“自动更新到该源最新壁纸”
- 结构上支持后续接入更多在线源，而不是把第一版实现写死为某一个来源

第一版只接入 `Bing` 作为默认 provider。

## 现状

当前首页背景设置集中在 [HomePage.vue](/Users/hanbaokun/workspace/Github/TerraRoot3/OpenGit/src/components/HomePage.vue)：
- 支持通过文件选择器选择本地图片
- 通过 `readImageAsBase64` 将本地图片转为 base64
- 将背景配置保存到 `homePageBackground`
- 首页渲染直接使用 `backgroundImage` 字段

当前这套设计的问题：
- 只能选择本地图片
- 背景配置缺少来源类型和在线元数据
- 没有下载缓存机制
- 没有自动更新逻辑

## 设计原则

1. 不破坏现有本地图片背景能力
2. 在线壁纸选中后必须落地到本地缓存，不依赖远程 URL 直连
3. UI 只接统一 provider 接口，不在页面里硬编码某个源的抓取细节
4. 自动更新只做“最新壁纸替换”，不引入复杂任务调度系统
5. 启动和首页打开都可触发检查，但要按天去重，避免重复请求

## 数据模型

`homePageBackground` 扩展为统一结构：

```js
{
  mode: 'local' | 'online',
  image: '', // 兼容现有渲染链路，始终保存最终可用的本地 dataUrl 或缓存 dataUrl
  overlayOpacity: 30,
  blurAmount: 5,
  localImagePath: '', // 本地图片原始路径，可选
  online: {
    providerId: 'bing',
    itemId: '20260422-zh-CN-0',
    title: '...',
    previewUrl: '...',
    remoteUrl: '...',
    cachedFilePath: '...',
    cachedDataUrl: '...',
    autoUpdateLatest: true,
    lastAutoUpdateDate: '2026-04-22',
    market: 'zh-CN'
  }
}
```

兼容策略：
- 旧配置只有 `image/overlayOpacity/blurAmount` 时，继续按本地模式处理
- 新结构里仍保留 `image` 作为页面最终背景来源，避免首页渲染链路大改

## 架构

### 1. Provider 注册表

新增一层 provider 注册表，例如：
- `src/components/home/wallpaperProviders/registry.mjs`
- `src/components/home/wallpaperProviders/bing.mjs`

统一 provider 结构：

```js
{
  id: 'bing',
  label: 'Bing 每日壁纸',
  supportsAutoUpdate: true,
  defaultOptions: { market: 'zh-CN' },
  listWallpapers(options),
  getLatestWallpaper(options),
  downloadWallpaper(item, options)
}
```

页面只读取 provider 列表和标准化后的壁纸项，不感知具体抓取实现。

### 2. 主进程在线壁纸 IPC

新增 `electron/ipc/wallpaper.js`，负责：
- 获取 provider 列表
- 拉取在线壁纸列表
- 下载壁纸到缓存目录
- 执行自动更新检查

缓存目录建议：
- `app.getPath('userData')/wallpapers/<providerId>/...`

原因：
- 跟应用数据一起管理
- 离线可继续使用
- 备份/迁移路径清晰

### 3. 首页设置 UI

在 [HomePage.vue](/Users/hanbaokun/workspace/Github/TerraRoot3/OpenGit/src/components/HomePage.vue) 的“背景设置”中扩展：
- 背景来源切换：`本地图片 / 在线壁纸`
- 在线源选择
- 在线壁纸列表
- 自动更新开关

第一版不做复杂分页和搜索，只展示首屏可选项即可。

## Bing 第一版实现

参考源采用 Bing 壁纸 API 风格，但实现不直接耦合第三方仓库页面。

第一版能力：
- 拉取最近若干张壁纸（例如 8 张）
- 展示标题、日期、缩略图
- 支持选中下载并应用
- 支持获取“最新一张”用于自动更新

provider 返回统一字段：

```js
{
  id: '20260422-zh-CN-0',
  title: '...',
  subtitle: '...',
  date: '2026-04-22',
  previewUrl: '...',
  downloadUrl: '...',
  attribution: 'Bing'
}
```

## 自动更新策略

自动更新在两个时机检查：
- 应用启动时
- 打开首页时

但只在满足以下条件时真正执行：
- 当前背景模式为 `online`
- 当前 provider 支持自动更新
- `autoUpdateLatest === true`
- 今日尚未成功更新过

执行流程：
1. 读取当前在线背景配置
2. 调 provider 的 `getLatestWallpaper`
3. 若最新项与当前 `itemId` 不同，则下载并替换
4. 更新配置中的：
   - `itemId`
   - `cachedFilePath`
   - `cachedDataUrl`
   - `image`
   - `lastAutoUpdateDate`
5. 下载失败时保留原背景，不清空当前设置

## 缓存策略

第一版只做最小缓存策略：
- 保留当前正在使用的缓存图片
- 允许保留少量最近下载的在线壁纸文件
- 不做单独缓存管理页面

可接受的简单策略：
- 按 provider 存储
- 新下载成功后仅覆盖相同 `itemId` 的现有文件
- 后续如有必要再加“最大缓存数量”清理

## 错误处理

### 列表拉取失败
- 在线壁纸面板显示错误文案
- 不影响当前背景显示

### 下载失败
- 不切换背景
- 保留当前配置

### 缓存文件失效
- 启动时若发现当前在线壁纸缓存丢失，尝试重新下载
- 重新下载失败则保留默认主题背景，不破坏其它设置项

### 自动更新失败
- 记录失败但不清空当前背景
- 下次打开首页或下次启动时继续尝试

## 测试重点

1. 本地图片模式不回归
2. 在线壁纸列表可加载
3. 选中在线壁纸后可下载并立即生效
4. 重启后缓存背景仍可用
5. 自动更新开启时：
   - 启动检查一次
   - 首页打开检查一次
   - 同一天不重复更新
6. 断网或接口失败时不破坏已有背景
7. 后续新增第二个 provider 时无需改首页主渲染逻辑

## 推荐实现顺序

1. 定义配置结构与 provider 注册表
2. 新增主进程 wallpaper IPC 与缓存下载
3. 接入 Bing provider
4. 扩展 HomePage 背景设置 UI
5. 接入自动更新检查
6. 做兼容迁移与回退处理
