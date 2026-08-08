import AppKit
import Foundation

@MainActor
final class RuntimeClient: ObservableObject {
    @Published var state = RuntimeState()
    @Published var config = CodexBarConfig()
    @Published var logs: [RuntimeLog] = []
    @Published var isReady = false
    @Published var isBusy = false
    @Published var lastError = ""

    private var process: Process?
    private var endpoint: URL?
    private var token = ""
    private var outputBuffer = Data()
    private var pollingTask: Task<Void, Never>?
    private var shouldRestart = true

    func start() {
        guard process == nil else { return }
        shouldRestart = true
        do {
            let hostURL = try resolveHostURL()
            let nodeURL = try resolveNodeURL()
            let process = Process()
            let output = Pipe()
            let errors = Pipe()
            let runtimeToken = UUID().uuidString.replacingOccurrences(of: "-", with: "")
            var environment = ProcessInfo.processInfo.environment
            environment["CODEXBAR_TOKEN"] = runtimeToken
            environment["CODEXBAR_OPEN_GIT_ROOT"] = resolveOpenGitRoot(for: hostURL)
            environment["PATH"] = [
                nodeURL.deletingLastPathComponent().path,
                "/opt/homebrew/bin",
                "/usr/local/bin",
                FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin").path,
                environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
            ].joined(separator: ":")
            process.executableURL = nodeURL
            process.arguments = [hostURL.path]
            process.environment = environment
            process.standardOutput = output
            process.standardError = errors
            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else { return }
                Task { @MainActor [weak self] in self?.consumeOutput(data) }
            }
            errors.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
                NSLog("CodexBar runtime: %@", text.trimmingCharacters(in: .whitespacesAndNewlines))
            }
            process.terminationHandler = { [weak self] finished in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.process = nil
                    self.isReady = false
                    self.endpoint = nil
                    self.pollingTask?.cancel()
                    if self.shouldRestart {
                        self.lastError = finished.terminationStatus == 75
                            ? "后台正在重启"
                            : "后台已退出，正在自动恢复"
                        try? await Task.sleep(for: .seconds(2))
                        self.start()
                    }
                }
            }
            self.token = runtimeToken
            self.process = process
            try process.run()
        } catch {
            process = nil
            lastError = error.localizedDescription
        }
    }

    func stop() {
        shouldRestart = false
        pollingTask?.cancel()
        pollingTask = nil
        process?.terminate()
        process = nil
        endpoint = nil
        isReady = false
    }

    func refreshAll(showActivity: Bool = false) async {
        guard isReady else { return }
        if showActivity { isBusy = true }
        defer { if showActivity { isBusy = false } }
        do {
            async let newState: RuntimeState = fetchState()
            async let newConfig: CodexBarConfig = fetchConfig()
            state = try await newState
            config = try await newConfig
            lastError = ""
        } catch {
            lastError = error.localizedDescription
        }
    }

    func saveConfig() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let response: APIResponse<EmptyPayload> = try await request(
                path: "/config",
                method: "PUT",
                body: config
            )
            if let updated = response.config { config = updated }
            if let updatedState = response.state { state = updatedState }
            lastError = ""
        } catch {
            lastError = error.localizedDescription
        }
    }

    func restartCodex() async { await performAction("/codex/restart") }
    func restartFeishu() async { await performAction("/feishu/restart") }
    func restartRuntime() async { await performAction("/runtime/restart") }
    func refreshAccount() async { await performAction("/account/refresh") }
    func createSession() async { await performAction("/sessions") }

    func notifyPowerEvent(_ event: String) {
        Task { await performAction("/power/\(event)", showActivity: false) }
    }

    func bind(session: CodexSession, name: String, path: String) async {
        let binding = ProjectBinding(
            projectQuery: name,
            cwd: path,
            title: name,
            boundAt: Date().timeIntervalSince1970 * 1000
        )
        await performAction(
            "/sessions/\(session.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? session.id)/binding",
            method: "PUT",
            body: binding
        )
    }

    func clearBinding(session: CodexSession) async {
        await performAction(
            "/sessions/\(session.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? session.id)/binding",
            method: "DELETE"
        )
    }

    func delete(session: CodexSession) async {
        await performAction(
            "/sessions/\(session.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? session.id)",
            method: "DELETE"
        )
    }

    func refreshLogs() async {
        do {
            let response: APIResponse<EmptyPayload> = try await request(path: "/logs")
            logs = response.logs ?? []
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func consumeOutput(_ data: Data) {
        outputBuffer.append(data)
        while let newline = outputBuffer.firstIndex(of: 0x0A) {
            let line = outputBuffer.prefix(upTo: newline)
            outputBuffer.removeSubrange(...newline)
            guard
                let value = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
                value["ready"] as? Bool == true,
                let port = value["port"] as? Int
            else { continue }
            endpoint = URL(string: "http://127.0.0.1:\(port)")
            isReady = true
            lastError = ""
            beginPolling()
            Task { await refreshAll(showActivity: true) }
        }
    }

    private func beginPolling() {
        pollingTask?.cancel()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                await self?.refreshStateOnly()
            }
        }
    }

    private func refreshStateOnly() async {
        do {
            state = try await fetchState()
            lastError = ""
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func fetchState() async throws -> RuntimeState {
        let response: APIResponse<EmptyPayload> = try await request(path: "/state")
        guard let state = response.state else { throw RuntimeClientError.invalidResponse }
        return state
    }

    private func fetchConfig() async throws -> CodexBarConfig {
        let response: APIResponse<EmptyPayload> = try await request(path: "/config")
        guard let config = response.config else { throw RuntimeClientError.invalidResponse }
        return config
    }

    private func performAction<Body: Encodable>(
        _ path: String,
        method: String = "POST",
        body: Body? = Optional<EmptyPayload>.none,
        showActivity: Bool = true
    ) async {
        if showActivity { isBusy = true }
        defer { if showActivity { isBusy = false } }
        do {
            let response: APIResponse<EmptyPayload> = try await request(
                path: path,
                method: method,
                body: body
            )
            if let updatedState = response.state { state = updatedState }
            lastError = ""
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func performAction(_ path: String, showActivity: Bool = true) async {
        await performAction(path, body: Optional<EmptyPayload>.none, showActivity: showActivity)
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String = "GET",
        body: Body? = Optional<EmptyPayload>.none
    ) async throws -> Response {
        guard let endpoint else { throw RuntimeClientError.notReady }
        var urlRequest = URLRequest(url: endpoint.appendingPathComponent(path))
        urlRequest.httpMethod = method
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            urlRequest.httpBody = try JSONEncoder().encode(body)
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw RuntimeClientError.invalidResponse
        }
        if !(200..<300).contains(httpResponse.statusCode) {
            let message = (try? JSONDecoder().decode(APIError.self, from: data).error)
                ?? "后台请求失败 (\(httpResponse.statusCode))"
            throw RuntimeClientError.server(message)
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func request<Response: Decodable>(
        path: String,
        method: String = "GET"
    ) async throws -> Response {
        try await request(path: path, method: method, body: Optional<EmptyPayload>.none)
    }

    private func resolveHostURL() throws -> URL {
        let environment = ProcessInfo.processInfo.environment
        let candidates: [URL?] = [
            environment["CODEXBAR_RUNTIME_HOST"].map { URL(fileURLWithPath: $0) },
            Bundle.main.resourceURL?.appendingPathComponent("Runtime/host.js"),
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appendingPathComponent("CodexBar/Runtime/host.js"),
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appendingPathComponent("Runtime/host.js")
        ]
        if let candidate = candidates.compactMap({ $0 }).first(where: {
            FileManager.default.fileExists(atPath: $0.path)
        }) {
            return candidate
        }
        throw RuntimeClientError.missingRuntime
    }

    private func resolveOpenGitRoot(for hostURL: URL) -> String {
        if let configured = ProcessInfo.processInfo.environment["CODEXBAR_OPEN_GIT_ROOT"] {
            return configured
        }
        let sourceRoot = hostURL.deletingLastPathComponent().deletingLastPathComponent()
        let candidate = sourceRoot.deletingLastPathComponent()
        if FileManager.default.fileExists(atPath: candidate.appendingPathComponent("electron/ipc/codex-main-session.js").path) {
            return candidate.path
        }
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("OpenGitRuntime")
        return bundled?.path ?? candidate.path
    }

    private func resolveNodeURL() throws -> URL {
        let environment = ProcessInfo.processInfo.environment
        var paths = [
            environment["CODEXBAR_NODE"],
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".volta/bin/node").path,
            environment["PATH"]?.split(separator: ":").map { "\($0)/node" }.first(where: {
                FileManager.default.isExecutableFile(atPath: $0)
            })
        ].compactMap { $0 }
        let nvmVersions = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".nvm/versions/node")
        if let versions = try? FileManager.default.contentsOfDirectory(
            at: nvmVersions,
            includingPropertiesForKeys: nil
        ) {
            paths.append(contentsOf: versions
                .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedDescending }
                .map { $0.appendingPathComponent("bin/node").path })
        }
        if let executable = paths.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) {
            return URL(fileURLWithPath: executable)
        }
        throw RuntimeClientError.missingNode
    }
}

private struct APIError: Decodable {
    var error: String
}

enum RuntimeClientError: LocalizedError {
    case notReady
    case invalidResponse
    case missingRuntime
    case missingNode
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notReady: "CodexBar 后台尚未就绪"
        case .invalidResponse: "CodexBar 后台返回了无效数据"
        case .missingRuntime: "找不到 CodexBar 后台文件"
        case .missingNode: "找不到 Node.js，请先安装 Node 20 或更高版本"
        case .server(let message): message
        }
    }
}
