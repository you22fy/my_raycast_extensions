import AppKit
import CoreImage
import Foundation

enum BridgeError: Error, CustomStringConvertible {
  case invalidArguments
  case unsupportedImage(String)
  case clipboardMissingImage
  case invalidColor(String)
  case invalidOperation(String)
  case renderFailed(String)

  var description: String {
    switch self {
    case .invalidArguments:
      return "invalid arguments"
    case .unsupportedImage(let path):
      return "unsupported image: \(path)"
    case .clipboardMissingImage:
      return "clipboard does not contain an image"
    case .invalidColor(let color):
      return "invalid color: \(color)"
    case .invalidOperation(let operation):
      return "invalid operation: \(operation)"
    case .renderFailed(let reason):
      return "render failed: \(reason)"
    }
  }
}

enum EditorTool: Int {
  case select = 0
  case filledRectangle = 1
  case outlineRectangle = 2
  case blur = 3
}

func fileURL(from input: String) -> URL {
  if let url = URL(string: input), url.scheme == "file" {
    return url
  }

  return URL(fileURLWithPath: input)
}

func loadImage(from input: String) throws -> NSImage {
  let url = fileURL(from: input)
  guard let image = NSImage(contentsOf: url) else {
    throw BridgeError.unsupportedImage(input)
  }
  return image
}

func pngData(from image: NSImage) throws -> Data {
  guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
  else {
    throw BridgeError.unsupportedImage("could not convert image")
  }
  return png
}

func writeClipboardImage(to outputPath: String) throws {
  let board = NSPasteboard.general
  if let directPng = board.data(forType: .png) {
    try directPng.write(to: URL(fileURLWithPath: outputPath))
    return
  }

  guard let image = NSImage(pasteboard: board) else {
    throw BridgeError.clipboardMissingImage
  }
  try pngData(from: image).write(to: URL(fileURLWithPath: outputPath))
}

func writeFileImage(from inputPath: String, to outputPath: String) throws {
  let image = try loadImage(from: inputPath)
  try pngData(from: image).write(to: URL(fileURLWithPath: outputPath))
}

func writeImage(_ image: NSImage, to outputPath: String) throws {
  try pngData(from: image).write(to: URL(fileURLWithPath: outputPath))
}

func color(from hex: String) throws -> NSColor {
  let cleaned = hex
    .trimmingCharacters(in: .whitespacesAndNewlines)
    .replacingOccurrences(of: "#", with: "")
  let expanded = cleaned.count == 3
    ? cleaned.map { "\($0)\($0)" }.joined()
    : cleaned

  guard expanded.count == 6, let value = Int(expanded, radix: 16) else {
    throw BridgeError.invalidColor(hex)
  }

  let red = CGFloat((value >> 16) & 0xff) / 255.0
  let green = CGFloat((value >> 8) & 0xff) / 255.0
  let blue = CGFloat(value & 0xff) / 255.0
  return NSColor(calibratedRed: red, green: green, blue: blue, alpha: 1)
}

func imageSize(for image: NSImage) -> NSSize {
  if image.size.width > 0, image.size.height > 0 {
    return image.size
  }

  if let representation = image.representations.first {
    return NSSize(width: representation.pixelsWide, height: representation.pixelsHigh)
  }

  return .zero
}

func ciRect(fromTopLeftX x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, imageSize: NSSize, extent: CGRect) -> CGRect {
  let scaleX = extent.width / imageSize.width
  let scaleY = extent.height / imageSize.height
  return CGRect(
    x: extent.minX + x * scaleX,
    y: extent.minY + extent.height - (y + height) * scaleY,
    width: width * scaleX,
    height: height * scaleY
  )
}

func draw(base image: NSImage, render: (_ size: NSSize) throws -> Void) throws -> NSImage {
  let size = imageSize(for: image)
  let target = NSImage(size: size)
  target.lockFocus()
  defer { target.unlockFocus() }
  image.draw(in: NSRect(origin: .zero, size: size))
  try render(size)
  return target
}

