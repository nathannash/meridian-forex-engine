# MERIDIAN Forex Engine: Design Proposal

Oct 11, 2026 · @Nathan

## Summary

The engine should simulate each country's **real** exchange rate against the dollar as a mean-reverting process driven by resampled historical shocks. Its only output is a yearly multiplier on the dollar cost of local spending, which the Monte Carlo applies to the budget and the tax layer.

Four choices define the design:

- **Real rate, not nominal.** The real rate is the quantity a dollar-based retiree actually pays, and it is roughly stationary, which makes 40 to 60 year paths defensible.
- **Model plus bootstrap.** An AR(1) equation supplies mean reversion. Historical residuals supply the shocks, so fat tails come from data, not from an assumed distribution.
- **Pooled estimation.** No candidate country has enough clean history alone, so reversion speed and tail shocks are estimated across regional peer groups, with each country's own shocks weighted most heavily.
- **Explicit confidence.** Every country carries a data grade, and results beyond the sample length are labelled as model extrapolation.

The decision requested is approval of this design and of phase 1: the US and Chile, two asset classes, and an on/off comparison that shows how much exchange rate risk changes the result.

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

No candidate country has 40 to 60 years of clean floating-rate history, so the engine grades each country by what its data can support. All coverage dates below are approximate and from memory; confirming them against primary sources is the first build phase.

**Inputs**

| Input | Candidate source | Use |
| --- | --- | --- |
| Nominal rate, annual average | IMF International Financial Statistics, FRED | Numerator of Q |
| Local consumer prices | National statistics institutes, World Bank | Local price level |
| US consumer prices (CPI-U) | Bureau of Labor Statistics | US price level |
| Real effective rate indices | Bank for International Settlements | Cross-check only: trade-weighted, not bilateral against the dollar |
| Long-run macro history | Jordà-Schularick-Taylor database | Advanced economies before 1973 |

Annual averages are preferred over year-end rates because a retiree converts money throughout the year.

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

**Confidence grade.** Each country shows its years of usable data, any regime breaks inside the sample, and whether its parameters are its own or pooled.

## Model specification

Each year's log real rate moves partway back toward its long-run level, then takes a shock drawn from history.

```latex
q_{t+1} = \mu + \phi\,(q_t - \mu) + \sigma\,\varepsilon_{t+1}
```

| Symbol | Meaning | How it is set |
| --- | --- | --- |
| q₀ | Starting level | Latest observed real rate for the country |
| μ | Long-run level | Country sample mean, held fixed with no drift; its standard error is carried into the simulation |
| φ | Carry-over: the share of a gap from the long-run level that remains a year later | &#32;φ is the share of any gap from the long-run level that carries into the next year. At 0.85, 15% of the gap closes each year Pooled panel estimate, corrected for small-sample bias |
| σ | Shock scale | Country's own residual standard deviation |
| ε | Shock | Standardized residual resampled from the peer-group pool |

φ is the share of any gap from the long-run level that carries into the next year. A half-life of 3 to 5 years corresponds to an annual φ of about 0.79 to 0.87.

In the product, this parameter is shown as a half-life in years under the label "reversion speed", with a tooltip. Neither φ nor a technical name for it appears in the interface.

**Why resample shocks instead of paths.** Stitching together blocks of raw historical changes breaks mean reversion at every seam, and the simulated rate drifts like a random walk. Feeding resampled residuals through the equation keeps real crisis-sized shocks while the model holds long paths together. The long-run spread stays bounded at σ / √(1 − φ²). As an illustration, φ = 0.85 and σ = 10% give a long-run standard deviation of about 19%.

**Shock draw, per simulated year**

1. Draw a single historical year y, independently of the previous step.
2. The portfolio module takes equity, bond and inflation outcomes from year y, all measured in dollars.
3. Draw a donor currency from the country's peer group among those with data for year y.
4. Use the donor's standardized residual for year y as ε, scaled by the country's own σ.

Peer groups are regional and follow the four groups in the tier C roster. Africa has only two members, so it draws from the whole of tier C until more countries join it. Tier A currencies form a single group. The donor is the country itself about 70% of the time and a peer 30%, a starting weight to be tested in phase 2.

Drawing everything from the same year preserves the tendency of the dollar to strengthen when equities fall. This is the one requirement the engine places on the portfolio module: both must consume the same year draws.

International equity needs no separate currency model. Its historical dollar returns already contain each year's currency moves, and the shared draw keeps them aligned with the engine's shock.

**Parameter uncertainty.** Each path draws its own φ and μ from their estimated sampling distributions, with φ capped below 1. Small samples make reversion look faster than it is, so a single point estimate would flatter the results.

**Long-run level.** μ is fixed for each country. A lasting rise in a country's price level is tested through the sustained appreciation scenario, not built into the simulated paths.

**Starting point.** Paths begin at today's q₀, not at μ. If a country is currently cheap against its own history, the model expects a headwind as it reverts.

## Integration with the Monte Carlo

The engine touches the simulation in two places each year: the spending line and the tax calculation. Everything is kept in real dollars.

&#91;embedded content: engine data flow · offline calibration, then the yearly loop\]

