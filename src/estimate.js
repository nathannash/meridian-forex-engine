// Offline calibration: turn raw annual series into the parameters the engine
// ships with. Nothing in here runs during a simulation.
//
//   Q_t = (P_local_t / S_t) / P_us_t,   q_t = ln Q_t
//   q_{t+1} = mu + phi (q_t - mu) + sigma eps_{t+1}

import { mean, halfLife } from './stats.js';

// phi is capped below 1 so every path stays mean-reverting.
export const PHI_CAP = 0.98;

// Log real exchange rate from nominal rate (local units per USD) and the two
// price indices. The index bases are arbitrary: only changes in q matter, and
// mu is estimated on the same scale.
export function logRealRate({ S, cpiLocal, cpiUs }) {
  if (S.length !== cpiLocal.length || S.length !== cpiUs.length) {
    throw new Error('logRealRate: series lengths differ');
  }
  return S.map((s, i) => Math.log(cpiLocal[i] / s / cpiUs[i]));
}

// Fit the AR(1) around the sample mean.
//
// years[i] labels q[i]. The residual for the move from q[i-1] to q[i] is
// labelled years[i], so the shock pool is keyed by the year it lands in.
//
// phiPrior, when given, replaces the country's own estimate as the shipped
// phi (the residuals and sigma are then measured against it). This is how the
// design's pooled panel estimate enters; the own estimate is still returned as
// a diagnostic.
export function fitAr1(years, q, { phiPrior = null } = {}) {
  const nObs = q.length;
  if (nObs < 6) throw new Error(`fitAr1: need at least 6 observations, got ${nObs}`);
  const n = nObs - 1; // number of transitions

  const mu = mean(q);
  let sxy = 0;
  let sxx = 0;
  for (let i = 1; i < nObs; i++) {
    const x = q[i - 1] - mu;
    sxy += x * (q[i] - mu);
    sxx += x * x;
  }
  const phiOls = sxy / sxx;

  // Kendall (1954): E[phi_hat] ~ phi - (1 + 3 phi) / n. Small samples make
  // reversion look faster than it is, so undo that before shipping.
  const phiOwn = clamp((n * phiOls + 1) / (n - 3), 0, PHI_CAP);
  const phi = phiPrior ? clamp(phiPrior.value, 0, PHI_CAP) : phiOwn;

  const residuals = [];
  for (let i = 1; i < nObs; i++) {
    residuals.push(q[i] - mu - phi * (q[i - 1] - mu));
  }
  const sigma = Math.sqrt(residuals.reduce((s, e) => s + e * e, 0) / (n - 1));

  // Standardize to exactly mean 0 and variance 1 over the pool, so that the
  // bootstrap reproduces sigma and the long-run spread sigma / sqrt(1 - phi^2).
  const eMean = mean(residuals);
  const eSd = Math.sqrt(residuals.reduce((s, e) => s + (e - eMean) ** 2, 0) / n);
  const shocks = {};
  for (let i = 1; i < nObs; i++) {
    shocks[years[i]] = (residuals[i - 1] - eMean) / eSd;
  }

  // Sampling uncertainty, carried into the simulation when parameter
  // uncertainty is switched on. The standard error of the mean of an AR(1)
  // is inflated by persistence: sigma / (1 - phi) / sqrt(n).
  const phiSe = phiPrior ? phiPrior.se : Math.sqrt(Math.max(1 - phi * phi, 1e-6) / n);
  const muSe = sigma / Math.max(1 - phi, 1e-3) / Math.sqrt(nObs);

  return {
    mu,
    phi,
    phiOls,
    phiOwn,
    phiSource: phiPrior ? phiPrior.source : 'own',
    sigma,
    phiSe,
    muSe,
    halfLifeYears: halfLife(phi),
    longRunSd: sigma / Math.sqrt(1 - phi * phi),
    shocks,
  };
}

// Data confidence grade: what the country's history can support. Short
// samples and regime breaks lower it. Pooled parameters are reported but not
// penalised: pooling is how the design compensates for short samples.
export function confidenceGrade({ years, regimeBreaks = [], pooled = false }) {
  let score = years >= 40 ? 3 : years >= 25 ? 2 : years >= 15 ? 1 : 0;
  score -= regimeBreaks.length > 0 ? 1 : 0;
  const label = score >= 3 ? 'high' : score >= 2 ? 'moderate' : score >= 1 ? 'low' : 'very low';
  return {
    label,
    yearsOfData: years,
    regimeBreaks,
    parameters: pooled ? 'pooled' : 'own',
  };
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