func addText(
  inputPath: String,
  outputPath: String,
  text: String,
  x: CGFloat,
  y: CGFloat,
  fontSize: CGFloat,
  hexColor: String
) throws {
  let image = try loadImage(from: inputPath)
  let colorValue = try color(from: hexColor)
  let result = try draw(base: image) { size in
    let lines = text.components(separatedBy: .newlines)
    let estimatedHeight = max(fontSize * CGFloat(max(lines.count, 1)) * 1.28, fontSize * 1.4)
    let rect = NSRect(
      x: x,
      y: size.height - y - estimatedHeight,
      width: max(size.width - x - 8, 40),
      height: estimatedHeight + fontSize
    )
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineBreakMode = .byWordWrapping

    let shadow = NSShadow()
    shadow.shadowBlurRadius = 8
    shadow.shadowOffset = NSSize(width: 0, height: -2)
    shadow.shadowColor = NSColor(calibratedWhite: 0.1, alpha: 0.15)

    let attributes: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: fontSize, weight: .bold),
      .foregroundColor: colorValue,
      .paragraphStyle: paragraph,
      .shadow: shadow
    ]

    (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes)
  }
  try writeImage(result, to: outputPath)
}

func drawRectangle(
  inputPath: String,
  outputPath: String,
  x: CGFloat,
  y: CGFloat,
  width: CGFloat,
  height: CGFloat,
  strokeWidth: CGFloat,
  hexColor: String,
  filled: Bool
) throws {
  let image = try loadImage(from: inputPath)
  let colorValue = try color(from: hexColor)
  let result = try draw(base: image) { size in
    let rect = NSRect(x: x, y: size.height - y - height, width: width, height: height)
    if filled {
      colorValue.setFill()
      rect.fill()
    } else {
      colorValue.setStroke()
      let path = NSBezierPath(rect: rect)
      path.lineWidth = strokeWidth
      path.stroke()
    }
  }
  try writeImage(result, to: outputPath)
}

func blurRegion(
  inputPath: String,
  outputPath: String,
  x: CGFloat,
  y: CGFloat,
  width: CGFloat,
  height: CGFloat,
  radius: CGFloat
) throws {
  let image = try loadImage(from: inputPath)
  let size = imageSize(for: image)
  guard
    let tiff = image.tiffRepresentation,
    let ciImage = CIImage(data: tiff)
  else {
    throw BridgeError.renderFailed("could not prepare CIImage")
  }

  guard let blurFilter = CIFilter(name: "CIGaussianBlur") else {
    throw BridgeError.renderFailed("could not create blur filter")
  }
  blurFilter.setValue(ciImage, forKey: kCIInputImageKey)
  blurFilter.setValue(radius, forKey: kCIInputRadiusKey)

  guard let blurredOutput = blurFilter.outputImage?.cropped(to: ciImage.extent) else {
    throw BridgeError.renderFailed("blur filter returned no image")
  }

  let rect = ciRect(
    fromTopLeftX: x,
    y: y,
    width: width,
    height: height,
    imageSize: size,
    extent: ciImage.extent
  )
  let maskWidth = Int(size.width.rounded(.up))
  let maskHeight = Int(size.height.rounded(.up))
  guard
    let maskContext = CGContext(
      data: nil,
      width: maskWidth,
      height: maskHeight,
      bitsPerComponent: 8,
      bytesPerRow: maskWidth,
      space: CGColorSpaceCreateDeviceGray(),
      bitmapInfo: CGImageAlphaInfo.none.rawValue
    )
  else {
    throw BridgeError.renderFailed("could not create mask context")
  }

  maskContext.setFillColor(gray: 0, alpha: 1)
  maskContext.fill(CGRect(x: 0, y: 0, width: maskWidth, height: maskHeight))
  maskContext.setFillColor(gray: 1, alpha: 1)
  maskContext.fill(rect)

  guard let maskImage = maskContext.makeImage() else {
    throw BridgeError.renderFailed("could not create mask image")
  }

  guard let blendFilter = CIFilter(name: "CIBlendWithMask") else {
    throw BridgeError.renderFailed("could not create blend filter")
  }
  blendFilter.setValue(blurredOutput, forKey: kCIInputImageKey)
  blendFilter.setValue(ciImage, forKey: kCIInputBackgroundImageKey)
  blendFilter.setValue(CIImage(cgImage: maskImage), forKey: kCIInputMaskImageKey)

  guard
    let outputCIImage = blendFilter.outputImage?.cropped(to: ciImage.extent)
  else {
    throw BridgeError.renderFailed("blend filter returned no image")
  }

  let ciContext = CIContext(options: nil)
  guard let cgImage = ciContext.createCGImage(outputCIImage, from: ciImage.extent) else {
    throw BridgeError.renderFailed("could not create output CGImage")
  }

  let representation = NSBitmapImageRep(cgImage: cgImage)
  let output = NSImage(size: size)
  output.addRepresentation(representation)
  try writeImage(output, to: outputPath)
}