The year draw is the only link between the two modules. The forex engine never sees portfolio values, and its output reaches the result only through spending and tax.

**Spending.** The budget is split into a dollar-priced part and a locally priced part. Only the local part moves with the real rate.

```latex
\text{Spending}_t = B^{USD} + B^{local} \times \frac{Q_t}{Q_0}
```

The local part covers rent, services, groceries and local healthcare. The dollar part covers flights, US insurance, imported goods and US tax.

**Tax.** Local brackets are denominated in local units such as UTA in Chile, BPC in Uruguay and UMA in Mexico. Dollar income is converted to local real terms by dividing by Qₜ / Q₀, then passed to the existing MERIDIAN bracket functions. When a country gets cheaper, the same dollar income lands in a higher local bracket. This assumes brackets track local inflation, which holds by construction for indexed units and is an assumption elsewhere.

Both sides are computed each year. US tax is calculated in dollars and never uses Q directly. The two sides meet at the foreign tax credit: local tax, which does move with Q, can offset US tax on the same income. How much it offsets depends on each treaty and on income sourcing, which the existing country modules already encode.

**Yearly loop, per path**

1. Take the shared year draw.
2. Advance the portfolio and the real rate from that draw.
3. Compute spending from the budget split.
4. Compute US and local tax on the withdrawal needed.
5. Withdraw, apply any guardrail rule, and record the year.

**Interface**

```js
const fx = createFxEngine({ country: 'CL', horizon: 60, paths: 10000, seed: 42 });

fx.path(i);   // Float64Array of Q_t / Q_0, length horizon + 1
fx.meta;      // tier, years of data, parameters, data as-of date
```

Parameters ship as a static JSON file per country, estimated offline. The simulation runs in a web worker with a seeded generator, so any result can be reproduced and spot-checked.

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

| Output | Question it answers |
| --- | --- |
| Valuation gauge | Is this country cheap or expensive today against its own history? |
| Attribution | How much does the success rate change with exchange rate risk switched on? |
| Break-even appreciation | How much sustained real appreciation can the plan absorb before it fails? |
| Cost-of-living fan chart | What range of dollar living costs should I expect over time? |
| Worst-decile spending | In a bad outcome, what does my local standard of living look like? |
| Regime label | Is the currency dollarized, pegged, managed or floating, and is convertibility a concern? |
| Data confidence grade | How much history supports this country's numbers? |
| Hedging levers | What changes if I hold a local cash buffer, own my home, or hold more international equity? |
| Visa threshold risk | How likely is a currency move to push my income below a residency requirement? |

## Validation plan

The engine is accepted when all seven checks pass.

- [ ] **Reproducibility.** The same seed produces identical paths.
- [ ] **Off switch.** With σ = 0 and q₀ = μ, results match the calculator without the engine exactly.
- [ ] **Bounded spread.** The simulated spread of q stops growing after about 20 years and matches σ / √(1 − φ²).
- [ ] **Out-of-sample coverage.** Fitted on the first 20 years of each series, the 5th to 95th percentile band contains the later actual path about 90% of the time across the panel.
- [ ] **Correlation.** Simulated correlation between equity returns and currency shocks matches the historical figure within sampling error.
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

## Build phases

The work runs in five phases, and each ends with a test that must pass before the next begins.

| Phase | Deliverable | Exit test |
| --- | --- | --- |
| 0. Data audit | Annual Q series and a confidence grade for every candidate country | Every series traced to a primary source; coverage dates in this proposal confirmed or corrected |
| 1. Single pair | US and Chile, AR(1) with the country's own residuals, two asset classes, on/off attribution | Reproducibility, off switch and bounded spread checks pass |
| 2. Full model | Regional shock pools at 70% own weight, tested at 50% and 30%; parameter uncertainty; shared single-year draws | Out-of-sample coverage and correlation checks pass |
| 3. All countries | Tier handling, stress scenarios, historical replay | Dollarized sanity check passes; scenarios reviewed against the record |
| 4. Product | Tax layer hookup and outputs built to the MERIDIAN design system | Hand check passes end to end, including tax |

Phase 1 is deliberately small. Its attribution result shows whether exchange rate risk is material enough to justify phases 2 to 4.

## Decisions

All six questions left open in the first draft are settled, and the sections above reflect each answer.

- [x] Which country goes first in phase 1? Decided: Chile, which lets the tax hookup reuse the existing Chile module.
- [x] How should peer groups for pooling be defined? Decided: by region, using the four groups in the tier C roster.
- [x] Should converging economies get an upward drift in μ, or is a fixed level with a stress scenario enough? Decided: fixed level, with the sustained appreciation scenario covering lasting rises.
- [x] Should year draws be single years or multi-year blocks? Blocks preserve long equity bear markets but shrink the effective sample. Decided: single years, with historical replay covering multi-year bear markets.
- [x] Should the currency exposure inside international equity be modelled explicitly, or left implicit in its dollar returns? Decided: implicit, using historical returns measured in dollars.
- [x] How much weight should a country's own residuals get against its peers' in the shock pool? Decided: mostly its own, starting at 70% own and 30% peers.
