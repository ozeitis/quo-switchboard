import AppKit
import Foundation

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets")
let iconset = root.appendingPathComponent("AppIcon.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

func render(size: Int, tray: Bool = false) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let scale = CGFloat(size) / 1024
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    if !tray {
        NSColor(srgbRed: 0.13, green: 0.19, blue: 0.27, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 70, y: 70, width: 884, height: 884), xRadius: 192, yRadius: 192).fill()
    }
    let color = tray ? NSColor.black : NSColor(srgbRed: 0.82, green: 0.89, blue: 0.95, alpha: 1)
    color.setStroke()
    let back = NSBezierPath(roundedRect: NSRect(x: 260, y: 366, width: 354, height: 410), xRadius: 77, yRadius: 77)
    back.lineWidth = 42
    back.stroke()
    if !tray {
        NSColor(srgbRed: 0.13, green: 0.19, blue: 0.27, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 412, y: 241, width: 354, height: 410), xRadius: 77, yRadius: 77).fill()
    }
    color.setStroke()
    let front = NSBezierPath(roundedRect: NSRect(x: 412, y: 241, width: 354, height: 410), xRadius: 77, yRadius: 77)
    front.lineWidth = 42
    front.stroke()
    if !tray {
        NSColor(srgbRed: 0.43, green: 0.82, blue: 0.65, alpha: 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: 704, y: 207, width: 92, height: 92)).fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}

for size in [16, 32, 128, 256, 512] {
    try render(size: size).write(to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
    try render(size: size * 2).write(to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
try render(size: 1024).write(to: root.appendingPathComponent("icon.png"))
try render(size: 36, tray: true).write(to: root.appendingPathComponent("tray.png"))