enum ResizeHandle {
  case topLeft
  case topRight
  case bottomLeft
  case bottomRight
}

final class EditorObject {
  let id: UUID
  var tool: EditorTool
  var rect: CGRect
  var text: String
  var color: NSColor
  var fontSize: CGFloat
  var strokeWidth: CGFloat
  var blurRadius: CGFloat

  init(
    id: UUID = UUID(),
    tool: EditorTool,
    rect: CGRect,
    text: String,
    color: NSColor,
    fontSize: CGFloat,
    strokeWidth: CGFloat,
    blurRadius: CGFloat
  ) {
    self.id = id
    self.tool = tool
    self.rect = rect
    self.text = text
    self.color = color
    self.fontSize = fontSize
    self.strokeWidth = strokeWidth
    self.blurRadius = blurRadius
  }

  func copy() -> EditorObject {
    EditorObject(
      id: id,
      tool: tool,
      rect: rect,
      text: text,
      color: color,
      fontSize: fontSize,
      strokeWidth: strokeWidth,
      blurRadius: blurRadius
    )
  }
}

final class InteractiveEditorState {
  let baseImage: NSImage
  var tool: EditorTool = .filledRectangle
  var color = NSColor.systemRed
  var strokeWidth: CGFloat = 4
  var blurRadius: CGFloat = 14
  var objects: [EditorObject] = []
  var selectedId: UUID?
  var undoStack: [[EditorObject]] = []
  var redoStack: [[EditorObject]] = []
  let outputPath: String

  init(image: NSImage, outputPath: String) {
    self.baseImage = image
    self.outputPath = outputPath
  }

  var selectedObject: EditorObject? {
    guard let selectedId else { return nil }
    return objects.first { $0.id == selectedId }
  }

  func pushUndo() {
    undoStack.append(objects.map { $0.copy() })
    redoStack.removeAll()
  }

  func undo() {
    guard let previous = undoStack.popLast() else { return }
    redoStack.append(objects.map { $0.copy() })
    objects = previous.map { $0.copy() }
    selectedId = objects.last?.id
  }

  func redo() {
    guard let next = redoStack.popLast() else { return }
    undoStack.append(objects.map { $0.copy() })
    objects = next.map { $0.copy() }
    selectedId = objects.last?.id
  }

  func addObject(tool: EditorTool, rect: CGRect) {
    pushUndo()
    let normalized = normalizeRect(rect)
    let object = EditorObject(
      tool: tool,
      rect: normalized,
      text: "",
      color: color,
      fontSize: 0,
      strokeWidth: strokeWidth,
      blurRadius: blurRadius
    )
    objects.append(object)
    selectedId = object.id
    self.tool = .select
  }

