// Small numeric helpers shared by calibration, the engine and the reports.

export function mean(xs) {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

// Sample standard deviation (n - 1 denominator).
export function stdev(xs) {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

// Linear-interpolated quantile, p in [0, 1]. Does not mutate the input.
export function quantile(xs, p) {
  const sorted = Float64Array.from(xs).sort();
  return quantileSorted(sorted, p);
}

export function quantileSorted(sorted, p) {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// Share of xs strictly below x, in [0, 1].
export function percentileRank(xs, x) {
  let below = 0;
  for (const v of xs) if (v < x) below++;
  return below / xs.length;
}

export function correlation(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// Half-life in years of a gap that shrinks by factor phi each year.
export function halfLife(phi) {
  if (phi <= 0) return 0;
  if (phi >= 1) return Infinity;
  return Math.log(0.5) / Math.log(phi);
}
