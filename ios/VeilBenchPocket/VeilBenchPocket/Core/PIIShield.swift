import Foundation

// Swift port of src/core/piiShield.ts (web app). Pure, deterministic, no network, no AI.
// Offsets are UTF-16 (NSString) so regex ranges and replacement spans always agree.

enum SemanticRole: String, CaseIterable, Sendable {
  case partyClient = "PARTY_CLIENT"
  case partyContractor = "PARTY_CONTRACTOR"
  case personName = "PERSON_NAME"
  case organization = "ORGANIZATION"
  case email = "EMAIL"
  case phone = "PHONE"
  case address = "ADDRESS"
  case idNumber = "ID_NUMBER"
  case bankAccount = "BANK_ACCOUNT"
  case moneyAmount = "MONEY_AMOUNT"
  case medicalID = "MEDICAL_ID"
  case sensitiveDate = "SENSITIVE_DATE"
  case secretKey = "SECRET_KEY"
  case otherPII = "OTHER_PII"

  /// Names, parties and emails also match all-caps / lower-case variants (e.g. document headers).
  var isCaseInsensitive: Bool {
    [.email, .personName, .partyClient, .partyContractor, .organization].contains(self)
  }
}

enum DetectionLayer: String, Sendable {
  case onDevice = "on_device_model"
  case regex = "deterministic_regex"
}

struct PIICandidate: Equatable, Sendable {
  var value: String
  var role: SemanticRole
  var layer: DetectionLayer = .regex
}

struct VaultEntry: Equatable, Sendable, Identifiable {
  let token: String
  let role: SemanticRole
  let originalValue: String
  var occurrences: Int
  let layer: DetectionLayer
  var id: String { token }
}

/// Local-only map between original values and role tokens. Never serialized, never sent.
struct Vault: Sendable {
  private(set) var byToken: [String: VaultEntry] = [:]
  private(set) var tokenForOriginal: [String: String] = [:]
  private var roleCounters: [SemanticRole: Int] = [:]

  var entries: [VaultEntry] {
    byToken.values.sorted { $0.token.compare($1.token, options: .numeric) == .orderedAscending }
  }

  func entry(forOriginal value: String) -> VaultEntry? {
    tokenForOriginal[value].flatMap { byToken[$0] }
  }

  mutating func register(_ candidate: PIICandidate, occurrences: Int, reserved: Set<String>) -> VaultEntry {
    if var existing = entry(forOriginal: candidate.value) {
      existing.occurrences += occurrences
      byToken[existing.token] = existing
      return existing
    }
    var number = roleCounters[candidate.role] ?? 0
    var token: String
    repeat {
      number += 1
      token = "[\(candidate.role.rawValue)_\(number)]"
    } while reserved.contains(token) || byToken[token] != nil
    roleCounters[candidate.role] = number
    let entry = VaultEntry(token: token, role: candidate.role, originalValue: candidate.value,
                           occurrences: occurrences, layer: candidate.layer)
    byToken[token] = entry
    tokenForOriginal[candidate.value] = token
    return entry
  }

  /// Test-only / programmatic insertion (e.g. building a vault for relation hints).
  mutating func insert(value: String, role: SemanticRole) -> VaultEntry {
    register(PIICandidate(value: value, role: role), occurrences: 1, reserved: [])
  }
}

struct AirlockStats: Equatable, Sendable {
  var totalDetected: Int
  var byOnDevice: Int
  var byRegex: Int
  var rawChars: Int
  var sanitizedChars: Int
}

struct AirlockResult: Sendable {
  let sanitizedText: String
  let vault: Vault
  let stats: AirlockStats
}

enum PIIShield {
  // MARK: Regex helpers

