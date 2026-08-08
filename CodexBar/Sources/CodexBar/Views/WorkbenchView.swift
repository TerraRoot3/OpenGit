import AppKit
import SwiftUI

struct WorkbenchView: View {
    @EnvironmentObject private var runtime: RuntimeClient
    @State private var selection: WorkspaceSection? = .overview

    var body: some View {
        NavigationSplitView {
            List(WorkspaceSection.allCases, selection: $selection) { section in
                Label(section.title, systemImage: section.systemImage)
                    .tag(section)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 210)
            .safeAreaInset(edge: .bottom) {
                runtimeSummary
            }
        } detail: {
            Group {
                switch selection ?? .overview {
                case .overview: OverviewView()
                case .feishu: FeishuSettingsView()
                case .sessions: SessionsView()
                case .routing: RoutingSettingsView()
                case .monitor: MonitorSettingsView()
                case .logs: LogsView()
                }
            }
            .environmentObject(runtime)
        }
        .toolbar {
            ToolbarItemGroup {
                if runtime.isBusy { ProgressView().controlSize(.small) }
                Button {
                    Task { await runtime.refreshAll(showActivity: true) }
                } label: {
                    Label("刷新", systemImage: "arrow.clockwise")
                }
                .disabled(!runtime.isReady || runtime.isBusy)
            }
        }
        .overlay(alignment: .bottom) {
            if !runtime.lastError.isEmpty {
                ErrorBanner(message: runtime.lastError)
                    .padding()
            }
        }
        .task {
            runtime.start()
        }
    }

    private var runtimeSummary: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(runtime.isReady ? Color.green : Color.orange)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(runtime.isReady ? "后台已连接" : "后台启动中")
                    .font(.caption.weight(.medium))
                Text("执行 \(runtime.state.activeTaskCount) · 排队 \(runtime.state.totalQueueLength)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(.bar)
    }
}

private struct OverviewView: View {
    @EnvironmentObject private var runtime: RuntimeClient

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageTitle("概览", subtitle: "飞书指令、Codex 会话和任务队列的运行状态")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), spacing: 14)], spacing: 14) {
                    MetricCard(
                        title: "Codex server",
                        value: serverLabel,
                        detail: runtime.state.serverError.isEmpty ? "本机 app-server" : runtime.state.serverError,
                        color: ["ready", "running"].contains(runtime.state.serverStatus) ? .green : .orange
                    )
                    MetricCard(
                        title: "飞书连接",
                        value: "\(connectedCount) / \(enabledCount)",
                        detail: runtime.state.feishu.status,
                        color: connectedCount == enabledCount && enabledCount > 0 ? .green : .blue
                    )
                    MetricCard(
                        title: "正在执行",
                        value: "\(runtime.state.activeTaskCount)",
                        detail: "跨会话任务",
                        color: .purple
                    )
                    MetricCard(
                        title: "排队任务",
                        value: "\(runtime.state.totalQueueLength)",
                        detail: "项目忙时自动等待",
                        color: .orange
                    )
                }

                GroupBox("Codex 订阅") {
                    LabeledContent("账号", value: runtime.state.account?.email.nonEmpty ?? "尚未识别")
                    LabeledContent("订阅", value: runtime.state.account?.planType.nonEmpty ?? "—")
                    LabeledContent("认证", value: runtime.state.requiresOpenaiAuth ? "需要登录" : "已就绪")
                    HStack {
                        Spacer()
                        Button("刷新账号") { Task { await runtime.refreshAccount() } }
                        Button("重启 Codex server") { Task { await runtime.restartCodex() } }
                    }
                    .padding(.top, 8)
                }

                GroupBox("当前运行目录") {
                    Text(runtime.state.workingDirectory)
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(28)
        }
    }

    private var enabledCount: Int { runtime.state.feishu.connections.filter(\.enabled).count }
    private var connectedCount: Int { runtime.state.feishu.connections.filter { $0.enabled && $0.running }.count }
    private var serverLabel: String {
        switch runtime.state.serverStatus {
        case "ready", "running": "运行中"
        case "starting": "启动中"
        case "error": "异常"
        default: "已停止"
        }
    }
}

