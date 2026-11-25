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
  const columns = (leaks, blocked = 0) => ({ '攔下或遮蔽': total - leaks, '仍露出': leaks, '封鎖的請求': blocked });
  const table = { '只用規則': columns(sum(rules, 'missed')), '規則加 Layer 3': columns(sum(rules, 'guardedMissed'), sum(rules, 'blockedParts')) };
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
    table['Nano 加規則'] = columns(sum(measured.rows, 'missed'));
    console.log('Chrome 實測時間 (UTC)', measured.completedAt);
  } else {
    table['Nano 加規則'] = { '攔下或遮蔽': '待 Chrome 實測', '仍露出': '待 Chrome 實測', '封鎖的請求': '—' };
    if (process.env.CI) process.exitCode = 1;
  }
  console.log(corpus.length, '份文件，', total, '個標註');
  console.table(table);
} finally { await vite.close(); }