  static func regex(_ pattern: String, caseInsensitive: Bool = false) -> NSRegularExpression {
    // Patterns are compile-time constants covered by unit tests; a failure here is a programmer error.
    try! NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : [])
  }

  /// Value of capture group 1 when it participated, else the whole match (mirrors `match[1] ?? match[0]`).
  static func values(of re: NSRegularExpression, in text: String) -> [String] {
    let ns = text as NSString
    return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { m in
      if m.numberOfRanges > 1, m.range(at: 1).location != NSNotFound {
        return ns.substring(with: m.range(at: 1))
      }
      return ns.substring(with: m.range)
    }
  }

  static let roleAlternation = SemanticRole.allCases.map(\.rawValue).joined(separator: "|")
  static let aliasRegex = regex(#"\[(?:"# + roleAlternation + #")_[1-9]\d*\]"#)

  static func aliasRanges(in text: String) -> [NSRange] {
    aliasRegex.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)).map(\.range)
  }

  // MARK: Layer 2a — deterministic format patterns (capture group 1 isolates the value from its label)

  static let deterministicPatterns: [(SemanticRole, NSRegularExpression)] = [
    (.email, regex(#"[A-Z0-9.!#\$%&'*+/=?^_`{|}~\-]{1,64}@[A-Z0-9\-]+(?:\.[A-Z0-9\-]+)*\.[A-Z]{2,63}\b"#, caseInsensitive: true)),
    (.secretKey, regex(#"\b(?:sk-[\w\-]{8,}|AIza[\w\-]{12,}|ghp_[A-Za-z0-9]{8,})"#)),
    (.medicalID, regex(#"\bMRN-\d{4,}\b"#, caseInsensitive: true)),
    (.idNumber, regex(#"\b(?:\d{3}-\d{2}-\d{4}|[A-Z][12]\d{8}|[A-Z]{1,2}\d{7,8}|INV-\d{4}-\d{3,})\b"#)),
    (.bankAccount, regex(#"\b[A-Z]{2}\d{2}(?:[A-Z0-9]{11,30}|(?:[ \-][A-Z0-9]{4}){2,7}(?:[ \-][A-Z0-9]{1,4})?)\b"#)),
    (.bankAccount, regex(#"\b(?:acct|account|routing)(?:\s+(?:number|no\.?))?[ \t]*[:#]?[ \t]*(\d(?:[ \-]?\d){7,17})\b"#, caseInsensitive: true)),
    (.bankAccount, regex(#"(?<!\d)\b\d{4}(?:[ \-]?\d{4}){3}\b(?!\d)"#)),
    // Horizontal whitespace only: a trailing "USD" must never swallow the next line's list number.
    (.moneyAmount, regex(#"(?:NT\$|US\$|[\$€£¥]|\b(?:USD|TWD|EUR|GBP))[ \t]*\d+(?:,\d{3})*(?:\.\d+)?"#, caseInsensitive: true)),
    (.otherPII, regex(#"(?<![\w.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?!\w|\.\d)"#)),
    (.sensitiveDate, regex(#"\b(?:DOB|(?:date of )?birth(?:\s*date)?)\s*[:=]?\s*(\d{4}[\-/]\d{1,2}[\-/]\d{1,2}|\d{1,2}[\-/]\d{1,2}[\-/]\d{4})\b"#, caseInsensitive: true)),
    // Calendar dates are HIPAA Safe Harbor identifiers; relational hints keep their ordering for the cloud.
    (.sensitiveDate, regex(#"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?[ \t]+\d{1,2},[ \t]*\d{4}\b"#)),
    (.sensitiveDate, regex(#"\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b"#)),
    (.address, regex(#"\b\d{1,6}[ \t]+(?:[A-Z][a-z]+[ \t]+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Way|Ct|Court)\.?(?:,[ \t]*(?:Apt|Suite|Ste|Unit)\.?[ \t]*\w+)?(?:,[ \t]*[A-Z][a-zA-Z .]+)?(?:,[ \t]*[A-Z]{2}[ \t]+\d{5}(?:-\d{4})?)?"#)),
    (.idNumber, regex(#"\b(?:Q|PO|SOW)-\d{4}-\d{2,}\b"#)),
    (.phone, regex(#"(?<![\w+])(?:\+\d{1,3}[ .\-]?(?:\(\d{1,4}\)|\d{1,4})(?:[ .\-]?\d){5,10}|(?:\(\d{3}\)[ .\-]?|\d{3}[ .\-])\d{3}[ .\-]\d{4}|(?:\(0[2-8]\) ?|0[2-8]-)\d{3,4}-\d{4}|09\d{2}[\- ]?\d{3}[\- ]?\d{3})\b"#)),
  ]

  static func scanDeterministic(_ text: String) -> [PIICandidate] {
    deterministicPatterns.flatMap { role, re in
      values(of: re, in: text).map { PIICandidate(value: $0, role: role) }
    }
  }

  // MARK: Layer 2b — contextual names, parties, organizations (order matters: party roles win)

  private static let capWord = #"[A-Z][\w&'.\-]*"#
  private static let personName = #"[A-Z][a-z'\-]+(?:[ \t]+[A-Z]\.)?(?:[ \t]+[A-Z][a-z'\-]+){1,2}"#
  private static let orgSuffix = #"(?:LLC|L\.L\.C\.|Inc\.?|INC\.?|Incorporated|Ltd\.?|LTD\.?|Limited|Corp\.?|CORP\.?|Corporation|GmbH|PLC|LLP)"#

  static let contextualPatterns: [(SemanticRole, NSRegularExpression)] = [
    (.partyClient, regex("(\(capWord)(?:[ \\t]+\(capWord)){0,5})[ \\t]*\\([ \\t]*[\"“](?:Client|Customer|Company|Buyer|Licensee)[\"”]")),
    (.partyContractor, regex("(\(capWord)(?:[ \\t]+\(capWord)){0,5})[ \\t]*\\([ \\t]*[\"“](?:Contractor|Consultant|Vendor|Supplier|Provider|Licensor|Seller)[\"”]")),
    (.personName, regex("\\b(?:Client Representative|Representative|represented by|Contractor|Patient|Account Owner|Attention|Attn|Ordering (?:MD|Physician)|[Ss]igned by|[Pp]repared for)[ \\t]*:?[ \\t]+(?:Dr\\.[ \\t]+)?(\(personName))")),
    (.personName, regex("\\bDr\\.[ \\t]+(\(personName.replacingOccurrences(of: "{1,2}", with: "{0,2}")))")),
    (.organization, regex("\\b([A-Z][A-Za-z&'\\-]*(?:[ \\t]+[A-Z][A-Za-z&'\\-]*){0,4}[ \\t]+\(orgSuffix))(?![A-Za-z])")),
    // Labeled street addresses: the value must contain a digit and ends at a column separator or line end.
    (.address, regex(#"\b(?:Address|Addr\.|Residence|Mailing Address)[ \t]*:[ \t]*([^\n|]*?\d[^\n|]*?)(?=[ \t]*(?:\||\n|$))"#)),
  ]

  static func scanContextual(_ text: String) -> [PIICandidate] {
    var seen = Set<String>()
    var result: [PIICandidate] = []
    for (role, re) in contextualPatterns {
      for raw in values(of: re, in: text) {
        let value = raw.trimmingCharacters(in: .whitespaces)
        let key = value.lowercased()
        // Already-tokenized text (e.g. "Address: [ADDRESS_1]") is never a fresh finding.
        if value.count < 3 || value.contains("[") || seen.contains(key) { continue }
        seen.insert(key)
        result.append(PIICandidate(value: value, role: role))
      }
    }
    return result
  }

  static func matchesCaseInsensitively(_ role: SemanticRole, _ value: String) -> Bool {
    value.count >= 4 && role.isCaseInsensitive
  }

  // MARK: On-device candidate hygiene

  /// Defined terms and boilerplate the on-device model sometimes returns as "names".
  private static let genericTerms: Set<String> = [
    "client", "contractor", "customer", "company", "vendor", "supplier", "provider", "buyer", "seller",
    "licensor", "licensee", "consultant", "party", "parties", "agreement", "the client", "the contractor",
    "n/a", "none", "unknown",
  ]

  /// Keeps only on-device findings that literally occur in the source (case-insensitive) and are not
  /// generic defined terms; the model can paraphrase or hallucinate, the vault must not.
  static func sanitizeOnDeviceCandidates(_ candidates: [PIICandidate], in text: String) -> [PIICandidate] {
    var seen = Set<String>()
    return candidates.compactMap { c in
      let value = c.value.trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ".,;:\"'()")))
      let key = value.lowercased()
      guard value.count >= 2, value.count <= 120, !value.contains("["), !genericTerms.contains(key),
            !seen.contains(key),
            text.range(of: value, options: [.caseInsensitive]) != nil else { return nil }
      // Structured formats (IBAN, routing, email, phone, money, dates, IDs) are owned by the deterministic
      // rules, which assign the precise role; the model sometimes mislabels them (e.g. IBAN as ADDRESS).
      if scanDeterministic(value).contains(where: { $0.role != .address }) { return nil }
      seen.insert(key)
      return PIICandidate(value: value, role: c.role, layer: .onDevice)
    }
  }

  // MARK: Longest-match location

  struct Span { let range: NSRange; let candidate: PIICandidate }

  /// Claims longest literal spans first, even when a shorter value starts earlier.
  static func locate(_ text: String, _ candidates: [PIICandidate]) -> [Span] {
    let ns = text as NSString
    var occupied = [Bool](repeating: false, count: ns.length)
    var spans: [Span] = []
    let ordered = candidates.enumerated().sorted { lhs, rhs in
      let l = (lhs.element.value as NSString).length, r = (rhs.element.value as NSString).length
      return l != r ? l > r : lhs.offset < rhs.offset
    }.map(\.element)
    for candidate in ordered where !candidate.value.isEmpty {
      var options: NSString.CompareOptions = [.literal]
      if matchesCaseInsensitively(candidate.role, candidate.value) { options.insert(.caseInsensitive) }
      var searchStart = 0
      while searchStart < ns.length {
        let found = ns.range(of: candidate.value, options: options,
                             range: NSRange(location: searchStart, length: ns.length - searchStart))
        if found.location == NSNotFound || found.length == 0 { break }
        let free = !occupied[found.location..<(found.location + found.length)].contains(true)
        if free {
          for i in found.location..<(found.location + found.length) { occupied[i] = true }
          spans.append(Span(range: found, candidate: candidate))
          searchStart = found.location + found.length
        } else {
          searchStart = found.location + 1
        }
      }
    }
    return spans.sorted { $0.range.location < $1.range.location }
  }

  static func substitute(_ text: String, _ spans: [Span], token: (PIICandidate) -> String) -> String {
    let ns = text as NSString
    var out = ""
    var cursor = 0
    for span in spans {
      out += ns.substring(with: NSRange(location: cursor, length: span.range.location - cursor))
      out += token(span.candidate)
      cursor = span.range.location + span.range.length
    }
    out += ns.substring(from: cursor)
    return out
  }

  // MARK: Airlock

  /// Merges on-device findings with the deterministic layers and replaces every occurrence with a
  /// role token. On-device input is optional: with `[]` this is the regex-only local fallback.
  static func runLocalAirlock(rawText: String, onDeviceCandidates: [PIICandidate] = []) -> AirlockResult {
    var order: [String] = []
    var byValue: [String: PIICandidate] = [:]
    func put(_ c: PIICandidate) {
      if byValue[c.value] == nil { order.append(c.value) }
      byValue[c.value] = c
    }

    for c in sanitizeOnDeviceCandidates(onDeviceCandidates, in: rawText) { put(c) }

    for c in scanDeterministic(rawText) {
      let prior = byValue[c.value]
      let specificFormat = prior?.role == .otherPII || [.email, .bankAccount, .secretKey, .medicalID].contains(c.role)
      if prior == nil || (prior!.role != c.role && specificFormat) { put(c) }
    }

    // Contextual findings fill gaps. A defined-party role ("Client"/"Contractor") upgrades a generic
    // on-device PERSON_NAME/ORGANIZATION for the same name so the cloud sees who is who.
    var knownKeys: [String: String] = [:] // folded key -> stored value
    for value in order {
      let c = byValue[value]!
      knownKeys[matchesCaseInsensitively(c.role, c.value) ? c.value.lowercased() : c.value] = value
    }
    for c in scanContextual(rawText) {
      let key = c.value.lowercased()
      if let existingValue = knownKeys[key] ?? knownKeys[c.value] {
        if var existing = byValue[existingValue],
           [.partyClient, .partyContractor].contains(c.role),
           [.personName, .organization].contains(existing.role) {
          existing.role = c.role
          byValue[existingValue] = existing
        }
        continue
      }
      knownKeys[key] = c.value
      put(c)
    }

    let candidates = order.compactMap { byValue[$0] }
    let spans = locate(rawText, candidates)

    // Tokens are numbered in order of first appearance in the document.
    var counts: [String: Int] = [:]
    var firstSeen: [String] = []
    for span in spans {
      if counts[span.candidate.value] == nil { firstSeen.append(span.candidate.value) }
      counts[span.candidate.value, default: 0] += 1
    }
    let ns = rawText as NSString
    let reserved = Set(aliasRanges(in: rawText).map { ns.substring(with: $0) })
    var vault = Vault()
    for value in firstSeen {
      _ = vault.register(byValue[value]!, occurrences: counts[value]!, reserved: reserved)
    }
    let sanitized = substitute(rawText, spans) { vault.entry(forOriginal: $0.value)!.token }
    let entries = vault.entries
    let byRegex = entries.filter { $0.layer == .regex }.count
    return AirlockResult(sanitizedText: sanitized, vault: vault, stats: AirlockStats(
      totalDetected: entries.count, byOnDevice: entries.count - byRegex, byRegex: byRegex,
      rawChars: rawText.count, sanitizedChars: sanitized.count))
  }

  // MARK: Re-hydration (local only)

  private static let anyBracketToken = regex(#"\[[^\[\]]+\]"#)

  static func rehydrate(_ text: String, vault: Vault) -> String {
    let ns = text as NSString
    var out = text
    for m in anyBracketToken.matches(in: text, range: NSRange(location: 0, length: ns.length)).reversed() {
      let token = ns.substring(with: m.range)
      guard let original = vault.byToken[token]?.originalValue,
            let r = Range(m.range, in: out) else { continue }
      out.replaceSubrange(r, with: original)
    }
    return out
  }
}
