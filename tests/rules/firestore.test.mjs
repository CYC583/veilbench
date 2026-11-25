import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

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

const relay = () => ({
  createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  flags: [{ title: 'Term', severity: 'high', summary: 'Review [PARTY_CLIENT_1].' }],
  emailSanitized: 'Dear [PARTY_CLIENT_1]',
});
const db = user => (user ? env.authenticatedContext(user) : env.unauthenticatedContext()).firestore();
const handoff = (user, code) => doc(db(user), 'relays', code);

test('authenticated holder can get one live relay across devices, never list or mutate it', async () => {
  const ref = handoff('phone', '004291');
  await assertSucceeds(setDoc(ref, relay()));
  await assertSucceeds(getDoc(handoff('browser', '004291')));
  await assertFails(getDoc(handoff(null, '004291')));
  await assertFails(getDocs(collection(db('browser'), 'relays')));
  await assertFails(setDoc(ref, relay()));
  await assertFails(deleteDoc(ref));
});

test('reject anonymous writes, invalid codes, expiry, oversized or unlisted nested fields', async () => {
  await assertFails(setDoc(handoff(null, '111111'), relay()));
  await assertFails(setDoc(handoff('phone', '01234A'), relay()));
  const flag = relay().flags[0];
  for (const fields of [
    { vault: {} }, { createdAt: Timestamp.fromMillis(100) }, { expiresAt: Timestamp.fromMillis(100) },
    { expiresAt: Timestamp.fromMillis(Date.now() + 25 * 3600_000) }, { flags: Array(6).fill(flag) },
    { flags: [flag,flag,flag,flag,{ ...flag, rawText: 'private' }] }, { flags: [{ ...flag, severity: 'other' }] },
    { flags: [{ ...flag, title: 'x'.repeat(121) }] }, { flags: [{ ...flag, summary: 'x'.repeat(1201) }] },
    { emailSanitized: 'x'.repeat(5001) },
  ]) await assertFails(setDoc(handoff('phone', '111111'), { ...relay(), ...fields }));
});

test('expired relay cannot be retrieved even by its creator', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'relays', '492100'), {
    ...relay(), expiresAt: Timestamp.fromMillis(100),
  }));
  await assertFails(getDoc(handoff('phone', '492100')));
});
