import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { corpus } from './corpus.mjs';

assert.equal(corpus.length, 20);
assert.equal(new Set(corpus.map(doc => doc.id)).size, corpus.length);
for (const doc of corpus) {
  assert.ok(doc.expected.length && new Set(doc.expected).size === doc.expected.length);
  assert.ok(doc.expected.every(value => doc.text.includes(value)));
  assert.ok(doc.expected.filter(value => value.includes(String.fromCharCode(64))).every(value => value.endsWith('.example')));
}
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { score, sum } = await vite.ssrLoadModule('/bench/score.mjs');
  const rules = corpus.map(doc => score(doc));
  const total = sum(rules, 'total');
  const ruleMisses = sum(rules, 'missed');
  const guardedMisses = sum(rules, 'guardedMissed');
  let nanoMisses;
  const file = new URL('./nano-result.json', import.meta.url);
  let measured;
  try { measured = JSON.parse(await readFile(file, 'utf8')); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (measured) {
    const digest = createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
    assert.equal(measured.corpusSha256, digest);
    assert.deepEqual(measured.rows.map(row => row.id), corpus.map(doc => doc.id));
    measured.rows.forEach((row, index) => {
      assert.equal(row.source, 'ON_DEVICE');
      assert.equal(row.total, rules[index].total);
      assert.ok(Number.isInteger(row.missed) && row.missed >= 0 && row.missed <= row.total);
    });
    nanoMisses = sum(measured.rows, 'missed');
    console.log('Chrome 實測時間 (UTC)', measured.completedAt);
  } else {
    if (process.env.CI) process.exitCode = 1;
  }
  console.log(corpus.length, '份文件，', total, '個標註');
  const pending = '待 Chrome 實測';
  console.table({
    '攔下或遮蔽': { '只用規則': total - ruleMisses, '規則加 Layer 3 斷路器': total - guardedMisses, 'Nano 加規則': nanoMisses === undefined ? pending : total - nanoMisses },
    '仍露出': { '只用規則': ruleMisses, '規則加 Layer 3 斷路器': guardedMisses, 'Nano 加規則': nanoMisses ?? pending },
    '封鎖的請求': { '只用規則': '—', '規則加 Layer 3 斷路器': sum(rules, 'blockedParts'), 'Nano 加規則': '—' },
  });
} finally { await vite.close(); }
