// ─────────────────────────────────────────────────────────────────────────────
// GitHub-backed persistence.
//
// Why: Render's free instances have an ephemeral filesystem — anything written to
// disk is lost on every deploy, restart, and spin-down (which happens after 15
// minutes of no traffic). Persistent disks are paid-only, Render's free Postgres is
// deleted after 30 days, and Atlas M0 pauses after 30 days idle. A private GitHub
// repo has none of those clauses: it doesn't pause, doesn't expire, and every save
// is a commit, so the version history doubles as a free, complete backup.
//
// Shape: one JSON file per document. Reads are served from memory after the first
// fetch (loadPortfolio runs on nearly every request, so hitting the API each time
// would add ~300ms to everything); writes go straight through to GitHub so a
// container dying can't lose them.
//
// Setup (one time):
//   1. Create a PRIVATE repo, e.g. <you>/finfolio-data, with a README so it has a
//      default branch.
//   2. Create a fine-grained PAT scoped to just that repo with Contents: Read+Write.
//   3. On Render set GITHUB_TOKEN and GITHUB_DATA_REPO=<owner>/<repo>.
//      Optional: GITHUB_DATA_BRANCH (default main), GITHUB_DATA_DIR (default root).
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = process.env.GITHUB_TOKEN || ''
const REPO = (process.env.GITHUB_DATA_REPO || '').trim()
const BRANCH = (process.env.GITHUB_DATA_BRANCH || 'main').trim()
const DIR = (process.env.GITHUB_DATA_DIR || '').trim().replace(/^\/+|\/+$/g, '')

// Overridable for GitHub Enterprise Server — and so the adapter can be tested
// against a local fake without touching a real repo.
const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '')
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'finfolio',
}

function isEnabled() {
  return !!(TOKEN && REPO && /^[^/]+\/[^/]+$/.test(REPO))
}

function pathFor(name) {
  return DIR ? `${DIR}/${name}` : name
}

// { content, sha } per path. sha is what makes writes conflict-safe: GitHub rejects
// a PUT whose sha doesn't match the current blob, so a concurrent write can't be
// silently clobbered the way a whole-file overwrite would.
const cache = new Map()
// One write at a time per path, or two saves in the same tick would race on sha.
const writeChains = new Map()

const stats = { reads: 0, writes: 0, conflicts: 0, lastError: null, lastWriteAt: null, repoPrivate: null }

async function ghFetch(url, options = {}, ms = 12000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, headers: { ...HEADERS, ...(options.headers || {}) }, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// The contents API returns an empty `content` for blobs over 1MB and points at the
// git blob API instead; follow that so a large expenses file still reads.
async function readBlob(gitUrl) {
  const r = await ghFetch(gitUrl)
  if (!r.ok) throw new Error(`blob read failed: ${r.status}`)
  const d = await r.json()
  return Buffer.from(d.content || '', 'base64').toString('utf8')
}

async function readFile(name) {
  const path = pathFor(name)
  const url = `${API}/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(BRANCH)}`
  const r = await ghFetch(url)
  stats.reads++

  if (r.status === 404) {
    cache.set(path, { content: null, sha: null })
    return null
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`GitHub read ${path} failed: ${r.status} ${body.slice(0, 120)}`)
  }
  const d = await r.json()
  const text = d.content
    ? Buffer.from(d.content, 'base64').toString('utf8')
    : (d.git_url ? await readBlob(d.git_url) : '')
  cache.set(path, { content: text, sha: d.sha })
  return text
}

async function writeFile(name, text, message) {
  const path = pathFor(name)
  const attempt = async (sha) => {
    const r = await ghFetch(`${API}/repos/${REPO}/contents/${encodeURI(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: Buffer.from(text, 'utf8').toString('base64'),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    })
    return r
  }

  let known = cache.get(path)
  if (known === undefined) {
    // Never read this file — find out whether it exists so we send the right sha.
    await readFile(name).catch(() => null)
    known = cache.get(path)
  }

  let r = await attempt(known?.sha || null)

  // 409/422 means our sha is stale: something else wrote. Re-read and retry once so
  // a legitimate save isn't lost, but log it — on a single instance it shouldn't happen.
  if (r.status === 409 || r.status === 422) {
    stats.conflicts++
    console.warn('[GITHUB] sha conflict on %s — refetching and retrying', path)
    await readFile(name).catch(() => null)
    r = await attempt(cache.get(path)?.sha || null)
  }

  if (!r.ok) {
    const body = await r.text().catch(() => '')
    const err = new Error(`GitHub write ${path} failed: ${r.status} ${body.slice(0, 160)}`)
    stats.lastError = err.message
    throw err
  }

  const d = await r.json().catch(() => ({}))
  cache.set(path, { content: text, sha: d?.content?.sha || null })
  stats.writes++
  stats.lastWriteAt = new Date().toISOString()
  return true
}

// Serialise writes per path.
function enqueue(name, fn) {
  const prev = writeChains.get(name) || Promise.resolve()
  const next = prev.then(fn, fn)
  // Keep the chain alive but don't leak rejections into it.
  writeChains.set(name, next.catch(() => {}))
  return next
}

async function readJson(name, fallback) {
  const path = pathFor(name)
  const hit = cache.get(path)
  if (hit !== undefined) {
    if (hit.content == null) return fallback
    try { return JSON.parse(hit.content) } catch (_) { return fallback }
  }
  const text = await readFile(name)
  if (text == null) return fallback
  try { return JSON.parse(text) } catch (e) {
    console.error('[GITHUB] %s is not valid JSON — treating as empty', path)
    return fallback
  }
}

async function writeJson(name, data, message) {
  const text = JSON.stringify(data, null, 2) + '\n'
  return enqueue(name, () => writeFile(name, text, message))
}

// Called once at boot: proves the token works and shouts if the repo is public,
// because this data is somebody's whole net worth.
async function verify() {
  if (!isEnabled()) return { ok: false, reason: 'not configured' }
  try {
    const r = await ghFetch(`${API}/repos/${REPO}`)
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      const reason = r.status === 404
        ? `repo "${REPO}" not found, or the token can't see it`
        : `${r.status} ${body.slice(0, 120)}`
      console.error('[GITHUB] Storage unavailable: %s', reason)
      stats.lastError = reason
      return { ok: false, reason }
    }
    const d = await r.json()
    stats.repoPrivate = !!d.private
    if (!d.private) {
      console.warn('[GITHUB] ⚠ %s is PUBLIC. Your portfolio is world-readable — make it private.', REPO)
    }
    console.log('[GITHUB] Storage ready: %s@%s%s (%s)', REPO, BRANCH, DIR ? `/${DIR}` : '', d.private ? 'private' : 'PUBLIC')
    return { ok: true, private: !!d.private }
  } catch (e) {
    stats.lastError = e.message
    console.error('[GITHUB] Storage check failed:', e.message)
    return { ok: false, reason: e.message }
  }
}

function status() {
  return {
    enabled: isEnabled(),
    repo: REPO || null,
    branch: BRANCH,
    dir: DIR || null,
    repoPrivate: stats.repoPrivate,
    cachedFiles: [...cache.keys()],
    reads: stats.reads,
    writes: stats.writes,
    conflicts: stats.conflicts,
    lastWriteAt: stats.lastWriteAt,
    lastError: stats.lastError,
  }
}

module.exports = { isEnabled, readJson, writeJson, verify, status, FILES: {
  portfolio: 'portfolio.json',
  expenses: 'expenses.json',
  categories: 'categories.json',
  bank: 'bank.json',
} }
