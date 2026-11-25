import SwiftUI

enum Theme {
  static let background = Color(hex: 0xF8F9FA)
  static let surface = Color(hex: 0xFFFFFF)
  static let ink = Color(hex: 0x141518)
  static let muted = Color(hex: 0x5C626E)
  static let hairline = Color(hex: 0xE2E5EA)
  static let accent = Color(hex: 0x0F766E)   // emerald: on-device, safe, tokens
  static let rose = Color(hex: 0xBE123C)     // raw PII, blocked
  static let amber = Color(hex: 0xB45309)    // cloud boundary
  static let radius: CGFloat = 12
}

extension Color {
  init(hex: UInt32) {
    self.init(.sRGB,
              red: Double((hex >> 16) & 0xFF) / 255,
              green: Double((hex >> 8) & 0xFF) / 255,
              blue: Double(hex & 0xFF) / 255,
              opacity: 1)
  }
}

/// Where an AI or rule step actually ran. Every pipeline step in the UI carries one of these.
enum InferenceSite: Equatable, Sendable {
  case onDeviceModel          // Apple Foundation Models via Firebase AI Logic .systemModel()
  case onDeviceRules          // deterministic Swift code on this iPhone
  case cloud(model: String)   // Gemini via Firebase AI Logic .geminiModel(name:)

  var label: String {
    switch self {
    case .onDeviceModel: return "ON-DEVICE · Apple Foundation Models"
    case .onDeviceRules: return "ON-DEVICE · Swift rules"
    case .cloud: return "IN-CLOUD · Gemini"
    }
  }

  var symbol: String {
    switch self {
    case .onDeviceModel: return "iphone"
    case .onDeviceRules: return "lock.shield"
    case .cloud: return "cloud"
    }
  }

  var tint: Color {
    switch self {
    case .onDeviceModel, .onDeviceRules: return Theme.accent
    case .cloud: return Theme.amber
    }
  }
}

struct SiteBadge: View {
  let site: InferenceSite
  var body: some View {
    Label {
      Text(site.label).font(.caption2.weight(.semibold)).tracking(0.4)
    } icon: {
      Image(systemName: site.symbol).font(.caption2.weight(.semibold))
    }
    .foregroundStyle(site.tint)
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(site.tint.opacity(0.08), in: Capsule())
    .overlay(Capsule().strokeBorder(site.tint.opacity(0.35), lineWidth: 1))
    .accessibilityLabel(site.label)
  }
}

struct Card<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 14) { content }
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
      .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.hairline, lineWidth: 1))
  }
}

struct StageHeader: View {
  let step: String
  let title: String
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(step).font(.caption2.monospaced().weight(.semibold)).foregroundStyle(Theme.muted).tracking(0.8)
      Text(title).font(.headline).foregroundStyle(Theme.ink)
    }
  }
}

struct PrimaryButtonStyle: ButtonStyle {
  var tint: Color = Theme.accent
  @Environment(\.isEnabled) private var isEnabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background((isEnabled ? tint : Theme.muted.opacity(0.45)).opacity(configuration.isPressed ? 0.85 : 1),
                  in: RoundedRectangle(cornerRadius: 10))
  }
}

struct SecondaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.footnote.weight(.semibold))
      .foregroundStyle(isEnabled ? Theme.ink : Theme.muted)
      .padding(.horizontal, 12)
      .frame(minHeight: 36)
      .background(configuration.isPressed ? Theme.hairline.opacity(0.6) : Theme.surface,
                  in: RoundedRectangle(cornerRadius: 8))
      .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.hairline, lineWidth: 1))
  }
}

enum TokenStyling {
  /// Renders bracket tokens in emerald monospace; restored originals (when given) in rose.
  static func attributed(_ text: String, highlightOriginals originals: [String] = []) -> AttributedString {
    var result = AttributedString(text)
    result.foregroundColor = Theme.ink
    let ns = text as NSString
    for range in PIIShield.aliasRanges(in: text) {
      if let r = Range(range, in: text), let ar = Range(r, in: result) {
        result[ar].foregroundColor = Theme.accent
        result[ar].font = .system(.footnote, design: .monospaced).weight(.semibold)
      }
    }
    for original in originals where !original.isEmpty {
      var search = NSRange(location: 0, length: ns.length)
      while true {
        let found = ns.range(of: original, options: [.literal], range: search)
        if found.location == NSNotFound { break }
        if let r = Range(found, in: text), let ar = Range(r, in: result) {
          result[ar].foregroundColor = Theme.rose
        }
        let next = found.location + found.length
        search = NSRange(location: next, length: ns.length - next)
      }
    }
    return result
  }
}
