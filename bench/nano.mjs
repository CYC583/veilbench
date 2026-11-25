import { corpus } from './corpus.mjs';
import { score } from './score.mjs';
import { runOnDevicePiiScan } from '../src/services/aiLogicService.ts';
import { parseNanoEntitiesDefensive } from '../src/core/piiShield.ts';
import { DEFAULT_REMOTE_HYBRID_CONFIG } from '../src/config/remoteConfig.ts';
const run = document.querySelector('#run');
const progress = document.querySelector('#progress');
const save = document.querySelector('#save');
run.onclick = async () => {
  run.disabled = true;
  save.hidden = true;
  if (save.href) URL.revokeObjectURL(save.href);
  progress.textContent = '';
  try {
    const rows = [];
    for (const doc of corpus) {
      progress.textContent += doc.id + ' … ';
      const { candidates, telemetry } = await runOnDevicePiiScan({ rawText: doc.text, remoteConfig: DEFAULT_REMOTE_HYBRID_CONFIG, parseDefensive: parseNanoEntitiesDefensive });
      if (telemetry.actualSource !== 'ON_DEVICE') throw Error(doc.id + ': ' + telemetry.actualSource);
      const { id, total, missed } = score(doc, candidates);
      rows.push({ id, total, missed, source: telemetry.actualSource, latencyMs: telemetry.latencyMs });
      progress.textContent += telemetry.actualSource + ' ' + telemetry.latencyMs + ' ms；仍露出 ' + missed + '/' + total + '\n';
    }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(corpus)));
    const corpusSha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    const result = { completedAt: new Date().toISOString(), browser: navigator.userAgent, corpusSha256, rows };
    save.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], { type: 'application/json' }));
    save.hidden = false;
    progress.textContent += '完成 ' + rows.length + '/' + corpus.length;
  } catch (err) { progress.textContent += '中止：' + err.message; }
  finally { run.disabled = false; }
};
