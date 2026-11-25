import type { DocumentCategory } from '../types/audit';
import type { ImageRedactionRegion } from '../types/privacy';

export interface SampleDocumentSpec {
  id: string;
  label: string;
  subtitle: string;
  labelZh: string;
  subtitleZh: string;
  category: DocumentCategory;
  documents: Array<{
    id: string;
    title: string;
    category: DocumentCategory;
    rawText: string;
    generateImage?: () => { dataUrl: string; regions: ImageRedactionRegion[] };
  }>;
}

/**
 * Draws a text line and records a pixel-exact, value-anchored redaction region for every sensitive
 * substring. Labels are placeholders: the workbench resolves them to the live Local Vault tokens.
 */
function trackedWriter(ctx: CanvasRenderingContext2D, regions: ImageRedactionRegion[]) {
  const { width: w, height: h } = ctx.canvas;
  return (text: string, x: number, y: number, fontPx: number, sensitive: string[] = []) => {
    ctx.fillText(text, x, y);
    for (const value of sensitive) {
      const idx = text.indexOf(value);
      if (idx < 0) throw new Error(`Sample scan is missing sensitive value: ${value}`);
      const left = x + ctx.measureText(text.slice(0, idx)).width;
      const valueWidth = ctx.measureText(value).width;
      regions.push({
        id: `reg_${regions.length + 1}`,
        label: '[REDACTED]',
        originalValue: value,
        bbox: { x: left / w, y: (y - fontPx * 0.95) / h, width: valueWidth / w, height: (fontPx * 1.25) / h },
      });
    }
  };
}

/**
 * Generates crisp, realistic PNG document scans client-side via Canvas
 * so judges can test multimodal pixel-level redaction with zero external broken links.
 */
function renderQuoteScanPng(): { dataUrl: string; regions: ImageRedactionRegion[] } {
  if (typeof document === 'undefined') {
    return { dataUrl: '', regions: [] };
  }
  const canvas = document.createElement('canvas');
  canvas.width = 880;
  canvas.height = 560;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', regions: [] };
  const regions: ImageRedactionRegion[] = [];
  const write = trackedWriter(ctx, regions);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#E2E5EA';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 840, 520);

  ctx.fillStyle = '#141518';
  ctx.font = 'bold 26px system-ui, sans-serif';
  write('NORTHSTAR VENTURES LLC — STATEMENT OF WORK QUOTE', 48, 76, 26, ['NORTHSTAR VENTURES LLC']);

  ctx.fillStyle = '#5C626E';
  ctx.font = '15px monospace';
  write('Quote ID: Q-2026-881   |   Issued: 2026-11-18   |   Confidential', 48, 108, 15,
    ['Q-2026-881', '2026-11-18']);

  ctx.fillStyle = '#F8F9FA';
  ctx.fillRect(48, 134, 784, 130);
  ctx.strokeStyle = '#E2E5EA';
  ctx.strokeRect(48, 134, 784, 130);

  ctx.fillStyle = '#141518';
  ctx.font = '17px monospace';
  write('Contractor: Elena Rostova (SSN: 987-65-4321)', 68, 170, 17, ['Elena Rostova', '987-65-4321']);
  write('Contact:    elena.rostova@rostova-studio.example | +1-415-555-0194', 68, 204, 17,
    ['elena.rostova@rostova-studio.example', '+1-415-555-0194']);
  write('Wire Acct:  IBAN US89-4829-1104-8821 (Routing 021000021)', 68, 238, 17,
    ['US89-4829-1104-8821', '021000021']);

  ctx.font = 'bold 18px system-ui, sans-serif';
  write('Commercial Terms (Attached Schedule B)', 48, 312, 18);

  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#141518';
  write('1. Total Fixed Engagement Fee: $42,000 USD', 48, 352, 16, ['$42,000']);
  write('2. Payment Schedule: 100% payable Net-90 ONLY after final written acceptance.', 48, 388, 16);
  write('3. Late Delivery Penalty: $1,500 per calendar day deducted automatically.', 48, 424, 16, ['$1,500']);
  write('4. Client Representative: Marcus Vance (m.vance@northstar.example)', 48, 460, 16,
    ['Marcus Vance', 'm.vance@northstar.example']);

  ctx.fillStyle = '#5C626E';
  ctx.font = '13px monospace';
  write('Signed Electronically — Authorized by Northstar Ventures LLC Finance Dept.', 48, 512, 13,
    ['Northstar Ventures LLC']);

  return { dataUrl: canvas.toDataURL('image/png'), regions };
}

