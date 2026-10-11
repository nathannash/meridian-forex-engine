# MERIDIAN Forex Engine: Design Proposal

Oct 11, 2026 · @Nathan

**Revision 2** (Oct 11, 2026): updated after the phase 1 prototype was built. What changed and why is listed under *Changes since revision 1*; affected sections are marked *Revised*.

## Summary

The engine should simulate each country's **real** exchange rate against the dollar as a mean-reverting process driven by resampled historical shocks. Its only output is a yearly multiplier on the dollar cost of local spending, which the Monte Carlo applies to the budget and the tax layer.

Four choices define the design:

- **Real rate, not nominal.** The real rate is the quantity a dollar-based retiree actually pays, and it is roughly stationary, which makes 40 to 60 year paths defensible.
- **Model plus bootstrap.** An AR(1) equation supplies mean reversion. Historical residuals supply the shocks, so fat tails come from data, not from an assumed distribution.
- **Pooled estimation.** No candidate country has enough clean history alone, so reversion speed and tail shocks are estimated across regional peer groups, with each country's own shocks weighted most heavily.
- **Explicit confidence.** Every country carries a data grade, and results beyond the sample length are labelled as model extrapolation.

Revision 1 asked for approval of this design and of phase 1: the US and Chile, two asset classes, and an on/off comparison that shows how much exchange rate risk changes the result. Phase 1 is now built and its three exit tests pass. The decision requested in this revision is approval of the changes listed below and of phase 2.

**Phase 1 result in one line.** For a $1M, 60/40 plan drawing 4% a year in Chile over 40 years, exchange rate risk lowers the success rate from about 90% to about 77%. Almost all of that comes from the peso starting about 22% below its long-run level and reverting, not from year-to-year shocks.

## Changes since revision 1

Each change was made while building or reviewing the phase 1 prototype. The sections below have been updated to match.

| # | Area | Revision 1 | Now | Why |
| --- | --- | --- | --- | --- |
| 1 | Reversion speed (φ) | Pooled panel estimate | Placeholder prior, a 4-year half-life (φ = 0.841, standard error 0.04), until the phase 2 panel exists | Chile's own 30 years give an OLS φ of 0.88, which the small-sample correction pushes to 1 or above: effectively a random walk. The design already said no country has enough history alone |
| 2 | Phase 0 data | Coverage dates from memory | Chile and US series downloaded from the World Bank, FRED and Damodaran, with provenance recorded. Status is *sourced*, not yet *audited* | Needed real inputs for the phase 1 result |
| 3 | Missing data | Not covered | A single missing month in a year is filled with the mean of its neighbours and recorded | BLS published no US CPI for October 2025 |
| 4 | Confidence grade | Fields listed, no rule | A scored rule with four labels (see *Data*) | Needed a concrete grade to display |
| 5 | Spending input | Budget split into a dollar part and a local part | The product asks for a safe withdrawal rate. Spending is portfolio × rate, all priced locally. The split stays in the engine | Simpler form; see *Integration* and open question 1 |
| 6 | Attribution | On versus off | On versus off, split into *reversion from today's level* and *shocks* | Shows which part of the effect is the starting valuation |
| 7 | Year draws in phase 1 | Shared single-year draws | Shared draws limited to years where both US returns and the country's own shock exist: 1997 to 2025 (29 years) | Phase 1 uses own residuals only; peer donors arrive in phase 2 |
| 8 | Parameter uncertainty | Every path draws φ and μ | Built, but off by default until phase 2 | Phase 2 deliverable; switching it on now would mix a placeholder φ with a sampled one |
| 9 | Seed in the product | Seeded generator | The engine stays seeded and reproducible. The interface draws a new seed for each run and shows it, so any run can be reproduced | Product request |
| 10 | Home country | Not covered | The US is a *home* country with Q fixed at 1, which is the calculator without the engine | Gives the baseline comparison |

## Scope

The engine produces annual real exchange rate paths for each supported country, for horizons up to 60 years.

**In scope**

- Real exchange rate paths per country, starting from today's observed level
- Correlation between currency shocks and US equity, bond and inflation outcomes
- Named stress scenarios and historical replay
- A data confidence grade per country

