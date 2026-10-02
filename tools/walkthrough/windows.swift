import Foundation
import CoreGraphics
import AppKit
import ScreenCaptureKit

let pid = Int32(CommandLine.arguments[1])!
if CommandLine.arguments.contains("--activate") {
  guard let app = NSRunningApplication(processIdentifier: pid) else { exit(1) }
  app.activate(options: [.activateAllWindows])
  Thread.sleep(forTimeInterval: 0.35)
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { exit(2) }
  exit(0)
}
let entries = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
if let flag = CommandLine.arguments.firstIndex(of: "--capture-glass") {
  let target = UInt32(CommandLine.arguments[flag + 1])!
  let output = CommandLine.arguments[flag + 2]
  Task {
    do {
      let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
      let owned = content.windows.filter { $0.owningApplication?.processID == pid }
      guard let window = owned.first(where: { $0.windowID == target }),
            let backdrop = owned.first(where: { $0.title == "Switchboard demo backdrop" }),
            let display = content.displays.first(where: { $0.frame.contains(window.frame) }) else { exit(3) }
      // An inclusion filter excludes every other app, desktop, Dock, and menu bar.
      let filter = SCContentFilter(display: display, including: [backdrop, window])
      let config = SCStreamConfiguration()
      config.width = Int(window.frame.width * 2)
      config.height = Int(window.frame.height * 2)
      config.sourceRect = window.frame.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
      config.showsCursor = false
      config.ignoreShadowsDisplay = true
      let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
      guard let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { exit(4) }
      try png.write(to: URL(fileURLWithPath: output))
      exit(0)
    } catch {
      fputs("Native demo capture failed: \(error.localizedDescription)\n", stderr)
      exit(5)
    }
  }
  RunLoop.main.run()
}
let windows = entries
  .filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }
  .map { entry -> [String: Any] in
    ["id": entry[kCGWindowNumber as String] ?? 0,
     "name": entry[kCGWindowName as String] ?? "",
     "bounds": entry[kCGWindowBounds as String] ?? [:],
     "layer": entry[kCGWindowLayer as String] ?? 0]
  }
let data = try JSONSerialization.data(withJSONObject: windows)
print(String(data: data, encoding: .utf8)!)
