import { InferenceMode, InferenceSource } from 'firebase/ai';
export * from 'firebase/ai';

export function getGenerativeModel(_ai, options) {
  return {
    async generateContent(input) {
      const text = typeof input === 'string' ? input : input.filter(part => typeof part === 'string').join('\n');
      const local = options.mode !== InferenceMode.ONLY_IN_CLOUD;
      window.__vbCalls.push({ mode: options.mode, online: navigator.onLine, local });
      if (!local && !navigator.onLine) throw Error('Cloud fixture is offline');
      let result;
      if (text.includes('strict local PII detector')) result = { entities: [] };
      else if (text.includes('overallRisk')) result = { overallRisk: 'medium', headline: 'Offline payment review', flags: [{ id: 'payment', title: 'Payment terms', severity: 'medium', plainSummary: 'Review the payment term.', excerpt: 'Payment' }] };
      else if (text.includes('TASK A')) result = { contradictions: [], redlines: [] };
      else if (text.includes('TASK B')) result = { executiveSummary: 'Review before signing.', counterpartyPushback: [], readyToSendEmailSanitized: 'Please reconcile the terms. [PARTY_CONTRACTOR_1]' };
      else throw Error('Unknown AI fixture request');
      return { response: { text: () => JSON.stringify(result), inferenceSource: local ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD } };
    },
  };
}
