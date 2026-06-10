# New-Market Source Checklist

Tick these off as files come in for a new metro. Drop everything into a folder
named `<Market>_Source_Data/` (e.g. `Charlotte_Source_Data/`), then run:

```
npm run check-sources -- "<path to Market_Source_Data folder>"
```

…which prints this same checklist with ✅/❌ filled in and tells you what's still
missing (and how bad each gap is). Filenames don't have to match exactly — the
scanner matches on keywords, so `CoStar__Property_Level_Data_Dump_CLT.xlsx`
works just as well as the Austin name.

Legend for severity:
- 🔴 **Blocker** — can't build the core dashboard without it.
- 🟠 **Degrades** — dashboard builds, but a whole tab/panel is empty or weak.
- 🟣 **Narrative** — needed for the written commentary/thesis to be market-specific.
- ⚪ **Optional** — context/color; nice to have, not required.

---

## 🔴 Blockers — required to build the data file

- [ ] **CoStar property-level export** — feeds `PROPS` (+ the property↔submarket
      crosswalk). *Austin: `CoStar__Property_Level_Data_Dump_ATX.xlsx`* — sheet
      `Property Level Data` (716 rows, 185 cols) **and** sheet `Submarket Mapping`
      (the CoStar-submarket → property-submarket crosswalk — don't lose it; it's
      how `PROPS.sb` ends up matching `SUBS.s`).
- [ ] **CoStar market & submarket workbook** — ONE file with **3 sheets**, feeds
      `SUBS`, the `Q_*` metro series, and `SUB_TS`. *Austin:
      `CoStar__Market_and_Submarket_Data_ATX.xlsx`* →
      `Submarket Source of Truth` (current-quarter SUBS),
      `Market Data` (metro quarterly time series),
      `Submarket Data` (per-submarket quarterly forecast curve, ~1,526 rows).
- [ ] **Zip-code data dump** — ONE CSV, feeds **both** `ZIPS` and `MS`. *Austin:
      `Zip_Code_Data_Dump_ATX.csv`* (61 zips, ~249 cols: ZHVI, ACS, income by age
      band, structure mix, education, and the Market Stadium `[Score]/[Actual]`
      factor columns).

## 🟠 Degrades a tab/panel if missing

- [ ] **CoStar sales since 1/2020** — feeds `SALES` / Capital Markets tab.
      *Austin: `CoStar__Austin_Sales_Data_since_1_2020.xlsx`* (467 rows).
- [ ] **Major employers** — feeds `EMPLOYERS` panel. *Austin:
      `Major_Employers__Austin.xlsx`* — use the `Actionable Employers` sheet.
- [ ] **Monthly property time series** (2022+ vintage) — feeds lease-up velocity.
      *Austin: `MonthlyTimeSeries_AustinRoundRockSanMarcosTX.xlsx`*. If missing,
      lease-up velocity falls back to the market default (dashboard still works).
- [ ] **Map geometry — now AUTOMATED, no file needed.** `COAST`, `COUNTY_LINES`,
      and `MAP_VIEW` are generated from Census TIGERweb (free, no download):

      ```
      npm run build-geometry -- --counties "Mecklenburg NC, Union NC, Cabarrus NC" \
        --labels "CHARLOTTE@35.227,-80.843; CONCORD@35.409,-80.581" --out clt-geom.json
      ```

      Pass the metro's counties (a Section-7 decision anyway) and the city labels;
      merge the output keys into the market JSON (or use `--merge <market.json>`).
      `GEO` (property dots) comes from the CoStar property export's lat/lng.
      Offline fallback: `--in <dir>` with saved county GeoJSON/Esri-JSON files.
      *(The Austin map predates this script and was hand-built.)*

## 🟣 Narrative sources (for market-specific commentary)

- [ ] **Consolidated PDF extracts** — the real input to the narrative constants
      (`RP`, `AT`, `NM`, `CS_CAP`, `GS`). *Austin:
      `PDF_Extracts__RealPage_Axio_GreenStreet_CoStar_Apartment_Trends_Newmark_ATX.xlsx`*
      — one sheet per provider. **Workflow:** the provider PDFs below get
      extracted into this structured workbook first, then coded into the JSON.
- [ ] **Newmark "Why \<Market\>"** PDF — *Austin: `Why_Austin_4Q_25__Newmark.pdf`*
- [ ] **RealPage market report** PDF — *Austin: `RealPage_Apartment_Market_Report_Austin_4Q25.pdf`*
- [ ] **Green Street market snapshot** PDF — *Austin: `GreenStreetMarketSnapshotApartment…Austin.pdf`*
- [ ] **Apartment Trends / Investor Interests** PDF — *Austin: `Austin_Trends_Report_4Q_2025.pdf`*

## ⚪ Optional context / color

- [ ] Axio market performance summary, local CRE brokerage reports, WSJ / news
      articles, construction-starts pieces, the dashboard overview PDFs. *(Austin
      set included several — none are required to build.)*
- [ ] **Project briefing / voice doc** — `Atlas_Austin_Dashboard_Briefing.md` is
      the voice & conventions reference. Reuse its **voice and formatting rules**
      (full property names, visible data vintages, `$X,XXX` rent format, "we"
      voice in partner copy). Note it predates the multi-market app, so ignore its
      "Austin-only / not multi-market" statements.

---

## Per-market decisions to confirm (not files)

- Counties / MSA scope · submarket naming (use CoStar's verbatim) · unit filter
  (30+) · `URBAN_SUBS` list · `_market.propTaxRate` for the state · `_market`
  vintage quarter (`asOfQuarter`/`todayQuarter`/`todayLabel`) · which providers
  Atlas reads · any Atlas conviction or already-underwritten/passed deals.

After building the JSON: `npm run validate-market -- src/markets/data/<id>.json`.
