import Foundation

/// Splits long input for the on-device model (small context window) at paragraph, then line, then
/// whitespace boundaries. Chunks are contiguous, so every character is covered exactly once.
enum TextChunker {
  static let defaultMaxChars = 3_000

  static func chunk(_ text: String, maxChars: Int = defaultMaxChars) -> [String] {
    precondition(maxChars > 0)
    guard text.count > maxChars else { return text.isEmpty ? [] : [text] }
    var chunks: [String] = []
    var rest = Substring(text)
    while rest.count > maxChars {
      let window = rest.prefix(maxChars)
      let floor = window.index(window.startIndex, offsetBy: maxChars / 2)
      let cut = window.range(of: "\n\n", options: .backwards, range: floor..<window.endIndex)?.upperBound
        ?? window.range(of: "\n", options: .backwards, range: floor..<window.endIndex)?.upperBound
        ?? window.range(of: " ", options: .backwards, range: floor..<window.endIndex)?.upperBound
        ?? window.endIndex
      chunks.append(String(rest[rest.startIndex..<cut]))
      rest = rest[cut...]
    }
    if !rest.isEmpty { chunks.append(String(rest)) }
    return chunks
  }
}
