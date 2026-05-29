# Market Data Schema (the contract a market JSON must satisfy)

This is the authoritative reference for a per-market data file
(`src/markets/data/<id>.json`). `austin.json` is the canonical example — when in
doubt, open it. Every market file must have the **same top-level keys** as
`austin.json`. Run `npm run validate-market -- src/markets/data/<id>.json` to
check a file against this contract.

> Field keys are deliberately short (file size). Values use the exact unit
> conventions below — getting a unit wrong renders without error but shows wrong
> numbers, so the validator checks the easy-to-confuse ones.

## Unit conventions (read this first)

| Field(s) | Stored as | Example | Note |
|---|---|---|---|
| `SUBS.cap` | **decimal** | `0.0568` = 5.68% | Do **not** ×100. Validator errors if any cap > 1. |
| `SUBS.vac`, `SUBS.erg` | **percent** | `10.83` = 10.83% | ×100 from CoStar's decimal. |
| `Q_OCC.v` | **decimal** | `0.9272` = 92.72% | Occupancy only. |
| `Q_*` other `.v` | natural units | rent `1313`, etc. | |
| money | whole dollars (int) | `171985` | |

## Top-level keys

Counts/IDs use these containers (validator checks the container type matches
`austin.json`):

### `_market` (object) — per-market behavior, NEW
Controls behavior the shared dashboard used to hardcode. All optional; each
falls back to the Austin default if omitted.

```jsonc
"_market": {
  "id": "austin",          // informational
  "asOfQuarter": "26Q1",   // latest ACTUAL quarter; anchors reconciliation + forward-growth. MUST exist in SUB_TS.q
  "todayQuarter": "26Q2",  // the "Today" marker drawn on charts
  "todayLabel": "May 2026",
  "propTaxRate": 2.10      // cost-to-own calculator default (%). TX=2.10; set per state (NC differs).
}
```

### `URBAN_SUBS` (array of strings) — NEW
Submarkets treated as urban core for $/unit home-value estimation. Must be a
subset of `SUBS[].s`. Austin: `["Central Austin","Downtown Austin","East Austin","West Austin","South Central Austin","North Austin"]`.

### `PROPS` (array) — one record per property (Austin: 716, 30+ units)
`{n,yb,u,v,o,z,m,sb,er,cn,sf,cl,co,st,pm,ds,cs,sg}` + optional `{la,lr,it,mt,sd,sp}`

| key | meaning | type |
|---|---|---|
| n | name | string |
| yb | year built | int |
| u | units | int |
| v | vacancy % | float |
| o | owner (often truncated) | string |
| z | zip | int |
| m | CoStar micro-market label | string |
| sb | submarket (**must match `SUBS.s`**) | string |
| er | effective rent $ | int |
| cn | concessions % | float |
| sf | avg unit SF | int |
| cl | class `A`/`B`/`C` | string |
| co | county | string |
| st | stories | int |
| pm | property manager | string |
| ds | distress score 0–10 | float |
| cs | composite score — leave `0` (computed at runtime) | int |
| sg | signal — leave `"WATCH"` (computed at runtime) | string |
| la | loan amount $ | int (optional) |
| lr | loan rate % | float (optional) |
| it | interest type `Fixed`/`Floating`/`Variable` | string (optional) |
| mt | maturity `MM/DD/YYYY` | string (optional) |
| sd | last sale date | string (optional) |
| sp | last sale price $ | int (optional) |

### `SUBS` (array) — submarket source-of-truth, current quarter (Austin: 25)
`{s,rent,vac,erg,uc,inv,t4a,t4d,ad,cap,spu}`

| key | meaning | unit |
|---|---|---|
| s | submarket name — **the join key everywhere** | string |
| rent | asking rent/unit | $ int |
| vac | vacancy | percent |
| erg | effective rent growth 12mo | percent |
| uc | under-construction units | int |
| inv | inventory units | int |
| t4a | absorption 12mo | int |
| t4d | net delivered 12mo | int |
| ad | absorption/delivery ratio = `t4a/t4d` (0 if t4d=0) | float |
| cap | market cap rate | **decimal** |
| spu | sale price per unit | $ int |

