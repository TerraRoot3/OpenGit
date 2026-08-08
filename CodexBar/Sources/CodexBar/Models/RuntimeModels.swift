import Foundation

struct RuntimeState: Codable, Equatable {
    var serverStatus = "stopped"
    var serverError = ""
    var account: CodexAccount?
    var requiresOpenaiAuth = true
    var sessions: [CodexSession] = []
    var activeSessionId = ""
    var threadId = ""
    var turnStatus = "idle"
    var activeTurnId = ""
    var queueLength = 0
    var activeTaskCount = 0
    var totalQueueLength = 0
    var workingDirectory = ""
    var sandboxMode = "danger-full-access"
    var feishu = FeishuRuntimeState()

    enum CodingKeys: String, CodingKey {
        case serverStatus, serverError, account, requiresOpenaiAuth, sessions
        case activeSessionId, threadId, turnStatus, activeTurnId, queueLength
        case activeTaskCount, totalQueueLength, workingDirectory, sandboxMode, feishu
    }
}

struct CodexAccount: Codable, Equatable {
    var type = ""
    var email = ""
    var planType = ""
}

struct FeishuRuntimeState: Codable, Equatable {
    var enabled = false
    var running = false
    var status = "disabled"
    var error = ""
    var connections: [FeishuConnectionState] = []
    var autoMonitor: AutoMonitorState?
}

struct FeishuConnectionState: Codable, Equatable, Identifiable {
    var id = ""
    var name = ""
    var enabled = false
    var running = false
    var status = "disabled"
    var error = ""
}

struct AutoMonitorState: Codable, Equatable {
    var enabled = false
    var running = false
    var screenState = "unlocked"
    var status = "disabled"
    var reason = ""
    var targetSessionId = ""
    var eligibleSessionIds: [String] = []
}

struct CodexSession: Codable, Equatable, Identifiable {
    var id = ""
    var title = ""
    var source = ""
    var connectionId = ""
    var connectionName = ""
    var chatId = ""
    var chatType = ""
    var threadId = ""
    var projectBinding: ProjectBinding?
    var lastMessage = ""
    var createdAt: Double = 0
    var updatedAt: Double = 0
    var turnStatus = "idle"
    var activeTurnId = ""
    var activeTaskCount = 0
    var queueLength = 0
}

struct ProjectBinding: Codable, Equatable {
    var projectQuery = ""
    var cwd = ""
    var title = ""
    var boundAt: Double = 0
}

struct CodexBarConfig: Codable, Equatable {
    var workingDirectory = ""
    var sandboxMode = "danger-full-access"
    var approvalPolicy = "never"
    var reasoningEffort = ""
    var feishu = FeishuConfig()
}

struct FeishuConfig: Codable, Equatable {
    var autoMonitor = AutoMonitorConfig()
    var connections: [FeishuConnectionConfig] = []
}

struct AutoMonitorConfig: Codable, Equatable {
    var enabled = false
    var targetSessionId = ""
    var stallMinutes = 20
}

struct FeishuConnectionConfig: Codable, Equatable, Identifiable {
    var id = ""
    var name = ""
    var enabled = false
    var appId = ""
    var appSecret = ""
    var hasAppSecret = false
    var allowedChatIds: [String] = []
    var allowedSenderIds: [String] = []
}

struct RuntimeLog: Codable, Equatable, Identifiable {
    var timestamp = ""
    var level = "info"
    var message = ""
    var id: String { "\(timestamp)-\(level)-\(message)" }
}

struct APIResponse<Value: Decodable>: Decodable {
    var success: Bool
    var error: String?
    var state: RuntimeState?
    var config: CodexBarConfig?
    var sessions: [CodexSession]?
    var logs: [RuntimeLog]?
    var account: Value?
}

struct EmptyPayload: Codable, Equatable {}

enum WorkspaceSection: String, CaseIterable, Identifiable {
    case overview
    case feishu
    case sessions
    case routing
    case monitor
    case logs

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: "概览"
        case .feishu: "飞书机器人"
        case .sessions: "会话与项目"
        case .routing: "路由与权限"
        case .monitor: "自动监控"
        case .logs: "运行日志"
        }
    }

    var systemImage: String {
        switch self {
        case .overview: "gauge.with.dots.needle.67percent"
        case .feishu: "paperplane"
        case .sessions: "rectangle.stack"
        case .routing: "point.3.connected.trianglepath.dotted"
        case .monitor: "bell.badge"
        case .logs: "text.alignleft"
        }
    }
}