private struct FeishuSettingsView: View {
    @EnvironmentObject private var runtime: RuntimeClient
    @State private var expandedIds: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle("飞书机器人", subtitle: "配置多个机器人；每个飞书会话会自动隔离并路由到自己的 Codex 会话")
                ForEach($runtime.config.feishu.connections) { $connection in
                    GroupBox {
                        DisclosureGroup(isExpanded: expansionBinding(connection.id)) {
                            VStack(spacing: 12) {
                                TextField("别名", text: $connection.name)
                                TextField("App ID", text: $connection.appId)
                                SecureField(
                                    connection.hasAppSecret ? "Secret 已保存在 Keychain；留空即不修改" : "App Secret",
                                    text: $connection.appSecret
                                )
                                StringListField(title: "允许的群聊 ID", values: $connection.allowedChatIds)
                                StringListField(title: "允许的发送者 ID", values: $connection.allowedSenderIds)
                                HStack {
                                    Text(connection.hasAppSecret ? "Secret 已安全保存" : "尚未保存 Secret")
                                        .font(.caption)
                                        .foregroundStyle(connection.hasAppSecret ? .green : .secondary)
                                    Spacer()
                                    Button("删除", role: .destructive) {
                                        runtime.config.feishu.connections.removeAll { $0.id == connection.id }
                                    }
                                }
                            }
                            .padding(.top, 10)
                        } label: {
                            HStack {
                                Toggle("", isOn: $connection.enabled).labelsHidden()
                                VStack(alignment: .leading) {
                                    Text(connection.name.nonEmpty ?? "未命名机器人").fontWeight(.medium)
                                    Text(connection.appId.nonEmpty ?? "未填写 App ID")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                ConnectionBadge(state: runtime.state.feishu.connections.first { $0.id == connection.id })
                            }
                        }
                    }
                }

                HStack {
                    Button {
                        let id = "feishu-\(UUID().uuidString.lowercased())"
                        runtime.config.feishu.connections.append(
                            FeishuConnectionConfig(id: id, name: "新机器人")
                        )
                        expandedIds.insert(id)
                    } label: {
                        Label("添加机器人", systemImage: "plus")
                    }
                    Spacer()
                    Button("重连全部") { Task { await runtime.restartFeishu() } }
                    Button("保存配置") { Task { await runtime.saveConfig() } }
                        .buttonStyle(.borderedProminent)
                }
            }
            .padding(28)
        }
    }

    private func expansionBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { expandedIds.contains(id) },
            set: { value in
                if value { expandedIds.insert(id) } else { expandedIds.remove(id) }
            }
        )
    }
}

private struct SessionsView: View {
    @EnvironmentObject private var runtime: RuntimeClient
    @State private var selectedSession: CodexSession?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                PageTitle("会话与项目", subtitle: "飞书消息会按机器人和 chat_id 隔离；项目忙时在原会话排队")
                Spacer()
                Button {
                    Task { await runtime.createSession() }
                } label: {
                    Label("新建本机会话", systemImage: "plus")
                }
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)

            List(runtime.state.sessions) { session in
                SessionRow(session: session) {
                    selectedSession = session
                }
            }
            .listStyle(.inset)
        }
        .sheet(item: $selectedSession) { session in
            SessionEditor(session: session)
                .environmentObject(runtime)
        }
    }
}

private struct SessionRow: View {
    let session: CodexSession
    let edit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: session.source == "feishu" ? "paperplane.fill" : "rectangle.stack")
                .foregroundStyle(session.turnStatus == "running" ? .purple : .secondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(session.title).fontWeight(.medium)
                    if session.turnStatus == "running" { Badge("执行中", color: .purple) }
                    if session.queueLength > 0 { Badge("排队 \(session.queueLength)", color: .orange) }
                }
                Text(session.projectBinding.map { "项目：\($0.title.nonEmpty ?? $0.cwd)" } ?? "未绑定项目")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !session.lastMessage.isEmpty {
                    Text(session.lastMessage)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
            Spacer()
            Button("管理", action: edit)
        }
        .padding(.vertical, 6)
    }
}

