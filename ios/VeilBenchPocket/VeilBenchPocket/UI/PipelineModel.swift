import Foundation
import Observation

struct StepLogEntry: Identifiable, Equatable {
  enum Outcome: Equatable { case ok, warning, blocked, failed, skipped }
  let id = UUID()
  let site: InferenceSite
  let title: String
  let detail: String
  let latencyMs: Int?
  let outcome: Outcome
}

struct Stage1Result {
  enum Mode: Equatable {
    case onDeviceModel(modelVersion: String)
    /// The on-device model was unavailable or failed; regex-only, still 100% local.
    case rulesOnly(reason: String)
  }
  let mode: Mode
  let airlock: AirlockResult
  let onDeviceLatencyMs: Int
  let rulesLatencyMs: Int
}

struct Layer3State {
  let result: Layer3Result
  let payload: String
  let hintsText: String
  let hintCount: Int
}

enum CloudState {
  case idle
  case notConfigured
  case running
  case failed(CloudFailure)
  case done(AuditReport, latencyMs: Int)
}

@MainActor
@Observable
final class PipelineModel {
  var input: String = "" {
    didSet { if input != oldValue, stage1 != nil, !isRunningStage1 { resetResults() } }
  }
  private(set) var isRunningStage1 = false
  private(set) var stage1: Stage1Result?
  private(set) var layer3: Layer3State?
  private(set) var cloud: CloudState = .idle
  private(set) var log: [StepLogEntry] = []
  private(set) var syncStatus = ""
  private(set) var relayStatus = ""
  private(set) var relayCode: String?
  private(set) var publishingRelay = false
  private var pendingExport: PocketResult?
  private var revision = UUID()
  var showRestored = false

  let cloudConfigured: Bool
  let onDeviceAvailability: String?

  init(cloudConfigured: Bool = FirebaseBootstrap.cloudConfigured) {
    self.cloudConfigured = cloudConfigured
    self.onDeviceAvailability = OnDeviceExtractor.availabilityDescription()
  }

  func loadSample() {
    input = SampleDocuments.sampleContract
    resetResults()
  }

  func clear() {
    input = ""
    resetResults()
  }

  private func resetResults() {
    revision = UUID()
    pendingExport = nil
    relayCode = nil
    publishingRelay = false
    relayStatus = ""
    syncStatus = ""
    stage1 = nil
    layer3 = nil
    cloud = .idle
    showRestored = false
    log = []
  }

  // MARK: Stage 1 + Layer 3 (all on this iPhone)

  func runAirlock() async {
    let raw = input
    guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !isRunningStage1 else { return }
    resetResults()
    isRunningStage1 = true
    defer { isRunningStage1 = false }

    // Stage 1a — Apple Foundation Models via Firebase AI Logic `.systemModel()`. Never hybrid.
    let outcome = await OnDeviceExtractor.extract(raw)
    let mode: Stage1Result.Mode
    switch outcome.status {
    case .ok:
      let version = outcome.modelVersion ?? OnDeviceExtractor.expectedModelVersion
      mode = .onDeviceModel(modelVersion: version)
      log.append(StepLogEntry(site: .onDeviceModel, title: "Entity extraction",
                              detail: "\(outcome.candidates.count) names, orgs, addresses · \(outcome.chunks) chunk\(outcome.chunks == 1 ? "" : "s") · \(version)",
                              latencyMs: outcome.latencyMs, outcome: .ok))
    case .unavailable(let reason), .failed(let reason):
      mode = .rulesOnly(reason: reason)
      log.append(StepLogEntry(site: .onDeviceRules, title: "On-device model skipped",
                              detail: "\(reason) Fell back to local rules. No cloud fallback.",
                              latencyMs: outcome.latencyMs, outcome: .warning))
    }

    // Stage 1b — deterministic Swift rules + vault + longest-match replacement.
    let t0 = Date()
    let airlock = PIIShield.runLocalAirlock(rawText: raw, onDeviceCandidates: outcome.candidates)
    let rulesMs = Int(Date().timeIntervalSince(t0) * 1000)
    log.append(StepLogEntry(site: .onDeviceRules, title: "Regex shield + vault",
                            detail: "\(airlock.stats.totalDetected) values tokenized · \(airlock.stats.byOnDevice) from model, \(airlock.stats.byRegex) from rules",
                            latencyMs: rulesMs, outcome: .ok))
    let result = Stage1Result(mode: mode, airlock: airlock, onDeviceLatencyMs: outcome.latencyMs, rulesLatencyMs: rulesMs)
    stage1 = result
    runLayer3(for: result)
  }

