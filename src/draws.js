// Shared year draws: the only link between the forex engine and the
// portfolio module. For every path and simulated year, one historical year is
// drawn; the portfolio takes that year's equity, bond and inflation outcomes,
// and the forex engine takes that year's currency shock. Drawing both from the
// same year keeps the historical tendency of the dollar to strengthen when
// equities fall.

import { createRng, streamSeed } from './rng.js';

const YEAR_STREAM = 1;

// Years present in every list, ascending.
export function sharedYears(...lists) {
  const [first, ...rest] = lists.map((l) => new Set(l.map(Number)));
  return [...first].filter((y) => rest.every((s) => s.has(y))).sort((a, b) => a - b);
}

// Draw `horizon` independent single years per path from `years`.
// Each path has its own random stream, so path i is the same whichever paths
// are generated and in whatever order.
export function createYearDraws({ years, horizon, paths, seed }) {
  if (!years.length) throw new Error('createYearDraws: empty year pool');
  const pool = Int32Array.from(years);
  const idx = new Uint16Array(paths * horizon);
  for (let i = 0; i < paths; i++) {
    const rng = createRng(streamSeed(seed, YEAR_STREAM, i));
    for (let t = 0; t < horizon; t++) idx[i * horizon + t] = rng.int(pool.length);
  }
  return {
    years: Array.from(pool),
    horizon,
    paths,
    seed,
    // Historical year driving simulated year t (1..horizon) of path i.
    year(i, t) {
      return pool[idx[i * horizon + (t - 1)]];
    },
  };
}
