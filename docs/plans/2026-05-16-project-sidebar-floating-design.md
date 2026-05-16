# Project Sidebar Floating Design

## Goal

将项目列表侧边栏改成默认悬浮抽屉，并保留“固定”能力。默认情况下左侧只保留窄入口 rail；点击后侧栏像抽屉一样覆盖在内容之上。用户可以随时固定侧栏，固定后恢复现有的左侧占位布局和宽度拖拽。

## User Experience

### Default behavior

- 默认模式为 `floating`
- 左侧始终保留窄入口 `rail`
- 点击 `rail` 上的项目按钮后，侧栏从左侧滑出
- 浮动侧栏覆盖在 Browser 之上，不挤压主内容
- 点击抽屉外空白区域时自动收起
- 在浮动模式下，点击目录或项目后自动收起

### Pinned behavior

- 点击侧栏头部的固定按钮后切换到 `pinned`
- 固定模式下侧栏恢复成当前的左侧占位布局
- 保留宽度拖拽
- Browser 为固定侧栏让位
- 固定模式下点击内容区不会自动收起

## State Model

当前的 `sidebarCollapsed` 语义过于单一，不足以表达“悬浮/固定”和“开/关”两个维度。新状态模型改为：

- `sidebarMode = 'floating' | 'pinned'`
- `sidebarOpen = boolean`
- `sidebarWidth` 保持不变

推荐组合：

- `floating + false`: 仅显示 rail
- `floating + true`: rail + 浮动抽屉
- `pinned + true`: 固定占位侧栏

`pinned + false` 不作为常规停留状态；取消固定时直接回到 `floating + true` 或 `floating + false`。

## Layout Structure

`AppShell` 拆成三层：

1. `sidebar-rail`
   - 始终存在
   - 提供打开抽屉、添加目录等快速入口

2. `floating-sidebar-layer`
   - 仅在 `floating + open` 时显示
   - 包含遮罩和抽屉面板
   - 点击遮罩关闭

3. `pinned-sidebar-pane`
   - 仅在 `pinned` 模式显示
   - 复用现有 `ProjectSidebar` 和 resizer

`Browser` 的 `leadingTabInset` 改为按模式计算：

- `floating`: 只按 rail 的窄占位处理
- `pinned`: 按固定侧栏状态处理

## Component Changes

### `projectSidebarStore`

- 新增 `sidebarMode`
- 新增 `sidebarOpen`
- 保留 `sidebarWidth`
- 持久化结构升级到新版本
- 旧 `sidebarCollapsed` 迁移到新模型

迁移策略：

- 统一迁移到 `floating + false`
- 用户后续手动固定

### `AppShell.vue`

- 替换现有 `sidebarCollapsed ? rail : pane` 二元布局
- 增加：
  - rail 常驻
  - 浮动抽屉层
  - 固定占位层
- resizer 只在固定模式显示
- 增加点击外部关闭逻辑
- 在浮动模式下，打开项目/目录后自动关闭抽屉

### `ProjectSidebar.vue`

- 移除“收起侧边栏”单一语义
- 改成：
  - `固定 / 取消固定`
  - `关闭`
- 关闭按钮只负责收起浮动抽屉
- 固定按钮负责切换模式

## Interaction Rules

- 点击 rail 项目按钮：
  - 若是 `floating + closed`，打开抽屉
  - 若是 `floating + open`，关闭抽屉
  - 若是 `pinned`，不切模式，只保留固定侧栏

- 点击固定按钮：
  - `floating -> pinned`
  - `pinned -> floating`

- 浮动模式点击项目/目录：
  - 打开对应内容
  - 自动关闭抽屉

- 固定模式点击项目/目录：
  - 行为不变

## Persistence

侧栏状态持久化字段改为：

- `sidebarMode`
- `sidebarOpen`
- `sidebarWidth`
- `expandedRootPaths`
- `scanRoots`

不保留旧的 `sidebarCollapsed` 持久化语义。

## Verification

需要验证的关键路径：

1. 默认启动后只显示 rail，不显示占位侧栏
2. 点击 rail 能打开/关闭浮动抽屉
3. 点击抽屉外区域能关闭
4. 浮动模式点击项目后自动关闭
5. 点击固定按钮后恢复占位布局
6. 固定模式下宽度拖拽仍可用
7. 重启后模式和宽度能正确恢复
