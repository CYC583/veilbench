import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env;
before(async () => {
  const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
  if (!endpoint) throw new Error('Run via firebase emulators:exec --only firestore');
  const { hostname, port } = new URL('http://' + endpoint);
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  env = await initializeTestEnvironment({
    projectId: 'demo-veilbench',
    firestore: { host: hostname, port: Number(port), rules },
  });
});
after(async () => { await env?.cleanup(); });

function session(id) {
  return { id, uid: 'owner', title: 'Sample', category: 'contract', documentCount: 1,
    sanitizedExcerpts: ['[PARTY_CLIENT_1]'], zeroLeakProofHash: 'sample',
    updatedAt: '2026-11-26T00:00:00Z' };
}
function ref(uid, id) {
  return doc(env.authenticatedContext(uid).firestore(), 'sanitized_sessions', id);
}

test('owner can write a valid session', async () => {
  await assertSucceeds(setDoc(ref('owner', 'own'), session('own')));
});
test('another user cannot read an existing session', async () => {
  await assertSucceeds(setDoc(ref('owner', 'private'), session('private')));
  await assertFails(getDoc(ref('other', 'private')));
});
test('an unlisted field rejects an otherwise valid write', async () => {
  const id = 'extra';
  await assertFails(setDoc(ref('owner', id), { ...session(id), rawTxt: 'synthetic' }));
});
