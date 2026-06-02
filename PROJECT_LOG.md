# Atlas Market Dashboard — Project Log & Session Handoff

> **What this file is.** The single source of truth for this project's status and
> history. It exists so any Claude session — on any account — can pick up
> seamlessly. If you are a Claude instance starting fresh: **read this file
> first**, then `README.md`, then skim `src/Dashboard.jsx`.
>
> **Maintenance rule (important).** Whenever we change the code/docs and push to
> GitHub, **update this file in the same commit**: append to the Work History
> (Section 8) with the date and what changed, and update any affected section
> (Open Items, Auth status, file list). Keep it accurate — it's the handoff.

Last updated: 2026-06-01

---

## 1. What this is

A web app that hosts the Atlas Real Estate Partners multifamily market dashboard.
It started as a single ~10,500-line React artifact for the **Austin** market and
was turned into a **multi-market** app: one shared dashboard UI, with each market's
data in its own file. You switch markets from a bar at the top, and can add blank
markets for previewing. Built for Atlas's acquisitions team (submarket / zip /
property screening). Stack: **Vite + React 18 + recharts + lucide-react.**

## 2. Live locations

- **GitHub repo:** https://github.com/Mshaeffer5/MarketAnalysis (branch `main`)
- **Hosting:** Cloudflare **Workers** (static assets), project name `marketanalysis`
- **Live URL:** https://marketanalysis.martyshaef61.workers.dev
- **Auto-deploy:** every push to `main` triggers a Cloudflare build automatically.
- **Cloudflare Access team:** `blue-cloud-df44.cloudflareaccess.com`
- **Local dev:** double-click `Launch Dashboard.bat` (see Section 5).

## 3. Architecture (the core idea)

The dashboard **logic is fully separated from the market data**:

- `src/Dashboard.jsx` is **data-free**. It declares its data fields as module-level
  bindings and exposes `hydrate(data)`, which fills them in *before* the dashboard
  renders. This is why the same component can render any market unchanged.
- Each market is a JSON file in `src/markets/data/` (e.g. `austin.json`). Data is
  **lazy-loaded** via dynamic import, so Vite code-splits each market into its own
  chunk — the initial page load doesn't download data for markets you aren't viewing.
- Per-market *behavior* (not just data) also lives in the JSON: `URBAN_SUBS` (array)
  and a `_market` block (`asOfQuarter`, `todayQuarter`, `todayLabel`, `propTaxRate`).
  `hydrate()` applies these with Austin-compatible fallbacks. So `Dashboard.jsx`
  is genuinely market-agnostic.
- Registry is **data-driven**: `src/markets/index.js` reads `data/manifest.json`
  (the market list) and uses `import.meta.glob` to auto-discover data files. Adding
  a market needs **no code edits** — just a JSON file + a manifest line.

## 4. File-by-file

```
atlas-dashboard/
  PROJECT_LOG.md           <- this file (status + history + handoff)
  README.md                 how to run/build/deploy; structure
  TODO.md                   deferred items (mainly: turn on login properly)
  DATA_SCHEMA.md            the contract a market JSON must satisfy (field-by-field)
  MARKET_TRANSFER_PLAYBOOK.md  end-to-end guide to build a new metro (v2)
  NEW_MARKET_CHECKLIST.md   tick-box list of source docs needed per market
  DEPLOY_CLOUDFLARE.md      deploy + Access steps (written for Pages; we used Workers)
  Launch Dashboard.bat      one-click local launcher (mirrors to %LOCALAPPDATA%)
  index.html                Vite entry
  package.json              deps; Vite ^6 (required by Cloudflare Workers)
  package-lock.json
  vercel.json               Vercel config (ignored by Cloudflare; kept for option)
  vite.config.js
  scripts/
    validate-market.mjs     `npm run validate-market -- <file>` — checks a market JSON
    check-sources.mjs       `npm run check-sources -- <folder>` — flags missing source docs
  src/
    main.jsx                renders <AppShell/>
    AppShell.jsx            market switcher bar, "+ Add market", lazy-load + hydrate,
                            and the (dismissible) "not password-protected yet" banner
    Dashboard.jsx           the entire dashboard (~9,084 lines). DATA-FREE. exports hydrate()
    markets/
      index.js              registry: manifest + import.meta.glob auto-discovery
      data/
        manifest.json       [{ id, name }] — the switcher list/order
        austin.json         Austin market data (the canonical example; 51 top-level keys)
        _blank.json         empty-but-correctly-shaped dataset (used by blank markets)
```

Notable internals of `Dashboard.jsx`:
- `hydrate(d)` near the top: destructures data, sets `URBAN_SUBS`/`RECON_Q`/
  `TODAY_Q`/`TODAY_LABEL`/`DEFAULT_PROP_TAX_RATE` from the JSON, runs
  `reconcileSubTs()` (splices SUBS current-quarter values into the time series),
  then computes `LEASEUP_BY_MAIN` and `METRO_REF`.
