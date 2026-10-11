# MERIDIAN Forex Engine (prototype)

A phase 1 prototype of the MERIDIAN forex engine described in the design proposal
(Oct 11, 2026). It simulates each country's **real** exchange rate against the
dollar as a mean-reverting AR(1) process driven by resampled historical shocks.
Its only output is a yearly multiplier `Q_t / Q_0` on the dollar cost of local
spending.

> **Data status: illustrative.** The bundled data in `data/raw/` holds approximate
> values entered from memory. It has not been traced to primary sources. Every
> number this prototype prints demonstrates the method and is not advice. Phase 0
> (the data audit) replaces these files. Calibration, the engine and the tests run
> unchanged on the replacement data.

## Quick start

No dependencies. Needs Node 20 or later.

```sh
npm test            # phase 1 exit tests and estimator tests
npm run report      # phase 1 attribution report for Chile
npm run demo        # browser demo at http://localhost:8080/demo/
npm run calibrate   # rebuild parameter files from data/raw
```

Report options:
`node scripts/report.js --country CL --balance 1000000 --usd 15000 --local 30000 --equity 0.6 --horizon 40 --paths 10000 --seed 42 [--uncertainty] [--json]`

## Interface

```js
import { createFxEngine, runPlan } from './src/index.js';

const fx = createFxEngine({ country: 'CL', horizon: 60, paths: 10000, seed: 42 });
fx.path(i);   // Float64Array of Q_t / Q_0, length horizon + 1
fx.meta;      // tier, years of data, parameters, data as-of date, confidence grade

// The whole phase 1 deliverable: one plan with the engine on and off, on identical year draws
const r = runPlan({ country: 'CL', startBalance: 1e6, budgetUsd: 15000, budgetLocal: 30000 });
r.attribution; // { successRateChange, fromReversion, fromShocks }
```

## Phase 1 scope

| Design element | In this prototype |
| --- | --- |
| Real rate `q = ln((P_local / S) / P_us)` | `src/estimate.js` `logRealRate` |
| AR(1) around the sample mean, small-sample bias correction | `fitAr1` (Kendall correction, φ capped at 0.98) |
| Shocks from the country's own standardized residuals | yes (regional pools are phase 2) |
| Shared single-year draws with the portfolio | `src/draws.js`: one draw per path and year feeds both modules |
| Two asset classes | US equity and 10-year Treasuries, real USD, rebalanced annually |
| Spending `B_usd + B_local × Q_t / Q_0` | `src/simulate.js` |
| On/off attribution | split into *reversion from today's level* and *shocks* |
| Seeded and reproducible, web worker | `src/rng.js` (xoshiro128**, one stream per path), `demo/worker.js` |
| Static parameter file per country | `data/params/*.json`, also bundled as `src/params/index.js` |
| Confidence grade, extrapolation label | in `fx.meta`, the report and the demo |
| Parameter uncertainty (φ, μ per path) | implemented behind `parameterUncertainty: true` (off by default; phase 2) |

Not yet built: regional shock pools and donor draws (phase 2), the tier B and D
handling, stress scenarios and historical replay (phase 3), and the tax layer
(phase 4). The budget in this prototype is after tax.

### Validation status

The tests in `test/validation.test.js` cover the three phase 1 exit checks:

- **Reproducibility.** The same seed gives identical paths. Path *i* does not depend on how many paths are requested or the order they are generated in.
- **Off switch.** With σ = 0 and q₀ = μ, balances and spending match the run without the engine exactly.
- **Bounded spread.** The spread of q follows σ·√((1 − φ^2t)/(1 − φ²)), stops growing by year 20 and holds at σ/√(1 − φ²), within 3%.

The tests also check that the portfolio and the engine use the same drawn year, and they check the estimator against simulated AR(1) data.

## One decision to review: reversion speed

The design calls for φ to come from a pooled panel estimate. Phase 1 has no
panel. Chile's own 30 years give an OLS φ of 0.89. After the small-sample
correction that becomes 1.0 or more, so it hits the cap. A 34-year half-life
would make the paths behave almost like a random walk. The design anticipates
exactly this when it says no country has enough history alone.

The prototype therefore ships **φ = 0.84, a half-life of 4 years**. That is the
middle of the 3 to 5 year range the design cites, with a standard error of 0.04.
It is labelled as a placeholder in the parameter file, `fx.meta`, the report and
the demo. Chile's own estimate is kept as `model.phiOwn` for comparison. Phase 2
replaces the placeholder with the pooled estimate. Change `PHI_PRIOR` in
`scripts/calibrate.js` to test other values.

## Example result (illustrative data)

```
Valuation gauge
  Today Chile is 21.9% cheaper than its long-run level for a dollar holder
Attribution: success rate (portfolio lasts the full horizon)
  Exchange rate risk off            83.4%
  Reversion to long-run level only  71.8%   -11.6 pp
  Full engine (reversion + shocks)  71.7%   -0.1 pp
```

On this data, almost all of the effect comes from where Chile starts, not from
shocks. The peso looks cheap against its own history, so the model expects
dollar living costs to rise about 28% as it reverts. Both the size and the split
depend on q₀ − μ and φ. Re-check both once the audited data is in.

## Layout

```
data/raw/        input series (CSV) and country metadata: replace in phase 0
data/params/     calibrated parameter files (generated)
src/estimate.js  real rate, AR(1) fit, confidence grade (offline)
src/engine.js    createFxEngine
src/draws.js     shared year draws
src/simulate.js  two-asset Monte Carlo, on/off attribution, fan percentiles
src/rng.js       seeded generator
scripts/         calibrate, report, demo server
demo/            browser demo (module web worker)
test/            node:test suites
```

## Adding a country

1. Add `data/raw/<CODE>.csv` with `year,S,cpi_local`, where S is local units per USD as an annual average.
2. Add its metadata to `data/raw/countries.json`: regime, tier, peer group, regime breaks.
3. Run `npm run calibrate`.

In phase 1 a country needs a shock for every year in the shared pool. Phase 2's
peer donors remove that constraint.