  func updateSelectedFromControls() {
    guard let selectedObject else { return }
    pushUndo()
    selectedObject.color = color
    selectedObject.blurRadius = blurRadius
    selectedObject.strokeWidth = strokeWidth
  }

  func selectObject(id: UUID?) {
    selectedId = id
    guard let selectedObject else { return }
    color = selectedObject.color
    blurRadius = selectedObject.blurRadius
    strokeWidth = selectedObject.strokeWidth
  }

  func hitTest(_ point: CGPoint) -> EditorObject? {
    for object in objects.reversed() {
      if object.rect.insetBy(dx: -8, dy: -8).contains(point) {
        return object
      }
    }
    return nil
  }

  func handleHitTest(_ point: CGPoint) -> ResizeHandle? {
    guard let selectedObject else { return nil }
    let handles = resizeHandleRects(for: selectedObject.rect)
    for (handle, rect) in handles {
      if rect.contains(point) {
        return handle
      }
    }
    return nil
  }

  func resizeHandleRects(for rect: CGRect) -> [(ResizeHandle, CGRect)] {
    let size: CGFloat = 12
    return [
      (.topLeft, CGRect(x: rect.minX - size / 2, y: rect.minY - size / 2, width: size, height: size)),
      (.topRight, CGRect(x: rect.maxX - size / 2, y: rect.minY - size / 2, width: size, height: size)),
      (.bottomLeft, CGRect(x: rect.minX - size / 2, y: rect.maxY - size / 2, width: size, height: size)),
      (.bottomRight, CGRect(x: rect.maxX - size / 2, y: rect.maxY - size / 2, width: size, height: size)),
    ]
  }

  func moveSelected(by delta: CGPoint) {
    guard let selectedObject else { return }
    selectedObject.rect.origin.x += delta.x
    selectedObject.rect.origin.y += delta.y
    selectedObject.rect = clampRect(selectedObject.rect)
  }

  func resizeSelected(to point: CGPoint, handle: ResizeHandle) {
    guard let selectedObject else { return }
    var rect = selectedObject.rect
    switch handle {
    case .topLeft:
      rect = CGRect(x: point.x, y: point.y, width: rect.maxX - point.x, height: rect.maxY - point.y)
    case .topRight:
      rect = CGRect(x: rect.minX, y: point.y, width: point.x - rect.minX, height: rect.maxY - point.y)
    case .bottomLeft:
      rect = CGRect(x: point.x, y: rect.minY, width: rect.maxX - point.x, height: point.y - rect.minY)
    case .bottomRight:
      rect = CGRect(x: rect.minX, y: rect.minY, width: point.x - rect.minX, height: point.y - rect.minY)
    }
    selectedObject.rect = clampRect(normalizeRect(rect))
  }

  func renderedImage() throws -> NSImage {
    var current = try draw(base: baseImage) { _ in }
    for object in objects {
      current = try render(object: object, on: current)
    }
    return current
  }

  private func render(object: EditorObject, on image: NSImage) throws -> NSImage {
    let tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("raycast-my-image-editor-interactive", isDirectory: true)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    let token = UUID().uuidString
    let inputPath = tempDir.appendingPathComponent("\(token)-input.png").path
    let outputPath = tempDir.appendingPathComponent("\(token)-output.png").path

    try writeImage(image, to: inputPath)
    switch object.tool {
    case .filledRectangle, .outlineRectangle:
      try drawRectangle(
        inputPath: inputPath,
        outputPath: outputPath,
        x: object.rect.minX,
        y: object.rect.minY,
        width: object.rect.width,
        height: object.rect.height,
        strokeWidth: object.strokeWidth,
        hexColor: object.color.hexString,
        filled: object.tool == .filledRectangle
      )
    case .blur:
      try blurRegion(
        inputPath: inputPath,
        outputPath: outputPath,
        x: object.rect.minX,
        y: object.rect.minY,
        width: object.rect.width,
        height: object.rect.height,
        radius: object.blurRadius
      )
    case .select:
      break
    }
    return try loadImage(from: outputPath)
  }

