import Foundation
import FoundationModels
import FirebaseAILogic

@Generable(description: "Sensitive entities that appear verbatim in a contract excerpt")
struct OnDeviceEntities {
  @Guide(description: "Full names of natural persons, copied exactly as written. Empty if none.")
  var personNames: [String]
  @Guide(description: "Company or organization names copied exactly as written, including suffixes such as LLC or Inc. Empty if none.")
  var organizations: [String]
  @Guide(description: "Postal street addresses copied exactly as written. Empty if none.")
  var addresses: [String]
}

struct OnDeviceOutcome: Sendable {
  enum Status: Sendable, Equatable {
    case ok
    /// Model not available on this device (not eligible, Apple Intelligence off, model downloading).
    case unavailable(String)
    /// The model ran but failed; Stage 1 continues regex-only, still fully local.
    case failed(String)
  }
  let status: Status
  let candidates: [PIICandidate]
  let modelVersion: String?
  let chunks: Int
  let latencyMs: Int
}

/// Stage 1 extractor. ON-DEVICE ONLY: uses Firebase AI Logic with `.systemModel()` (Apple Foundation
/// Models). There is deliberately no hybrid/cloud fallback here — raw text never leaves the device.
enum OnDeviceExtractor {
  static let expectedModelVersion = "apple-foundation-models-system-language-model"

  static let instructions = """
  You find personal names, organization names and street addresses in contract text. \
  Copy each value exactly as it appears. Do not invent values. Do not include role words such as Client or Contractor.
  """

  static func availabilityDescription() -> String? {
    switch FoundationModels.SystemLanguageModel.default.availability {
    case .available: return nil
    case .unavailable(.deviceNotEligible): return "This device does not support Apple Intelligence."
    case .unavailable(.appleIntelligenceNotEnabled): return "Apple Intelligence is turned off in Settings."
    case .unavailable(.modelNotReady): return "The on-device model is still downloading."
    case .unavailable(let other): return "On-device model unavailable (\(other))."
    }
  }

  @MainActor
  static func extract(_ rawText: String) async -> OnDeviceOutcome {
    let started = Date()
    func elapsed() -> Int { Int(Date().timeIntervalSince(started) * 1000) }

    if let reason = availabilityDescription() {
      return OnDeviceOutcome(status: .unavailable(reason), candidates: [], modelVersion: nil, chunks: 0, latencyMs: elapsed())
    }

    let ai = FirebaseAI.firebaseAI(backend: .googleAI())
    let chunks = TextChunker.chunk(rawText)
    var candidates: [PIICandidate] = []
    var version: String?
    for chunk in chunks {
      do {
        // A fresh session per chunk keeps each request inside the small on-device context window.
        let session = ai.generativeModelSession(
          model: .systemModel(guardrails: .permissiveContentTransformations),
          instructions: instructions
        )
        let response = try await session.respond(to: chunk, generating: OnDeviceEntities.self)
        let reported = response.rawResponse.modelVersion
        // Defense in depth: accept results only when the response proves it ran on-device.
        guard reported == expectedModelVersion else {
          return OnDeviceOutcome(status: .failed("Unexpected model source; discarded."), candidates: [],
                                 modelVersion: reported, chunks: chunks.count, latencyMs: elapsed())
        }
        version = reported
        let e = response.content
        candidates += e.personNames.map { PIICandidate(value: $0, role: .personName, layer: .onDevice) }
        candidates += e.organizations.map { PIICandidate(value: $0, role: .organization, layer: .onDevice) }
        candidates += e.addresses.map { PIICandidate(value: $0, role: .address, layer: .onDevice) }
      } catch {
        return OnDeviceOutcome(status: .failed(shortReason(error)), candidates: [], modelVersion: version,
                               chunks: chunks.count, latencyMs: elapsed())
      }
    }
    return OnDeviceOutcome(status: .ok, candidates: candidates, modelVersion: version, chunks: chunks.count,
                           latencyMs: elapsed())
  }

  private static func shortReason(_ error: Error) -> String {
    if let e = error as? LanguageModelSession.GenerationError {
      switch e {
      case .exceededContextWindowSize: return "Input exceeded the on-device context window."
      case .guardrailViolation: return "The on-device model declined this text."
      case .unsupportedLanguageOrLocale: return "Language not supported by the on-device model."
      default: break
      }
    }
    return "The on-device model could not process this text."
  }
}
