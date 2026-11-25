import XCTest
@testable import VeilBenchPocket

final class PIIShieldTests: XCTestCase {
  private let rawValues = [
    "Marcus Vance", "Elena Rostova", "Northstar Ventures LLC", "987-65-4321", "$48,000", "$24,000",
    "November 18, 2026", "m.vance@northstar.example", "elena.rostova@rostova-studio.example",
    "+1-650-555-0182", "US89-4829-1104-8821",
  ]

  func testSampleContractRegexOnlyRemovesAllKeyValues() {
    let result = PIIShield.runLocalAirlock(rawText: SampleDocuments.masterAgreement)
    for value in rawValues {
      XCTAssertNil(result.sanitizedText.range(of: value, options: .caseInsensitive), "leaked: \(value)")
    }
    XCTAssertTrue(result.sanitizedText.contains("[PARTY_CLIENT_1]"))
    XCTAssertTrue(result.sanitizedText.contains("[PARTY_CONTRACTOR_1]"))
    XCTAssertTrue(result.sanitizedText.contains("[MONEY_AMOUNT_1]"))
    XCTAssertEqual(result.vault.entry(forOriginal: "Northstar Ventures LLC")?.role, .partyClient)
    XCTAssertEqual(result.vault.entry(forOriginal: "Elena Rostova")?.role, .partyContractor)
    XCTAssertEqual(result.vault.entry(forOriginal: "Marcus Vance")?.role, .personName)
    XCTAssertEqual(result.vault.entry(forOriginal: "$48,000")?.token, "[MONEY_AMOUNT_1]")
    XCTAssertEqual(result.stats.byOnDevice, 0)
  }

  func testFullSampleWithScheduleCoversCaseVariantsAndRouting() {
    let result = PIIShield.runLocalAirlock(rawText: SampleDocuments.sampleContract)
    for value in rawValues + ["NORTHSTAR VENTURES LLC", "$42,000", "$1,500", "021000021", "2026-11-18", "+1-415-555-0194"] {
      XCTAssertNil(result.sanitizedText.range(of: value, options: .caseInsensitive), "leaked: \(value)")
    }
    // Same entity, same token everywhere (all-caps header folds onto the party token).
    XCTAssertEqual(result.sanitizedText.components(separatedBy: "[PARTY_CLIENT_1]").count - 1, 2)
  }

  func testOnDeviceCandidatesAreMergedAndHallucinationsDropped() {
    let text = "Signed between Acme Robotics and Jane Q Public at 12 Harbor Point."
    let result = PIIShield.runLocalAirlock(rawText: text, onDeviceCandidates: [
      PIICandidate(value: "Acme Robotics", role: .organization, layer: .onDevice),
      PIICandidate(value: "Jane Q Public", role: .personName, layer: .onDevice),
      PIICandidate(value: "John Nobody", role: .personName, layer: .onDevice), // not in text
      PIICandidate(value: "Client", role: .organization, layer: .onDevice),    // generic term
    ])
    XCTAssertEqual(result.sanitizedText, "Signed between [ORGANIZATION_1] and [PERSON_NAME_1] at 12 Harbor Point.")
    XCTAssertEqual(result.stats.byOnDevice, 2)
    XCTAssertNil(result.vault.entry(forOriginal: "John Nobody"))
  }

  func testOnDeviceMislabeledStructuredValuesYieldToRules() {
    let result = PIIShield.runLocalAirlock(rawText: SampleDocuments.sampleContract, onDeviceCandidates: [
      PIICandidate(value: "IBAN US89-4829-1104-8821", role: .address, layer: .onDevice),
      PIICandidate(value: "Routing 021000021", role: .address, layer: .onDevice),
    ])
    XCTAssertEqual(result.vault.entry(forOriginal: "US89-4829-1104-8821")?.role, .bankAccount)
    XCTAssertEqual(result.vault.entry(forOriginal: "021000021")?.role, .bankAccount)
    XCTAssertFalse(result.vault.entries.contains { $0.role == .address })
  }

  func testContextualPartyRoleUpgradesOnDevicePersonName() {
    let result = PIIShield.runLocalAirlock(rawText: SampleDocuments.masterAgreement, onDeviceCandidates: [
      PIICandidate(value: "Elena Rostova", role: .personName, layer: .onDevice),
    ])
    XCTAssertEqual(result.vault.entry(forOriginal: "Elena Rostova")?.role, .partyContractor)
    XCTAssertEqual(result.vault.entry(forOriginal: "Elena Rostova")?.layer, .onDevice)
  }

