# macOS 代码签名完整指南

## 当前问题
应用未签名，在其他电脑上无法运行（Gatekeeper 阻止）。

## 解决方案

### ✅ 方案1: 使用 Developer ID 证书（推荐，用于正式分发）

**步骤：**

1. **登录 Apple Developer**
   ```
   访问: https://developer.apple.com/account/
   需要: Apple Developer 账号（$99/年）
   ```

2. **创建 Developer ID Application 证书**
   - 登录后进入：Certificates, Identifiers & Profiles
   - 点击 "+" 创建新证书
   - 选择 "Developer ID Application"
   - 按照提示完成创建
   - 下载证书文件（.cer）
   - 双击安装到 Keychain

3. **查找证书名称**
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID"
   ```
   输出示例：
   ```
   1) ABC123DEF456 "Developer ID Application: Your Name (TEAM_ID)"
   ```

4. **使用证书签名打包**
   ```bash
   # 方法1: 使用环境变量（推荐）
   export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
   npm run electron:build:mac
   
   # 方法2: 在 package.json 中设置（不推荐，会暴露证书信息）
   # 编辑 package.json，在 mac 配置中添加：
   # "identity": "Developer ID Application: Your Name (TEAM_ID)"
   ```

### ⚠️ 方案2: 使用 Apple Development 证书（仅限开发测试）

如果只有 Apple Development 证书（不是 Developer ID），可以临时使用：

```bash
# 查找证书
security find-identity -v -p codesigning | grep "Apple Development"

# 使用证书（替换为实际证书名称）
export CSC_NAME="Apple Development: Your Name (TEAM_ID)"
npm run electron:build:mac
```

**注意**: Development 证书签名的应用在其他电脑上可能仍然无法运行。

### 🔧 方案3: 创建本地自签名证书（仅限测试）

如果没有 Apple Developer 账号：

```bash
# 1. 创建证书请求
cat > /tmp/cert.conf << EOF
[req]
distinguished_name = req_distinguished_name
[req_distinguished_name]
EOF

openssl req -new -x509 -nodes -days 365 -keyout /tmp/cert.key -out /tmp/cert.crt -config /tmp/cert.conf

# 2. 导入到 Keychain
security add-certificates /tmp/cert.crt

# 3. 查找证书名称
security find-identity -v -p codesigning

# 4. 使用证书签名
export CSC_NAME="证书名称"
npm run electron:build:mac
```

### 📝 方案4: 不签名（用户需要手动允许）

如果无法签名，用户可以手动允许运行：

**方法1: 右键打开**
1. 右键点击应用
2. 选择"打开"
3. 在弹出对话框中点击"打开"

**方法2: 使用命令**
```bash
# 移除隔离属性
xattr -cr /Applications/OpenGit.app

# 或者
sudo spctl --master-disable  # 临时禁用 Gatekeeper（不推荐）
```

## 验证签名

签名后验证：
```bash
# 检查签名信息
codesign -dv --verbose=4 dist-electron/mac/OpenGit.app

# 验证签名
spctl -a -vv dist-electron/mac/OpenGit.app

# 应该输出: dist-electron/mac/OpenGit.app: accepted
```

## 当前状态

检测到的证书：
- ❌ Apple Development: 宝坤 韩 (D97DTC98SZ) - **已过期**

需要：
- ✅ Developer ID Application 证书（用于分发）
- 或更新现有的 Apple Development 证书

## 快速开始

如果有 Developer ID 证书：
```bash
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
npm run electron:build:mac
```

如果没有证书，需要先获取：
1. 访问 https://developer.apple.com/
2. 注册/登录 Apple Developer 账号
3. 创建 Developer ID Application 证书
4. 按照上面的步骤签名

