import Foundation

// Swift port of src/core/preFlightGuard.ts — the Layer 3 circuit breaker.
// Runs on the exact outbound string right before any cloud call; a failure blocks the call.

struct LeakFinding: Equatable, Sendable {
  enum Source: String, Sendable { case vaultOriginal, rawPattern }
  let source: Source
  let reason: String
  /// Raw matched text. Shown in the UI only in masked form; never logged or sent.
  let matchedSnippet: String

  var maskedSnippet: String {
    guard let first = matchedSnippet.first else { return "" }
    return "\(first)" + String(repeating: "•", count: max(3, min(matchedSnippet.count - 1, 10)))
  }
}

struct Layer3Result: Equatable, Sendable {
  let passed: Bool
  let leaks: [LeakFinding]
  let inspectedChars: Int
  let checkedValues: Int
}

enum PreFlightGuard {
  /// Formats that can never legitimately appear raw in an outbound payload.
  static let hardBlockRoles: Set<SemanticRole> = [
    .email, .bankAccount, .secretKey, .medicalID, .sensitiveDate, .address, .phone,
  ]

  static func assertZeroLeak(payload: String, vault: Vault) -> Layer3Result {
    var leaks: [LeakFinding] = []
    let ns = payload as NSString
    let full = NSRange(location: 0, length: ns.length)
    let aliases = PIIShield.aliasRanges(in: payload)

    // 1. No original vault value may remain (case-insensitive for names, parties, orgs, emails).
    for entry in vault.entries where !entry.originalValue.isEmpty {
      let pattern = NSRegularExpression.escapedPattern(for: entry.originalValue)
      let fold = PIIShield.matchesCaseInsensitively(entry.role, entry.originalValue)
      let re = PIIShield.regex(pattern, caseInsensitive: fold)
      for m in re.matches(in: payload, range: full) {
        let insideAlias = aliases.contains { $0.location <= m.range.location && NSMaxRange(m.range) <= NSMaxRange($0) }
        if insideAlias { continue }
        leaks.append(LeakFinding(source: .vaultOriginal,
                                 reason: "Original value for \(entry.token) remains in the payload.",
                                 matchedSnippet: ns.substring(with: m.range)))
        break
      }
    }

    // 2. Independent format checks: raw email / IBAN / phone / date / address / SSN patterns.
    for c in PIIShield.scanDeterministic(payload) {
      let ssnLike = c.role == .idNumber
        && c.value.range(of: #"^(?:\d{3}-\d{2}-\d{4}|[A-Z][12]\d{8})$"#, options: .regularExpression) != nil
      if hardBlockRoles.contains(c.role) || ssnLike {
        leaks.append(LeakFinding(source: .rawPattern, reason: "Raw \(c.role.rawValue) pattern remains in the payload.",
                                 matchedSnippet: c.value))
      }
    }

    // 3. Context-anchored names ("represented by Jane Doe", "Acme LLC (\"Client\")") even if no model saw them.
    for c in PIIShield.scanContextual(payload) {
      if leaks.contains(where: { $0.matchedSnippet.lowercased() == c.value.lowercased() }) { continue }
      leaks.append(LeakFinding(source: .rawPattern, reason: "Unredacted \(c.role.rawValue) remains in the payload.",
                               matchedSnippet: c.value))
    }

    return Layer3Result(passed: leaks.isEmpty, leaks: leaks, inspectedChars: payload.count,
                        checkedValues: vault.entries.count)
  }
}
