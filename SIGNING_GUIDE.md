# macOS 代码签名和公证指南

## 问题说明

在另一台 Mac 上打开应用时显示"已损坏，无法打开"，这是因为应用没有经过代码签名和公证。

---

## 解决方案

### 方案1：用户临时解决（适用于个人使用）

#### 方法A：右键打开
1. 右键点击应用图标
2. 选择"打开"
3. 在弹出的对话框中点击"打开"

#### 方法B：移除隔离属性
```bash
# 移除应用的隔离属性
xattr -cr /Applications/OpenGit.app

# 或者移除特定属性
xattr -d com.apple.quarantine /Applications/OpenGit.app
```

---

### 方案2：代码签名和公证（适用于分发）

#### 步骤1：获取 Apple 开发者证书

1. **加入 Apple 开发者计划**
   - 访问：https://developer.apple.com/programs/
   - 费用：$99/年

2. **创建证书签名请求 (CSR)**
   ```bash
   # 打开钥匙串访问 -> 证书助理 -> 从证书颁发机构请求证书
   # 填写信息后保存 CSR 文件
   ```

3. **创建 Developer ID Application 证书**
   - 访问：https://developer.apple.com/account/resources/certificates/list
   - 选择"Developer ID Application"
   - 上传 CSR 文件
   - 下载证书并双击安装到钥匙串

#### 步骤2：配置环境变量

创建 `.env.local` 文件（不要提交到 Git）：

```bash
# Apple ID 配置
APPLE_ID="your-apple-id@example.com"
APPLE_ID_PASSWORD="your-app-specific-password"
APPLE_TEAM_ID="your-team-id"

# 证书配置
CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"

# 或者使用证书文件
# CSC_LINK=/path/to/certificate.p12
# CSC_KEY_PASSWORD=certificate-password
```

**获取 App-Specific Password：**
1. 访问：https://appleid.apple.com/account/manage
2. 登录后进入"安全"部分
3. 生成 App-Specific Password

#### 步骤3：更新 package.json

在 `package.json` 中添加公证配置：

```json
{
  "build": {
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "assets/entitlements.mac.plist",
      "entitlementsInherit": "assets/entitlements.mac.plist"
    },
    "afterSign": "scripts/notarize.js"
  }
}
```

#### 步骤4：创建公证脚本

创建 `scripts/notarize.js`：

```javascript
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'com.gitmanager.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

#### 步骤5：安装依赖

```bash
npm install --save-dev @electron/notarize
```

#### 步骤6：构建和公证

```bash
# 设置环境变量并构建
export APPLE_ID="your-apple-id@example.com"
export APPLE_ID_PASSWORD="your-app-specific-password"
export APPLE_TEAM_ID="your-team-id"
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"

npm run electron:build:mac
```

公证过程可能需要几分钟，完成后应用就可以在任何 Mac 上正常打开了。

---

## 验证签名

构建完成后，可以验证签名：

```bash
# 检查签名
codesign -dv --verbose=4 /path/to/OpenGit.app

# 检查是否通过 Gatekeeper
spctl -a -v /path/to/OpenGit.app

# 检查公证状态
xcrun stapler validate /path/to/OpenGit.app
```

---

## 推荐方案

- **个人使用**：使用方案1，让用户手动绕过安全检查
- **团队分发**：使用方案2，但需要 Apple 开发者账号
- **公开分发**：必须使用方案2，确保用户体验

---

## 常见问题

### Q: 我没有 Apple 开发者账号怎么办？
A: 使用方案1，在 README 中说明用户需要右键打开或使用 `xattr` 命令。

### Q: 公证失败怎么办？
A: 检查以下内容：
- Apple ID 和密码是否正确
- Team ID 是否正确
- 证书是否已安装到钥匙串
- `entitlements.mac.plist` 配置是否正确

### Q: 可以跳过公证吗？
A: 从 macOS 10.15+ 开始，公证是推荐的，但不是强制的。用户仍然可以通过右键打开应用。

---

## 参考资料

- [Apple 代码签名指南](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [electron-builder 签名文档](https://www.electron.build/code-signing)
- [@electron/notarize 文档](https://github.com/electron/notarize)

