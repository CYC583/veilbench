import type { DeepAuditResult } from '../types/audit';

/**
 * Recorded Stage 4 outputs for the built-in sample packs (T-3 demo cache).
 *
 * These are verbatim responses from real Firebase AI Logic calls on the exact sanitized envelope the
 * sample produces, captured from the app's own Zero-PII Firestore sessions. They contain tokens only and
 * are re-hydrated locally like a live result. They are shown ONLY when the live cloud call fails, always
 * with a "CACHED DEMO RESULT" badge and a retry action, and never for user-supplied documents.
 * Content is intentionally unedited model output.
 */
export interface GoldenAuditRecord {
  recordedAt: string;
  analysisModel: string;
  playbookModel: string;
  analysis: Pick<DeepAuditResult, 'contradictions' | 'redlines'>;
  playbook: DeepAuditResult['playbook'];
}

export const SAMPLE_GOLDEN_AUDITS: Record<string, GoldenAuditRecord> = {
  sample_contract_bundle: {
    recordedAt: '2026-11-25T17:06:17.934Z',
    analysisModel: 'gemini-3.5-flash-lite',
    playbookModel: 'gemini-3.5-flash',
    analysis: {
      contradictions: [
        {
          id: 'c1',
          docATitle: 'Master Consulting & IP Agreement.txt',
          docBTitle: 'Schedule B — Quote [ID_NUMBER_2].png',
          severity: 'high',
          description:
            'Total fixed engagement fee differs between documents: [MONEY_AMOUNT_1] in Master Agreement versus [MONEY_AMOUNT_3] in Schedule B (difference {{DIFF:[MONEY_AMOUNT_1]-[MONEY_AMOUNT_3]}}).',
          recommendation:
            'Amend Schedule B to match the Master Agreement fixed fee exactly or execute a formal addendum.',
        },
        {
          id: 'c2',
          docATitle: 'Master Consulting & IP Agreement.txt',
          docBTitle: 'Schedule B — Quote [ID_NUMBER_2].png',
          severity: 'high',
          description:
            'Payment terms conflict directly: Master Agreement specifies 50% upfront deposit ([MONEY_AMOUNT_2]) and Net-15 balance, while Schedule B mandates 100% payable Net-90 after acceptance.',
          recommendation:
            'Harmonize payment schedules across both documents to reflect a single agreed structure.',
        },
      ],
      redlines: [
        {
          id: 'r1',
          clauseTitle: 'COMPENSATION & DEPOSIT',
          severity: 'high',
          originalExcerpt:
            'Client agrees to pay Contractor a total fixed fee of [MONEY_AMOUNT_1] USD. A 50% upfront deposit ([MONEY_AMOUNT_2] USD) is due within 7 days of execution',
          proposedRevision:
            'Client agrees to pay Contractor a total fixed fee of [MONEY_AMOUNT_3] USD. A 50% upfront deposit is due within 7 days of execution',
          rationale: 'Aligns the Master Agreement fee with the quoted amount in Schedule B.',
        },
      ],
    },
    playbook: {
      executiveSummary:
        'Audit reveals significant contradictions between the Master Agreement and Schedule B. Total compensation conflicts between [MONEY_AMOUNT_1] and [MONEY_AMOUNT_3], reflecting a variance of {{DIFF:[MONEY_AMOUNT_1]-[MONEY_AMOUNT_3]}}. Payment terms also diverge between a 50% deposit with Net-15 balance versus 100% Net-90 payment. Furthermore, the Master Agreement contains high-risk broad IP assignment, unlimited personal liability, and a 36-month non-compete clause.',
      counterpartyPushback: [
        {
          objection: "The client insists on Schedule B's 100% Net-90 payment structure after final acceptance.",
          recommendedResponse:
            "Reject Net-90 terms and enforce the Master Agreement's 50% deposit ([MONEY_AMOUNT_2]) upfront to secure project resources and manage cash flow risk.",
        },
        {
          objection: 'The client requests retaining [MONEY_AMOUNT_3] as the total fee as outlined in Schedule B.',
          recommendedResponse:
            'Reconcile the fee variance of {{DIFF:[MONEY_AMOUNT_1]-[MONEY_AMOUNT_3]}} by holding firm on [MONEY_AMOUNT_1] as agreed in the Master Agreement.',
        },
      ],
      readyToSendEmailSanitized:
        "Dear [PERSON_NAME_1],\n\nWe have reviewed the Master Agreement and Schedule B ([ID_NUMBER_2]) for [PARTY_CONTRACTOR_1] and identified key discrepancies that require alignment prior to execution.\n\nFirst, total compensation differs between [MONEY_AMOUNT_1] in the Master Agreement and [MONEY_AMOUNT_3] in Schedule B, creating a variance of {{DIFF:[MONEY_AMOUNT_1]-[MONEY_AMOUNT_3]}}. Second, payment terms conflict between the 50% deposit ([MONEY_AMOUNT_2]) with Net-15 balance versus Schedule B's 100% Net-90 payment timeline.\n\nPlease confirm agreement on the [MONEY_AMOUNT_1] fee structure with the 50% upfront deposit. Additionally, we need to revise the pre-existing IP assignment, liability, and non-compete terms to standard commercial boundaries.\n\nBest regards,\n[PARTY_CLIENT_1]",
    },
  },
};