**Out of scope**

- Nominal exchange rate forecasts
- Swings within a year and the timing of individual transfers
- Capital controls, dual exchange rates and bank freezes, which appear only as a qualitative flag
- Currency hedging instruments
- The portfolio return model itself, although the model specification places one requirement on it

## Core decision: simulate the real rate

The state variable is the real exchange rate Q: the dollar cost of a fixed local basket, relative to US prices. When Q rises, the country has become more expensive for someone holding dollars.

```latex
Q_t = \frac{P^{local}_t / S_t}{P^{US}_t}, \qquad q_t = \ln Q_t
```

Here S is local currency units per dollar, and P is each country's consumer price index.

Three reasons favour Q over the nominal rate S:

1. **It is what the retiree pays.** A 30% devaluation matched by 30% local inflation changes nothing for a dollar holder. Q captures that; S does not.
2. **It is roughly stationary.** Nominal rates in higher-inflation countries trend without limit. Real rates tend to revert, with deviations commonly estimated to halve in about 3 to 5 years.
3. **One mechanism covers every regime.** Dollarized Panama and euro-using Montenegro have a fixed or shared S, but Q still moves with the inflation differential.

This framing also reverses the usual intuition about risk. A local currency crash is a temporary windfall for a dollar holder. The threat to the plan is sustained real appreciation, where local prices in dollar terms climb for a decade.

## Data

No candidate country has 40 to 60 years of clean floating-rate history, so the engine grades each country by what its data can support. Coverage dates in the tier tables below are approximate and from memory; confirming them against primary sources is the first build phase. Chile and the US have now been sourced (see *Phase 1 sources*).

**Inputs**

| Input | Candidate source | Use |
| --- | --- | --- |
| Nominal rate, annual average | IMF International Financial Statistics, FRED | Numerator of Q |
| Local consumer prices | National statistics institutes, World Bank | Local price level |
| US consumer prices (CPI-U) | Bureau of Labor Statistics | US price level |
| Real effective rate indices | Bank for International Settlements | Cross-check only: trade-weighted, not bilateral against the dollar |
| Long-run macro history | Jordà-Schularick-Taylor database | Advanced economies before 1973 |

Annual averages are preferred over year-end rates because a retiree converts money throughout the year.

**Phase 1 sources** *(Revised)*

| Series | Source used | Coverage |
| --- | --- | --- |
| Chile nominal rate, CLP per USD, annual average | World Bank WDI `PA.NUS.FCRF` | 1996 to 2025 |
| Chile CPI, annual average | World Bank WDI `FP.CPI.TOTL` | 1996 to 2025 |
| US CPI-U, calendar-year average of monthly values | BLS via FRED `CPIAUCNS` | 1913 to 2025 |
| S&P 500 and 10-year Treasury total returns, nominal USD | Damodaran, NYU Stern, `histretSP` | 1928 to 2025 |

A script downloads these and records the source, series id and retrieval date for each one. BLS published no CPI for October 2025; that month is the mean of September and November, and the fill is recorded with the data. Data carries one of three statuses: *illustrative* (placeholder values), *sourced* (downloaded and traced, not yet checked) and *audited* (passed the phase 0 review). Chile and the US are *sourced*. The interface shows the sources and says the data is not yet audited.

**Coverage tiers**

| Tier | Countries | Approximate clean history | Treatment |
| --- | --- | --- | --- |
| A: long-run floaters | UK, Japan, Switzerland, Canada, Australia, Sweden, Norway | 1973 onward | Own volatility; anchor for pooled reversion speed |
| B: euro members and users | Spain, France, Cyprus, Montenegro | Euro from 1999; legacy currencies spliced before | Own volatility; splice flagged as a regime change |
| C: emerging floaters | Chile, Uruguay, Philippines, Paraguay, Albania and 17 others, listed below | 15 to 30 years | Own volatility; pooled reversion speed and pooled shocks |
| D: dollarized | Panama | Not applicable | Inflation differential only |

Earlier data exists for tier C but spans pegs, crawling bands and crises. It informs the stress scenarios, not the parameter estimates.

