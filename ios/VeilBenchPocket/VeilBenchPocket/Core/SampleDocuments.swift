import Foundation

// Fictional sample shared with the web app (src/data/sampleDocuments.ts: doc_msa_text + doc_quote_scan).
// Reserved .example domains, 555 phone numbers and a non-issuable SSN; no real person or company.
enum SampleDocuments {
  static let masterAgreement = """
  MASTER INDEPENDENT CONTRACTOR & IP AGREEMENT

  This Agreement is entered into on November 18, 2026, between Northstar Ventures LLC ("Client"), represented by Marcus Vance (m.vance@northstar.example, +1-650-555-0182), and Elena Rostova ("Contractor", SSN 987-65-4321, email elena.rostova@rostova-studio.example).

  1. COMPENSATION & DEPOSIT
  Client agrees to pay Contractor a total fixed fee of $48,000 USD. A 50% upfront deposit ($24,000 USD) is due within 7 days of execution, wired to IBAN US89-4829-1104-8821, with the remaining 50% payable Net-15 upon delivery.

  2. INTELLECTUAL PROPERTY ASSIGNMENT (BROAD)
  Contractor hereby irrevocably assigns to Client all right, title, and interest in not only the Deliverables, but also any pre-existing libraries, tooling, frameworks, or side projects developed by Contractor during the term of this Agreement, whether or not created using Client resources.

  3. UNLIMITED LIABILITY & NON-COMPETE
  Contractor agrees to indemnify Client with unlimited personal liability for any consequential damages and shall not provide software engineering or AI consulting services to any technology company worldwide for 36 months following termination.
  """

  static let quoteSchedule = """
  NORTHSTAR VENTURES LLC — STATEMENT OF WORK QUOTE (Q-2026-881)
  Issued: 2026-11-18
  Contractor: Elena Rostova (SSN: 987-65-4321)
  Contact: elena.rostova@rostova-studio.example | +1-415-555-0194
  Wire Acct: IBAN US89-4829-1104-8821 (Routing 021000021)
  1. Total Fixed Engagement Fee: $42,000 USD
  2. Payment Schedule: 100% payable Net-90 ONLY after final written acceptance.
  3. Late Delivery Penalty: $1,500 per calendar day deducted automatically.
  4. Client Representative: Marcus Vance (m.vance@northstar.example)
  """

  /// The MSA plus its Schedule B quote, so the audit can compare the two fees ($48,000 vs $42,000).
  static let sampleContract = masterAgreement + "\n\nSCHEDULE B\n" + quoteSchedule
}