  private func normalizeRect(_ rect: CGRect) -> CGRect {
    CGRect(
      x: min(rect.minX, rect.maxX),
      y: min(rect.minY, rect.maxY),
      width: abs(rect.width),
      height: abs(rect.height)
    )
  }

  private func clampRect(_ rect: CGRect) -> CGRect {
    let size = imageSize(for: baseImage)
    let width = min(max(rect.width, 8), size.width)
    let height = min(max(rect.height, 8), size.height)
    let x = min(max(rect.minX, 0), max(size.width - width, 0))
    let y = min(max(rect.minY, 0), max(size.height - height, 0))
    return CGRect(x: x, y: y, width: width, height: height)
  }
}

extension NSColor {
  var hexString: String {
    let converted = usingColorSpace(.deviceRGB) ?? self
    let red = Int(round(converted.redComponent * 255))
    let green = Int(round(converted.greenComponent * 255))
    let blue = Int(round(converted.blueComponent * 255))
    return String(format: "#%02x%02x%02x", red, green, blue)
  }
}

final class ImageCanvasView: NSView {
  let state: InteractiveEditorState
  enum InteractionMode {
    case none
    case creating(EditorTool)
    case moving
    case resizing(ResizeHandle)
  }

  var mode: InteractionMode = .none
  var dragStart: CGPoint?
  var dragCurrent: CGPoint?
  var lastDragPoint: CGPoint?
  var onCreateComplete: (() -> Void)?

  init(state: InteractiveEditorState) {
    self.state = state
    super.init(frame: .zero)
    wantsLayer = true
    layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
  }

  required init?(coder: NSCoder) {
    nil
  }

  override var isFlipped: Bool {
    true
  }

  override var acceptsFirstResponder: Bool {
    true
  }

  private var imageFrame: CGRect {
    let size = imageSize(for: state.baseImage)
    guard size.width > 0, size.height > 0, bounds.width > 0, bounds.height > 0 else {
      return .zero
    }

    let scale = min(bounds.width / size.width, bounds.height / size.height)
    let width = size.width * scale
    let height = size.height * scale
    return CGRect(
      x: (bounds.width - width) / 2,
      y: (bounds.height - height) / 2,
      width: width,
      height: height
    )
  }

  override func draw(_ dirtyRect: NSRect) {
    NSColor(calibratedWhite: 0.94, alpha: 1).setFill()
    bounds.fill()

    let frame = imageFrame
    NSColor.white.setFill()
    frame.fill()
    state.baseImage.draw(in: frame)
    drawObjectPreviews()

    if let selection = currentImageSelection() {
      let viewRect = viewRect(fromImageRect: selection)
      NSColor.systemBlue.withAlphaComponent(0.16).setFill()
      viewRect.fill()
      NSColor.systemBlue.setStroke()
      let path = NSBezierPath(rect: viewRect)
      path.lineWidth = 2
      path.setLineDash([7, 5], count: 2, phase: 0)
      path.stroke()
    }

    if let selected = state.selectedObject {
      drawSelection(for: selected)
    }
  }

  override func mouseDown(with event: NSEvent) {
    window?.makeFirstResponder(self)
    guard let point = imagePoint(from: convert(event.locationInWindow, from: nil)) else {
      return
    }

    if let handle = state.handleHitTest(point) {
      state.pushUndo()
      mode = .resizing(handle)
      dragStart = point
      dragCurrent = point
      return
    }

    if let hit = state.hitTest(point) {
      state.selectObject(id: hit.id)
      state.pushUndo()
      mode = .moving
      lastDragPoint = point
      needsDisplay = true
      return
    }

    state.selectObject(id: nil)
    dragStart = point
    dragCurrent = point
    mode = state.tool == .select ? .none : .creating(state.tool)
    needsDisplay = true
  }