**Tier C roster.** Tier C is built to be broad: 22 countries can be simulated as destinations, and each feeds its region's shock pool. Membership is provisional until the data audit confirms each series.

| Region | Countries | Regime notes to verify |
| --- | --- | --- |
| Latin America | Chile, Uruguay, Paraguay, Mexico, Colombia, Peru, Brazil, Costa Rica | Paraguay and Costa Rica are managed floats |
| Asia | Philippines, Thailand, Indonesia, Malaysia | Malaysia was pegged from 1998 to 2005 |
| Europe and the Caucasus | Albania, Georgia, Serbia, Hungary, Poland, Czechia, Romania, Turkey | Serbia is tightly managed; Turkey's high inflation lowers its grade |
| Africa | South Africa, Mauritius | Mauritius is a managed float |

A country qualifies with at least 15 years of annual rate and price data under a floating or managed-float regime. Adding one requires only a new parameter file, so the roster can grow with MERIDIAN. Currencies with dual rates or capital controls, such as Argentina, stay out and carry a flag instead.

**Confidence grade.** *(Revised)* Each country shows its years of usable data, any regime breaks inside the sample, and whether its parameters are its own or pooled. The grade scores history length (40 years or more scores 3, 25 or more scores 2, 15 or more scores 1), takes one point off for a regime break inside the sample, and maps the score to *high*, *moderate*, *low* or *very low*. Pooled parameters are reported but not penalised, because pooling is how the design compensates for short samples. Chile grades *low*: 30 years with the September 1999 move from a crawling band to a free float inside the sample.

## Model specification

Each year's log real rate moves partway back toward its long-run level, then takes a shock drawn from history.

```latex
q_{t+1} = \mu + \phi\,(q_t - \mu) + \sigma\,\varepsilon_{t+1}
```

| Symbol | Meaning | How it is set |
| --- | --- | --- |
| q₀ | Starting level | Latest observed real rate for the country |
| μ | Long-run level | Country sample mean, held fixed with no drift; its standard error is carried into the simulation |
| φ | Carry-over: the share of a gap from the long-run level that remains a year later | Pooled panel estimate, corrected for small-sample bias. Phase 1 uses a placeholder (see below) |
| σ | Shock scale | Country's own residual standard deviation |
| ε | Shock | Standardized residual resampled from the peer-group pool |

φ is the share of any gap from the long-run level that carries into the next year. A half-life of 3 to 5 years corresponds to an annual φ of about 0.79 to 0.87.

In the product, this parameter is shown as a half-life in years under the label "reversion speed", with a tooltip. Neither φ nor a technical name for it appears in the interface.

**Phase 1 reversion speed.** *(Revised)* Chile's own sample gives an OLS φ of 0.88. The Kendall small-sample correction moves it to 1 or above, so it hits the cap of 0.98, a half-life of about 34 years. That would make paths behave almost like a random walk. Until the phase 2 panel exists, phase 1 ships φ = 0.841, a 4-year half-life, the middle of the 3 to 5 year range above, with a standard error of 0.04. It is labelled as a placeholder wherever it appears, and the country's own estimate is kept alongside for comparison. With σ = 7.3% this gives a long-run spread of 13.5%.

**Why resample shocks instead of paths.** Stitching together blocks of raw historical changes breaks mean reversion at every seam, and the simulated rate drifts like a random walk. Feeding resampled residuals through the equation keeps real crisis-sized shocks while the model holds long paths together. The long-run spread stays bounded at σ / √(1 − φ²). As an illustration, φ = 0.85 and σ = 10% give a long-run standard deviation of about 19%.

**Shock draw, per simulated year**

1. Draw a single historical year y, independently of the previous step.
2. The portfolio module takes equity, bond and inflation outcomes from year y, all measured in dollars.
3. Draw a donor currency from the country's peer group among those with data for year y.
4. Use the donor's standardized residual for year y as ε, scaled by the country's own σ.

*Phase 1* *(Revised)*: the donor is always the country itself, so the shared draw is limited to years where both the portfolio data and the country's own residual exist. For Chile that is 1997 to 2025, 29 years. Longer US return history (back to 1928) is loaded but cannot be drawn until phase 2 fills earlier years from peers.

