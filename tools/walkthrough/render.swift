import AppKit
import AVFoundation
import CoreGraphics
import CoreText
import CoreVideo
import ImageIO
import VideoToolbox

struct Box {
  var x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat
  var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
}

struct Walkthrough {
  static let duration = 34
  static let fps: Int32 = 30
  let square: Bool
  let images: [String: CGImage]
  var width: Int { square ? 1080 : 1920 }
  var margin: CGFloat { square ? 60 : 112 }
  var window: Box { square ? Box(x: 60, y: 352, width: 960, height: 525)
    : Box(x: 272, y: 252, width: 1376, height: 752.5) }
  let white = color(0xf7f8fc), muted = color(0x9faac1), accent = color(0xbda7ff)

  init(inputs: URL, square: Bool) throws {
    self.square = square
    let names = ["01-studio", "02-workshop", "03-field-team", "04-call-base", "05-call-sheet",
      "06-call-answered", "08-theme-picker", "09-theme-dark", "10-theme-isolation", "12-menu-activity", "app-icon"]
    images = try Dictionary(uniqueKeysWithValues: names.map { name in
      let file = inputs.appendingPathComponent("\(name).png")
      guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw Failure("Cannot read demo asset \(name).")
      }
      return (name, image)
    })
  }

  func draw(_ ctx: CGContext, time t: Double) {
    ctx.translateBy(x: 0, y: 1080); ctx.scaleBy(x: 1, y: -1)
    let colors = [color(0x17192e), color(0x0d1425), color(0x101929)] as CFArray
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.5, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: 0), end: CGPoint(x: width, y: 1080), options: [])
    text(ctx, "SWITCHBOARD FOR QUO", x: margin, y: 46, width: 560, size: 17, weight: .semibold, tint: muted, kern: 1.7)
    text(ctx, "DEMO DATA", x: CGFloat(width) - margin - 180, y: 46, width: 180, size: 17,
      weight: .semibold, tint: muted, align: .right, kern: 1.1)

    switch t {
    case 0..<3:
      heading(ctx, square ? "One Mac.\nEvery workspace." : "One Mac. Every workspace.",
        "A workspace switcher built around Quo.", t: t, start: 0, duration: 3)
      let progress = ease(t / 0.55)
      let scale = 0.98 + 0.02 * progress
      let box = Box(x: window.x + window.width * (1 - scale) / 2,
        y: window.y + 30 * (1 - progress), width: window.width * scale, height: window.height * scale)
      image(ctx, "01-studio", box, alpha: progress)
    case 3..<9:
      heading(ctx, square ? "Switch workspaces.\nKeep your place." : "Switch workspaces. Keep your place.",
        "Separate profiles. One familiar app.", t: t, start: 3, duration: 6)
      let names = ["01-studio", "02-workshop", "03-field-team", "01-studio"]
      image(ctx, names[min(3, Int((t - 3) / 1.5))], square ? Box(x: 60, y: 340, width: 960, height: 630) : window,
        source: square ? Box(x: 0, y: 0, width: 640, height: 420) : nil)
      let studio = point(29, 86), workshop = point(29, 135), field = point(29, 184)
      pointer(ctx, interpolate(t - 3, [(0, point(185, 220)), (0.9, workshop), (1.8, workshop),
        (2.8, field), (3.3, field), (4.35, studio), (6, studio)]))
      click(ctx, workshop, t: t, at: 4.4); click(ctx, field, t: t, at: 5.9); click(ctx, studio, t: t, at: 7.4)
    case 9..<13.2:
      heading(ctx, square ? "A call in Workshop.\nYou’re in Studio." : "A call in Workshop. You’re in Studio.",
        "Native controls identify the receiving workspace.", t: t, start: 9, duration: 4.2)
      image(ctx, "04-call-base", window)
      let call = square ? Box(x: 110, y: 400, width: 860, height: 516)
        : Box(x: 1070, y: 336, width: 720, height: 432)
      let alpha = fade(t, start: 9.6, duration: 3.6, incoming: 0.3, outgoing: 0.15)
      fill(ctx, window, tint: color(0x0b1020), alpha: alpha * 0.38, radius: 16)
      image(ctx, "05-call-sheet", call, alpha: alpha, radius: 34)
      let answer = CGPoint(x: call.x + call.width * 0.82, y: call.y + call.height * 0.73)
      if t >= 11.1 { pointer(ctx, interpolate(t - 11.1, [(0, CGPoint(x: call.x + call.width * 0.55,
        y: call.y + call.height * 0.4)), (0.75, answer), (2.1, answer)]), alpha: alpha) }
      click(ctx, answer, t: t, at: 12.8)
      disclosure(ctx)
    case 13.2..<17:
      heading(ctx, square ? "Workshop opens.\nThe call follows." : "Workshop opens. The call follows.",
        "Answer routes to the receiving account.", t: t, start: 13.2, duration: 3.8)
      image(ctx, "06-call-answered", square ? Box(x: 60, y: 340, width: 960, height: 630) : window,
        alpha: fade(t, start: 13.2, duration: 3.8, incoming: 0.2),
        source: square ? Box(x: 0, y: 0, width: 800, height: 525) : nil)
      disclosure(ctx)
    case 17..<20.3:
      heading(ctx, square ? "A theme for\nevery workspace." : "A theme for every workspace.",
        "A native picker. A coordinated Quo interface.", t: t, start: 17, duration: 5.5)
      image(ctx, "02-workshop", window)
      fill(ctx, window, tint: color(0x0b1020), alpha: 0.48, radius: 16)
      let picker = square ? Box(x: 230, y: 341, width: 620, height: 552)
        : Box(x: 1030, y: 258, width: 760, height: 676.585)
      let alpha = fade(t, start: 17, duration: 3.3)
      image(ctx, "08-theme-picker", picker, alpha: alpha, radius: 32)
      let apply = CGPoint(x: picker.x + picker.width * 0.62, y: picker.y + picker.height * 0.927)
      pointer(ctx, interpolate(t - 17, [(0, CGPoint(x: picker.x + picker.width * 0.3,
        y: picker.y + picker.height * 0.49)), (2.5, apply), (3.3, apply)]), alpha: alpha)
      click(ctx, apply, t: t, at: 20)
    case 20.3..<22.5:
      heading(ctx, square ? "A theme for\nevery workspace." : "A theme for every workspace.",
        "A native picker. A coordinated Quo interface.", t: t, start: 17, duration: 5.5)
      image(ctx, "09-theme-dark", window, alpha: fade(t, start: 20.3, duration: 2.2, incoming: 0.25, outgoing: 0.1))
    case 22.5..<25:
      heading(ctx, square ? "Studio stays light.\nWorkshop stays dark." : "Studio stays light. Workshop stays dark.",
        "Your choice is saved per workspace.", t: t, start: 22.5, duration: 2.5)
      image(ctx, "10-theme-isolation", window, alpha: fade(t, start: 22.5, duration: 2.5, incoming: 0.22, outgoing: 0.1))
    case 25..<30:
      heading(ctx, square ? "Every workspace.\nOne glance." : "Every workspace. One glance.",
        "Unread counts and recent activity in the menu bar.", t: t, start: 25, duration: 5)
      let activity = square ? Box(x: 270, y: 333, width: 540, height: 649.12)
        : Box(x: 1170, y: 252, width: 560, height: 673.16)
      if !square {
        let base = Box(x: 112, y: 302, width: 1040, height: 568.75)
        image(ctx, "01-studio", base)
        fill(ctx, base, tint: color(0x0b1020), alpha: 0.2, radius: 16)
        text(ctx, "3 workspaces", x: 112, y: 909, width: 700, size: 32, weight: .semibold)
        text(ctx, "12 unread · fictional counts", x: 112, y: 956, width: 700, size: 23, tint: muted)
      }
      if square && t < 27.5 {
        image(ctx, "12-menu-activity", Box(x: 90, y: 333, width: 900, height: 652.85),
          alpha: fade(t, start: 25, duration: 2.5, incoming: 0.36, outgoing: 0.1), radius: 26,
          source: Box(x: 0, y: 0, width: 386, height: 280), sourceCoordinateWidth: 386)
      } else {
        image(ctx, "12-menu-activity", activity,
          alpha: fade(t, start: square ? 27.5 : 25, duration: square ? 2.5 : 5, incoming: 0.22, outgoing: 0.22), radius: 26)
      }
    default:
      let alpha = fade(t, start: 30, duration: 4, incoming: 0.5, outgoing: 0.12)
      image(ctx, "app-icon", Box(x: CGFloat(width) / 2 - 72, y: square ? 214 : 268,
        width: 144, height: 144), alpha: alpha, radius: 0, shadow: false)
      ctx.saveGState(); ctx.setAlpha(alpha)
      text(ctx, "Switchboard for Quo", x: margin, y: square ? 413 : 472, width: CGFloat(width) - margin * 2,
        size: square ? 55 : 76, weight: .semibold, align: .center, kern: -1.7)
      text(ctx, "Your workspaces. One Mac app.", x: margin, y: square ? 546 : 580,
        width: CGFloat(width) - margin * 2, size: square ? 31 : 36, tint: muted, align: .center)
      text(ctx, "MIT licensed · by Oze", x: margin, y: square ? 651 : 690,
        width: CGFloat(width) - margin * 2, size: 26, tint: accent, align: .center)
      text(ctx, "github.com/ozeitis/quo-switchboard", x: margin, y: square ? 746 : 775,
        width: CGFloat(width) - margin * 2, size: square ? 27 : 30, align: .center)
      ctx.restoreGState()
    }
    fill(ctx, Box(x: margin, y: 1018, width: CGFloat(width) - margin * 2, height: 1), tint: color(0x28314a))
    text(ctx, "Open source · by Oze", x: margin, y: 1040, width: 450, size: 17, tint: muted)
    let chapter = t < 9 ? "Workspaces" : t < 17 ? "Calls" : t < 25 ? "Themes" : t < 30 ? "Activity" : "Built for Mac"
    text(ctx, chapter, x: CGFloat(width) - margin - 300, y: 1040, width: 300, size: 17, tint: accent, align: .right)
  }

  func heading(_ ctx: CGContext, _ title: String, _ subtitle: String, t: Double, start: Double, duration: Double) {
    ctx.saveGState(); ctx.setAlpha(fade(t, start: start, duration: duration))
    let offset = 14 * (1 - ease((t - start) / 0.34))
    text(ctx, title, x: margin, y: (square ? 120 : 102) + offset, width: CGFloat(width) - margin * 2,
      size: square ? 52 : 60, weight: .semibold, kern: -1.5)
    text(ctx, subtitle, x: margin, y: square ? 269 : 184, width: CGFloat(width) - margin * 2,
      size: square ? 25 : 27, tint: muted)
    ctx.restoreGState()
  }
  func disclosure(_ ctx: CGContext) {
    text(ctx, "Simulated call · no live audio", x: margin, y: square ? 987 : 226,
      width: CGFloat(width) - margin * 2, size: square ? 21 : 18, tint: accent, align: square ? .center : .left)
  }
  func image(_ ctx: CGContext, _ name: String, _ box: Box, alpha: CGFloat = 1, radius: CGFloat = 16,
    shadow: Bool = true, source: Box? = nil, sourceCoordinateWidth: CGFloat = 1280) {
    guard alpha > 0, var image = images[name] else { return }
    if let source {
      let scale = CGFloat(image.width) / sourceCoordinateWidth
      guard let cropped = image.cropping(to: CGRect(x: source.x * scale, y: source.y * scale,
        width: source.width * scale, height: source.height * scale)) else { preconditionFailure("Invalid demo close-up.") }
      image = cropped
    }
    ctx.saveGState(); ctx.setAlpha(alpha)
    if shadow {
      ctx.setShadow(offset: CGSize(width: 0, height: 14), blur: 32, color: color(0x000000, alpha: 0.28))
      ctx.setFillColor(color(0x101524)); ctx.addPath(CGPath(roundedRect: box.rect, cornerWidth: radius, cornerHeight: radius, transform: nil)); ctx.fillPath()
      ctx.setShadow(offset: .zero, blur: 0, color: nil)
    }
    if radius > 0 { ctx.addPath(CGPath(roundedRect: box.rect, cornerWidth: radius, cornerHeight: radius, transform: nil)); ctx.clip() }
    ctx.interpolationQuality = .high
    ctx.translateBy(x: box.x, y: box.y + box.height); ctx.scaleBy(x: 1, y: -1)
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: box.width, height: box.height))
    ctx.restoreGState()
  }
  func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
    square ? CGPoint(x: 60 + 960 * x / 640, y: 340 + 630 * y / 420)
      : CGPoint(x: window.x + window.width * x / 1280, y: window.y + window.height * y / 700)
  }
  func pointer(_ ctx: CGContext, _ point: CGPoint, alpha: CGFloat = 1) {
    ctx.saveGState(); ctx.setAlpha(alpha); ctx.translateBy(x: point.x, y: point.y)
    let path = CGMutablePath(); path.move(to: CGPoint(x: 2, y: 2))
    for point in [CGPoint(x: 2, y: 29), CGPoint(x: 9, y: 23), CGPoint(x: 15, y: 34),
      CGPoint(x: 21, y: 31), CGPoint(x: 15, y: 21), CGPoint(x: 25, y: 20)] { path.addLine(to: point) }
    path.closeSubpath()
    ctx.setShadow(offset: CGSize(width: 1, height: 3), blur: 5, color: color(0, alpha: 0.4))
    ctx.addPath(path); ctx.setFillColor(white); ctx.setStrokeColor(color(0x182036)); ctx.setLineWidth(1.6)
    ctx.drawPath(using: .fillStroke); ctx.restoreGState()
  }
  func click(_ ctx: CGContext, _ point: CGPoint, t: Double, at: Double) {
    guard t >= at, t < at + 0.4 else { return }
    let progress = CGFloat((t - at) / 0.4), radius = 11 + 12 * ease(Double(progress))
    ctx.saveGState(); ctx.setAlpha(0.9 * (1 - progress)); ctx.setStrokeColor(accent); ctx.setLineWidth(2)
    ctx.strokeEllipse(in: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
    ctx.restoreGState()
  }
}

