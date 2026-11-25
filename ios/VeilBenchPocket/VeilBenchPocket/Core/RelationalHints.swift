import Foundation

// Swift port of src/core/relationalHints.ts — Split-Knowledge Reasoning.
// The cloud reasons over tokens and coarse relations; the device keeps the facts and does the math.

enum RelationalHint: Equatable, Sendable {
  case moneyCompare(a: String, b: String, relation: String, pctBucket: String)
  case dateOrder(a: String, b: String, relation: String, gapBucket: String)
}

enum RelationalHints {
  static let maxHints = 24

  static func parseMoneyAmount(_ value: String) -> Double? {
    var s = value
    for symbol in ["NT$", "US$", "$", "€", "£", "¥"] { s = s.replacingOccurrences(of: symbol, with: "") }
    s = s.replacingOccurrences(of: #"\b(?:USD|TWD|EUR|GBP)\b"#, with: "", options: [.regularExpression, .caseInsensitive])
    s = s.replacingOccurrences(of: #"[,\s]"#, with: "", options: .regularExpression)
    guard s.range(of: #"^\d+(?:\.\d+)?$"#, options: .regularExpression) != nil, let n = Double(s), n.isFinite else {
      return nil
    }
    return n
  }

  private static let dateFormatters: [DateFormatter] = ["yyyy-MM-dd", "MMMM d, yyyy", "MMM d, yyyy", "MMM. d, yyyy"].map {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = $0
    f.isLenient = false
    return f
  }

  static func parseCalendarDate(_ value: String) -> Date? {
    let normalized = value.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .replacingOccurrences(of: "Sept ", with: "Sep ")
    for f in dateFormatters { if let d = f.date(from: normalized) { return d } }
    return nil
  }

  static func pctBucket(_ pct: Double) -> String {
    pct < 5 ? "<5%" : pct < 15 ? "5-15%" : pct < 30 ? "15-30%" : ">30%"
  }

  static func gapBucket(_ days: Double) -> String {
    days < 7 ? "<7d" : days <= 30 ? "7-30d" : ">30d"
  }

  /// Deterministic, value-free relations between vault tokens (stable order by token number).
  static func build(from vault: Vault) -> [RelationalHint] {
    let entries = vault.entries
    let money: [(String, Double)] = entries.compactMap { e in
      e.role == .moneyAmount ? parseMoneyAmount(e.originalValue).map { (e.token, $0) } : nil
    }
    let dates: [(String, Date)] = entries.compactMap { e in
      e.role == .sensitiveDate ? parseCalendarDate(e.originalValue).map { (e.token, $0) } : nil
    }
    var hints: [RelationalHint] = []
    for i in money.indices {
      for j in money.indices where j > i {
        let (a, x) = money[i], (b, y) = money[j]
        let base = max(x, y) == 0 ? 1 : max(x, y)
        hints.append(.moneyCompare(a: a, b: b, relation: x > y ? ">" : x < y ? "<" : "=",
                                   pctBucket: pctBucket(abs(x - y) / base * 100)))
      }
    }
    for i in dates.indices {
      for j in dates.indices where j > i {
        let (a, x) = dates[i], (b, y) = dates[j]
        hints.append(.dateOrder(a: a, b: b, relation: x < y ? "is before" : x > y ? "is after" : "is the same day as",
                                gapBucket: gapBucket(abs(x.timeIntervalSince(y)) / 86_400)))
      }
    }
    return Array(hints.prefix(maxHints))
  }

  static func format(_ hints: [RelationalHint]) -> String {
    guard !hints.isEmpty else { return "" }
    let lines = hints.map { hint -> String in
      switch hint {
      case let .moneyCompare(a, b, relation, pct):
        return "- \(a) \(relation) \(b) (difference \(pct) of the larger amount)"
      case let .dateOrder(a, b, relation, gap):
        return "- \(a) \(relation) \(b) (gap \(gap))"
      }
    }
    return (["LOCALLY COMPUTED RELATIONS (exact values never leave the device):"] + lines + [
      "When an exact monetary difference matters, write the placeholder {{DIFF:[TOKEN_A]-[TOKEN_B]}};",
      "the user's phone computes it locally. Never guess real amounts.",
    ]).joined(separator: "\n")
  }

  // Lenient about spaces around "-" because models sometimes add them.
  static let diffRegex = PIIShield.regex(#"\{\{DIFF:\s*(\[[A-Z_]+_\d+\])\s*-\s*(\[[A-Z_]+_\d+\])\s*\}\}"#)

  static func formatLikeSource(_ amount: Double, sample: String) -> String {
    let nf = NumberFormatter()
    nf.locale = Locale(identifier: "en_US")
    nf.numberStyle = .decimal
    nf.maximumFractionDigits = 2
    let body = nf.string(from: NSNumber(value: amount)) ?? String(amount)
    if let symbol = sample.range(of: #"NT\$|US\$|[$€£¥]"#, options: .regularExpression).map({ String(sample[$0]) }) {
      return "\(symbol)\(body)"
    }
    if let code = sample.range(of: #"\b(?:USD|TWD|EUR|GBP)\b"#, options: [.regularExpression, .caseInsensitive])
      .map({ String(sample[$0]) }) {
      return "\(code) \(body)"
    }
    return body
  }

  /// Replaces {{DIFF:[A]-[B]}} with e.g. "$6,000 (12.5%)" computed from the vault. Unknown or non-numeric
  /// tokens are left untouched. Tokens themselves are not restored here.
  static func applyLocalMath(_ text: String, vault: Vault) -> String {
    let ns = text as NSString
    var out = text
    for m in diffRegex.matches(in: text, range: NSRange(location: 0, length: ns.length)).reversed() {
      let a = ns.substring(with: m.range(at: 1)), b = ns.substring(with: m.range(at: 2))
      guard let ea = vault.byToken[a], let eb = vault.byToken[b],
            let x = parseMoneyAmount(ea.originalValue), let y = parseMoneyAmount(eb.originalValue),
            max(x, y) > 0, let r = Range(m.range, in: out) else { continue }
      let diff = x - y
      let pct = abs(diff) / max(x, y) * 100
      let rendered = "\(diff < 0 ? "-" : "")\(formatLikeSource(abs(diff), sample: ea.originalValue)) (\(String(format: "%.1f", pct))%)"
      out.replaceSubrange(r, with: rendered)
    }
    return out
  }

  /// Local re-hydration with on-device math, then every token restored from the vault.
  static func rehydrateWithLocalMath(_ text: String, vault: Vault) -> String {
    PIIShield.rehydrate(applyLocalMath(text, vault: vault), vault: vault)
  }

  static func countPlaceholders(_ text: String) -> Int {
    diffRegex.numberOfMatches(in: text, range: NSRange(location: 0, length: (text as NSString).length))
  }
}
