# Atlas Multifamily Dashboard — Market Transfer Playbook (v2)

**Purpose:** Stand up the Atlas multifamily intelligence dashboard for a new
metro (Charlotte first, others to follow), with identical functionality and
look-and-feel — only the data and narrative change.

> **What changed from v1 of this playbook.** v1 assumed each market was its own
> ~10,500-line single-file `.jsx` artifact that you cloned and hand-edited. The
> dashboard is now a **web app** (`atlas-dashboard/`, Vite + React) with **one
> shared, data-free `Dashboard.jsx`** and **one JSON data file per market**.
> A new market is **a JSON file + one manifest line — not a new code file.**
> Everything below is rewritten for that model.

---

## TL;DR — the turnkey workflow

When you want a new market, you (Marty) only do two things:

1. Say: *"New market: Charlotte."*
2. Hand over the data exports (Section 4 checklist).

Claude does the rest: builds `src/markets/data/charlotte.json` to the schema,
runs the validator, registers it, and confirms it renders. You never touch code.

Because every market renders through the **same** `Dashboard.jsx`, feature
parity is automatic — tabs, charts, modals, filters, scoring, and styling are
literally the same component. The v1 "Feature Parity Contract" (count the tabs,
don't change the framework, etc.) is now guaranteed by construction. **The only
risk is data correctness**, which is exactly what the validator guards.

---

## Section 1: How the app is structured

```
atlas-dashboard/
  src/
    AppShell.jsx          Market switcher bar + "+ Add market" + lazy-load/hydrate
    Dashboard.jsx         The whole dashboard. DATA-FREE. exports hydrate(data).
    markets/
      index.js            Registry: auto-discovers data/*.json via import.meta.glob
      data/
        manifest.json     [{ id, name }] — switcher list + order
        austin.json       Austin market data (canonical example)
        _blank.json       Empty-but-shaped dataset (used by blank markets)
        <new>.json        Each new market drops in here
  scripts/validate-market.mjs   Schema + invariant checker
  DATA_SCHEMA.md          The data contract (field-by-field)
```

`Dashboard.jsx` declares its data fields as module-level bindings that
`hydrate(data)` fills in before render. Per-market behavior (urban-sub list,
data vintage / "today" marker, property-tax default) now comes from the data
file's `URBAN_SUBS` array and `_market` block — see DATA_SCHEMA.md. The scoring
weights and `lerp` calibration ranges still live in the shared file (they're
market-agnostic by default; see Section 6 on recalibration).

## Section 2: Adding a market — the exact steps Claude follows

1. **Confirm scope** (Section 7 decisions: counties, submarket naming, unit
   filter, urban-sub list, providers).
2. **Ingest** the raw exports into a single JSON matching `austin.json`'s shape
   (DATA_SCHEMA.md is the contract). Honor the unit conventions exactly. **Start
   from `src/markets/data/_blank.json`** (the Austin-free scaffold — correct shape,
   no Austin content), *not* from `austin.json`, so no Austin submarket names,
   zips, or prose leak into the new market. Write every narrative
   (`SUB_NARRATIVES`, `THESIS`, `EXEC_NARRATIVE`, provider commentary) fresh for
   this market.
3. **Validate:** `npm run validate-market -- src/markets/data/<id>.json`. Fix
   every ERROR; review WARNINGS (some are expected, e.g. a sub with no
   narrative yet).
4. **Register:** add `{ "id": "<id>", "name": "<City, ST>" }` to
   `src/markets/data/manifest.json`. (No edit to `index.js` — the glob finds the
   file automatically.)
5. **Verify it renders:** `npm run build`, and spot-check in `npm run dev`.

## Section 3: Atlas brand & voice (constant across markets)

Brand tokens live in the shared `T` object and **do not change**: navy
`#090E41`, light bg `#EDF0F8`, accents `#AFCBFF`/`#7BA9FF`, 2px radius, system
sans-serif.

**Voice (analyst tone):** terse, fact-led, one implication per sentence; numbers
before adjectives; no "moreover/furthermore"; nothing "underscores" or "is a
testament to" anything. `SUB_NARRATIVES` pattern: **facts first** (inventory,
vacancy, UC) → **one operational read** (T12 absorption vs delivery) → **one
structural color** (employer anchor / school / water / pricing tier) → **one
forward-looking phrase**. Example:

