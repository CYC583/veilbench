import Foundation
import FoundationModels
import FirebaseAILogic

@Generable(description: "Risk audit of a tokenized contract")
struct CloudAudit {
  @Guide(description: "The most important contract risks for the Contractor, highest severity first. At most 5.")
  var riskFlags: [CloudRiskFlag]
  @Guide(description: "A short, polite negotiation email from the Contractor to the Client, using the bracket tokens instead of names, under 160 words.")
  var negotiationEmail: String
}

@Generable(description: "One contract risk")
struct CloudRiskFlag {
  @Guide(description: "Short title, under 8 words")
  var title: String
  @Guide(description: "Exactly one of: high, medium, low")
  var severity: String
  @Guide(description: "One or two sentences explaining the risk, using bracket tokens for any party, amount or date")
  var summary: String
}

struct AuditFlag: Identifiable, Equatable, Sendable {
  enum Severity: String, Sendable { case high, medium, low }
  let id = UUID()
  let title: String
  let severity: Severity
  let summary: String
}

struct AuditReport: Equatable, Sendable {
  let flags: [AuditFlag]
  let email: String
  let model: String
  let modelVersion: String?
  let attempts: [CloudAttempt]
}

/// Stage 4. IN-CLOUD: Gemini via Firebase AI Logic `.geminiModel(name:)`. Receives only the
/// tokenized payload that already passed Layer 3; callers must never pass raw text.
enum CloudAuditor {
  static let instructions = """
  You are a contract risk reviewer for an independent contractor. The document is tokenized: values such as \
  [PARTY_CLIENT_1], [PERSON_NAME_1] or [MONEY_AMOUNT_1] are placeholders for private data you will never see. \
  Keep every bracket token exactly as written and never guess what a token stands for. \
  Return the main risks and a short negotiation email that uses the tokens.
  """

  /// The exact outbound prompt. Layer 3 inspects this full string (instructions are sent separately and
  /// contain no document data).
  static func buildPayload(sanitizedText: String, hints: String) -> String {
    var parts = ["DOCUMENT (tokenized):", sanitizedText]
    if !hints.isEmpty { parts += ["", hints] }
    return parts.joined(separator: "\n")
  }

  static func audit(payload: String) async -> Result<AuditReport, CloudFailure> {
    let result = await CloudResilience.run { model in
      try await requestAudit(payload: payload, model: model)
    }
    return result.map { value, model, attempts in
      AuditReport(flags: value.flags, email: value.email, model: model, modelVersion: value.version, attempts: attempts)
    }
  }

  private struct Raw: Sendable { let flags: [AuditFlag]; let email: String; let version: String? }

  @MainActor
  private static func requestAudit(payload: String, model: String) async throws -> Raw {
    // Limited-use App Check tokens so Firebase AI Logic replay protection can be enforced.
    let ai = FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens: true)
    let session = ai.generativeModelSession(
      model: .geminiModel(name: model, requestOptions: RequestOptions(timeout: 60)),
      instructions: instructions
    )
    let response = try await session.respond(to: payload, generating: CloudAudit.self)
    let flags = response.content.riskFlags.prefix(5).map { f in
      AuditFlag(title: f.title, severity: AuditFlag.Severity(rawValue: f.severity.lowercased()
        .trimmingCharacters(in: .whitespaces)) ?? .medium, summary: f.summary)
    }
    return Raw(flags: Array(flags), email: response.content.negotiationEmail, version: response.rawResponse.modelVersion)
  }
}