  override func mouseDragged(with event: NSEvent) {
    guard let point = imagePoint(from: convert(event.locationInWindow, from: nil)) else {
      return
    }

    switch mode {
    case .moving:
      if let lastDragPoint {
        state.moveSelected(by: CGPoint(x: point.x - lastDragPoint.x, y: point.y - lastDragPoint.y))
      }
      lastDragPoint = point
    case .resizing(let handle):
      state.resizeSelected(to: point, handle: handle)
    case .creating:
      dragCurrent = point
    case .none:
      break
    }
    needsDisplay = true
  }

  override func mouseUp(with event: NSEvent) {
    defer {
      dragStart = nil
      dragCurrent = nil
      lastDragPoint = nil
      mode = .none
      needsDisplay = true
    }

    if case .creating(let tool) = mode {
      dragCurrent = imagePoint(from: convert(event.locationInWindow, from: nil))
      guard var selection = currentImageSelection() else {
        return
      }
      if selection.width < 12 || selection.height < 12 {
        selection = CGRect(x: selection.minX, y: selection.minY, width: 80, height: 60)
      }
      state.addObject(tool: tool, rect: selection)
      onCreateComplete?()
    }
  }

  override func keyDown(with event: NSEvent) {
    let isCommand = event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.command)
    guard isCommand, event.charactersIgnoringModifiers?.lowercased() == "z" else {
      super.keyDown(with: event)
      return
    }

    let isShift = event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.shift)
    if isShift {
      state.redo()
    } else {
      state.undo()
    }
    needsDisplay = true
  }

  private func imagePoint(from viewPoint: CGPoint) -> CGPoint? {
    let frame = imageFrame
    guard frame.contains(viewPoint) else {
      return nil
    }

    let size = imageSize(for: state.baseImage)
    return CGPoint(
      x: (viewPoint.x - frame.minX) / frame.width * size.width,
      y: (viewPoint.y - frame.minY) / frame.height * size.height
    )
  }

  private func viewRect(fromImageRect rect: CGRect) -> CGRect {
    let frame = imageFrame
    let size = imageSize(for: state.baseImage)
    return CGRect(
      x: frame.minX + rect.minX / size.width * frame.width,
      y: frame.minY + rect.minY / size.height * frame.height,
      width: rect.width / size.width * frame.width,
      height: rect.height / size.height * frame.height
    )
  }

  private func currentImageSelection() -> CGRect? {
    guard let start = dragStart, let current = dragCurrent else {
      return nil
    }
    return CGRect(
      x: min(start.x, current.x),
      y: min(start.y, current.y),
      width: abs(current.x - start.x),
      height: abs(current.y - start.y)
    )
  }

  private func drawSelection(for object: EditorObject) {
    let selectedViewRect = viewRect(fromImageRect: object.rect)
    NSColor.controlAccentColor.setStroke()
    let outline = NSBezierPath(rect: selectedViewRect)
    outline.lineWidth = 2
    outline.stroke()

    for (_, imageHandle) in state.resizeHandleRects(for: object.rect) {
      let handle = viewRect(fromImageRect: imageHandle)
      NSColor.white.setFill()
      handle.fill()
      NSColor.controlAccentColor.setStroke()
      NSBezierPath(rect: handle).stroke()
    }
  }

  private func drawObjectPreviews() {
    for object in state.objects {
      let rect = viewRect(fromImageRect: object.rect)
      switch object.tool {
      case .filledRectangle:
        object.color.setFill()
        rect.fill()
      case .outlineRectangle:
        object.color.setStroke()
        let path = NSBezierPath(rect: rect)
        path.lineWidth = max(1, object.strokeWidth * rect.width / max(object.rect.width, 1))
        path.stroke()
      case .blur:
        NSColor.black.withAlphaComponent(0.18).setFill()
        rect.fill()
        NSColor.black.withAlphaComponent(0.35).setStroke()
        let path = NSBezierPath(rect: rect)
        path.lineWidth = 2
        path.setLineDash([6, 4], count: 2, phase: 0)
        path.stroke()
      case .select:
        break
      }
    }
  }
}

