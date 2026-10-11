// Seeded pseudo-random numbers. Every stochastic draw in the engine goes
// through here so that any result can be reproduced from its seed.

// splitmix32: turns any 32-bit integer into a well-mixed one. Used to derive
// independent stream seeds from (seed, stream id) pairs.
export function mix32(x) {
  x = (x + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

// Derive a stream seed from a base seed and any number of integer keys,
// e.g. streamSeed(seed, PATH_STREAM, i). Order matters.
export function streamSeed(seed, ...keys) {
  let h = mix32(seed >>> 0);
  for (const k of keys) h = mix32(h ^ (k >>> 0));
  return h;
}

// xoshiro128**: fast, small-state generator with good statistical quality.
export function createRng(seed) {
  let a = mix32(seed);
  let b = mix32(a);
  let c = mix32(b);
  let d = mix32(c);
  if ((a | b | c | d) === 0) a = 1;

  let spare = null;

  function nextU32() {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  }

  return {
    // Uniform on [0, 1).
    next() {
      return nextU32() / 4294967296;
    },
    // Uniform integer on [0, n).
    int(n) {
      return Math.floor((nextU32() / 4294967296) * n);
    },
    // Standard normal (Marsaglia polar method).
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u, v, s;
      do {
        u = 2 * (nextU32() / 4294967296) - 1;
        v = 2 * (nextU32() / 4294967296) - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const m = Math.sqrt((-2 * Math.log(s)) / s);
      spare = v * m;
      return u * m;
    },
  };
}

function rotl(x, k) {
  return (x << k) | (x >>> (32 - k));
}