private struct SessionEditor: View {
    @EnvironmentObject private var runtime: RuntimeClient
    @Environment(\.dismiss) private var dismiss
    let session: CodexSession
    @State private var projectName: String
    @State private var projectPath: String
    @State private var confirmDelete = false

    init(session: CodexSession) {
        self.session = session
        _projectName = State(initialValue: session.projectBinding?.projectQuery ?? "")
        _projectPath = State(initialValue: session.projectBinding?.cwd ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(session.title, subtitle: session.source == "feishu" ? "飞书会话" : "本机会话")
            Form {
                TextField("项目名称", text: $projectName)
                HStack {
                    TextField("项目目录", text: $projectPath)
                    Button("选择…") { selectDirectory() }
                }
            }
            HStack {
                Button("删除会话", role: .destructive) { confirmDelete = true }
                    .disabled(session.turnStatus == "running" || session.queueLength > 0)
                Spacer()
                if session.projectBinding != nil {
                    Button("解除绑定") {
                        Task {
                            await runtime.clearBinding(session: session)
                            dismiss()
                        }
                    }
                }
                Button("保存绑定") {
                    Task {
                        await runtime.bind(session: session, name: projectName, path: projectPath)
                        dismiss()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(projectName.trimmingCharacters(in: .whitespaces).isEmpty && projectPath.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 560)
        .alert("删除这个会话？", isPresented: $confirmDelete) {
            Button("取消", role: .cancel) {}
            Button("删除", role: .destructive) {
                Task {
                    await runtime.delete(session: session)
                    dismiss()
                }
            }
        } message: {
            Text("对应的 Codex 会话也会删除，此操作不可撤销。")
        }
    }

    private func selectDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            projectPath = url.path
            if projectName.isEmpty { projectName = url.lastPathComponent }
        }
    }
}

private struct RoutingSettingsView: View {
    @EnvironmentObject private var runtime: RuntimeClient

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle("路由与权限", subtitle: "控制项目任务的默认目录、文件权限和 Codex 推理参数")
                GroupBox("默认目录") {
                    HStack {
                        TextField("未配置时使用用户目录", text: $runtime.config.workingDirectory)
                        Button("选择…") { chooseDirectory() }
                    }
                }
                GroupBox("执行权限") {
                    Picker("沙箱", selection: $runtime.config.sandboxMode) {
                        Text("只读").tag("read-only")
                        Text("项目读写").tag("workspace-write")
                        Text("完全访问").tag("danger-full-access")
                    }
                    Picker("审批策略", selection: $runtime.config.approvalPolicy) {
                        Text("不信任命令时询问").tag("untrusted")
                        Text("按需询问").tag("on-request")
                        Text("不询问").tag("never")
                    }
                    Picker("推理强度", selection: $runtime.config.reasoningEffort) {
                        Text("跟随默认").tag("")
                        Text("低").tag("low")
                        Text("中").tag("medium")
                        Text("高").tag("high")
                        Text("极高").tag("xhigh")
                    }
                }
                HStack {
                    Spacer()
                    Button("保存并应用") { Task { await runtime.saveConfig() } }
                        .buttonStyle(.borderedProminent)
                }
            }
            .padding(28)
        }
    }

    private func chooseDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        if panel.runModal() == .OK { runtime.config.workingDirectory = panel.url?.path ?? "" }
    }
}