  func testLongestMatchWinsAndCaseInsensitiveNames() {
    let text = "Northstar Ventures LLC (\"Client\") signed. NORTHSTAR VENTURES LLC pays. northstar ventures llc agrees."
    let result = PIIShield.runLocalAirlock(rawText: text, onDeviceCandidates: [
      PIICandidate(value: "Northstar Ventures", role: .organization, layer: .onDevice),
    ])
    XCTAssertFalse(result.sanitizedText.lowercased().contains("northstar"))
    XCTAssertEqual(result.sanitizedText.components(separatedBy: "[PARTY_CLIENT_1]").count - 1, 3)
  }

  func testRehydrateRestoresOriginalAndLeavesUnknownTokens() {
    let result = PIIShield.runLocalAirlock(rawText: SampleDocuments.masterAgreement)
    XCTAssertEqual(PIIShield.rehydrate(result.sanitizedText, vault: result.vault), SampleDocuments.masterAgreement)
    XCTAssertEqual(PIIShield.rehydrate("[PERSON_NAME_99] stays", vault: result.vault), "[PERSON_NAME_99] stays")
  }

  func testPreExistingTokenInInputIsNotReused() {
    let result = PIIShield.runLocalAirlock(rawText: "[EMAIL_1] and a@b.example")
    XCTAssertEqual(result.sanitizedText, "[EMAIL_1] and [EMAIL_2]")
  }
}

final class PreFlightGuardTests: XCTestCase {
  private func sample() -> AirlockResult { PIIShield.runLocalAirlock(rawText: SampleDocuments.sampleContract) }

  func testSanitizedSamplePasses() {
    let r = sample()
    let payload = CloudAuditor.buildPayload(sanitizedText: r.sanitizedText,
                                            hints: RelationalHints.format(RelationalHints.build(from: r.vault)))
    let check = PreFlightGuard.assertZeroLeak(payload: payload, vault: r.vault)
    XCTAssertTrue(check.passed, "\(check.leaks)")
  }

  func testReinjectingAnyVaultOriginalFails() {
    let r = sample()
    XCTAssertFalse(r.vault.entries.isEmpty)
    for entry in r.vault.entries {
      let tampered = r.sanitizedText + "\nNote: " + entry.originalValue
      let check = PreFlightGuard.assertZeroLeak(payload: tampered, vault: r.vault)
      XCTAssertFalse(check.passed, "re-injected \(entry.token) was not caught")
    }
  }

  func testNamesAreCheckedCaseInsensitively() {
    let r = sample()
    let check = PreFlightGuard.assertZeroLeak(payload: r.sanitizedText + " marcus VANCE", vault: r.vault)
    XCTAssertFalse(check.passed)
  }

  func testRawFormatsBlockedEvenWithEmptyVault() {
    for raw in ["ping x@y.example", "SSN 123-45-6789", "IBAN DE89-3704-0044-0532", "call +1-212-555-0100",
                "due March 3, 2027", "represented by Jane Doe"] {
      XCTAssertFalse(PreFlightGuard.assertZeroLeak(payload: raw, vault: Vault()).passed, raw)
    }
    XCTAssertTrue(PreFlightGuard.assertZeroLeak(payload: "[PARTY_CLIENT_1] pays [MONEY_AMOUNT_1] Net-15.", vault: Vault()).passed)
  }

  func testMaskedSnippetNeverShowsFullValue() {
    let leak = LeakFinding(source: .vaultOriginal, reason: "", matchedSnippet: "Marcus Vance")
    XCTAssertFalse(leak.maskedSnippet.contains("Vance"))
  }
}

final class RelationalHintsTests: XCTestCase {
  func testDiffPlaceholderComputedLocally() {
    var vault = Vault()
    let a = vault.insert(value: "$48,000", role: .moneyAmount)
    let b = vault.insert(value: "$42,000", role: .moneyAmount)
    let out = RelationalHints.rehydrateWithLocalMath("Fee cut of {{DIFF:\(a.token)-\(b.token)}} vs \(a.token).", vault: vault)
    XCTAssertEqual(out, "Fee cut of $6,000 (12.5%) vs $48,000.")
    XCTAssertEqual(RelationalHints.applyLocalMath("{{DIFF:\(b.token) - \(a.token)}}", vault: vault), "-$6,000 (12.5%)")
  }

  func testDiffOnFullSampleUsesVaultTokens() {
    let r = PIIShield.runLocalAirlock(rawText: SampleDocuments.sampleContract)
    let t48 = r.vault.entry(forOriginal: "$48,000")!.token
    let t42 = r.vault.entry(forOriginal: "$42,000")!.token
    XCTAssertEqual(RelationalHints.applyLocalMath("{{DIFF:\(t48)-\(t42)}}", vault: r.vault), "$6,000 (12.5%)")
  }