Peer groups are regional and follow the four groups in the tier C roster. Africa has only two members, so it draws from the whole of tier C until more countries join it. Tier A currencies form a single group. The donor is the country itself about 70% of the time and a peer 30%, a starting weight to be tested in phase 2.

Drawing everything from the same year preserves the tendency of the dollar to strengthen when equities fall. This is the one requirement the engine places on the portfolio module: both must consume the same year draws.

International equity needs no separate currency model. Its historical dollar returns already contain each year's currency moves, and the shared draw keeps them aligned with the engine's shock.

**Parameter uncertainty.** Each path draws its own φ and μ from their estimated sampling distributions, with φ capped below 1. Small samples make reversion look faster than it is, so a single point estimate would flatter the results. *(Revised)* This is built and seeded, but off by default until phase 2 replaces the placeholder φ.

**Long-run level.** μ is fixed for each country. A lasting rise in a country's price level is tested through the sustained appreciation scenario, not built into the simulated paths.

**Starting point.** Paths begin at today's q₀, not at μ. If a country is currently cheap against its own history, the model expects a headwind as it reverts.

## Integration with the Monte Carlo

The engine touches the simulation in two places each year: the spending line and the tax calculation. Everything is kept in real dollars.

&#91;embedded content: engine data flow · offline calibration, then the yearly loop\]

The year draw is the only link between the two modules. The forex engine never sees portfolio values, and its output reaches the result only through spending and tax.

**Spending.** *(Revised)* The engine splits the budget into a dollar-priced part and a locally priced part. Only the local part moves with the real rate.

```latex
\text{Spending}_t = B^{USD} + B^{local} \times \frac{Q_t}{Q_0}
```

The local part covers rent, services, groceries and local healthcare. The dollar part covers flights, US insurance, imported goods and US tax.

In the product, the person enters a safe withdrawal rate instead of the two budget figures. Spending is the portfolio times the rate, and all of it is treated as locally priced:

```latex
B^{USD} = 0, \qquad B^{local} = r_{SWR} \times W_0
```

The interface shows the result under the field, for example "$40,000 / yr spent locally, at today's exchange rate". Treating all spending as local is the more exposed case. With $1M at 4% over 40 years (60/40, seed 42), the success rate falls from 89.8% to 77.0% with exchange rate risk on (−12.8 percentage points). With the same $40,000 split one third dollar-priced and two thirds local, it falls to 81.9% (−7.9 points). Whether to restore a fixed dollar share is open question 1. Asset allocation is entered as linked Stocks and Bonds percentages that always sum to 100.

**Tax.** Local brackets are denominated in local units such as UTA in Chile, BPC in Uruguay and UMA in Mexico. Dollar income is converted to local real terms by dividing by Qₜ / Q₀, then passed to the existing MERIDIAN bracket functions. When a country gets cheaper, the same dollar income lands in a higher local bracket. This assumes brackets track local inflation, which holds by construction for indexed units and is an assumption elsewhere.

Both sides are computed each year. US tax is calculated in dollars and never uses Q directly. The two sides meet at the foreign tax credit: local tax, which does move with Q, can offset US tax on the same income. How much it offsets depends on each treaty and on income sourcing, which the existing country modules already encode.

**Yearly loop, per path**

1. Take the shared year draw.
2. Advance the portfolio and the real rate from that draw.
3. Compute spending from the budget split.
4. Compute US and local tax on the withdrawal needed.
5. Withdraw, apply any guardrail rule, and record the year.

*Phase 1* *(Revised)*: there is no tax step yet (phase 4), so spending is after tax. The two asset classes are US equity (S&P 500 with dividends) and 10-year Treasuries, in real dollars, rebalanced each year. A path fails in the year its balance reaches zero; the success rate is the share of paths that last the full horizon.

**Interface**

```js
const fx = createFxEngine({ country: 'CL', horizon: 60, paths: 10000, seed: 42 });

fx.path(i);   // Float64Array of Q_t / Q_0, length horizon + 1
fx.meta;      // tier, years of data, parameters, data as-of date
```

Parameters ship as a static JSON file per country, estimated offline. The simulation runs in a web worker with a seeded generator, so any result can be reproduced and spot-checked.

