// The forex engine: annual real exchange rate paths per country.
//
//   q_{t+1} = mu + phi (q_t - mu) + sigma eps_{t+1}
//
// eps is a standardized historical residual for the drawn year. The output is
// the yearly multiplier Q_t / Q_0 on the dollar cost of local spending.

import { PARAMS } from './params/index.js';
import { createRng, streamSeed } from './rng.js';
import { createYearDraws } from './draws.js';
import { PHI_CAP } from './estimate.js';

const PARAM_STREAM = 2;

export function getCountryParams(code) {
  const p = PARAMS[code];
  if (!p || code === 'assets') throw new Error(`Unknown country: ${code}`);
  return p;
}

export function listCountries() {
  return Object.keys(PARAMS).filter((k) => k !== 'assets');
}

/**
 * @param {object} opts
 * @param {string} [opts.country]      ISO code with a shipped parameter file
 * @param {object} [opts.params]       explicit parameter object (overrides country)
 * @param {number} [opts.horizon=60]   years simulated after today
 * @param {number} [opts.paths=10000]
 * @param {number} [opts.seed=42]
 * @param {object} [opts.draws]        shared year draws from createYearDraws;
 *                                     built from the country's own shock years if omitted
 * @param {object} [opts.overrides]    { q0, mu, phi, sigma } replacements, e.g. for the off switch
 * @param {boolean} [opts.parameterUncertainty=false]
 *                                     draw phi and mu per path from their sampling distributions
 */
export function createFxEngine({
  country,
  params,
  horizon = 60,
  paths = 10000,
  seed = 42,
  draws,
  overrides = {},
  parameterUncertainty = false,
} = {}) {
  const p = params ?? getCountryParams(country);
  const model = { ...p.model, ...overrides };
  const { phiSe, muSe } = model;
  const sigma = model.sigma;
  const isHome = p.tier === 'home';

  // q0 is the observed starting level: overriding mu without q0 keeps today's level.
  const q0 = model.q0;
  const shockYears = Object.keys(p.shocks).map(Number);

  if (!isHome && !draws) {
    draws = createYearDraws({ years: shockYears, horizon, paths, seed });
  }
  if (draws) {
    if (draws.horizon !== horizon || draws.paths < paths) {
      throw new Error('createFxEngine: draws do not cover the requested horizon and paths');
    }
    if (!isHome && sigma !== 0) {
      const missing = draws.years.filter((y) => !(y in p.shocks));
      if (missing.length) {
        // Phase 2 fills these from a peer donor; phase 1 uses own residuals only.
        throw new Error(`createFxEngine: ${p.code} has no shock for drawn years ${missing.join(', ')}`);
      }
    }
  }

  const shockOf = new Map(Object.entries(p.shocks).map(([y, z]) => [Number(y), z]));

  function pathParams(i) {
    if (!parameterUncertainty || isHome) return { mu: model.mu, phi: model.phi };
    const rng = createRng(streamSeed(seed, PARAM_STREAM, i));
    const phi = Math.min(PHI_CAP, Math.max(0, model.phi + phiSe * rng.normal()));
    const mu = model.mu + muSe * rng.normal();
    return { mu, phi };
  }

  // Log real rate q_t for path i, t = 0..horizon.
  function logPath(i, out = new Float64Array(horizon + 1)) {
    checkIndex(i);
    out[0] = q0;
    if (isHome) {
      out.fill(q0);
      return out;
    }
    const { mu, phi } = pathParams(i);
    let q = q0;
    for (let t = 1; t <= horizon; t++) {
      const eps = sigma === 0 ? 0 : shockOf.get(draws.year(i, t));
      q = mu + phi * (q - mu) + sigma * eps;
      out[t] = q;
    }
    return out;
  }

  // Q_t / Q_0 for path i: the multiplier on the dollar cost of local spending.
  function path(i) {
    const out = logPath(i);
    for (let t = 0; t <= horizon; t++) out[t] = Math.exp(out[t] - q0);
    return out;
  }

  function checkIndex(i) {
    if (!Number.isInteger(i) || i < 0 || i >= paths) {
      throw new RangeError(`path index ${i} outside 0..${paths - 1}`);
    }
  }

  const sampleYears = p.sample?.years ?? null;

  return {
    path,
    logPath,
    draws,
    horizon,
    paths,
    seed,
    meta: {
      code: p.code,
      name: p.name,
      currency: p.currency,
      tier: p.tier,
      regime: p.regime,
      flags: p.flags,
      peerGroup: p.peerGroup,
      localTaxUnit: p.localTaxUnit,
      dataStatus: p.dataStatus,
      dataAsOf: p.dataAsOf,
      sample: p.sample,
      yearsOfData: sampleYears,
      // Beyond the sample length, results are model extrapolation.
      extrapolationFromYear: sampleYears,
      confidence: p.confidence,
      valuation: p.valuation ?? null,
      parameterUncertainty,
      parameters: {
        q0,
        mu: model.mu,
        phi: model.phi,
        phiSource: model.phiSource ?? null,
        sigma,
        halfLifeYears: model.phi > 0 && model.phi < 1 ? Math.log(0.5) / Math.log(model.phi) : null,
        longRunSd: sigma / Math.sqrt(1 - model.phi * model.phi),
      },
    },
  };
}