function renderMedicalLabPng(): { dataUrl: string; regions: ImageRedactionRegion[] } {
  if (typeof document === 'undefined') {
    return { dataUrl: '', regions: [] };
  }
  const canvas = document.createElement('canvas');
  canvas.width = 880;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', regions: [] };
  const regions: ImageRedactionRegion[] = [];
  const write = trackedWriter(ctx, regions);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#E2E5EA';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 840, 500);

  ctx.fillStyle = '#0F766E';
  ctx.font = 'bold 24px system-ui, sans-serif';
  write('PACIFIC DIAGNOSTIC LABORATORY — CLINICAL PANEL', 48, 72, 24);

  ctx.fillStyle = '#F8F9FA';
  ctx.fillRect(48, 96, 784, 120);
  ctx.strokeStyle = '#E2E5EA';
  ctx.strokeRect(48, 96, 784, 120);

  ctx.fillStyle = '#141518';
  ctx.font = '16px monospace';
  write('Patient: David K. Lin    DOB: 1988-07-14    MRN: MRN-884920', 68, 132, 16,
    ['David K. Lin', '1988-07-14', 'MRN-884920']);
  write('Address: 742 Market St, Apt 9B, San Francisco, CA 94103', 68, 164, 16,
    ['742 Market St, Apt 9B, San Francisco, CA 94103']);
  write('Phone:   +1-415-555-0148    Ordering MD: Dr. Priya Nair', 68, 196, 16,
    ['+1-415-555-0148', 'Priya Nair']);

  ctx.font = 'bold 17px system-ui, sans-serif';
  write('Metabolic & Lipid Findings (2026-11-20)', 48, 260, 17, ['2026-11-20']);

  ctx.font = '16px monospace';
  ctx.fillStyle = '#BE123C';
  write('• HbA1c:              6.7 %   [HIGH — Ref: 4.0 - 5.6 %]', 48, 300, 16);
  write('• LDL Cholesterol:  178 mg/dL [HIGH — Ref: < 100 mg/dL]', 48, 336, 16);
  ctx.fillStyle = '#141518';
  write('• Fasting Glucose:  118 mg/dL [BORDERLINE — Ref: 70 - 99 mg/dL]', 48, 372, 16);
  write('• HDL Cholesterol:   44 mg/dL [NORMAL — Ref: > 40 mg/dL]', 48, 408, 16);
  write('• eGFR (Kidney):     96 mL/min [NORMAL]', 48, 444, 16);

  return { dataUrl: canvas.toDataURL('image/png'), regions };
}

