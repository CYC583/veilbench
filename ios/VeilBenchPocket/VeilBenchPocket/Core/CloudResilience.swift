import Foundation

// Swift port of the policy in src/core/cloudResilience.ts: retry once on 429/5xx/timeout, then move to
// the fallback model. Pure and injectable so it is unit-tested; it never surfaces endpoint URLs.

enum CloudFailureKind: String, Sendable {
  case overloaded, rateLimited, quota, timeout, modelUnavailable, appCheck, invalidConfiguration,
       network, unknown
}

struct ClassifiedCloudError: Equatable, Sendable {
  let kind: CloudFailureKind
  let status: Int?
  /// Worth retrying the same model after a short backoff.
  let retrySameModel: Bool
  /// Worth switching to the fallback model.
  let tryNextModel: Bool
}

struct CloudAttempt: Equatable, Sendable {
  let model: String
  let attempt: Int
  let kind: CloudFailureKind?
  let status: Int?
}

struct CloudFailure: Error, Equatable, Sendable {
  let kind: CloudFailureKind
  let attempts: [CloudAttempt]
  var userMessage: String { CloudResilience.describe(kind, attempts: attempts) }
}

enum CloudResilience {
  static let primaryModel = "gemini-3.5-flash-lite"
  static let fallbackModel = "gemini-3.6-flash"
  static let maxAttemptsPerModel = 2

  // MARK: Classification

  static func classify(status: Int?, message: String, urlErrorCode: Int? = nil) -> ClassifiedCloudError {
    if let code = urlErrorCode {
      if code == URLError.timedOut.rawValue {
        return .init(kind: .timeout, status: nil, retrySameModel: true, tryNextModel: true)
      }
      return .init(kind: .network, status: nil, retrySameModel: false, tryNextModel: false)
    }
    switch status {
    case 429? where message.range(of: "quota|billing", options: [.regularExpression, .caseInsensitive]) != nil:
      // Exhausted quota will not recover within a backoff, but each model has its own bucket.
      return .init(kind: .quota, status: 429, retrySameModel: false, tryNextModel: true)
    case 429?:
      return .init(kind: .rateLimited, status: 429, retrySameModel: true, tryNextModel: true)
    case let s? where [500, 502, 503, 504].contains(s):
      return .init(kind: .overloaded, status: s, retrySameModel: true, tryNextModel: true)
    case let s? where s == 401 || s == 403:
      return .init(kind: .appCheck, status: s, retrySameModel: false, tryNextModel: false)
    case 404?:
      return .init(kind: .modelUnavailable, status: 404, retrySameModel: false, tryNextModel: true)
    case 400?:
      return .init(kind: .invalidConfiguration, status: 400, retrySameModel: false, tryNextModel: false)
    default:
      if message.range(of: "timed? ?out", options: [.regularExpression, .caseInsensitive]) != nil {
        return .init(kind: .timeout, status: status, retrySameModel: true, tryNextModel: true)
      }
      return .init(kind: .unknown, status: status, retrySameModel: false, tryNextModel: false)
    }
  }

  /// Finds the HTTP status of a Firebase AI Logic backend error (or a URLError) anywhere in the error
  /// chain. FirebaseAILogic wraps `BackendError` (a CustomNSError whose code is the HTTP status) inside
  /// `GenerateContentError.internalError(underlying:)`, so the chain is walked by reflection.
  static func classify(_ error: Error) -> ClassifiedCloudError {
    var status: Int?
    var urlCode: Int?
    var messages: [String] = []
    func walk(_ value: Any, depth: Int) {
      guard depth < 6 else { return }
      if let err = value as? Error {
        let ns = err as NSError
        if ns.domain.hasSuffix("BackendError"), status == nil { status = ns.code }
        if let u = err as? URLError, urlCode == nil { urlCode = u.code.rawValue }
        messages.append(String(describing: err))
      }
      for child in Mirror(reflecting: value).children { walk(child.value, depth: depth + 1) }
    }
    walk(error, depth: 0)
    if status == nil, let found = messages.lazy.compactMap(Self.statusFromDescription).first { status = found }
    return classify(status: status, message: messages.joined(separator: " "), urlErrorCode: status == nil ? urlCode : nil)
  }

  static func statusFromDescription(_ text: String) -> Int? {
    guard let r = text.range(of: #"httpResponseCode: (\d{3})"#, options: .regularExpression) else { return nil }
    return Int(text[r].suffix(3))
  }

  // MARK: Retry / fallback runner

  static func modelChain(primary: String = primaryModel, fallback: String = fallbackModel) -> [String] {
    var chain: [String] = []
    for m in [primary, fallback].map({ $0.trimmingCharacters(in: .whitespaces) }) where !m.isEmpty && !chain.contains(m) {
      chain.append(m)
    }
    return chain
  }

  static func run<T: Sendable>(
    models: [String] = modelChain(),
    maxAttemptsPerModel: Int = maxAttemptsPerModel,
    backoff: @Sendable (Int) async -> Void = { attempt in try? await Task.sleep(for: .milliseconds(600 * attempt)) },
    classify: @Sendable (Error) -> ClassifiedCloudError = { CloudResilience.classify($0) },
    operation: @Sendable (String) async throws -> T
  ) async -> Result<(value: T, model: String, attempts: [CloudAttempt]), CloudFailure> {
    var attempts: [CloudAttempt] = []
    var lastKind: CloudFailureKind = .unknown
    modelLoop: for model in models {
      for attempt in 1...max(1, maxAttemptsPerModel) {
        do {
          let value = try await operation(model)
          attempts.append(CloudAttempt(model: model, attempt: attempt, kind: nil, status: nil))
          return .success((value, model, attempts))
        } catch {
          let c = classify(error)
          lastKind = c.kind
          attempts.append(CloudAttempt(model: model, attempt: attempt, kind: c.kind, status: c.status))
          if c.retrySameModel && attempt < maxAttemptsPerModel {
            await backoff(attempt)
            continue
          }
          if c.tryNextModel { continue modelLoop }
          break modelLoop
        }
      }
    }
    return .failure(CloudFailure(kind: lastKind, attempts: attempts))
  }

  // MARK: Friendly copy (no URLs, no project identifiers, no raw server messages)

  static func describe(_ kind: CloudFailureKind, attempts: [CloudAttempt]) -> String {
    let models = Set(attempts.map(\.model)).count
    let tried = "\(attempts.count) attempt\(attempts.count == 1 ? "" : "s") across \(models) model\(models == 1 ? "" : "s")"
    switch kind {
    case .overloaded, .rateLimited, .timeout:
      return "Gemini is temporarily busy (\(tried)). Your tokens and vault are intact on this iPhone. Try again in a moment."
    case .quota:
      return "Cloud quota is temporarily exhausted (\(tried)). Nothing raw left the device. Try again later."
    case .modelUnavailable:
      return "The configured Gemini models are not available for this project (\(tried))."
    case .appCheck:
      return "The cloud request was rejected by App Check. Register this device's debug token in the Firebase console, then retry."
    case .invalidConfiguration:
      return "The cloud request was rejected as invalid. Check the Firebase project configuration and that Firebase AI Logic is enabled."
    case .network:
      return "No network connection. The on-device stages still work offline."
    case .unknown:
      return "The cloud audit failed unexpectedly (\(tried)). Nothing raw left the device."
    }
  }
}
