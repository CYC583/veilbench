import Foundation
import CryptoKit
import Security
import FirebaseAuth
import FirebaseFirestore
import FirebaseRemoteConfig

/// The only persisted audit fields are constructed here, directly from the token view.
struct PocketResult {
  enum ExportError: Error { case unsafe, invalidSize }
  let flags: [AuditFlag]
  var relayFlags: [[String: String]] { flags.map { ["title": $0.title, "severity": $0.severity.rawValue, "summary": $0.summary] } }
  let email: String
  let proof: String

  init(report: AuditReport, payload: String, vault: Vault) throws {
    let flags = report.flags
    guard flags.count <= 5, (1...5000).contains(report.email.utf8.count),
          report.flags.allSatisfy({ (1...120).contains($0.title.utf8.count) && (1...1200).contains($0.summary.utf8.count) }) else {
      throw ExportError.invalidSize
    }
    let texts = report.flags.flatMap { [$0.title, $0.summary] } + [report.email]
    guard texts.allSatisfy({ PreFlightGuard.assertZeroLeak(payload: $0, vault: vault).passed }) else {
      throw ExportError.unsafe
    }
    self.flags = flags
    email = report.email
    proof = SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  func session(id: String, uid: String, timestamp: String) -> [String: Any] {
    let severity = ["high", "medium", "low"].first { level in flags.contains { $0.severity.rawValue == level } } ?? "low"
    let triageFlags = flags.enumerated().map { i, flag in
      ["id": "risk-\(i+1)", "title": flag.title, "severity": flag.severity.rawValue,
       "plainSummary": flag.summary, "excerpt": ""]
    }
    let triage: [String: Any] = ["overallRisk": severity, "headline": "Pocket contract audit", "flags": triageFlags,
                                  "inferenceSource": "IN_CLOUD", "generatedAt": timestamp]
    let playbook: [String: Any] = ["executiveSummary": "Pocket contract audit", "counterpartyPushback": [],
                                   "readyToSendEmailSanitized": email]
    let deepAudit: [String: Any] = ["contradictions": [], "redlines": [], "playbook": playbook,
                                      "inferenceSource": "IN_CLOUD", "generatedAt": timestamp]
    return ["id": id, "uid": uid, "title": "Pocket contract audit", "category": "contract", "documentCount": 1,
            "sanitizedExcerpts": [], "zeroLeakProofHash": proof, "triage": triage, "deepAudit": deepAudit,
            "updatedAt": timestamp]
  }
}

struct PocketShareLink {
  let id: String
  let expiresAt: Date
  var url: URL { URL(string: "https://veilbench-hybrid-ai.web.app/#relay=\(id)")! }

  init(now: Date = Date()) throws {
    var bytes = [UInt8](repeating: 0, count: 16)
    let status = bytes.withUnsafeMutableBytes {
      SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!)
    }
    guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    id = bytes.map { String(format: "%02x", $0) }.joined()
    // Firestore checks the ceiling against server time. Leave room for small client clock offsets.
    expiresAt = now.addingTimeInterval(15 * 60 - 30)
  }

  func document(for result: PocketResult) -> [String: Any] {
    ["createdAt": FieldValue.serverTimestamp(), "expiresAt": Timestamp(date: expiresAt),
     "flags": result.relayFlags, "emailSanitized": result.email]
  }
}

struct PocketRelay {
  let code: String
  let expiresAt: Date

  init(now: Date = Date()) {
    code = String(format: "%06d", Int.random(in: 0..<1_000_000))
    expiresAt = now.addingTimeInterval(24 * 60 * 60)
  }

  func document(for result: PocketResult, ownerUid: String) -> [String: Any] {
    ["ownerUid": ownerUid, "createdAt": FieldValue.serverTimestamp(), "expiresAt": Timestamp(date: expiresAt),
     "flags": result.relayFlags, "emailSanitized": result.email]
  }
}

@MainActor
enum PocketServices {
  private static let database: Firestore = {
    let db = Firestore.firestore()
    let settings = db.settings
    settings.cacheSettings = PersistentCacheSettings()
    db.settings = settings
    return db
  }()