*(Revised)* Phase 1 adds a plan runner that uses the same year draws for every comparison:

```js
const r = runPlan({ country: 'CL', startBalance: 1e6, budgetUsd: 0, budgetLocal: 40000, equityShare: 0.6, horizon: 40, seed: 42 });
r.attribution; // { successRateChange, fromReversion, fromShocks }
```

Each path has its own random stream, so path *i* is the same however many paths are requested. The interface picks a new seed for every run and shows it beside the run time; entering that seed in the engine reproduces the run exactly.

## Stress scenarios and historical replay

Resampling cannot produce a regime the sample never contained, so named scenarios run alongside the simulation as fixed paths.

| Scenario | What it imposes on Q | Historical anchor |
| --- | --- | --- |
| Sustained real appreciation | A steady rise over 10 years that then holds | Uruguay, 2004 to 2014 |
| Broad dollar decline | A multi-year fall in the dollar against most currencies at once | The dollar from 2002 to 2008 |
| Devaluation with catch-up inflation | A sharp drop in Q that recovers within a few years | Uruguay, 2002 |
| Retiring at the trough | Start at the 10th percentile of the country's history, then full reversion | None; a valuation test |

Scenario magnitudes will be set from the data in the audit phase. The anchors above are from memory and need verification.

The devaluation scenario exists to check that the model does not book a crash as a permanent gain.

**Historical replay** runs the actual recorded path for a chosen start year, for example retiring to Montevideo in 2002. It is a sanity check on the simulated distribution, not a forecast.

## Outputs surfaced to the user

Each output answers one question a person comparing countries would ask.

| Output | Question it answers | Phase 1 prototype |
| --- | --- | --- |
| Valuation gauge | Is this country cheap or expensive today against its own history? | Built |
| Attribution | How much does the success rate change with exchange rate risk switched on? | Built, split into reversion and shocks |
| Break-even appreciation | How much sustained real appreciation can the plan absorb before it fails? | Not yet |
| Cost-of-living fan chart | What range of dollar living costs should I expect over time? | Built, with the extrapolation zone marked and a table view |
| Worst-decile spending | In a bad outcome, what does my local standard of living look like? | Built |
| Regime label | Is the currency dollarized, pegged, managed or floating, and is convertibility a concern? | Built (regime only; no convertibility flags yet) |
| Data confidence grade | How much history supports this country's numbers? | Built |
| Hedging levers | What changes if I hold a local cash buffer, own my home, or hold more international equity? | Not yet |
| Visa threshold risk | How likely is a currency move to push my income below a residency requirement? | Not yet |

## Validation plan

The engine is accepted when all seven checks pass.

- [x] **Reproducibility.** The same seed produces identical paths. *Passes; path i is also independent of path count and order.*
- [x] **Off switch.** With σ = 0 and q₀ = μ, results match the calculator without the engine exactly. *Passes: balances and spending are identical.*
- [x] **Bounded spread.** The simulated spread of q stops growing after about 20 years and matches σ / √(1 − φ²). *Passes within 3%, and follows σ·√((1 − φ^2t)/(1 − φ²)) on the way up.*
- [ ] **Out-of-sample coverage.** Fitted on the first 20 years of each series, the 5th to 95th percentile band contains the later actual path about 90% of the time across the panel.
- [ ] **Correlation.** Simulated correlation between equity returns and currency shocks matches the historical figure within sampling error. *Phase 2 check. Reported informally now: 0.12 historical, 0.11 simulated, over 29 years.*
- [ ] **Dollarized sanity.** Panama's paths are far less volatile than any floater's.
- [ ] **Hand check.** One five-year path is reproduced by hand in a spreadsheet.

## Limitations

The engine produces a plausible range conditional on its assumptions, not a forecast. Six limits should be stated wherever results appear.