func color(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
  CGColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
    blue: CGFloat(hex & 255) / 255, alpha: alpha)
}
func ease(_ input: Double) -> CGFloat {
  let t = max(0, min(1, input)); return CGFloat(1 - pow(1 - t, 3))
}
func fade(_ t: Double, start: Double, duration: Double, incoming: Double = 0.28, outgoing: Double = 0.18) -> CGFloat {
  guard t >= start, t < start + duration else { return 0 }
  return min(ease((t - start) / incoming), ease((start + duration - t) / outgoing))
}
func interpolate(_ t: Double, _ points: [(Double, CGPoint)]) -> CGPoint {
  for index in 1..<points.count where t <= points[index].0 {
    let before = points[index - 1], after = points[index]
    let progress = ease((t - before.0) / (after.0 - before.0))
    return CGPoint(x: before.1.x + (after.1.x - before.1.x) * progress,
      y: before.1.y + (after.1.y - before.1.y) * progress)
  }
  return points.last!.1
}
func fill(_ ctx: CGContext, _ box: Box, tint: CGColor, alpha: CGFloat = 1, radius: CGFloat = 0) {
  ctx.saveGState(); ctx.setAlpha(alpha); ctx.setFillColor(tint)
  ctx.addPath(CGPath(roundedRect: box.rect, cornerWidth: radius, cornerHeight: radius, transform: nil)); ctx.fillPath()
  ctx.restoreGState()
}
func text(_ ctx: CGContext, _ content: String, x: CGFloat, y: CGFloat, width: CGFloat, size: CGFloat,
  weight: NSFont.Weight = .regular, tint: CGColor = color(0xf7f8fc), align: NSTextAlignment = .left, kern: CGFloat = 0) {
  let font = NSFont.systemFont(ofSize: size, weight: weight)
  let ctFont = CTFontCreateWithName(font.fontName as CFString, size, nil)
  for (index, value) in content.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
    let attributed = NSAttributedString(string: String(value), attributes: [.font: font,
      .foregroundColor: NSColor(cgColor: tint)!, .kern: kern])
    let line = CTLineCreateWithAttributedString(attributed)
    let length = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    precondition(length <= width + 1, "Caption exceeds layout width: \(value)")
    let shift = align == .center ? (width - length) / 2 : align == .right ? width - length : 0
    ctx.saveGState(); ctx.translateBy(x: x + shift, y: y + CGFloat(index) * size * 1.18 + CTFontGetAscent(ctFont))
    ctx.scaleBy(x: 1, y: -1); ctx.textMatrix = .identity; ctx.textPosition = .zero
    CTLineDraw(line, ctx); ctx.restoreGState()
  }
}

