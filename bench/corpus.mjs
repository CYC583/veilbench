// Braces mark the exact sensitive span. Each span is scored once per document.
const rows = [
  ['contract', 'Client: {TEST Aster Studio}. Fee: {USD 3,200}. Notices go to {intake[at]aster.example}.'],
  ['quotation', '{Fictional Oriole Workshop} quoted {EUR 850}. Reach the estimator at {202-555-0101}.'],
  ['change-order', 'Change requested by {Mira Quillow} under invoice {INV-2099-003}. New cap: {USD 1,275}.'],
  ['statement', 'Represented by {Liora Testwell}. Send confirmation to {case[at]rill.example}.'],
  ['lease', 'Unit assigned to {Pavo Testwick} at {88 Imaginary Lane}. Rent is {$950}.'],
  ['referral', 'Referral {MRN-990006} for {Fable Morrowtest}. DOB: {2091-03-17}.'],
  ['follow-up', 'Ask for {Tavi Quilltest} on {202-555-0107}. Visit scheduled on {April 7, 2099}.'],
  ['lab', 'Accession for {MRN-990008}. Results requested by {Dr. Neri Fallowtest}.'],
  ['discharge', 'Patient: {Lumi Testwell}. Alternate contact {ward[at]marigold.example}.'],
  ['benefits', 'Beneficiary {Oren Testmere} asked about a deductible of {USD 420}.'],
  ['service-order', 'Billing host {192.0.2.11}. Send renewals to {orders[at]cobalt.example}.'],
  ['incident', 'On-call engineer {Davi Testford} reported traffic from {198.51.100.12}.'],
  ['subscription', 'Contract for {Fictional Finch Works}. Renewal fee {GBP 135}; phone {202-555-0113}.'],
  ['credit', 'Resolve invoice {INV-2099-014} for {USD 2,240}; contact {ledger[at]cedar.example}.'],
  ['support', 'Please ask for {Vela Quillmock} about endpoint {203.0.113.15}.'],
  ['dispatch', 'Contact {202-555-0116} before delivery to {72 Imaginary Avenue}.'],
  ['consent', 'Signed by {Aris Fictwell} on {October 17, 2099}.'],
  ['transfer', 'Route to {Fictional Wren Cooperative}; account number {0000000000000018}.'],
  ['itinerary', 'Passenger {Kiri Quilltest} has reference {FICT-ITIN-019}. Write to {trip[at]tern.example}.'],
  ['memo', 'Reviewer {Adra Testling} approved {USD 760} for {Fictional Fern Assembly}.'],
];

export const corpus = rows.map(([id, marked]) => {
  const expected = [];
  const text = marked.replaceAll('[at]', String.fromCharCode(64)).replace(/\{([^{}]+)\}/g, (_, value) => {
    expected.push(value);
    return value;
  });
  return { id, text, expected };
});