private struct MonitorSettingsView: View {
    @EnvironmentObject private var runtime: RuntimeClient

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageTitle("自动监控", subtitle: "默认关闭；开启后在锁屏期间监控本机其他 Codex 任务并主动飞书通知")
                GroupBox {
                    Toggle("启用自动监控", isOn: $runtime.config.feishu.autoMonitor.enabled)
                    Picker("通知到", selection: $runtime.config.feishu.autoMonitor.targetSessionId) {
                        Text("自动选择唯一会话").tag("")
                        ForEach(feishuSessions) { session in
                            Text(session.title).tag(session.id)
                        }
                    }
                    Stepper(
                        "停滞提醒：\(runtime.config.feishu.autoMonitor.stallMinutes) 分钟",
                        value: $runtime.config.feishu.autoMonitor.stallMinutes,
                        in: 5...1440,
                        step: 5
                    )
                }
                if let monitor = runtime.state.feishu.autoMonitor {
                    GroupBox("运行状态") {
                        LabeledContent("状态", value: monitor.running ? "监控中" : "未运行")
                        LabeledContent("屏幕", value: monitor.screenState == "locked" ? "已锁屏" : "使用中")
                        Text(monitor.reason)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                HStack {
                    Spacer()
                    Button("保存设置") { Task { await runtime.saveConfig() } }
                        .buttonStyle(.borderedProminent)
                }
            }
            .padding(28)
        }
    }

    private var feishuSessions: [CodexSession] {
        runtime.state.sessions.filter { $0.source == "feishu" }
    }
}

private struct LogsView: View {
    @EnvironmentObject private var runtime: RuntimeClient

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                PageTitle("运行日志", subtitle: "仅保留当前后台进程的最近 500 条脱敏日志")
                Spacer()
                Button("刷新") { Task { await runtime.refreshLogs() } }
                Button("复制诊断信息") { copyLogs() }
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(runtime.logs.reversed()) { entry in
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(entry.timestamp)  \(entry.level.uppercased())")
                                .font(.caption2)
                                .foregroundStyle(entry.level == "error" ? .red : .secondary)
                            Text(entry.message)
                                .font(.system(.caption, design: .monospaced))
                                .textSelection(.enabled)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Divider()
                    }
                }
            }
            .background(Color(nsColor: .textBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .padding(28)
        .task { await runtime.refreshLogs() }
    }

    private func copyLogs() {
        let text = runtime.logs.map { "\($0.timestamp) [\($0.level)] \($0.message)" }.joined(separator: "\n")
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

private struct PageTitle: View {
    let title: String
    let subtitle: String

    init(_ title: String, subtitle: String) {
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.title2.weight(.semibold))
            Text(subtitle).foregroundStyle(.secondary)
        }
    }
}

private struct MetricCard: View {
    let title: String
    let value: String
    let detail: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Circle().fill(color).frame(width: 9, height: 9)
                Text(title).font(.caption).foregroundStyle(.secondary)
            }
            Text(value).font(.title2.weight(.semibold))
            Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 95, alignment: .leading)
        .padding(16)
        .background(.background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.separator.opacity(0.5)))
    }
}

private struct Badge: View {
    let text: String
    let color: Color

    init(_ text: String, color: Color) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }
}

private struct ConnectionBadge: View {
    let state: FeishuConnectionState?

    var body: some View {
        Badge(label, color: color)
    }

    private var label: String {
        guard let state, state.enabled else { return "已停用" }
        if state.running { return "在线" }
        return state.error.isEmpty ? "连接中" : "异常"
    }

    private var color: Color {
        guard let state, state.enabled else { return .secondary }
        if state.running { return .green }
        return state.error.isEmpty ? .orange : .red
    }
}

private struct StringListField: View {
    let title: String
    @Binding var values: [String]

    var body: some View {
        TextField(title + "（逗号分隔，留空表示不限制）", text: Binding(
            get: { values.joined(separator: ", ") },
            set: { text in
                values = text.split(whereSeparator: { $0 == "," || $0 == "\n" })
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            }
        ))
    }
}

private struct ErrorBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.callout)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.red.opacity(0.12), in: Capsule())
            .foregroundStyle(.red)
            .shadow(radius: 8, y: 2)
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
