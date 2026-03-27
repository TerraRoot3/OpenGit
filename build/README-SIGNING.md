# macOS 代码签名说明

## 问题
未签名的 macOS 应用在其他电脑上可能无法运行，会被 Gatekeeper 阻止。

## 解决方案

### 方案1: 使用 Developer ID 证书（推荐，用于分发）

1. **获取 Apple Developer 账号**
   - 访问 https://developer.apple.com/
   - 注册/登录 Apple Developer 账号（$99/年）

2. **创建 Developer ID Application 证书**
   - 登录 Apple Developer Portal
   - 进入 Certificates, Identifiers & Profiles
   - 创建 "Developer ID Application" 证书
   - 下载并安装到 Keychain

3. **配置签名**
   - 方法1: 设置环境变量（推荐）
     ```bash
     export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
     npm run electron:build:mac
     ```
   
   - 方法2: 在 package.json 中设置
     将 `"identity": null` 改为：
     ```json
     "identity": "Developer ID Application: Your Name (TEAM_ID)"
     ```

### 方案2: 使用本地证书（仅限开发测试）

如果没有 Apple Developer 账号，可以创建本地证书：

```bash
# 创建本地证书
security create-certificate -n "OpenGit Local" -k ~/Library/Keychains/login.keychain-db

# 查找证书名称
security find-identity -v -p codesigning | grep "OpenGit"

# 使用证书签名
export CSC_NAME="OpenGit Local"
npm run electron:build:mac
```

**注意**: 本地签名的应用在其他电脑上可能仍然无法运行。

### 方案3: 不签名（需要用户手动允许）

如果无法签名，用户可以：
1. 右键点击应用
2. 选择"打开"
3. 在弹出对话框中点击"打开"

或者使用命令：
```bash
xattr -cr /Applications/OpenGit.app
```

## 当前状态

当前配置为自动检测签名证书。如果没有找到证书，应用将不签名。

要检查可用证书：
```bash
security find-identity -v -p codesigning
```

## 签名后验证

签名后可以验证：
```bash
codesign -dv --verbose=4 dist-electron/mac/OpenGit.app
spctl -a -vv dist-electron/mac/OpenGit.app
```
