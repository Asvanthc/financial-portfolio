# Data persistence

**The problem this solves:** Render's free instances have an ephemeral filesystem.
Anything written to `data/portfolio.json` is lost on every deploy, every restart, **and
every spin-down** — and Render spins a free service down after 15 minutes without
traffic. So on the free plan, without an external store, your edits disappear within
minutes of you closing the tab.

> An earlier version of this file recommended a Render persistent disk and claimed it
> was "FREE (1GB included in free tier)". That was wrong, and it's why data kept
> vanishing. Render only attaches disks to **paid** instances; the `disk:` block in
> `render.yaml` was silently doing nothing on a free plan. It has been removed.

## What's used instead: a private GitHub repo

Your data lives as JSON in a private repo, written through the GitHub API. It is free,
it never pauses, it never expires, and **every save is a commit** — so the repo history
is a complete, automatic backup you can browse and roll back.

| Option | Free? | Permanent? | Verdict |
|---|---|---|---|
| **Private GitHub repo** | yes | yes — no pause, no expiry | **in use** |
| Render persistent disk | no — paid instances only | yes | rejected: not free |
| Render free Postgres | yes | **no — deleted after 30 days** | rejected |
| MongoDB Atlas M0 | yes | mostly — pauses after 30 days idle | supported fallback |
| Container filesystem | yes | **no — wiped on restart/spin-down** | local dev only |

### Setup (about three minutes, once)

1. **Create a private repo** for the data — e.g. `finfolio-data`. Tick "Add a README"
   so it has a default branch. **It must be private:** it will contain your entire
   portfolio. (The app logs a loud warning at boot if the repo is public.)

2. **Create a fine-grained token** at
   *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained*:
   - Repository access: **Only select repositories** → your `finfolio-data`
   - Permissions: **Contents → Read and write** (nothing else)
   - Expiration: set a reminder if you don't choose "no expiration"

3. **Add two env vars in Render** (Dashboard → your service → Environment):
   ```
   GITHUB_DATA_REPO = your-username/finfolio-data
   GITHUB_TOKEN     = github_pat_...
   ```
   Optional: `GITHUB_DATA_BRANCH` (default `main`), `GITHUB_DATA_DIR` (default root).

4. **Redeploy**, then confirm:
   ```
   GET https://your-app.onrender.com/api/debug/storage
   → { "backend": "github", "durable": true, ... }
   ```
   The boot log will also show `[GITHUB] Storage ready: owner/repo@main (private)`.

### Moving existing data across

If you already have data in the app (or in Mongo), don't retype it:

1. Before switching, **Export → JSON backup** in the header.
2. Set the env vars, redeploy.
3. **Export → Restore from a JSON backup**, pick that file.

### What it looks like in the repo

```
finfolio-data/
  portfolio.json    ← divisions, subdivisions, holdings, targets
  bank.json         ← bank cash accounts
  expenses.json     ← income & expense entries
  categories.json   ← your expense/income category lists
```

Each save is a commit with a readable message (`portfolio: 3 divisions, 13 holdings`),
so `git log` on that repo is a full audit trail of every change you've ever made.

### How it behaves

- **Reads** are served from memory after the first fetch — `loadPortfolio` runs on
  nearly every request, so hitting the API each time would add ~300ms to everything.
- **Writes** go straight through to GitHub before the request returns, so a container
  dying can't lose them. Expect ~0.3–0.6s on save.
- **Concurrent writes** are safe: GitHub rejects a write whose blob SHA is stale, and
  the adapter refetches and retries rather than clobbering. This is stricter than the
  old file/Mongo paths, which silently let the last writer win.
- **Rate limits** are a non-issue: 5,000 requests/hour authenticated, against a
  handful of writes per session.

## Alternative: MongoDB Atlas

Still fully supported — if `GITHUB_TOKEN`/`GITHUB_DATA_REPO` are unset and
`MONGODB_URI` is set, the app uses Mongo. Create a free M0 cluster, add a database
user, allow access from `0.0.0.0/0`, and set `MONGODB_URI`. Caveats: free clusters
pause after 30 days with zero connections (data is kept; you resume it), and M0 has no
automatic backups — so take a JSON backup periodically.

## Local development

With none of those env vars set, the app uses `data/portfolio.json` on disk. That's
fine locally and is why the repo still ships a seed file. It is *not* safe in
production on a free instance — `/api/debug/storage` will tell you so.