- Composite scoring (unchanged across markets): Submarket 25 / Zip 40 / Property 35;
  BUY ≥ 65, WATCH 50–64, AVOID < 50. Default weights and `lerp` ranges live here and
  are market-agnostic by default (recalibrate only deliberately).

## 5. Run / build / deploy

- **Local (recommended):** double-click `Launch Dashboard.bat`. It mirrors the
  project to `%LOCALAPPDATA%\AtlasMarketDashboard` (a clean, non-OneDrive path),
  `npm install`s on first run, starts the dev server, and opens the browser. The
  mirror is disposable and re-synced each launch — **don't edit it; edit the
  OneDrive source.**
- **Terminal:** `npm install`, then `npm run dev` / `npm run build` / `npm run preview`.
- **Deploy:** push to `main` → Cloudflare auto-builds (build `npm run build`, output
  `dist`). Don't hand-copy the folder to deploy; use Git (see gotchas).

## 6. Add a new market (data-only, no code changes)

1. Gather source files; run `npm run check-sources -- <Market_Source_Data folder>`
   to see what's present/missing (`NEW_MARKET_CHECKLIST.md` is the canonical list).
2. Build `src/markets/data/<id>.json` matching `austin.json`'s shape
   (`DATA_SCHEMA.md` is the contract; honor unit conventions — cap is a decimal,
   vacancy/ERG are percent, Q_OCC is a decimal).
3. Validate: `npm run validate-market -- src/markets/data/<id>.json`.
4. Add a line to `src/markets/data/manifest.json`: `{ "id": "<id>", "name": "City, ST" }`.
5. Push. (Map geometry has no source export — it was hand-built for Austin; a new
   market needs boundary geometry acquired/built separately or its map stays empty.)

## 7. Authentication / access status

- The app is gated by **Cloudflare Access** on the `workers.dev` URL.
- Access **policy is correct**: an Allow policy ("Atlas") for **Emails ending in
  `atlasrep.com`**; the policy tester shows the user approved. Destination hostname
  is correct.
- **BLOCKER:** the **one-time PIN email is not being delivered** (almost certainly
  Atlas's Microsoft 365 mail filtering eating `noreply@notify.cloudflare.com`, or an
  account-level OTP delivery issue). So login currently doesn't complete.
- **Plan:** switch the login method to **Microsoft Entra ID (SSO)** — deferred by
  Marty until after the POC is validated and he has Entra admin access. Steps to be
  documented (offered as `SETUP_LOGIN_ENTRA.md`). Entra callback URL =
  `https://blue-cloud-df44.cloudflareaccess.com/cdn-cgi/access/callback`.
- **For POC viewing now:** either temporarily disable Cloudflare Access on the Worker
  (Settings → Domains & Routes), or add a personal Gmail to the policy / have IT
  allowlist the Cloudflare sender so OTP arrives.

## 8. Work history (chronological)

- **2026-05-28** — Started from `atlas_atx_v4.jsx` (937 KB, ~10,549 lines; Austin;
  React + recharts + lucide). Scaffolded a Vite React app and dropped it in.
- **2026-05-28** — Multi-market refactor: extracted ~1,500 lines of Austin data
  constants into `austin.json`; made `Dashboard.jsx` data-free with `hydrate()`;
  preserved the reconciliation IIFE + derived constants inside hydrate. Built the
  market switcher + "Add blank market" UI; per-market data lazy-loaded (code-split).
  Verified: Austin SSR-renders identically (71,794 chars), blank renders, clean build.
- **2026-05-28** — Added `Launch Dashboard.bat`; fixed an OneDrive/`&`/spaces path
  problem by having it mirror to `%LOCALAPPDATA%` before running.
- **2026-05-28** — Moved per-market constants into the data layer (`URBAN_SUBS`,
  `_market` vintage block, `propTaxRate`); made forward-growth vintage-independent
  via `RECON_Q` offsets. Made registration data-driven (`manifest.json` +
  `import.meta.glob`). Added `validate-market.mjs` + `DATA_SCHEMA.md`.
- **2026-05-28/29** — Audited the playbook against the real Austin source files;
  rewrote `MARKET_TRANSFER_PLAYBOOK.md` (v2, JSON-output model); added
  `NEW_MARKET_CHECKLIST.md` + `check-sources.mjs`. Key finding: map geometry was
  hand-built (no source file); provider PDFs → a `PDF_Extracts` workbook → narrative.
- **2026-05-29** — Pushed to GitHub `Mshaeffer5/MarketAnalysis` (initial target
  `UWComps` was rejected — it already held a different live app; verified an empty
  repo before pushing).
