import XCTest
@testable import CodexBar

final class RuntimeModelsTests: XCTestCase {
    func testDecodesRuntimeState() throws {
        let data = Data(#"""
        {
          "serverStatus":"running",
          "serverError":"",
          "account":{"type":"chatgpt","email":"user@example.com","planType":"pro"},
          "requiresOpenaiAuth":false,
          "sessions":[],
          "activeSessionId":"main",
          "threadId":"thread-1",
          "turnStatus":"idle",
          "activeTurnId":"",
          "queueLength":0,
          "activeTaskCount":2,
          "totalQueueLength":1,
          "workingDirectory":"/tmp",
          "sandboxMode":"danger-full-access",
          "feishu":{"enabled":true,"running":true,"status":"connected","error":"","connections":[],"autoMonitor":null}
        }
        """#.utf8)

        let state = try JSONDecoder().decode(RuntimeState.self, from: data)
        XCTAssertEqual(state.serverStatus, "running")
        XCTAssertEqual(state.activeTaskCount, 2)
        XCTAssertEqual(state.account?.planType, "pro")
    }

    func testDecodesProjectBindingFromOpenGitShape() throws {
        let data = Data(#"""
        {
          "id":"feishu:one",
          "title":"飞书会话",
          "source":"feishu",
          "connectionId":"bot-1",
          "connectionName":"机器人",
          "chatId":"chat-1",
          "chatType":"p2p",
          "threadId":"thread-1",
          "projectBinding":{"projectQuery":"api-go","cwd":"/workspace/api-go","title":"api-go","boundAt":1},
          "lastMessage":"继续处理",
          "createdAt":1,
          "updatedAt":2,
          "turnStatus":"idle",
          "activeTurnId":"",
          "activeTaskCount":0,
          "queueLength":0
        }
        """#.utf8)

        let session = try JSONDecoder().decode(CodexSession.self, from: data)
        XCTAssertEqual(session.projectBinding?.cwd, "/workspace/api-go")
    }
}
