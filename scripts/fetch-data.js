#!/usr/bin/env node
// Download the raw input series and write data/raw/CL.csv, data/raw/US.csv
// and data/raw/sources.json. Run `npm run calibrate` afterwards.
//
// Sources
//   Chile nominal rate   World Bank PA.NUS.FCRF  official rate, CLP per USD, period average
//   Chile prices         World Bank FP.CPI.TOTL  CPI, 2010 = 100, annual average
//   US prices            FRED CPIAUCNS           CPI-U, monthly, averaged to calendar years
//   US asset returns     Damodaran histretSP     S&P 500 incl. dividends, 10-year Treasury
//
// Usage: node scripts/fetch-data.js [--first-year 1996]
// Behind a proxy on Node >= 22.21, run with NODE_USE_ENV_PROXY=1.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => join(root, 'data', 'raw', f);

const { values: args } = parseArgs({ options: { 'first-year': { type: 'string', default: '1996' } } });
const FIRST_YEAR = Number(args['first-year']);

const URLS = {
  clRate: 'https://api.worldbank.org/v2/country/CHL/indicator/PA.NUS.FCRF?format=json&per_page=200',
  clCpi: 'https://api.worldbank.org/v2/country/CHL/indicator/FP.CPI.TOTL?format=json&per_page=200',
  usCpi: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS',
  usReturns: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
};

const retrieved = new Date().toISOString().slice(0, 10);
const filledMonths = []; // set by fredAnnualAverage

const [clRate, clCpi, usCpi, usReturns] = await Promise.all([
  worldBank(URLS.clRate),
  worldBank(URLS.clCpi),
  fredAnnualAverage(URLS.usCpi),
  damodaran(URLS.usReturns),
]);

// Chile: every year from FIRST_YEAR that has both series.
const clYears = [...clRate.keys()].filter((y) => y >= FIRST_YEAR && clCpi.has(y)).sort((a, b) => a - b);
assertContiguous('Chile', clYears);

// US: every year with returns and CPI, plus the year before the first return
// year so the first return can be deflated.
const usYears = [...usReturns.keys()].filter((y) => usCpi.has(y) && usCpi.has(y - 1)).sort((a, b) => a - b);
assertContiguous('US', usYears);

writeFileSync(
  raw('CL.csv'),
  [
    `# Sources: World Bank PA.NUS.FCRF (S) and FP.CPI.TOTL (cpi_local), retrieved ${retrieved}. See data/raw/sources.json.`,
    '# year: calendar year; S: CLP per USD, period average; cpi_local: Chile CPI, annual average, 2010=100. US prices come from data/raw/US.csv.',
    'year,S,cpi_local',
    ...clYears.map((y) => `${y},${num(clRate.get(y))},${num(clCpi.get(y))}`),
  ].join('\n') + '\n',
);

writeFileSync(
  raw('US.csv'),
  [
    `# Sources: Damodaran histretSP (equity, bond) and FRED CPIAUCNS (cpi_us), retrieved ${retrieved}. See data/raw/sources.json.`,
    '# year: calendar year; equity: S&P 500 total return incl. dividends, nominal USD, percent; bond: 10-year US Treasury total return, nominal USD, percent; cpi_us: US CPI-U annual average of monthly values, 1982-84=100',
    '# The first row carries CPI only, so the next year\'s returns can be deflated.',
    'year,equity,bond,cpi_us',
    `${usYears[0] - 1},,,${num(usCpi.get(usYears[0] - 1))}`,
    ...usYears.map((y) => {
      const r = usReturns.get(y);
      return `${y},${num(r.equity)},${num(r.bond)},${num(usCpi.get(y))}`;
    }),
  ].join('\n') + '\n',
);