  private func runLayer3(for result: Stage1Result) {
    let t0 = Date()
    let hints = RelationalHints.build(from: result.airlock.vault)
    let hintsText = RelationalHints.format(hints)
    let payload = CloudAuditor.buildPayload(sanitizedText: result.airlock.sanitizedText, hints: hintsText)
    let check = PreFlightGuard.assertZeroLeak(payload: payload, vault: result.airlock.vault)
    let ms = Int(Date().timeIntervalSince(t0) * 1000)
    layer3 = Layer3State(result: check, payload: payload, hintsText: hintsText, hintCount: hints.count)
    log.append(StepLogEntry(site: .onDeviceRules, title: "Layer 3 zero-leak check",
                            detail: check.passed
                              ? "Passed · \(check.inspectedChars) chars vs \(check.checkedValues) vault values"
                              : "Blocked · \(check.leaks.count) leak\(check.leaks.count == 1 ? "" : "s") found",
                            latencyMs: ms, outcome: check.passed ? .ok : .blocked))
  }

  // MARK: Stage 4 (cloud, tokens only)

  var canSendToCloud: Bool {
    guard let layer3, layer3.result.passed else { return false }
    if case .running = cloud { return false }
    return true
  }

  func runCloudAudit() async {
    guard let stage1, let layer3, layer3.result.passed else { return }
    if case .running = cloud { return }
    guard cloudConfigured else {
      cloud = .notConfigured
      log.append(StepLogEntry(site: .cloud(model: CloudResilience.primaryModel), title: "Cloud audit not sent",
                              detail: "Cloud not configured (no GoogleService-Info.plist). Nothing left the device.",
                              latencyMs: nil, outcome: .skipped))
      return
    }
    // Re-assert on the exact bytes about to leave, immediately before the call.
    let recheck = PreFlightGuard.assertZeroLeak(payload: layer3.payload, vault: stage1.airlock.vault)
    guard recheck.passed else {
      log.append(StepLogEntry(site: .onDeviceRules, title: "Cloud call blocked", detail: "Layer 3 re-check failed.",
                              latencyMs: nil, outcome: .blocked))
      return
    }
    let started = revision
    cloud = .running
    let t0 = Date()
    let result = await CloudAuditor.audit(payload: layer3.payload)
    let ms = Int(Date().timeIntervalSince(t0) * 1000)
    guard revision == started else { return }
    switch result {
    case .success(let report):
      cloud = .done(report, latencyMs: ms)
      let retries = report.attempts.count - 1
      log.append(StepLogEntry(site: .cloud(model: report.model), title: "Risk audit over tokens",
                              detail: "\(report.model) · \(report.flags.count) flags\(retries > 0 ? " · \(retries) retr\(retries == 1 ? "y" : "ies")" : "")",
                              latencyMs: ms, outcome: .ok))
      let restored = RelationalHints.countPlaceholders(report.email + report.flags.map(\.summary).joined())
      log.append(StepLogEntry(site: .onDeviceRules, title: "Re-hydration ready",
                              detail: "Tokens restored only on this iPhone · \(restored) exact difference\(restored == 1 ? "" : "s") computed locally",
                              latencyMs: nil, outcome: .ok))
      do {
        let export = try PocketResult(report: report, payload: layer3.payload, vault: stage1.airlock.vault)
        pendingExport = export
        syncStatus = "Waiting for Firestore confirmation…"
        Task {
          do {
            try await PocketServices.saveSession(export)
            if revision == started { syncStatus = "Synced" }
          } catch {
            if revision == started { syncStatus = "Session sync failed." }
          }
        }
      } catch {
        syncStatus = "Session and relay blocked by export checks."
      }
    case .failure(let failure):
      cloud = .failed(failure)
      let codes = failure.attempts.map { a in "\(a.model)#\(a.attempt) \(a.status.map(String.init) ?? a.kind?.rawValue ?? "?")" }
      log.append(StepLogEntry(site: .cloud(model: failure.attempts.last?.model ?? CloudResilience.primaryModel),
                              title: "Cloud audit failed", detail: codes.joined(separator: " · "),
                              latencyMs: ms, outcome: .failed))
    }
  }

  var canPublish: Bool { pendingExport != nil && !publishingRelay && relayCode == nil }

  func publishRelay() async {
    guard canPublish, let pendingExport else { return }
    let started = revision
    publishingRelay = true
    relayStatus = "Waiting for server confirmation…"
    defer { if revision == started { publishingRelay = false } }
    do {
      let code = try await PocketServices.publishRelay(pendingExport)
      guard revision == started else { return }
      relayCode = code
      relayStatus = "Enter the code on the web within 15 minutes."
    } catch {
      if revision == started { relayStatus = "Could not publish the relay. Try again when online." }
    }
  }

  // MARK: Display helpers

  func display(_ text: String) -> String {
    guard showRestored, let vault = stage1?.airlock.vault else { return text }
    return RelationalHints.rehydrateWithLocalMath(text, vault: vault)
  }

  var restoredOriginals: [String] {
    guard showRestored, let vault = stage1?.airlock.vault else { return [] }
    return vault.entries.map(\.originalValue)
  }
}