### `ZIPS` (array) — `{z,sb,p,u,pg,rp,mf,p2,ad,i2,hv,ns,mi,gr,cs}`
z=zip(int), sb=submarket(match `SUBS.s`), p=property count, u=MF units,
pg=4yr pop growth %, rp=renter % of HH, mf=% MF of stock, p2=% built 2000+,
ad=% associates+ , i2=median HH income age 25-44 $, hv=4yr home-value growth %,
ns=new supply % of inventory, mi=median HH income $, gr=ACS gross rent $,
cs=composite zip score (leave `0`).

### `MS` (object keyed by zip-as-string) — Market Stadium factor scores
Each value: `{sf,ht,cp,rb,ri,sc,vc,tc,jo,nm,mr,wk,rt,ma,ur,ct,fs}`.
Used by `scoreZip`: **ht** (HiTech worker %), **sf** (six-figure HH %),
**cp** (construction pipeline % of inv), **ct** (commute min), **jo** (jobs/1K),
**rt** (retail score), **wk** (walk score), **fs** (forecast composite 0–100),
**tc** (total crime/1K), **sc** (school 0–10). Also present and shown in detail
views: **rb** (rent-burdened %), **ri**, **vc**, **nm**, **mr**, **ma**, **ur**
— populate these from the same Market Stadium zip dump that feeds Austin (match
the source columns one-for-one; they are not all used in scoring but appear in
zip detail panels). Example: `MS["76537"] = {"sf":42.7,"ht":2,"cp":0,"rb":36.8,"ri":29.4,"sc":6.4,"vc":54.8,"tc":196.3,"jo":39.7,"nm":26,"mr":0.25,"wk":1,"rt":25.6,"ma":34,"ur":3.2,"ct":30.3,"fs":90.4}`.

### `SUB_TS` (object) — per-submarket quarterly time series
`{ q:[...], fc:[...], d:{ "<sub>": { r,v,sv,a,d,uc,st } } }`
- `q`: quarter labels, e.g. `"16Q1" … "31Q2"` (Austin: 62). `fc`: parallel array, `0`=actual `1`=forecast.
- Each series array length **must equal `q.length`**. Series: r=rent$, v=vacancy%, sv=stabilized vac%, a=absorption, d=delivery, uc=under-construction, st=starts.
- Object keys are submarket names (double-quoted) and must match `SUBS.s`.

### `Q_*` (arrays) — metro-wide quarterly series
`Q_RENT, Q_OCC, Q_ABS, Q_UC, Q_CAP, Q_NOI, Q_CVI, Q_AVPU, Q_SVOL, Q_SPU, Q_STARTS, Q_RENTSF, Q_ERG, Q_POP, Q_EMP`.
Each item `{q,fc,v}`. `Q_OCC.v` is decimal; `Q_UC.v` should be `null` for forecast quarters.

### Derived/aggregate data (compute during ingestion)
`SUB_PROPS, SUB_STATS, SUB_VAC, SUB_DESIRE, SUB_AFFORD` (objects keyed by sub),
`SALES` (keys: total, disclosed, dateRange, byYear, byQtr, peak, curr, decline,
buyerType, buyerOrigin, sellerType, topBuyers, topSellers, bySub, hold, vintage),
`ANN` (annual deliveries/absorption), `GEO`/`COAST`/`COUNTY_LINES`/`MAP_LABELS`/`MAP_VIEW`
(map geometry in viewBox-pixel coords), `LEASEUP_PROPS`/`LEASEUP_SUBS`/`LEASEUP_ZIPS`/`LEASEUP_MATCH`/`UC_DEALS` (lease-up tab), `EMPLOYERS` (major employers panel).

### Narrative (hand-written prose)
`EXEC_NARRATIVE`, `SUB_NARRATIVES` (one per sub), `THESIS` (per-sub thesis —
**note: the constant is `THESIS`, not `ANALYST_THESIS`**), `RISK_FACTORS`, and
provider commentary `RP, GS, NM, AT, CS_CAP`. Vintage labels live in `DV` and
`DATA_VINTAGE` (**there is no `DATA_SOURCES` constant**).

## Cross-reference invariants (the silent killers — validator enforces)
Every one of these must use the **same submarket names**:
`SUBS[].s` ⟺ `SUB_TS.d` keys ⟺ `SUB_NARRATIVES` keys ⟺ `PROPS[].sb` ⟺
`ZIPS[].sb` ⟺ `URBAN_SUBS`. And `_market.asOfQuarter` must be present in
`SUB_TS.q`. A mismatch renders the page fine but shows blank/■ data.
