# 应用图标使用指南

## 📦 生成的图标文件

所有图标文件位于 `icons/` 目录：

```
icons/
├── icon.svg              # 源 SVG 图标 (1024x1024)
├── icon.icns             # macOS 应用图标
├── icon-16x16.png        # 16x16 PNG
├── icon-32x32.png        # 32x32 PNG
├── icon-48x48.png        # 48x48 PNG
├── icon-64x64.png        # 64x64 PNG
├── icon-128x128.png      # 128x128 PNG
├── icon-256x256.png      # 256x256 PNG
├── icon-512x512.png      # 512x512 PNG
└── icon-1024x1024.png    # 1024x1024 PNG
```

## 🎨 图标设计

图标采用现代渐变风格，展示了 Git 分支结构：

- **配色方案**: 紫蓝渐变背景（#667eea → #764ba2）
- **主要元素**: 白色分支节点和连接线，模拟 Git 分支图
- **风格**: 圆角矩形，符合现代 macOS/Windows 设计规范
- **底部标识**: "Git" 文字标识

## 🚀 快速开始

### 1. 生成图标

```bash
# 生成 SVG 源文件
npm run generate-icon

# 转换为各种格式（PNG, ICNS）
npm run convert-icon
```

### 2. 查看图标

生成的图标会自动保存在 `icons/` 目录中。

## 🔧 自定义图标

如果您想自定义图标设计，可以编辑 `scripts/generate-icon.js`：

### 修改颜色

```javascript
// 修改背景渐变
<linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />  // 起始颜色
  <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" /> // 结束颜色
</linearGradient>

// 修改图标颜色
<linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
  <stop offset="100%" style="stop-color:#f0f0ff;stop-opacity:1" />
</linearGradient>
```

### 修改文字

```javascript
// 修改底部文字
<text x="512" y="880" font-family="Arial, sans-serif" font-size="120" 
      font-weight="bold" text-anchor="middle" fill="white" opacity="0.9">
  Git  <!-- 在这里修改文字 -->
</text>
```

### 修改圆角

```javascript
// 修改背景圆角半径
<rect x="0" y="0" width="1024" height="1024" 
      rx="180" ry="180"  <!-- 调整这两个值 -->
      fill="url(#bgGradient)"/>
```

修改后，重新运行生成和转换命令：

```bash
npm run generate-icon
npm run convert-icon
```

## 📱 平台支持

### macOS
- ✅ 已配置：`icon.icns`
- 自动应用于 DMG 和 ZIP 包
- 支持 Retina 显示屏

### Windows（需要 ImageMagick）
要生成 Windows .ico 文件：

```bash
# 安装 ImageMagick
brew install imagemagick

# 重新运行转换脚本
npm run convert-icon
```

然后在 `package.json` 中添加：

```json
"win": {
  "icon": "icons/icon.ico"
}
```

### Linux
使用 PNG 图标：

```json
"linux": {
  "icon": "icons/icon-512x512.png"
}
```

## 🔍 图标预览

要预览图标效果：

1. **macOS**: 在 Finder 中查看 `icon.icns`
2. **浏览器**: 在浏览器中打开 `icon.svg`
3. **图像查看器**: 打开任意 PNG 文件

## 📝 当前配置

应用图标已在 `package.json` 的 `build` 配置中设置：

```json
{
  "build": {
    "mac": {
      "icon": "icons/icon.icns"
    }
  }
}
```

## 🛠️ 常见问题

### Q: 图标在应用中不显示？
A: 确保：
1. 已运行 `npm run convert-icon` 生成 .icns 文件
2. `package.json` 中的路径正确
3. 重新构建应用：`npm run electron:build:mac`

### Q: 如何生成 Windows 图标？
A: 安装 ImageMagick 后运行 `npm run convert-icon`

### Q: 可以使用自己的图标吗？
A: 可以，将您的 1024x1024 PNG 或 SVG 文件放到 `icons/` 目录，命名为 `icon.svg` 或 `icon.png`，然后运行转换脚本。

## 📚 相关工具

- **ImageMagick**: 图像转换工具 - https://imagemagick.org/
- **GIMP**: 图像编辑器 - https://www.gimp.org/
- **Inkscape**: SVG 编辑器 - https://inkscape.org/
- **在线转换**: https://www.icoconverter.com/

## 🎯 下一步

1. ✅ 图标已生成并配置
2. 构建应用查看效果：`npm run electron:build:mac`
3. 检查 DMG 安装包中的图标显示

---

**提示**: 每次修改图标后，都需要重新构建应用才能看到效果。

