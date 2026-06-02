# Deploy to Cloudflare Pages + lock it down with Cloudflare Access (free)

> **Heads-up (2026-06):** this guide is written for Cloudflare **Pages**, but the
> live dashboard is actually deployed on Cloudflare **Workers** (project
> `marketanalysis`, see `PROJECT_LOG.md` §2). The Git-push-auto-deploy flow and the
> Access steps in Section B are the same; the only differences are: (1) there is
> **no** `public/_redirects` file (Workers rejects the SPA catch-all and the app
> has no client-side routes), and (2) Access is enabled from the Worker's
> **Settings → Domains & Routes** rather than the Pages project.

This is the recommended hosting + protection path: free, no custom domain, real
per-person login. Cloudflare Pages auto-builds from GitHub on every push (same
model as Vercel), and Cloudflare Access gates the `*.pages.dev` URL.

## A. One-time: deploy from GitHub

1. Push this project to a GitHub repo (private is fine).
2. Cloudflare dashboard -> **Workers & Pages** -> **Create** -> **Pages** ->
   **Connect to Git** -> pick the repo.
3. Build settings:
   - **Framework preset:** Vite (or "None")
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - (Node version: set env var `NODE_VERSION` = `20` if the build complains.)
4. **Save and Deploy.** You get a URL like `https://atlas-market-dashboard.pages.dev`.

From now on: every push to the production branch (e.g. `main`) auto-builds and
deploys. Other branches/PRs get their own preview URLs.

> The `vercel.json` in this repo is ignored by Cloudflare — that's expected.
> On **Pages** you could add a `public/_redirects` SPA fallback, but this repo
> intentionally omits it: on **Workers** (what we actually run) the `/* →`
> catch-all is rejected as a loop, and the app has no client-side routes.

## B. One-time: turn on login protection (Cloudflare Access, free <= 50 users)

1. Cloudflare dashboard -> **Zero Trust**. (First time: pick a team name; choose
   the **Free** plan — supports 50 users.)
2. **Access -> Applications -> Add an application -> Self-hosted.**
3. **Application domain:** enter your Pages hostname exactly, e.g.
   `atlas-market-dashboard.pages.dev` (subdomain = `atlas-market-dashboard`,
   domain = `pages.dev`). Don't leave it as a wildcard — point it at your project.
4. **Add a policy:**
   - Name: `Atlas team`
   - Action: **Allow**
   - Include rule: **Emails ending in** `@atlasrep.com`
     (or **Emails** -> list specific addresses for tighter control).
5. **Login method:** the default **One-time PIN** needs no setup — approved users
   enter their email and get a 6-digit code. (You can add Google/SSO later, also
   free.)
6. Save. Now visiting the `.pages.dev` URL shows a Cloudflare login first; only
   approved emails get through, and the dashboard data isn't served until they do.

### Notes
- Protect the production hostname; if you also want preview deployments locked,
  add Access for `*.<project>.pages.dev` as well.
- This protection lives in the Cloudflare dashboard, not in the repo, so it
  survives redeploys automatically.
- Once this is on, you can remove the in-app "password protection not enabled"
  reminder banner (see TODO.md / `AUTH_TODO_KEY` in `src/AppShell.jsx`).