export const SAMPLE_PACKS: SampleDocumentSpec[] = [
  {
    id: 'sample_contract_bundle',
    label: 'Contract + Quote Scan (Cross-Doc Conflict)',
    subtitle: '2 documents (Text + PNG): catches hidden payment conflict & IP trap',
    labelZh: '合約＋報價單掃描（跨文件矛盾）',
    subtitleZh: '2 份文件（文字＋PNG）：抓出隱藏的付款矛盾與智財陷阱',
    category: 'contract',
    documents: [
      {
        id: 'doc_msa_text',
        title: 'Master Consulting & IP Agreement.txt',
        category: 'contract',
        rawText: `MASTER INDEPENDENT CONTRACTOR & IP AGREEMENT

This Agreement is entered into on November 18, 2026, between Northstar Ventures LLC ("Client"), represented by Marcus Vance (m.vance@northstar.example, +1-650-555-0182), and Elena Rostova ("Contractor", SSN 987-65-4321, email elena.rostova@rostova-studio.example).

1. COMPENSATION & DEPOSIT
Client agrees to pay Contractor a total fixed fee of $48,000 USD. A 50% upfront deposit ($24,000 USD) is due within 7 days of execution, wired to IBAN US89-4829-1104-8821, with the remaining 50% payable Net-15 upon delivery.

2. INTELLECTUAL PROPERTY ASSIGNMENT (BROAD)
Contractor hereby irrevocably assigns to Client all right, title, and interest in not only the Deliverables, but also any pre-existing libraries, tooling, frameworks, or side projects developed by Contractor during the term of this Agreement, whether or not created using Client resources.

3. UNLIMITED LIABILITY & NON-COMPETE
Contractor agrees to indemnify Client with unlimited personal liability for any consequential damages and shall not provide software engineering or AI consulting services to any technology company worldwide for 36 months following termination.`,
      },
      {
        id: 'doc_quote_scan',
        title: 'Schedule B — Quote Q-2026-881.png',
        category: 'contract',
        rawText: `NORTHSTAR VENTURES LLC — STATEMENT OF WORK QUOTE (Q-2026-881)
Issued: 2026-11-18
Contractor: Elena Rostova (SSN: 987-65-4321)
Contact: elena.rostova@rostova-studio.example | +1-415-555-0194
Wire Acct: IBAN US89-4829-1104-8821 (Routing 021000021)
1. Total Fixed Engagement Fee: $42,000 USD
2. Payment Schedule: 100% payable Net-90 ONLY after final written acceptance.
3. Late Delivery Penalty: $1,500 per calendar day deducted automatically.
4. Client Representative: Marcus Vance (m.vance@northstar.example)`,
        generateImage: renderQuoteScanPng,
      },
    ],
  },
  {
    id: 'sample_medical_lab',
    label: 'Clinical Lab Report (Multimodal PNG)',
    subtitle: 'Patient PII + MRN pixel-redacted locally before clinical interpretation',
    labelZh: '臨床檢驗報告（多模態 PNG）',
    subtitleZh: '病患個資與病歷號先在本機像素塗黑，再做臨床解讀',
    category: 'medical',
    documents: [
      {
        id: 'doc_lab_scan',
        title: 'Pacific Diagnostic Lab Panel.png',
        category: 'medical',
        rawText: `PACIFIC DIAGNOSTIC LABORATORY — CLINICAL PANEL
Patient: David K. Lin | DOB: 1988-07-14 | MRN: MRN-884920
Address: 742 Market St, Apt 9B, San Francisco, CA 94103
Phone: +1-415-555-0148 | Ordering Physician: Dr. Priya Nair

Findings (2026-11-20):
- HbA1c: 6.7% (HIGH; Ref 4.0 - 5.6%)
- LDL Cholesterol: 178 mg/dL (HIGH; Ref < 100 mg/dL)
- Fasting Glucose: 118 mg/dL (BORDERLINE; Ref 70 - 99 mg/dL)
- HDL Cholesterol: 44 mg/dL (NORMAL; Ref > 40 mg/dL)
- eGFR: 96 mL/min (NORMAL)

Note: Patient reports occasional fatigue and requests plain-language preparation questions before follow-up visit.`,
        generateImage: renderMedicalLabPng,
      },
    ],
  },
  {
    id: 'sample_saas_invoice',
    label: 'Enterprise SaaS Renewal & Secret Leak',
    subtitle: 'Auto-renewal lock-in + accidentally pasted API key & bank IBAN',
    labelZh: '企業 SaaS 續約與密鑰外洩',
    subtitleZh: '自動續約綁約，加上誤貼的 API 金鑰與銀行 IBAN',
    category: 'financial',
    documents: [
      {
        id: 'doc_saas_renewal',
        title: 'CloudGrid Enterprise Renewal Notice.txt',
        category: 'financial',
        rawText: `CLOUDGRID ANALYTICS INC. — ENTERPRISE RENEWAL ORDER
Account Owner: Hannah Park (hannah.park@meridian-ops.example, +1-212-555-0177)
Billing Wire Account: Acct #9921-4402-7731
Internal Provisioning Debug Key (DO NOT SHARE): ${['AIza', 'SyD89xK2pL7vQ4mN1bR6tW3yZ9cF0eH2jK'].join('')}

RENEWAL TERMS:
- Annual Subscription Fee: $96,000 USD (22% price increase over prior year $78,500 USD).
- Auto-Renewal Trap: This agreement automatically renews for an additional 24-month non-cancellable term unless written notice is delivered via certified physical mail at least 90 days prior to expiration.
- Usage Overage: Any API call volume exceeding monthly baseline is billed at 400% standard rate without cap or prior alert.`,
      },
    ],
  },
];
