// Phase 1 Monte Carlo: a two-asset retirement plan in real dollars, with the
// forex engine applied to the locally priced part of the budget.
//
// Tax is out of scope until phase 4; the budget here is after tax.

import { PARAMS } from './params/index.js';
import { createFxEngine, getCountryParams } from './engine.js';
import { createYearDraws, sharedYears } from './draws.js';
import { quantileSorted } from './stats.js';

export function getAssetReturns() {
  return PARAMS.assets;
}

/**
 * Run one plan with the forex engine on and off, on identical year draws.
 *
 * @param {object} opts
 * @param {string} opts.country
 * @param {number} opts.startBalance     portfolio today, real USD
 * @param {number} opts.budgetUsd        dollar-priced spending per year (flights, US insurance, imports)
 * @param {number} opts.budgetLocal      locally priced spending per year at today's rate (rent, services, food)
 * @param {number} [opts.equityShare=0.6] rebalanced annually; the rest is bonds
 * @param {number} [opts.horizon=40]
 * @param {number} [opts.paths=10000]
 * @param {number} [opts.seed=42]
 * @param {object} [opts.fxOverrides]    passed to the engine, e.g. { sigma: 0 }
 * @param {boolean} [opts.parameterUncertainty=false]
 */
export function runPlan(opts) {
  const {
    country,
    horizon = 40,
    paths = 10000,
    seed = 42,
    fxOverrides,
    parameterUncertainty = false,
  } = opts;

  const assets = getAssetReturns();
  const p = getCountryParams(country);
  const years =
    p.tier === 'home' ? assets.years : sharedYears(assets.years, Object.keys(p.shocks));
  const draws = createYearDraws({ years, horizon, paths, seed });
  const fx = createFxEngine({ country, horizon, paths, seed, draws, overrides: fxOverrides, parameterUncertainty });

  const on = simulate({ ...opts, horizon, paths, draws, fx });
  const off = simulate({ ...opts, horizon, paths, draws, fx: null });

  // Same paths with shocks removed: only the expected drift from today's
  // level back to the long-run level remains.
  const driftFx = createFxEngine({
    country,
    horizon,
    paths,
    seed,
    draws,
    overrides: { ...fxOverrides, sigma: 0 },
    parameterUncertainty,
  });
  const drift = simulate({ ...opts, horizon, paths, draws, fx: driftFx });

  return {
    country,
    meta: fx.meta,
    yearPool: { first: years[0], last: years.at(-1), count: years.length },
    draws,
    on,
    off,
    drift,
    attribution: {
      // How much the success rate changes with exchange rate risk switched on,
      successRateChange: on.successRate - off.successRate,
      // split into reversion from today's level toward the long-run level
      fromReversion: drift.successRate - off.successRate,
      // and year-to-year currency shocks.
      fromShocks: on.successRate - drift.successRate,
    },
  };
}

/**
 * Simulate every path. With fx null, the local budget is held at today's
 * dollar cost (the calculator without the engine).
 *
 * Yearly loop, per path (the design's order; step 4, tax, arrives in phase 4):
 *   1. take the shared year draw
 *   2. advance the portfolio and the real rate from that draw
 *   3. compute spending from the budget split
 *   5. withdraw and record the year
 */
export function simulate({
  startBalance,
  budgetUsd,
  budgetLocal,
  equityShare = 0.6,
  horizon,
  paths,
  draws,
  fx,
}) {
  const assets = getAssetReturns();
  const eqOf = new Map(assets.years.map((y, k) => [y, assets.equity[k]]));
  const bdOf = new Map(assets.years.map((y, k) => [y, assets.bond[k]]));

  const balances = new Float64Array(paths * (horizon + 1));
  const spending = new Float64Array(paths * (horizon + 1));
  const fxRatio = new Float64Array(paths * (horizon + 1));
  const depletedAt = new Int32Array(paths).fill(-1);
  let successes = 0;

  for (let i = 0; i < paths; i++) {
    const ratio = fx ? fx.path(i) : null;
    const row = i * (horizon + 1);
    let balance = startBalance;
    balances[row] = balance;
    spending[row] = budgetUsd + budgetLocal;
    fxRatio[row] = 1;

    for (let t = 1; t <= horizon; t++) {
      const y = draws.year(i, t);
      const r = equityShare * eqOf.get(y) + (1 - equityShare) * bdOf.get(y);
      const q = ratio ? ratio[t] : 1;
      const spend = budgetUsd + budgetLocal * q;

      if (balance > 0) {
        balance = balance * (1 + r) - spend;
        if (balance <= 0) {
          balance = 0;
          depletedAt[i] = t;
        }
      }
      balances[row + t] = balance;
      spending[row + t] = spend;
      fxRatio[row + t] = q;
    }
    if (depletedAt[i] === -1) successes++;
  }

  return {
    successRate: successes / paths,
    depletedAt,
    balances,
    spending,
    fxRatio,
    horizon,
    paths,
  };
}

// Percentiles across paths of a (paths x horizon+1) matrix, per year.
export function fan(matrix, { paths, horizon }, ps = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]) {
  const out = Object.fromEntries(ps.map((p) => [p, new Float64Array(horizon + 1)]));
  const col = new Float64Array(paths);
  for (let t = 0; t <= horizon; t++) {
    for (let i = 0; i < paths; i++) col[i] = matrix[i * (horizon + 1) + t];
    col.sort();
    for (const p of ps) out[p][t] = quantileSorted(col, p);
  }
  return out;
}