> "Round Rock": "Thesis submarket: 21,944 units of inventory, 0 UC, 10.4%
> vacancy with 2.70x absorption/delivery ratio. Dell Technologies HQ. RealPage
> ranks #16 for current ERG but projects +3.3% in 2026F."

## Section 4: Data acquisition checklist

Pull these into a `<Market>_Source_Data/` folder, then run
`npm run check-sources -- <folder>` (it ticks off what's present and flags
what's missing). The canonical, tick-box version of this list is
**[NEW_MARKET_CHECKLIST.md](./NEW_MARKET_CHECKLIST.md)** — it's authoritative;
this section is the narrative version. *Verified against the actual Austin
source set, so the file shapes below are real, not assumed.*

**Blockers (required to build):**

1. **CoStar property-level export** — feeds `PROPS`. *Austin file had **two
   sheets**: `Property Level Data` (716 rows, ~185 cols) and a **`Submarket
   Mapping`** sheet that crosswalks CoStar submarket names → the property-level
   submarket taxonomy.* Keep that crosswalk — it's how `PROPS.sb` ends up
   matching `SUBS.s` (the property export uses a different submarket naming than
   the submarket export). Filter to **30+ units**.
2. **CoStar market & submarket workbook** — in Austin this was **one file with
   three sheets**, not three files: `Submarket Source of Truth` (current-quarter
   → `SUBS`), `Market Data` (metro quarterly → `Q_*`), and `Submarket Data`
   (~1,526 rows, per-sub quarterly → `SUB_TS`). Note exact submarket names — they
   are the join keys everywhere.
3. **Zip-code data dump** — ONE CSV feeding **both** `ZIPS` and `MS` (Austin:
   ~61 zips × ~249 cols incl. ZHVI, ACS, income-by-age, structure mix, education,
   and Market Stadium `[Score]/[Actual Value]` factor columns).

**Degrades a tab if missing:**

4. **CoStar sales since 1/2020** → `SALES` / Capital Markets tab (Austin: 467).
5. **Major employers** → `EMPLOYERS` panel (use the `Actionable Employers`
   sheet; Austin workbook had several sheets).
6. **Monthly property time series** (2022+) → lease-up velocity (optional;
   degrades gracefully — velocity falls back to the market default).
7. **Submarket boundary geometry** → the map (`GEO`/`COAST`/`COUNTY_LINES`/
   `MAP_LABELS`/`MAP_VIEW`). ⚠️ **There was NO geometry file in the Austin source
   set — the Austin map was hand-built.** For a new market, acquire it separately
   (CoStar KML/shapefile export or Census TIGER county-subdivision shapefiles) or
   hand-build it (viewBox-pixel coords). This is the longest manual step; without
   it the map is empty but every other tab works.

**Narrative sources** (provider commentary → `RP, GS, NM, AT, CS_CAP, THESIS`):

8. The real workflow is **two-step**: the provider PDFs (Newmark "Why \<Market\>",
   RealPage report, Green Street snapshot, Apartment Trends) are first extracted
   into **one consolidated workbook** — Austin's
   `PDF_Extracts__…_ATX.xlsx` had one sheet per provider — and *that* structured
   workbook is what gets coded into the narrative constants. Provide the PDFs
   (Claude builds the extract sheet) or the extract workbook directly.

## Section 5: CoStar column → field mapping

```
Inventory Units                     -> inv   (int)
Vacancy Rate                        -> vac   (×100 → percent)
Market Asking Rent/Unit             -> rent  (int)
Effective Rent Growth 12 Mo         -> erg   (×100 → percent)
Absorption Units 12 Mo              -> t4a   (int)
Net Delivered Units 12 Mo           -> t4d   (int)
Under Construction Units            -> uc    (int)
Market Sale Price Per Unit          -> spu   (int)
Market Cap Rate                     -> cap   (KEEP decimal, e.g. 0.0568)
Derived:  ad = round(t4a / t4d, 2) if t4d>0 else 0
```
CoStar prefixes submarket names like `"Charlotte - NC USA - Uptown"` — strip the
prefix to `"Uptown"`. **But note the property export uses a *different* submarket
taxonomy than the submarket export**, which is why the Austin property workbook
shipped a `Submarket Mapping` sheet (CoStar submarket → property submarket). Use
that crosswalk to set each `PROPS.sb` to the canonical `SUBS.s` name — don't
assume the two exports already agree. (This is the root of pitfall #3.)

## Section 6: Scoring (portable; in the shared file)

Composite = **Sub 25 / Zip 40 / Property 35**; signal **BUY ≥ 65 / WATCH 50–64 /
AVOID < 50**. Default weights and the `lerp(value, lo, hi, invert)` calibration
ranges live in `Dashboard.jsx` and are market-agnostic by default. Recalibration
is **rare and deliberate**: only if a new market's distribution differs
materially (e.g. Charlotte's tighter vacancy band) and scores cluster. That is a
shared-code change (it affects all markets' relative scoring), so flag it
explicitly and confirm before touching it — do not silently fork ranges per
market.

## Section 7: Per-market decisions (confirm up front)

- **Counties / MSA scope.** (Charlotte: Mecklenburg + Union + Cabarrus + Gaston +
  Iredell, possibly York/Lancaster SC.)
- **Submarket naming:** use CoStar's names verbatim (recommended).
- **Unit filter:** 30+ units unless a small-deal strategy says otherwise.
- **`URBAN_SUBS`:** which submarkets are urban core (Charlotte: Uptown, South
  End, NoDa, Plaza-Midwood, Wesley Heights).
- **`_market.propTaxRate`:** set per state (NC ≠ TX 2.10%).
- **`_market` vintage:** `asOfQuarter` (latest actual), `todayQuarter`,
  `todayLabel` — set from the CoStar export's vintage.
- **Providers** Atlas reads for this market; any historical conviction or
  already-underwritten/passed deals to color the thesis prose.

## Section 8: Pitfalls (carried over, still true)

1. **Cap rate is decimal** (`0.0568`) — never ×100. (Validator errors on cap>1.)
2. **Vacancy/ERG are percent** (`5.68`) — ×100 from CoStar's decimal. (Opposite
   of cap. Validator warns if all vac ≤ 1.)
3. **Submarket-name consistency is everything.** `SUBS.s` must match `SUB_TS.d`
   keys, `SUB_NARRATIVES` keys, `PROPS.sb`, `ZIPS.sb`, and `URBAN_SUBS`. A
   mismatch fails silently (renders, but blank). The validator checks this.
4. **`SUB_TS` series length** must equal `q.length`, and **`_market.asOfQuarter`
   must exist in `SUB_TS.q`** or reconciliation is skipped. (Validator checks.)
5. **`Q_UC.v` is `null` for forecast quarters** (UC isn't forecastable).
6. **`Q_OCC.v` is a decimal** (`0.94`), not a percent.
7. **Reconciliation runs at load.** `Dashboard.jsx` splices `SUBS` actuals into
   `SUB_TS` at `_market.asOfQuarter` and flips that quarter's `fc` to actual. If
   you change a `SUB_TS` value at that quarter, change the matching `SUBS` value
   too, or it'll be overwritten.
8. **Hard-coded dates in prose.** `EXEC_NARRATIVE`/`SUB_NARRATIVES` may name a
   quarter ("Q4 2025"); update statistical claims by hand per refresh. (The
   `_market` block and chart "today" marker update automatically.)
9. **Don't inherit Austin's narratives.** Build from `_blank.json`, not
   `austin.json`. Every narrative and submarket-keyed object must be this market's
   own — no Austin submarket names, zips, property names, or prose left behind.
   The validator WARNS if a non-Austin file still contains "Austin" or leftover
   Austin submarket keys in its narratives; treat those warnings as must-fix.

## Section 9: Quarterly refresh (once a market is live)

Refresh is now even simpler — no new code file. Regenerate that market's JSON
(updated `SUBS`, splice new actuals into `SUB_TS`, flip `fc`, replace the
forecast tail, bump `_market.todayQuarter`/`todayLabel`/`asOfQuarter`), validate,
and you're done. All markets can be refreshed independently.

## Section 10: What to hand Claude for a new market

The Section 4 files, plus one short message: the Section 7 decisions (counties,
urban-sub list, prop-tax rate, vintage quarter, providers, any Atlas conviction).
Then: *"Build the <Market> market JSON per DATA_SCHEMA.md and the playbook."*
