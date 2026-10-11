import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitAr1, logRealRate, confidenceGrade, PHI_CAP } from '../src/estimate.js';
import { createRng } from '../src/rng.js';
import { mean, stdev, halfLife } from '../src/stats.js';

function simulateAr1({ n, phi, sigma, mu, seed }) {
  const rng = createRng(seed);
  const q = [mu];
  for (let t = 1; t < n; t++) q.push(mu + phi * (q[t - 1] - mu) + sigma * rng.normal());
  return q;
}

test('real rate: matched devaluation and local inflation leave q unchanged', () => {
  const q = logRealRate({ S: [100, 130], cpiLocal: [100, 130], cpiUs: [100, 100] });
  assert.ok(Math.abs(q[1] - q[0]) < 1e-12);
});

test('real rate: a stronger local currency makes the country more expensive', () => {
  const q = logRealRate({ S: [100, 80], cpiLocal: [100, 100], cpiUs: [100, 100] });
  assert.ok(q[1] > q[0]);
});

test('fitAr1: bias correction recovers phi on average in short samples', () => {
  const phi = 0.85;
  const n = 30;
  const ols = [];
  const corrected = [];
  for (let s = 1; s <= 400; s++) {
    const q = simulateAr1({ n, phi, sigma: 0.1, mu: 0, seed: s });
    const years = q.map((_, i) => 2000 + i);
    const fit = fitAr1(years, q);
    ols.push(fit.phiOls);
    corrected.push(fit.phiOwn);
  }
  // OLS is biased down; the correction removes most of it.
  assert.ok(mean(ols) < phi - 0.05, `OLS mean ${mean(ols)}`);
  assert.ok(Math.abs(mean(corrected) - phi) < Math.abs(mean(ols) - phi) / 2, `corrected mean ${mean(corrected)}`);
});

test('fitAr1: standardized shocks have mean 0 and variance 1, keyed by landing year', () => {
  const q = simulateAr1({ n: 25, phi: 0.8, sigma: 0.08, mu: 1, seed: 9 });
  const years = q.map((_, i) => 1990 + i);
  const fit = fitAr1(years, q);
  const z = Object.values(fit.shocks);
  assert.equal(z.length, 24);
  assert.deepEqual(Object.keys(fit.shocks).map(Number), years.slice(1));
  assert.ok(Math.abs(mean(z)) < 1e-12);
  assert.ok(Math.abs(stdev(z) * Math.sqrt(23 / 24) - 1) < 1e-12);
});

test('fitAr1: phi prior replaces the own estimate and phi is capped below 1', () => {
  const q = Array.from({ length: 20 }, (_, i) => i * 0.05); // pure trend
  const years = q.map((_, i) => 2000 + i);
  const own = fitAr1(years, q);
  assert.ok(own.phi <= PHI_CAP);
  const prior = fitAr1(years, q, { phiPrior: { value: 0.84, se: 0.04, source: 'test' } });
  assert.equal(prior.phi, 0.84);
  assert.equal(prior.phiSource, 'test');
  assert.equal(prior.phiSe, 0.04);
});

test('half-life: phi 0.79 to 0.87 is about 3 to 5 years', () => {
  assert.ok(Math.abs(halfLife(0.79) - 2.94) < 0.05);
  assert.ok(Math.abs(halfLife(0.87) - 4.98) < 0.05);
});

test('confidence grade reflects history length and regime breaks', () => {
  assert.equal(confidenceGrade({ years: 50 }).label, 'high');
  assert.equal(confidenceGrade({ years: 30 }).label, 'moderate');
  assert.equal(confidenceGrade({ years: 30, regimeBreaks: [{ year: 1999 }] }).label, 'low');
  assert.equal(confidenceGrade({ years: 12 }).label, 'very low');
  assert.equal(confidenceGrade({ years: 20, pooled: true }).parameters, 'pooled');
});
