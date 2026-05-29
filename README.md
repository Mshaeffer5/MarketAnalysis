# Atlas Market Dashboard

A multi-market version of the Atlas market-analysis dashboard. The Austin
dashboard now lives behind a market switcher, and the per-market data is
lazy-loaded so the app starts fast and only downloads the market you're viewing.

## Run locally

**Easiest:** double-click **`Launch Dashboard.bat`** in this folder. On the first
run it installs dependencies, then it starts the app and opens your browser at
http://localhost:5173. Close the window (or Ctrl+C) to stop it.

Or from a terminal:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

## How it's structured

```
src/
  main.jsx              App entry — renders <AppShell/>
  AppShell.jsx          Market switcher bar, "+ Add market", lazy-load + hydrate
  Dashboard.jsx         The full dashboard (all charts/tabs/logic). Data-free:
                        it exposes hydrate(data) and reads the active market's
                        data after hydration.
  markets/
    index.js            Market registry + localStorage for user-added markets
    data/
      austin.json       Austin market data (the source of truth — edit this)
      _blank.json       Empty dataset (correct shape) used by blank markets
```

The dashboard logic and the market **data** are fully separated. `Dashboard.jsx`
declares its data fields as module-level bindings that `hydrate(data)` fills in
before the dashboard renders. This is why the same component can show Austin or
any other market with no code changes — only the data differs.

### Lazy loading

Markets are loaded with dynamic `import()` (see `markets/index.js`), so Vite
splits each market's JSON into its own chunk. The initial bundle contains the
app + chart code; a market's ~400 KB of data is fetched only when selected.

## Markets

- **Switch markets:** buttons in the top bar.
- **Add a blank market:** "+ Add market" creates a same-layout dashboard with no
  data, remembered in your browser (localStorage). Useful for previewing the
  shell before data exists.
- **Add a real market with data (data-only, no code edits):**
  1. Create `src/markets/data/<id>.json` matching `austin.json`'s shape — the
     contract is in **[DATA_SCHEMA.md](./DATA_SCHEMA.md)**.
  2. Validate it: `npm run validate-market -- src/markets/data/<id>.json`
     (catches missing keys, unit mistakes, and submarket-name mismatches).
  3. Add one line to `src/markets/data/manifest.json`:
     `{ "id": "<id>", "name": "Dallas, TX" }`.

  No edit to `index.js` — `import.meta.glob` auto-discovers the new data file.
  Per-market behavior (urban-sub list, data vintage, property-tax rate) lives in
  the data file's `URBAN_SUBS` array and `_market` block, so the shared
  `Dashboard.jsx` never changes between markets.

There's intentionally **no upload UI** — editing the JSON files (via Claude Code)
is the workflow. The end-to-end process for a brand-new metro is in
**[MARKET_TRANSFER_PLAYBOOK.md](./MARKET_TRANSFER_PLAYBOOK.md)**: hand Claude the
CoStar exports and say "new market," and it builds + validates the JSON.

When collecting source files for a new metro, drop them in a folder and run
`npm run check-sources -- <folder>` to see what's present vs missing — the
tick-box list is **[NEW_MARKET_CHECKLIST.md](./NEW_MARKET_CHECKLIST.md)**.

## Deploy to Vercel

The repo is Vercel-ready (`vercel.json` sets framework=vite, build=`npm run build`,
output=`dist`). Either:

- **Dashboard:** import the Git repo at vercel.com → it auto-detects Vite → Deploy.
- **CLI:** `npm i -g vercel && vercel` from this folder.

**Or Cloudflare Pages (recommended for free login protection):** same
Git-push-auto-deploy flow (build `npm run build`, output `dist`), and you can
gate it with free Cloudflare Access on the `*.pages.dev` URL — no custom domain.
Step-by-step in **[DEPLOY_CLOUDFLARE.md](./DEPLOY_CLOUDFLARE.md)**.
(`public/_redirects` is the Cloudflare SPA fallback; Vercel ignores it.)

## ⚠️ Not protected yet

The site is currently public. See **[TODO.md](./TODO.md)** for how to add
password protection when you're ready.
