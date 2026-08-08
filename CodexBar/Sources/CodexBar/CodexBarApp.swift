import AppKit
import SwiftUI

@main
enum CodexBarMain {
    @MainActor private static var retainedDelegate: AppDelegate?

    @MainActor
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        retainedDelegate = delegate
        application.delegate = delegate
        application.setActivationPolicy(.accessory)
        application.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
    private let runtime = RuntimeRegistry.shared.client
    private var statusItem: NSStatusItem?
    private var workbenchWindow: NSWindow?
    private var observers: [NSObjectProtocol] = []
    private var statusTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        installStatusItem()
        runtime.start()
        statusTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
            Task { @MainActor in RuntimeRegistry.shared.updateStatusIcon() }
        }
        let workspaceCenter = NSWorkspace.shared.notificationCenter
        observers.append(workspaceCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                RuntimeRegistry.shared.client.notifyPowerEvent("resume")
            }
        })
        let distributed = DistributedNotificationCenter.default()
        observers.append(distributed.addObserver(
            forName: Notification.Name("com.apple.screenIsLocked"),
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                RuntimeRegistry.shared.client.notifyPowerEvent("lock")
            }
        })
        observers.append(distributed.addObserver(
            forName: Notification.Name("com.apple.screenIsUnlocked"),
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                RuntimeRegistry.shared.client.notifyPowerEvent("unlock")
            }
        })
    }

    func applicationWillTerminate(_ notification: Notification) {
        runtime.stop()
        statusTimer?.invalidate()
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    func applicationShouldHandleReopen(
        _ sender: NSApplication,
        hasVisibleWindows flag: Bool
    ) -> Bool {
        if !flag { showWorkbench() }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(
        _ sender: NSApplication
    ) -> Bool {
        false
    }

    func menuWillOpen(_ menu: NSMenu) {
        rebuildMenu(menu)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        NSApp.setActivationPolicy(.accessory)
        return false
    }

    private func installStatusItem() {
        UserDefaults.standard.set(true, forKey: "NSStatusItem Visible Item-0")
        UserDefaults.standard.set(true, forKey: "NSStatusItem VisibleCC Item-0")
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.autosaveName = "CodexBar"
        item.isVisible = true
        configureStatusButton(item.button, symbol: "bolt.circle")
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        statusItem = item
        RuntimeRegistry.shared.statusItem = item
        rebuildMenu(menu)
    }

    private func rebuildMenu(_ menu: NSMenu) {
        menu.removeAllItems()
        menu.addItem(menuItem("打开工作台", action: #selector(showWorkbench), key: "o", image: "rectangle.grid.2x2"))
        menu.addItem(.separator())

        let enabled = runtime.state.feishu.connections.filter(\.enabled).count
        let connected = runtime.state.feishu.connections.filter { $0.enabled && $0.running }.count
        menu.addItem(infoItem(runtime.isReady ? "后台运行中" : "后台启动中", image: runtime.isReady ? "checkmark.circle.fill" : "clock"))
        menu.addItem(infoItem("飞书 \(connected)/\(enabled) 在线", image: "paperplane"))
        menu.addItem(infoItem("执行中 \(runtime.state.activeTaskCount) · 排队 \(runtime.state.totalQueueLength)", image: "list.bullet.rectangle"))

        let activeSessions = runtime.state.sessions.filter { $0.turnStatus == "running" || $0.queueLength > 0 }
        if !activeSessions.isEmpty {
            menu.addItem(.separator())
            for session in activeSessions.prefix(6) {
                let suffix = session.turnStatus == "running" ? "执行中" : "排队 \(session.queueLength)"
                menu.addItem(menuItem("\(session.title) · \(suffix)", action: #selector(showWorkbench), image: session.turnStatus == "running" ? "bolt.fill" : "clock"))
            }
        }

        if !runtime.lastError.isEmpty {
            menu.addItem(.separator())
            let error = infoItem(runtime.lastError, image: "exclamationmark.triangle")
            error.toolTip = runtime.lastError
            menu.addItem(error)
        }

        menu.addItem(.separator())
        let restart = menuItem("重启后台", action: #selector(restartRuntime), image: "arrow.clockwise")
        restart.isEnabled = runtime.isReady && !runtime.isBusy
        menu.addItem(restart)
        menu.addItem(menuItem("退出 CodexBar", action: #selector(quit), key: "q", image: "power"))
        updateStatusIcon()
    }

    private func menuItem(
        _ title: String,
        action: Selector,
        key: String = "",
        image: String
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        item.image = NSImage(systemSymbolName: image, accessibilityDescription: nil)
        return item
    }

    private func infoItem(_ title: String, image: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.image = NSImage(systemSymbolName: image, accessibilityDescription: nil)
        item.isEnabled = false
        return item
    }

    fileprivate func updateStatusIcon() {
        let symbol = runtime.state.activeTaskCount > 0 ? "bolt.circle.fill" : "bolt.circle"
        statusItem?.isVisible = true
        configureStatusButton(statusItem?.button, symbol: symbol)
        statusItem?.button?.appearsDisabled = !runtime.isReady
    }

    private func configureStatusButton(_ button: NSStatusBarButton?, symbol: String) {
        guard let button else { return }
        let image = makeStatusIcon(active: symbol.hasSuffix(".fill"))
        button.image = image
        button.imagePosition = .imageOnly
        button.title = ""
        button.toolTip = "CodexBar · 点击查看运行状态"
        button.setAccessibilityLabel("CodexBar")
    }

    private func makeStatusIcon(active: Bool) -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            NSGraphicsContext.current?.shouldAntialias = true
            NSColor.black.setStroke()

            let outerPath = NSBezierPath()
            outerPath.move(to: NSPoint(x: 13.3, y: 15.1))
            outerPath.curve(
                to: NSPoint(x: 4.2, y: 9),
                controlPoint1: NSPoint(x: 7.7, y: 15.1),
                controlPoint2: NSPoint(x: 4.2, y: 13.3)
            )
            outerPath.curve(
                to: NSPoint(x: 13.3, y: 2.9),
                controlPoint1: NSPoint(x: 4.2, y: 4.7),
                controlPoint2: NSPoint(x: 7.7, y: 2.9)
            )
            outerPath.lineWidth = 2.2
            outerPath.lineCapStyle = .round
            outerPath.stroke()

            let routePath = NSBezierPath()
            routePath.move(to: NSPoint(x: 4.4, y: 9))
            routePath.curve(
                to: NSPoint(x: 11.7, y: 9),
                controlPoint1: NSPoint(x: 7.1, y: 9),
                controlPoint2: NSPoint(x: 8.2, y: 9)
            )
            routePath.lineWidth = 2
            routePath.lineCapStyle = .round
            routePath.stroke()

            let nodePath = NSBezierPath(ovalIn: NSRect(x: 11.7, y: 6.7, width: 4.6, height: 4.6))
            if active {
                NSColor.black.setFill()
                nodePath.fill()
            } else {
                nodePath.lineWidth = 1.8
                nodePath.stroke()
            }
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "CodexBar"
        return image
    }

    @objc private func showWorkbench() {
        if workbenchWindow == nil {
            let rootView = WorkbenchView()
                .environmentObject(runtime)
                .frame(minWidth: 900, minHeight: 620)
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 1060, height: 720),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            window.title = "CodexBar 工作台"
            window.contentView = NSHostingView(rootView: rootView)
            window.center()
            window.isReleasedWhenClosed = false
            window.delegate = self
            workbenchWindow = window
        }
        NSApp.setActivationPolicy(.regular)
        workbenchWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func restartRuntime() {
        Task { await runtime.restartRuntime() }
    }

    @objc private func quit() {
        runtime.stop()
        NSApp.terminate(nil)
    }
}

@MainActor
final class RuntimeRegistry {
    static let shared = RuntimeRegistry()
    let client = RuntimeClient()
    weak var statusItem: NSStatusItem?

    func updateStatusIcon() {
        guard let delegate = NSApp.delegate as? AppDelegate else { return }
        delegate.updateStatusIcon()
    }
}
