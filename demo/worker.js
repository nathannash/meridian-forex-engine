// Runs the Monte Carlo off the main thread. Everything is seeded, so the same
// inputs always return the same numbers.
import { runPlan, fan } from '../src/index.js';

self.onmessage = (e) => {
  const t0 = performance.now();
  const r = runPlan(e.data);
  const ps = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
  const ratio = fan(r.on.fxRatio, r.on, ps);
  const spend = fan(r.on.spending, r.on, [0.5, 0.9]);
  self.postMessage({
    seed: e.data.seed,
    meta: r.meta,
    yearPool: r.yearPool,
    success: { off: r.off.successRate, drift: r.drift.successRate, on: r.on.successRate },
    attribution: r.attribution,
    ratio: Object.fromEntries(ps.map((p) => [p, Array.from(ratio[p])])),
    spend: { p50: Array.from(spend[0.5]), p90: Array.from(spend[0.9]) },
    ms: performance.now() - t0,
  });
};