- **2026-05-29** — Cloudflare Workers deploy. Fixed two Workers-specific failures:
  (1) upgraded **Vite 5 → 6** (Workers' Vite plugin requires ≥6); (2) removed
  `public/_redirects` (Workers rejects the SPA catch-all; app has no client routes).
- **2026-05-29** — Enabled Cloudflare Access on the workers.dev URL; policy correct
  but OTP email not delivering; Entra SSO deferred (Section 7).
- **2026-05-29** — Added this `PROJECT_LOG.md`.
- **2026-06-01** — Fixed root cause: `loaderForPath()` in `src/markets/index.js` was returning the dynamic import function instead of calling it (`return fn` → `return fn()`). This caused `hydrate()` to receive the loader function rather than JSON data, making every field undefined. Also added null guard in `reconcileSubTs()` for resilience.
- **2026-06-01** — Removed "Add market" button, X (remove) buttons on tabs, and associated handlers from `AppShell.jsx`. Market switcher now shows only built-in markets; new markets added by dropping a JSON file + manifest line (no UI needed). in `reconcileSubTs()` (`Dashboard.jsx` line 28): `if (!SUB_TS || !SUB_TS.q) return;`. Fixes crash on live site — "Failed to load market data: Cannot read properties of undefined (reading 'q')". Root cause: `SUB_TS` can be undefined if the market JSON loads but is structurally unexpected in the Cloudflare Workers build environment.

- **2026-06-01** — Added Rollup `manualChunks` vendor splitting to `vite.config.js` (`react` / `charts` / `vendor` pulled out of the app chunk). No first-load byte change, but the ~140 KB-gzip chart+react code now stays cached across app/data redeploys and the chunks download in parallel. Also corrected stale `public/_redirects` references in `README.md` and `DEPLOY_CLOUDFLARE.md` (the file was removed in `2b3d6af`; Workers rejects the SPA catch-all) and flagged Pages-vs-Workers in both. Note: the OneDrive working copy had drifted from `main` and a large-file truncation had cut `Dashboard.jsx` off mid-JSX locally (the repo copy was never affected); the local folder was re-synced from `main` after this push.

- **2026-06-01** — Made `_blank.json` a truly **Austin-free scaffold**: emptied the
  submarket-/zip-/property-keyed objects (`SUB_NARRATIVES`, `SUB_STATS`, `SUB_DESIRE`,
  `SUB_AFFORD`, `SUB_PROPS`, `MS`, `LEASEUP_SUBS/ZIPS/MATCH`, `SUB_TS.d`, `SUB_VAC`) that
  still carried Austin submarket names/zips (their values were already zeroed). New/blank
  markets no longer inherit any Austin identifiers. Added a **narrative-leak guard** to
  `validate-market.mjs`: a non-Austin file now WARNS if its narratives contain "Austin"
  or leftover Austin submarket keys. Updated `DATA_SCHEMA.md` and
  `MARKET_TRANSFER_PLAYBOOK.md` to say: start a new market from `_blank.json` (not
  `austin.json`) and write all narratives market-specific. Verified all 9 tabs SSR-render
  on the cleaned blank with zero crashes; validator clean.

## 9. Known gotchas & decisions

- **OneDrive mount truncation:** large files copied through the OneDrive-synced
  folder can silently truncate. Deploy via Git (not hand-copy); when scripting,
  verify writes. (This is an environment quirk, not a code issue.)
- **Cloudflare Workers needs Vite ≥ 6.** Keep `vite` on `^6` in `package.json`.
- **No `_redirects` file.** Workers rejects `/* /index.html 200` as a loop, and the
  app has no client-side routes, so it isn't needed. (Pages would accept it.)
- **Hosting is Workers, not Pages.** Works fine; Workers is just more version-
  sensitive. `DEPLOY_CLOUDFLARE.md` describes the Pages route — Workers Access is
  enabled via the Worker's Settings → Domains & Routes instead.
- **Security reminder:** a GitHub personal access token was shared in chat during
  setup — it should be rotated at github.com/settings/tokens. Never commit tokens.

## 10. Open items / next steps

- [ ] **Login:** finish Microsoft Entra ID SSO (deferred until post-POC + admin
      access). Until then, decide POC viewing approach (disable Access, or unblock OTP).
- [ ] Rotate the shared GitHub token.
- [ ] (Optional) Tidy `DEPLOY_CLOUDFLARE.md` to the Workers flow; add `SETUP_LOGIN_ENTRA.md`.
- [ ] (Optional) Tighten the Access policy value from `atlasrep.com` to `@atlasrep.com`.
- [ ] Future markets (e.g. Charlotte): build per `MARKET_TRANSFER_PLAYBOOK.md`.

## 11. Maintenance (for any Claude session, any account)

When you make changes and push to GitHub:
1. Update **Section 8 (Work history)** with the date and what changed.
2. Update **Section 7 (Auth)** and **Section 10 (Open items)** if affected.
3. Update **Section 4 (file list)** if files were added/removed.
4. Bump the "Last updated" date.
5. Commit this file in the same push.