  func testHintsAreValueFreeAndBucketed() {
    let r = PIIShield.runLocalAirlock(rawText: SampleDocuments.sampleContract)
    let text = RelationalHints.format(RelationalHints.build(from: r.vault))
    XCTAssertTrue(text.contains("[MONEY_AMOUNT_1] > [MONEY_AMOUNT_2] (difference >30% of the larger amount)"), text)
    XCTAssertTrue(text.contains("{{DIFF:[TOKEN_A]-[TOKEN_B]}}"))
    for raw in ["48,000", "42,000", "24,000", "November", "2026"] { XCTAssertFalse(text.contains(raw), raw) }
  }

  func testUnknownOrNonNumericTokensUntouched() {
    var vault = Vault()
    let name = vault.insert(value: "Elena Rostova", role: .personName)
    let s = "{{DIFF:\(name.token)-[MONEY_AMOUNT_9]}}"
    XCTAssertEqual(RelationalHints.applyLocalMath(s, vault: vault), s)
  }

  func testDateParsing() {
    XCTAssertNotNil(RelationalHints.parseCalendarDate("November 18, 2026"))
    XCTAssertNotNil(RelationalHints.parseCalendarDate("2026-11-18"))
    XCTAssertNil(RelationalHints.parseCalendarDate("soon"))
  }
}

final class CloudResilienceTests: XCTestCase {
  private struct FakeError: Error { let status: Int }
  private static let classifier: @Sendable (Error) -> ClassifiedCloudError = {
    CloudResilience.classify(status: ($0 as? FakeError)?.status, message: "")
  }

  func testRetriesOnceThenFallsBackToFlash() async {
    let calls = Calls()
    let result = await CloudResilience.run(backoff: { _ in }, classify: Self.classifier) { model -> String in
      await calls.add(model)
      if model == CloudResilience.primaryModel { throw FakeError(status: 503) }
      return "ok"
    }
    let made = await calls.list
    XCTAssertEqual(made, ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.6-flash"])
    guard case .success(let s) = result else { return XCTFail("expected success") }
    XCTAssertEqual(s.model, "gemini-3.6-flash")
    XCTAssertEqual(s.attempts.count, 3)
  }

  func testAppCheckRejectionStopsImmediately() async {
    let calls = Calls()
    let result = await CloudResilience.run(backoff: { _ in }, classify: Self.classifier) { model -> String in
      await calls.add(model)
      throw FakeError(status: 403)
    }
    let count = await calls.list.count
    XCTAssertEqual(count, 1)
    guard case .failure(let f) = result else { return XCTFail("expected failure") }
    XCTAssertEqual(f.kind, .appCheck)
    XCTAssertFalse(f.userMessage.contains("http"))
  }

  func testClassification() {
    XCTAssertEqual(CloudResilience.classify(status: 429, message: "Resource exhausted").kind, .rateLimited)
    XCTAssertEqual(CloudResilience.classify(status: 429, message: "quota exceeded").kind, .quota)
    XCTAssertEqual(CloudResilience.classify(status: 500, message: "").kind, .overloaded)
    XCTAssertEqual(CloudResilience.classify(status: 404, message: "").kind, .modelUnavailable)
    XCTAssertEqual(CloudResilience.classify(status: nil, message: "", urlErrorCode: URLError.notConnectedToInternet.rawValue).kind, .network)
    XCTAssertEqual(CloudResilience.statusFromDescription("BackendError(httpResponseCode: 503, message"), 503)
  }

  func testNSErrorBackendDomainIsUnwrapped() {
    let backend = NSError(domain: "com.google.firebase.firebaseai.BackendError", code: 429, userInfo: nil)
    struct Wrapper: Error { let underlying: Error }
    XCTAssertEqual(CloudResilience.classify(Wrapper(underlying: backend)).status, 429)
  }
}

private actor Calls {
  var list: [String] = []
  func add(_ s: String) { list.append(s) }
}

final class TextChunkerTests: XCTestCase {
  func testChunksAreContiguousAndBounded() {
    let paragraph = String(repeating: "word ", count: 150) + "\n\n"
    let text = String(repeating: paragraph, count: 12)
    let chunks = TextChunker.chunk(text, maxChars: 3_000)
    XCTAssertGreaterThan(chunks.count, 1)
    XCTAssertTrue(chunks.allSatisfy { $0.count <= 3_000 })
    XCTAssertEqual(chunks.joined(), text)
    XCTAssertEqual(TextChunker.chunk("short"), ["short"])
    XCTAssertEqual(TextChunker.chunk(""), [])
  }
}
