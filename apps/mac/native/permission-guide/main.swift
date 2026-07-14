import AppKit
import Foundation

@MainActor
private final class PermissionGuideApp: NSObject, NSApplicationDelegate {
    private let targetAppPath: String
    private var window: NSWindow?
    private var statusLabel: NSTextField?
    private var requestButton: NSButton?

    init(arguments: [String]) {
        self.targetAppPath = Self.value(after: "--app-path", in: arguments)
            ?? Bundle.main.bundleURL.path
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        NSApp.activate(ignoringOtherApps: true)
        showWindow()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func showWindow() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 230),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "OpenFolio Messages Access"
        window.center()
        window.isReleasedWhenClosed = false

        let content = NSView(frame: window.contentView?.bounds ?? .zero)
        content.translatesAutoresizingMaskIntoConstraints = false
        window.contentView = content

        let title = NSTextField(labelWithString: "Grant Full Disk Access")
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        title.alignment = .center

        let detail = NSTextField(wrappingLabelWithString: "OpenFolio needs Full Disk Access to read your local iMessage database. Messages stay on this Mac, and OpenFolio does not make network requests.")
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = .secondaryLabelColor
        detail.alignment = .center

        let button = NSButton(title: "Open Guided Setup", target: self, action: #selector(startRequest))
        button.bezelStyle = .rounded
        button.controlSize = .large
        button.keyEquivalent = "\r"
        self.requestButton = button

        let status = NSTextField(labelWithString: "")
        status.font = .systemFont(ofSize: 12)
        status.textColor = .secondaryLabelColor
        status.alignment = .center
        self.statusLabel = status

        let stack = NSStackView(views: [title, detail, button, status])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            stack.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            detail.widthAnchor.constraint(lessThanOrEqualToConstant: 340),
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 170),
        ])

        self.window = window
        window.makeKeyAndOrderFront(nil)
    }

    @objc private func startRequest() {
        guard let button = requestButton,
              let window = button.window
        else { return }

        requestButton?.isEnabled = false
        statusLabel?.stringValue = "Opening System Settings..."

        let rectInWindow = button.convert(button.bounds, to: nil)
        let sourceRect = window.convertToScreen(rectInWindow)
        let targetURL = URL(fileURLWithPath: targetAppPath)

        Task { @MainActor in
            do {
                let center = try PermissionCenter(appName: "OpenFolio", bundleURL: targetURL)
                _ = try await center.request(.fullDiskAccess, sourceRectInScreen: sourceRect)
                statusLabel?.stringValue = "Return to OpenFolio and recheck Messages access."
            } catch {
                statusLabel?.stringValue = error.localizedDescription
            }
            requestButton?.isEnabled = true
        }
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: flag),
              arguments.indices.contains(index + 1)
        else { return nil }
        return arguments[index + 1]
    }
}

@main
@MainActor
private enum PermissionGuideMain {
    private static var delegate: PermissionGuideApp?

    static func main() {
        let app = NSApplication.shared
        let delegate = PermissionGuideApp(arguments: CommandLine.arguments)
        Self.delegate = delegate
        app.delegate = delegate
        app.run()
    }
}
