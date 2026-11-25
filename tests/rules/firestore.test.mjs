import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, where, limit, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

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
  ownerUid: 'phone',
  createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  flags: [{ title: 'Term', severity: 'high', summary: 'Review [PARTY_CLIENT_1].' }],
  emailSanitized: 'Dear [PARTY_CLIENT_1]',
});
const db = user => (user ? env.authenticatedContext(user) : env.unauthenticatedContext()).firestore();
const handoff = (user, code) => doc(db(user), 'relays', code);

test('only the phone can select one recipient after the browser requests approval', async () => {
  const code = '004291';
  const phone = handoff('phone', code);
  const browser = handoff('browser', code);
  const stranger = handoff('stranger', code);
  const request = (user, uid) => doc(db(user), 'relays', code, 'requests', uid);
  const approval = user => doc(db(user), 'relays', code, 'pairing', 'approval');
  const claim = { challenge: '427902', createdAt: serverTimestamp() };
  const grant = { receiverUid: 'browser', challenge: claim.challenge, approvedAt: serverTimestamp() };
  await assertSucceeds(setDoc(phone, relay()));
  await assertSucceeds(getDoc(phone));
  await assertFails(getDoc(browser));
  await assertFails(getDoc(handoff(null, code)));
  await assertFails(setDoc(request('stranger', 'browser'), claim));
  await assertSucceeds(setDoc(request('browser', 'browser'), claim));
  await assertFails(setDoc(request('browser', 'browser'), claim));
  await assertFails(getDoc(request('stranger', 'browser')));
  const lookup = user => query(collection(db(user), 'relays', code, 'requests'), where('challenge','==',claim.challenge), limit(2));
  await assertSucceeds(getDocs(lookup('phone')));
  await assertFails(getDocs(lookup('stranger')));
  await assertFails(getDocs(collection(db('phone'), 'relays', code, 'requests')));
  await assertFails(setDoc(approval('browser'), grant));
  await assertFails(setDoc(approval('phone'), { ...grant, challenge: '000000' }));
  await assertFails(getDoc(browser));
  await assertSucceeds(setDoc(approval('phone'), grant));
  await assertSucceeds(getDoc(browser));
  await assertFails(getDoc(stranger));
  await assertFails(setDoc(approval('phone'), grant));
  await assertFails(deleteDoc(approval('phone')));
  await assertFails(getDocs(collection(db('browser'), 'relays')));
  await assertFails(setDoc(phone, relay()));
  await assertFails(deleteDoc(phone));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'relays', code), {
    ...relay(), expiresAt: Timestamp.fromMillis(100),
  }));
  await assertFails(getDoc(browser));
  await assertFails(getDoc(phone));
  await assertFails(getDoc(request('browser', 'browser')));
});

test('reject anonymous writes, invalid codes, expiry, oversized or unlisted nested fields', async () => {
  await assertFails(setDoc(handoff(null, '111111'), relay()));
  await assertFails(setDoc(handoff('phone', '01234A'), relay()));
  const flag = relay().flags[0];
  for (const fields of [
    { ownerUid: 'somebody-else' }, { vault: {} }, { createdAt: Timestamp.fromMillis(100) }, { expiresAt: Timestamp.fromMillis(100) },
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