  static func parseModels(primary: String, fallbacks: Data) -> [String] {
    func valid(_ name: String) -> Bool {
      name.range(of: #"^gemini-[a-z0-9][a-z0-9.-]{0,100}$"#, options: .regularExpression) != nil
    }
    let decoded = try? JSONDecoder().decode([String].self, from: fallbacks)
    let saved = decoded.flatMap { values -> [String]? in
      let models = values.filter(valid)
      return !values.isEmpty && models.isEmpty ? nil : models
    }
    let model = valid(primary) ? primary : CloudResilience.primaryModel
    return ([model] + (saved ?? [CloudResilience.fallbackModel])).reduce(into: []) {
      if !$0.contains($1) { $0.append($1) }
    }
  }

  static func models() async -> [String] {
    let rc = RemoteConfig.remoteConfig()
    let settings = rc.configSettings
    settings.fetchTimeout = 5
    rc.configSettings = settings
    // Offline or throttled clients continue with their last activated Remote Config values.
    _ = try? await rc.fetchAndActivate()
    return parseModels(primary: rc["cloud_model_name"].stringValue, fallbacks: rc["cloud_model_fallbacks"].dataValue)
  }

  private static var signingIn: Task<String, Error>?
  private static func userID() async throws -> String {
    if let user = Auth.auth().currentUser { return user.uid }
    if let signingIn { return try await signingIn.value }
    let task = Task { try await Auth.auth().signInAnonymously().user.uid }
    signingIn = task
    defer { signingIn = nil }
    return try await task.value
  }

  static func saveSession(_ result: PocketResult) async throws {
    let uid = try await userID()
    let doc = database.collection("sanitized_sessions").document()
    try await doc.setData(result.session(id: doc.documentID, uid: uid, timestamp: Date().ISO8601Format()))
  }

  static func publishRelay(_ result: PocketResult) async throws -> PocketRelay {
    let uid = try await userID()
    for attempt in 1...3 {
      let relay = PocketRelay()
      let doc = database.collection("relays").document(relay.code)
      do {
        try await doc.setData(relay.document(for: result, ownerUid: uid))
        return relay
      } catch {
        // A create on an occupied code is an update and is denied by the create-only rule.
        let failure = error as NSError
        guard attempt < 3, failure.domain == FirestoreErrorDomain,
              failure.code == FirestoreErrorCode.Code.permissionDenied.rawValue else { throw error }
      }
    }
    throw PocketResult.ExportError.invalidSize
  }

  static func publishShareLink(_ result: PocketResult) async throws -> PocketShareLink {
    _ = try await userID()
    let relay = try PocketShareLink()
    try await database.collection("relays").document(relay.id).setData(relay.document(for: result))
    return relay
  }

  enum PairingError: LocalizedError {
    case noUniqueRequest, alreadyPaired
    var errorDescription: String? {
      switch self {
      case .noUniqueRequest: "No unique matching browser. Check the confirmation number on your browser."
      case .alreadyPaired: "This code has already been approved for a different browser."
      }
    }
  }

  static func approveRecipient(code: String, challenge: String) async throws {
    guard challenge.range(of: #"^[0-9]{6}$"#, options: .regularExpression) != nil else {
      throw PairingError.noUniqueRequest
    }
    let relay = database.collection("relays").document(code)
    let matches = try await relay.collection("requests").whereField("challenge", isEqualTo: challenge)
      .limit(to: 2).getDocuments(source: .server)
    guard matches.documents.count == 1, let uid = matches.documents.first?.documentID else {
      throw PairingError.noUniqueRequest
    }
    let approval = relay.collection("pairing").document("approval")
    let prior = try await approval.getDocument(source: .server)
    if prior.exists {
      guard prior.data()?["receiverUid"] as? String == uid else { throw PairingError.alreadyPaired }
      return
    }
    try await approval.setData(["receiverUid": uid, "challenge": challenge, "approvedAt": FieldValue.serverTimestamp()])
  }

}