final class InteractiveEditorController: NSObject, NSWindowDelegate {
  let state: InteractiveEditorState
  let window: NSWindow
  let canvas: ImageCanvasView
  var toolControl: NSSegmentedControl?

  init(inputPath: String, outputPath: String) throws {
    state = InteractiveEditorState(image: try loadImage(from: inputPath), outputPath: outputPath)
    canvas = ImageCanvasView(state: state)
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1080, height: 760),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    super.init()
    window.title = "My Image Editor"
    window.delegate = self
    window.center()
    window.contentView = makeContentView()
  }

  func show() {
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(canvas)
  }

  private func makeContentView() -> NSView {
    let root = NSView()
    root.translatesAutoresizingMaskIntoConstraints = false

    let toolbar = NSStackView()
    toolbar.orientation = .horizontal
    toolbar.alignment = .centerY
    toolbar.spacing = 10
    toolbar.edgeInsets = NSEdgeInsets(top: 10, left: 12, bottom: 10, right: 12)
    toolbar.translatesAutoresizingMaskIntoConstraints = false

    let segmented = NSSegmentedControl(labels: ["Select", "Filled", "Outline", "Blur"], trackingMode: .selectOne, target: self, action: #selector(toolChanged(_:)))
    segmented.selectedSegment = 1
    toolControl = segmented
    canvas.onCreateComplete = { [weak self] in
      self?.toolControl?.selectedSegment = 0
    }

    let colorWell = NSColorWell()
    colorWell.color = state.color
    colorWell.target = self
    colorWell.action = #selector(colorChanged(_:))

    let strokeLabel = NSTextField(labelWithString: "Stroke")
    let strokeSlider = NSSlider(value: Double(state.strokeWidth), minValue: 1, maxValue: 24, target: self, action: #selector(strokeChanged(_:)))
    strokeSlider.widthAnchor.constraint(equalToConstant: 100).isActive = true

    let blurLabel = NSTextField(labelWithString: "Blur")
    let blurSlider = NSSlider(value: Double(state.blurRadius), minValue: 2, maxValue: 40, target: self, action: #selector(blurChanged(_:)))
    blurSlider.widthAnchor.constraint(equalToConstant: 100).isActive = true

    let spacer = NSView()
    spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)

    let undoButton = NSButton(title: "Undo", target: self, action: #selector(undo))
    let redoButton = NSButton(title: "Redo", target: self, action: #selector(redo))
    let applyButton = NSButton(title: "Apply Style", target: self, action: #selector(applyStyle))
    let cancelButton = NSButton(title: "Cancel", target: self, action: #selector(cancel))
    let doneButton = NSButton(title: "Done", target: self, action: #selector(done))
    doneButton.bezelStyle = .rounded
    doneButton.keyEquivalent = "\r"

    [segmented, colorWell, strokeLabel, strokeSlider, blurLabel, blurSlider, applyButton, spacer, undoButton, redoButton, cancelButton, doneButton].forEach {
      toolbar.addArrangedSubview($0)
    }

    canvas.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(toolbar)
    root.addSubview(canvas)

    NSLayoutConstraint.activate([
      toolbar.topAnchor.constraint(equalTo: root.topAnchor),
      toolbar.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      toolbar.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      canvas.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
      canvas.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      canvas.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      canvas.bottomAnchor.constraint(equalTo: root.bottomAnchor),
    ])

    return root
  }

  @objc private func toolChanged(_ sender: NSSegmentedControl) {
    state.tool = EditorTool(rawValue: sender.selectedSegment) ?? .filledRectangle
    window.makeFirstResponder(canvas)
  }

  @objc private func colorChanged(_ sender: NSColorWell) {
    state.color = sender.color
  }

  @objc private func strokeChanged(_ sender: NSSlider) {
    state.strokeWidth = CGFloat(sender.doubleValue)
  }

  @objc private func blurChanged(_ sender: NSSlider) {
    state.blurRadius = CGFloat(sender.doubleValue)
  }

  @objc private func applyStyle() {
    state.updateSelectedFromControls()
    canvas.needsDisplay = true
  }

  @objc private func undo() {
    state.undo()
    canvas.needsDisplay = true
  }

  @objc private func redo() {
    state.redo()
    canvas.needsDisplay = true
  }

  @objc private func done() {
    do {
      try writeImage(try state.renderedImage(), to: state.outputPath)
      exit(0)
    } catch {
      FileHandle.standardError.write(Data((String(describing: error) + "\n").utf8))
      exit(1)
    }
  }

  @objc private func cancel() {
    FileHandle.standardError.write(Data("cancelled\n".utf8))
    exit(2)
  }

  func windowWillClose(_ notification: Notification) {
    cancel()
  }
}

func runInteractiveEditor(inputPath: String, outputPath: String) throws {
  let app = NSApplication.shared
  app.setActivationPolicy(.regular)
  let controller = try InteractiveEditorController(inputPath: inputPath, outputPath: outputPath)
  controller.show()
  app.activate(ignoringOtherApps: true)
  app.run()
}

let args = CommandLine.arguments

do {
  switch args.dropFirst().first {
  case "clipboard":
    guard args.count == 3 else {
      throw BridgeError.invalidArguments
    }
    try writeClipboardImage(to: args[2])
  case "convert":
    guard args.count == 4 else {
      throw BridgeError.invalidArguments
    }
    try writeFileImage(from: args[2], to: args[3])
  case "text":
    guard args.count == 9 else {
      throw BridgeError.invalidArguments
    }
    try addText(
      inputPath: args[2],
      outputPath: args[3],
      text: args[4],
      x: CGFloat(Double(args[5]) ?? 0),
      y: CGFloat(Double(args[6]) ?? 0),
      fontSize: CGFloat(Double(args[7]) ?? 0),
      hexColor: args[8]
    )
  case "rectangle":
    guard args.count == 10 else {
      throw BridgeError.invalidArguments
    }
      try drawRectangle(
        inputPath: args[2],
        outputPath: args[3],
        x: CGFloat(Double(args[4]) ?? 0),
        y: CGFloat(Double(args[5]) ?? 0),
        width: CGFloat(Double(args[6]) ?? 0),
        height: CGFloat(Double(args[7]) ?? 0),
        strokeWidth: CGFloat(Double(args[8]) ?? 0),
        hexColor: args[9],
        filled: true
      )
  case "outline":
    guard args.count == 10 else {
      throw BridgeError.invalidArguments
    }
    try drawRectangle(
      inputPath: args[2],
      outputPath: args[3],
      x: CGFloat(Double(args[4]) ?? 0),
      y: CGFloat(Double(args[5]) ?? 0),
      width: CGFloat(Double(args[6]) ?? 0),
      height: CGFloat(Double(args[7]) ?? 0),
      strokeWidth: CGFloat(Double(args[8]) ?? 0),
      hexColor: args[9],
      filled: false
    )
  case "blur":
    guard args.count == 9 else {
      throw BridgeError.invalidArguments
    }
    try blurRegion(
      inputPath: args[2],
      outputPath: args[3],
      x: CGFloat(Double(args[4]) ?? 0),
      y: CGFloat(Double(args[5]) ?? 0),
      width: CGFloat(Double(args[6]) ?? 0),
      height: CGFloat(Double(args[7]) ?? 0),
      radius: CGFloat(Double(args[8]) ?? 0)
    )
  case "interactive":
    guard args.count == 4 else {
      throw BridgeError.invalidArguments
    }
    try runInteractiveEditor(inputPath: args[2], outputPath: args[3])
  default:
    throw BridgeError.invalidOperation(args.dropFirst().first ?? "unknown")
  }
} catch {
  FileHandle.standardError.write(Data((String(describing: error) + "\n").utf8))
  exit(1)
}
