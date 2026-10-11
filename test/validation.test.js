// Phase 1 exit tests from the design's validation plan:
// reproducibility, off switch and bounded spread.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxEngine, getCountryParams, runPlan, simulate, createYearDraws, getAssetReturns, sharedYears } from '../src/index.js';
import { stdev } from '../src/stats.js';

const PLAN = { country: 'CL', startBalance: 1_000_000, budgetUsd: 15_000, budgetLocal: 30_000, horizon: 40, paths: 2000 };

test('reproducibility: the same seed produces identical paths', () => {
  const a = createFxEngine({ country: 'CL', horizon: 60, paths: 500, seed: 7 });
  const b = createFxEngine({ country: 'CL', horizon: 60, paths: 500, seed: 7 });
  for (const i of [0, 1, 250, 499]) assert.deepEqual(a.path(i), b.path(i));

  // Path i does not depend on how many paths were requested or on call order.
  const c = createFxEngine({ country: 'CL', horizon: 60, paths: 1000, seed: 7 });
  assert.deepEqual(c.path(499), a.path(499));
  assert.deepEqual(c.path(0), a.path(0));

  const d = createFxEngine({ country: 'CL', horizon: 60, paths: 500, seed: 8 });
  assert.notDeepEqual(d.path(0), a.path(0));
});

test('reproducibility: whole-plan results are identical for the same seed', () => {
  const a = runPlan({ ...PLAN, seed: 3 });
  const b = runPlan({ ...PLAN, seed: 3 });
  assert.equal(a.on.successRate, b.on.successRate);
  assert.deepEqual(a.on.balances, b.on.balances);
});

test('reproducibility: parameter uncertainty is seeded too', () => {
  const a = createFxEngine({ country: 'CL', horizon: 30, paths: 50, seed: 11, parameterUncertainty: true });
  const b = createFxEngine({ country: 'CL', horizon: 30, paths: 50, seed: 11, parameterUncertainty: true });
  assert.deepEqual(a.path(17), b.path(17));
  const plain = createFxEngine({ country: 'CL', horizon: 30, paths: 50, seed: 11 });
  assert.notDeepEqual(a.path(17), plain.path(17));
});

test('off switch: sigma = 0 and q0 = mu reproduce the calculator without the engine exactly', () => {
  const { mu } = getCountryParams('CL').model;
  const r = runPlan({ ...PLAN, fxOverrides: { sigma: 0, q0: mu } });
  assert.equal(r.on.successRate, r.off.successRate);
  assert.deepEqual(r.on.balances, r.off.balances);
  assert.deepEqual(r.on.spending, r.off.spending);
  assert.equal(r.attribution.successRateChange, 0);
});

test('off switch: every path is exactly 1 when sigma = 0 and q0 = mu', () => {
  const { mu } = getCountryParams('CL').model;
  const fx = createFxEngine({ country: 'CL', horizon: 60, paths: 100, overrides: { sigma: 0, q0: mu } });
  for (let i = 0; i < 100; i++) assert.ok(fx.path(i).every((v) => v === 1));
});

test('home country: the US is the calculator without the engine', () => {
  const r = runPlan({ ...PLAN, country: 'US' });
  assert.deepEqual(r.on.balances, r.off.balances);
});

test('bounded spread: sd of q stops growing after ~20 years and matches sigma / sqrt(1 - phi^2)', () => {
  const paths = 20000;
  const horizon = 60;
  const fx = createFxEngine({ country: 'CL', horizon, paths, seed: 42 });
  const { sigma, phi } = fx.meta.parameters;
  const theory = sigma / Math.sqrt(1 - phi * phi);

  const sdAt = {};
  const cols = { 1: [], 3: [], 5: [], 20: [], 40: [], 60: [] };
  const buf = new Float64Array(horizon + 1);
  for (let i = 0; i < paths; i++) {
    fx.logPath(i, buf);
    for (const t of Object.keys(cols)) cols[t].push(buf[t]);
  }
  for (const t of Object.keys(cols)) sdAt[t] = stdev(cols[t]);

  // Growing early on, along sigma * sqrt((1 - phi^2t) / (1 - phi^2))...
  for (const t of [1, 3, 5]) {
    const exact = theory * Math.sqrt(1 - phi ** (2 * t));
    const rel = Math.abs(sdAt[t] / exact - 1);
    assert.ok(rel < 0.03, `sd at ${t}y = ${sdAt[t].toFixed(4)} vs ${exact.toFixed(4)}`);
  }
  assert.ok(sdAt[1] < sdAt[3] && sdAt[3] < sdAt[5]);
  // ...flat after 20 years and at the theoretical level.
  for (const t of [20, 40, 60]) {
    const rel = Math.abs(sdAt[t] / theory - 1);
    assert.ok(rel < 0.03, `sd at ${t}y = ${sdAt[t].toFixed(4)} vs theory ${theory.toFixed(4)} (${(rel * 100).toFixed(1)}% off)`);
  }
  assert.ok(Math.abs(sdAt[60] / sdAt[20] - 1) < 0.03);
});

test('shared draws: portfolio and forex consume the same historical year', () => {
  const assets = getAssetReturns();
  const p = getCountryParams('CL');
  const years = sharedYears(assets.years, Object.keys(p.shocks));
  const draws = createYearDraws({ years, horizon: 10, paths: 5, seed: 1 });
  const fx = createFxEngine({ country: 'CL', horizon: 10, paths: 5, seed: 1, draws });
  const { mu, phi, sigma, q0 } = fx.meta.parameters;

  // Rebuild path 2 by hand from the drawn years.
  const q = fx.logPath(2);
  let expected = q0;
  for (let t = 1; t <= 10; t++) {
    expected = mu + phi * (expected - mu) + sigma * p.shocks[draws.year(2, t)];
    assert.equal(q[t], expected);
  }

  // A one-year plan's return comes from the same drawn year.
  const r = simulate({ startBalance: 100, budgetUsd: 0, budgetLocal: 0, equityShare: 1, horizon: 10, paths: 5, draws, fx });
  const y1 = draws.year(2, 1);
  const k = assets.years.indexOf(y1);
  assert.equal(r.balances[2 * 11 + 1], 100 * (1 + assets.equity[k]));
});

test('engine rejects draws containing years with no shock (phase 1: own residuals only)', () => {
  const draws = createYearDraws({ years: [1950, 1951], horizon: 5, paths: 3, seed: 1 });
  assert.throws(() => createFxEngine({ country: 'CL', horizon: 5, paths: 3, draws }), /no shock/);
});
