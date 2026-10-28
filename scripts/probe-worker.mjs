// Isolated probe runner. Invoked by scripts/lib.mjs as:
//   node --max-old-space-size=256 scripts/probe-worker.mjs <lx|mf> <file> <out.json>
// A crash, hang or runaway allocation here only kills this child process.
import fs from 'node:fs';
import { probeLxInProcess, probePluginInProcess } from './lib.mjs';

const [kind, file, out] = process.argv.slice(2);

try {
  const result = kind === 'lx' ? await probeLxInProcess(file) : probePluginInProcess(file);
  fs.writeFileSync(out, JSON.stringify(result));
} catch (e) {
  fs.writeFileSync(out, JSON.stringify({ error: String(e && e.message || e), load: 'failed', syntax: 'ok' }));
}
process.exit(0);