struct Failure: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}

@main struct Render {
  static func main() async throws {
    guard CommandLine.arguments.count == 4, ["wide", "square"].contains(CommandLine.arguments[3]) else {
      throw Failure("Usage: render CAPTURES OUTPUT.mp4 wide|square")
    }
    let inputs = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    let output = URL(fileURLWithPath: CommandLine.arguments[2])
    let film = try Walkthrough(inputs: inputs, square: CommandLine.arguments[3] == "square")
    guard !FileManager.default.fileExists(atPath: output.path) else { throw Failure("Output already exists; use a new path.") }
    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: film.width, AVVideoHeightKey: 1080,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 10_000_000,
        AVVideoExpectedSourceFrameRateKey: Walkthrough.fps,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
      AVVideoEncoderSpecificationKey: [kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder as String: true]])
    guard writer.canAdd(input) else { throw Failure("H.264 input is unavailable.") }
    let receiver = writer.inputPixelBufferReceiver(for: input, pixelBufferAttributes: CVPixelBufferCreationAttributes(
      pixelFormatType: CVPixelFormatType(rawValue: kCVPixelFormatType_32BGRA),
      size: CVImageSize(width: film.width, height: 1080)))
    try writer.start()
    writer.startSession(atSourceTime: .zero)
    guard let pool = receiver.pixelBufferPool else { throw Failure("No native pixel buffer pool.") }
    for number in 0..<(Walkthrough.duration * Int(Walkthrough.fps)) {
      let buffer = try pool.makeMutablePixelBuffer()
      try buffer.withUnsafeBuffer { raw in
        CVPixelBufferLockBaseAddress(raw, [])
        defer { CVPixelBufferUnlockBaseAddress(raw, []) }
        try autoreleasepool {
          guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(raw), width: film.width, height: 1080,
            bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(raw), space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else {
            throw Failure("Cannot create native drawing context.")
          }
          film.draw(ctx, time: Double(number) / Double(Walkthrough.fps))
        }
      }
      try await receiver.append(CVReadOnlyPixelBuffer(buffer), with: CMTime(value: Int64(number), timescale: Walkthrough.fps))
      if number % 150 == 0 { print("Rendered \(number / Int(Walkthrough.fps))s of \(Walkthrough.duration)s.") }
    }
    writer.endSession(atSourceTime: CMTime(value: Int64(Walkthrough.duration), timescale: 1))
    receiver.finish(); await writer.finishWriting()
    guard writer.status == .completed else { throw writer.error ?? Failure("Native export failed.") }
    print("Exported \(output.lastPathComponent): \(film.width)×1080, 30 fps, \(Walkthrough.duration) seconds.")
  }
}
