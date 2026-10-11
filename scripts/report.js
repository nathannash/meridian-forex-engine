#!/usr/bin/env node
// Phase 1 report: how much does exchange rate risk change the result?
//
// Usage:
//   node scripts/report.js [--country CL] [--balance 1000000] [--usd 15000]
//     [--local 30000] [--equity 0.6] [--horizon 40] [--paths 10000]
//     [--seed 42] [--uncertainty] [--json]

import { parseArgs } from 'node:util';
import { runPlan, fan, getAssetReturns, getCountryParams } from '../src/index.js';
import { correlation, quantile } from '../src/stats.js';

const { values: a } = parseArgs({
  options: {
    country: { type: 'string', default: 'CL' },
    balance: { type: 'string', default: '1000000' },
    usd: { type: 'string', default: '15000' },
    local: { type: 'string', default: '30000' },
    equity: { type: 'string', default: '0.6' },
    horizon: { type: 'string', default: '40' },
    paths: { type: 'string', default: '10000' },
    seed: { type: 'string', default: '42' },
    uncertainty: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});

const plan = {
  country: a.country.toUpperCase(),
  startBalance: Number(a.balance),
  budgetUsd: Number(a.usd),
  budgetLocal: Number(a.local),
  equityShare: Number(a.equity),
  horizon: Number(a.horizon),
  paths: Number(a.paths),
  seed: Number(a.seed),
  parameterUncertainty: a.uncertainty,
};

const r = runPlan(plan);
const { meta } = r;
const H = plan.horizon;
const checkpoints = [0, 5, 10, 20, 30, 40, 50, 60].filter((t) => t <= H);
const ratioFan = fan(r.on.fxRatio, r.on);
const spendFan = fan(r.on.spending, r.on);

// Historical correlation between the currency shock and real US equity
// returns in the same year, and the same figure inside the simulation.
let corr = null;
if (meta.tier !== 'home') {
  const assets = getAssetReturns();
  const p = getCountryParams(plan.country);
  const ys = assets.years.filter((y) => y in p.shocks);
  const hist = correlation(
    ys.map((y) => assets.equity[assets.years.indexOf(y)]),
    ys.map((y) => p.shocks[y]),
  );
  const eq = [];
  const dq = [];
  const n = Math.min(plan.paths, 2000);
  for (let i = 0; i < n; i++) {
    const y = r.draws.year(i, 1);
    eq.push(assets.equity[assets.years.indexOf(y)]);
    dq.push(p.shocks[y]);
  }
  corr = { historical: hist, simulated: correlation(eq, dq), years: ys.length };
}

const worstDecileRatio = quantile(Array.from({ length: plan.paths }, (_, i) => r.on.fxRatio[i * (H + 1) + H]), 0.9);

const out = {
  plan,
  data: {
    status: meta.dataStatus,
    asOf: meta.dataAsOf,
    sample: meta.sample,
    confidence: meta.confidence,
    regime: meta.regime,
    yearPool: r.yearPool,
  },
  parameters: meta.parameters,
  valuation: meta.valuation,
  successRate: { fxOff: r.off.successRate, fxDriftOnly: r.drift.successRate, fxOn: r.on.successRate },
  attribution: r.attribution,
  costOfLiving: checkpoints.map((t) => ({
    year: t,
    extrapolated: meta.extrapolationFromYear != null && t > meta.extrapolationFromYear,
    p10: ratioFan[0.1][t],
    p50: ratioFan[0.5][t],
    p90: ratioFan[0.9][t],
    spendingP50: spendFan[0.5][t],
    spendingP90: spendFan[0.9][t],
  })),
  worstDecile: {
    // At the 90th percentile of the cost multiplier in the final year, the
    // local budget buys this share of what it buys today if dollars are fixed.
    year: H,
    costMultiplier: worstDecileRatio,
    localLivingStandard: 1 / worstDecileRatio,
  },
  correlation: corr,
};

if (a.json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  print(out);
}

function print(o) {
  const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
  const pp = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pp`;
  const usd = (x) => `$${Math.round(x).toLocaleString('en-US')}`;
  const line = (s = '') => console.log(s);

  line(`MERIDIAN forex engine, phase 1 report: ${meta.name} (${meta.currency})`);
  if (o.data.status !== 'audited') {
    line(`!! DATA STATUS: ${o.data.status.toUpperCase()}. Numbers below demonstrate the method; they are not advice.`);
  }
  line();
  line('Plan');
  line(`  Portfolio ${usd(o.plan.startBalance)}, ${pct(o.plan.equityShare, 0)} US equity / ${pct(1 - o.plan.equityShare, 0)} US bonds, ${o.plan.horizon} years, ${o.plan.paths.toLocaleString()} paths, seed ${o.plan.seed}`);
  line(`  Budget per year: ${usd(o.plan.budgetUsd)} dollar-priced + ${usd(o.plan.budgetLocal)} locally priced (real, after tax)`);
  line();

  if (meta.tier === 'home') {
    line(`Home country: no exchange rate exposure. Success rate ${pct(o.successRate.fxOn)}.`);
    return;
  }

  const pr = o.parameters;
  line('Data and model');
  line(`  Sample ${o.data.sample.first}-${o.data.sample.last} (${o.data.sample.years} years), regime: ${o.data.regime}`);
  line(`  Confidence: ${o.data.confidence.label} (${o.data.confidence.parameters} parameters${o.data.confidence.regimeBreaks.length ? `, regime break ${o.data.confidence.regimeBreaks.map((b) => b.year).join(', ')}` : ''})`);
  line(`  Reversion speed: half-life ${pr.halfLifeYears.toFixed(1)} years  [${pr.phiSource}]`);
  line(`  Yearly shock size ${pct(pr.sigma)}, long-run spread ${pct(pr.longRunSd)}`);
  line(`  Year draws shared with the portfolio: ${o.data.yearPool.first}-${o.data.yearPool.last} (${o.data.yearPool.count} years)`);
  if (o.plan.parameterUncertainty) line('  Parameter uncertainty: on');
  line();

  const v = o.valuation;
  const cheapDear = v.gapToLongRun < 0 ? 'cheaper' : 'more expensive';
  line('Valuation gauge');
  line(`  Today ${meta.name} is ${pct(Math.abs(v.gapToLongRun))} ${cheapDear} than its long-run level for a dollar holder`);
  line(`  (${pct(v.percentile, 0)} of years in the sample were cheaper). Reversion is expected to ${v.gapToLongRun < 0 ? 'raise' : 'lower'} costs.`);
  line();

  line('Attribution: success rate (portfolio lasts the full horizon)');
  line(`  Exchange rate risk off            ${pct(o.successRate.fxOff)}`);
  line(`  Reversion to long-run level only  ${pct(o.successRate.fxDriftOnly)}   ${pp(o.attribution.fromReversion)}`);
  line(`  Full engine (reversion + shocks)  ${pct(o.successRate.fxOn)}   ${pp(o.attribution.fromShocks)}`);
  line(`  Total change from exchange rates                ${pp(o.attribution.successRateChange)}`);
  line();

  line('Cost-of-living fan: dollar cost of the local basket vs today (Q_t / Q_0)');
  line('  year    p10     p50     p90    median spend   p90 spend');
  for (const c of o.costOfLiving) {
    line(
      `  ${String(c.year).padStart(4)}  ${c.p10.toFixed(3)}   ${c.p50.toFixed(3)}   ${c.p90.toFixed(3)}   ${usd(c.spendingP50).padStart(10)}   ${usd(c.spendingP90).padStart(10)}${c.extrapolated ? '   (model extrapolation)' : ''}`,
    );
  }
  line();
  line('Worst decile');
  line(`  In the worst 10% of outcomes, by year ${o.worstDecile.year} the local basket costs ${o.worstDecile.costMultiplier.toFixed(2)}x today in dollars:`);
  line(`  a fixed dollar budget buys ${pct(o.worstDecile.localLivingStandard, 0)} of today's local standard of living.`);
  line();
  if (o.correlation) {
    line(`Equity / currency shock correlation: historical ${o.correlation.historical.toFixed(2)}, simulated ${o.correlation.simulated.toFixed(2)} (${o.correlation.years} years; formal check is phase 2)`);
    line();
  }
  line('Limits: one regime in the sample; fixed long-run level; tails bounded by the sample;');
  line('no convertibility risk; CPI is not your basket; annual steps. Not a forecast.');
}
