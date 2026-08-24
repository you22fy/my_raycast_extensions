import AppKit
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

guard CommandLine.arguments.count == 4 else {
  fail("usage: svg-to-png.swift <input.svg> <output.png> <size>")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

guard let pixelSize = Int(CommandLine.arguments[3]), pixelSize > 0 else {
  fail("invalid output size")
}

guard
  let svgData = try? Data(contentsOf: inputURL),
  let image = NSImage(data: svgData)
else {
  fail("could not decode SVG")
}

guard
  let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: pixelSize,
    pixelsHigh: pixelSize,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ),
  let context = NSGraphicsContext(bitmapImageRep: bitmap)
else {
  fail("could not create bitmap context")
}

let bounds = NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize)
bitmap.size = bounds.size

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.cgContext.clear(bounds)
context.imageInterpolation = .high
image.draw(
  in: bounds,
  from: NSRect(origin: .zero, size: image.size),
  operation: .sourceOver,
  fraction: 1
)
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
  fail("could not encode PNG")
}

do {
  try pngData.write(to: outputURL, options: .atomic)
} catch {
  fail("could not write PNG: \(error.localizedDescription)")
}
