import { writeFileSync } from 'node:fs';
import { renderMetricsDoc } from '../src/metrics/doc.ts';

const out = new URL('../../../docs/metrics.md', import.meta.url);
writeFileSync(out, renderMetricsDoc());
console.log(`docs/metrics.md geschrieben (${out.pathname})`);
