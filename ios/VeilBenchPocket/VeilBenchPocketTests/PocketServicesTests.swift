import XCTest
import FirebaseFirestore
@testable import VeilBenchPocket

final class PocketServicesTests: XCTestCase {
  @MainActor func testRemoteModelsRetainOrderDeduplicateAndUseOfflineDefaults() {
    XCTAssertEqual(PocketServices.parseModels(primary: "gemini-demo", fallbacks: Data(#"["gemini-demo","gemini-alt","bad/name"]"#.utf8)),
                   ["gemini-demo", "gemini-alt"])
    XCTAssertEqual(PocketServices.parseModels(primary: "", fallbacks: Data()), CloudResilience.modelChain())
    XCTAssertEqual(PocketServices.parseModels(primary: "gemini-demo", fallbacks: Data("[]".utf8)), ["gemini-demo"])
    XCTAssertEqual(PocketServices.parseModels(primary: "", fallbacks: Data(#"["bad/name"]"#.utf8)), CloudResilience.modelChain())
  }

  func testVaultValueInModelOutputBlocksBothExports() {
    let vault = PIIShield.runLocalAirlock(rawText: SampleDocuments.masterAgreement).vault
    let report = AuditReport(flags: [.init(title: "MARCUS VANCE", severity: .high, summary: "Review the term.")],
                             email: "Please review.", model: "test", modelVersion: nil, attempts: [])
    XCTAssertThrowsError(try PocketResult(report: report, payload: "sanitized", vault: vault))
  }

  func testResultOnlyPersistsTokenizedOutputWithWebCompatibleSessionFields() throws {
    let flag = AuditFlag(title: "Payment", severity: .high, summary: "Review [MONEY_AMOUNT_1].")
    let report = AuditReport(flags: [flag], email: "From [PARTY_CONTRACTOR_1]", model: "test", modelVersion: nil, attempts: [])
    let result = try PocketResult(report: report, payload: "abc", vault: Vault())
    XCTAssertEqual(result.proof, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    XCTAssertEqual(result.relayFlags, [["title":"Payment","severity":"high","summary":"Review [MONEY_AMOUNT_1]."]])
    let session = result.session(id: "audit", uid: "user", timestamp: "now")
    XCTAssertEqual(Set(session.keys), Set(["id", "uid", "title", "category", "documentCount", "sanitizedExcerpts",
                                          "zeroLeakProofHash", "triage", "deepAudit", "updatedAt"]))
    XCTAssertEqual((session["triage"] as? [String: Any])?["overallRisk"] as? String, "high")
    XCTAssertEqual((session["sanitizedExcerpts"] as? [Any])?.count, 0)
  }

  func testRelayUses128RandomBitsAndOnlyPublishesIDInProductionURLFragment() throws {
    let relay = try PocketRelay()
    XCTAssertEqual(relay.id.count, 32)
    XCTAssertTrue(relay.id.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) })
    XCTAssertTrue(relay.id != (try PocketRelay()).id)
    let components = try XCTUnwrap(URLComponents(url: relay.url, resolvingAgainstBaseURL: false))
    XCTAssertEqual(components.scheme, "https")
    XCTAssertEqual(components.host, "veilbench-hybrid-ai.web.app")
    XCTAssertEqual(components.path, "/")
    XCTAssertNil(components.query)
    XCTAssertTrue(components.fragment == "relay=" + relay.id)
  }

  func testRelayAllowsForClockSkewUnderFifteenMinutesAndContainsOnlyGuardedAuditFields() throws {
    let issued = Date(timeIntervalSince1970: 1000)
    let relay = try PocketRelay(now: issued)
    let report = AuditReport(flags: [], email: "Signed [PARTY_CONTRACTOR_1]", model: "test", modelVersion: nil, attempts: [])
    let result = try PocketResult(report: report, payload: "fixture", vault: Vault())
    let doc = relay.document(for: result)
    XCTAssertEqual(Set(doc.keys), ["createdAt", "expiresAt", "flags", "emailSanitized"])
    XCTAssertTrue(doc["createdAt"] is FieldValue)
    XCTAssertEqual((doc["expiresAt"] as? Timestamp)?.dateValue(), issued.addingTimeInterval(870))
    XCTAssertEqual(doc["flags"] as? [[String: String]], [])
    XCTAssertEqual(doc["emailSanitized"] as? String, report.email)
  }
}
