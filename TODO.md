# TODO

## 🔒 Add password protection (deferred — do this before sharing the URL widely)

The dashboard is currently **public**: anyone with the deployed URL can view it.
You asked to be reminded to lock it down later. An amber banner in the app says
the same thing until you dismiss it. When you're ready, pick one of these:

1. **Cloudflare Pages + Cloudflare Access — RECOMMENDED (free, no domain).**
   Real per-person login (one-time email PIN, allow-list `@atlasrep.com`), free
   for up to 50 users, and it works on the free `*.pages.dev` URL — no custom
   domain needed. Requires hosting on Cloudflare Pages instead of Vercel (a
   lateral move; same Git-push-auto-deploy flow). Full steps:
   **[DEPLOY_CLOUDFLARE.md](./DEPLOY_CLOUDFLARE.md)**.

2. **Stay on Vercel + a self-hosted Edge Middleware gate (free, shared password).**
   Vercel's *built-in* password protection needs paid Pro, and free "Vercel
   Authentication" leaves the production URL public — so the free route on Vercel
   is to add our own Edge Middleware (HTTP Basic Auth / password check) that runs
   server-side before serving. One shared password via env var. Ask Claude to
   wire it up.

3. **In-app password gate (free, any host — weakest).**
   A `<PasswordGate>` around `<AppShell />` in `src/main.jsx` checking
   `VITE_DASHBOARD_PASSWORD`. Client-side only — the data still ships in the
   bundle, so it just deters casual access. Use option 1 or 2 for real security.

Recommended: **option 1** (Cloudflare Pages + Access) — the only free choice with
true per-person login and no domain. Option 2 if you'd rather not leave Vercel.

When done, remove the reminder banner (search for `authDismissed` /
`AUTH_TODO_KEY` in `src/AppShell.jsx`).