const sources = {
  status: 'sourced',
  note: 'Downloaded from the sources below. Not yet independently checked in the phase 0 data audit.',
  retrieved,
  series: {
    'CL.S': { source: 'World Bank, World Development Indicators', id: 'PA.NUS.FCRF', description: 'Official exchange rate (LCU per US$, period average)', url: URLS.clRate },
    'CL.cpi_local': { source: 'World Bank, World Development Indicators', id: 'FP.CPI.TOTL', description: 'Consumer price index (2010 = 100), annual average', url: URLS.clCpi },
    'US.cpi_us': {
      source: 'U.S. Bureau of Labor Statistics via FRED',
      id: 'CPIAUCNS',
      description: 'CPI-U, all items, not seasonally adjusted; calendar-year average of monthly values',
      url: URLS.usCpi,
      filledMonths: filledMonths.map((m) => ({ month: m, method: 'mean of the neighbouring months (not published by BLS)' })),
    },
    'US.equity': { source: 'Aswath Damodaran, NYU Stern, Historical Returns on Stocks, Bonds and Bills', id: 'histretSP', description: 'S&P 500 annual total return including dividends', url: URLS.usReturns },
    'US.bond': { source: 'Aswath Damodaran, NYU Stern, Historical Returns on Stocks, Bonds and Bills', id: 'histretSP', description: 'US 10-year Treasury bond annual total return', url: URLS.usReturns },
  },
  coverage: {
    CL: { first: clYears[0], last: clYears.at(-1) },
    US: { first: usYears[0], last: usYears.at(-1) },
  },
};
writeFileSync(raw('sources.json'), JSON.stringify(sources, null, 2) + '\n');

console.log(`Chile ${clYears[0]}-${clYears.at(-1)} (${clYears.length} years); US returns ${usYears[0]}-${usYears.at(-1)} (${usYears.length} years). Now run: npm run calibrate`);

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'meridian-forex-engine/0.1 (data fetch)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function worldBank(url) {
  const body = await (await get(url)).json();
  if (!Array.isArray(body) || !Array.isArray(body[1])) throw new Error(`${url}: unexpected response`);
  return new Map(body[1].filter((r) => r.value != null).map((r) => [Number(r.date), r.value]));
}

// Calendar-year averages of monthly values. A single missing month inside a
// year (BLS published no October 2025 CPI) is filled with the mean of its two
// neighbours; years missing more than that are left out.
async function fredAnnualAverage(url) {
  const lines = (await (await get(url)).text()).trim().split('\n').slice(1);
  const byYear = new Map();
  for (const l of lines) {
    const [date, v] = l.split(',');
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(5, 7));
    if (!byYear.has(y)) byYear.set(y, new Array(12).fill(null));
    byYear.get(y)[m - 1] = v === '.' || v === '' || v === undefined ? null : Number(v);
  }
  const out = new Map();
  for (const [y, vs] of byYear) {
    const missing = vs.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    if (missing.length > 1) continue;
    if (missing.length === 1) {
      const i = missing[0];
      if (i === 0 || i === 11 || vs[i - 1] === null || vs[i + 1] === null) continue;
      vs[i] = (vs[i - 1] + vs[i + 1]) / 2;
      filledMonths.push(`${y}-${String(i + 1).padStart(2, '0')}`);
    }
    out.set(y, vs.reduce((a, b) => a + b, 0) / 12);
  }
  return out;
}

// Annual return table: year, S&P 500, small cap, T-bill, 10-year T-bond, ...
async function damodaran(url) {
  const html = await (await get(url)).text();
  const out = new Map();
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    if (cells.length < 5 || !/^(19|20)\d\d$/.test(cells[0])) continue;
    const pct = (s) => Number(s.replace('%', ''));
    const equity = pct(cells[1]);
    const bond = pct(cells[4]);
    if (Number.isFinite(equity) && Number.isFinite(bond)) out.set(Number(cells[0]), { equity, bond });
  }
  if (out.size < 50) throw new Error(`${url}: parsed only ${out.size} years; has the page layout changed?`);
  return out;
}

function assertContiguous(label, years) {
  if (!years.length) throw new Error(`${label}: no years`);
  for (let i = 1; i < years.length; i++) {
    if (years[i] !== years[i - 1] + 1) throw new Error(`${label}: gap between ${years[i - 1]} and ${years[i]}`);
  }
}

function num(x) {
  return Number(x.toPrecision(10)).toString();
}