- **One regime.** Thirty years of data may be a single monetary regime. Results for years 31 to 60 are extrapolation.
- **A fixed long-run level.** The model assumes μ does not move. Real rates in economies that grow faster than the US can trend upward for decades.
- **Bounded tails.** No simulated shock can exceed the worst one in the pooled sample. With 70% of shocks drawn from the country itself, extreme years are also rarer than a full pool would give.
- **No convertibility risk.** Capital controls, dual rates and deposit freezes are flagged but not simulated.
- **CPI is not your basket.** Rents in neighbourhoods popular with foreigners can outrun national inflation.
- **Annual steps.** Swings within a year are averaged away, so short-term cash needs are understated. Years are also drawn independently, so multi-year bear markets appear less often than in history.
- **A thin year pool in phase 1.** *(Revised)* Until peer donors exist, portfolio outcomes come from 29 years (1997 to 2025), so equity tails reflect only that period.
- **The starting point dominates.** *(Revised)* With a short half-life, the result depends heavily on today's gap from the long-run level and on φ, which is still a placeholder. Both should be re-checked after the audit and phase 2.

## Build phases

The work runs in five phases, and each ends with a test that must pass before the next begins.

| Phase | Deliverable | Exit test |
| --- | --- | --- |
| 0. Data audit | Annual Q series and a confidence grade for every candidate country | Every series traced to a primary source; coverage dates in this proposal confirmed or corrected |
| | *Status:* Chile and US downloaded and traced (*sourced*). Review and the other 21 countries outstanding | |
| 1. Single pair | US and Chile, AR(1) with the country's own residuals, two asset classes, on/off attribution | Reproducibility, off switch and bounded spread checks pass |
| | *Status:* built; all three exit checks pass. Includes a browser prototype and a command-line report | |
| 2. Full model | Regional shock pools at 70% own weight, tested at 50% and 30%; parameter uncertainty; shared single-year draws | Out-of-sample coverage and correlation checks pass |
| 3. All countries | Tier handling, stress scenarios, historical replay | Dollarized sanity check passes; scenarios reviewed against the record |
| 4. Product | Tax layer hookup and outputs built to the MERIDIAN design system | Hand check passes end to end, including tax |

Phase 1 is deliberately small. Its attribution result shows whether exchange rate risk is material enough to justify phases 2 to 4.

*(Revised)* On sourced data the effect is material: about −12 to −13 percentage points of success rate for Chile at today's level. Most of it comes from the starting valuation, which makes the phase 2 pooled estimate of reversion speed the most important next step.

## Decisions

All six questions left open in the first draft are settled, and the sections above reflect each answer.

- [x] Which country goes first in phase 1? Decided: Chile, which lets the tax hookup reuse the existing Chile module.
- [x] How should peer groups for pooling be defined? Decided: by region, using the four groups in the tier C roster.
- [x] Should converging economies get an upward drift in μ, or is a fixed level with a stress scenario enough? Decided: fixed level, with the sustained appreciation scenario covering lasting rises.
- [x] Should year draws be single years or multi-year blocks? Blocks preserve long equity bear markets but shrink the effective sample. Decided: single years, with historical replay covering multi-year bear markets.
- [x] Should the currency exposure inside international equity be modelled explicitly, or left implicit in its dollar returns? Decided: implicit, using historical returns measured in dollars.
- [x] How much weight should a country's own residuals get against its peers' in the shock pool? Decided: mostly its own, starting at 70% own and 30% peers.

**Decided during phase 1** *(Revised)*

- [x] What reversion speed does phase 1 use without a panel? Decided: a 4-year half-life placeholder, labelled as such, with the own estimate kept for comparison.
- [x] What does the product ask for instead of a budget split? Decided: a safe withdrawal rate, with spending derived from it and shown read-only.
- [x] How are allocation inputs shown? Decided: Stocks and Bonds percentages, linked to sum to 100.
- [x] Should the product expose the seed? Decided: no input; a new seed each run, shown with the results.
- [x] Which design system does the prototype use? Decided: its own neutral styling with light and dark themes. Dune Light was tried and reverted; it has no dark theme yet.

**Open questions**

1. Should part of the withdrawal be fixed in dollars (flights, US insurance, US tax) instead of treating all of it as local? A fixed share would need either an input or a default.
2. Should Chile's sample start in 2000, after the move to a free float, instead of 1996? That removes the regime break but leaves 26 years.
3. Who reviews the sourced series to move them to *audited*, and against which primary sources (Banco Central de Chile, INE, BLS)?
