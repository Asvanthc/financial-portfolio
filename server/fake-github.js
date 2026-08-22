// A stand-in for GitHub's Contents API, used only by the storage tests.
// Implements the parts githubStore.js relies on, including sha conflict rejection
// and the >1MB "content is empty, follow git_url" behaviour.
//
//   node server/fake-github.js 4020
//
const http = require('http')
const crypto = require('crypto')

const files = new Map()   // path -> { text, sha }
let repoPrivate = true
const log = []

const sha = text => crypto.createHash('sha1').update(text).digest('hex')

function send(res, code, body) {
  const json = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(json)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)
  log.push(`${req.method} ${url.pathname}`)

  if (!req.headers.authorization?.startsWith('Bearer ')) return send(res, 401, { message: 'Bad credentials' })

  // Test hooks
  if (url.pathname === '/__state') return send(res, 200, { files: [...files.keys()], log, repoPrivate })
  if (url.pathname === '/__public') { repoPrivate = false; return send(res, 200, { ok: true }) }
  if (url.pathname === '/__big') {
    // A blob big enough that the real API would omit `content`.
    const text = JSON.stringify(Array.from({ length: 40000 }, (_, i) => ({ i })))
    files.set('expenses.json', { text, sha: sha(text) })
    return send(res, 200, { ok: true, bytes: text.length })
  }

  // GET /repos/:owner/:repo
  if (parts[0] === 'repos' && parts.length === 3 && req.method === 'GET') {
    return send(res, 200, { full_name: `${parts[1]}/${parts[2]}`, private: repoPrivate })
  }

  // GET /repos/:owner/:repo/git/blobs/:sha
  if (parts[3] === 'git' && parts[4] === 'blobs' && req.method === 'GET') {
    const entry = [...files.values()].find(f => f.sha === parts[5])
    if (!entry) return send(res, 404, { message: 'Not Found' })
    return send(res, 200, { sha: entry.sha, content: Buffer.from(entry.text).toString('base64'), encoding: 'base64' })
  }

  // /repos/:owner/:repo/contents/:path...
  if (parts[3] === 'contents') {
    const filePath = decodeURIComponent(parts.slice(4).join('/'))

    if (req.method === 'GET') {
      const f = files.get(filePath)
      if (!f) return send(res, 404, { message: 'Not Found' })
      const big = f.text.length > 1024 * 1024
      return send(res, 200, {
        name: filePath, path: filePath, sha: f.sha, size: f.text.length,
        // Mirrors the real API: oversized blobs come back with empty content.
        content: big ? '' : Buffer.from(f.text).toString('base64'),
        encoding: big ? 'none' : 'base64',
        git_url: `http://localhost:${server.address().port}/repos/${parts[1]}/${parts[2]}/git/blobs/${f.sha}`,
      })
    }

    if (req.method === 'PUT') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        let payload
        try { payload = JSON.parse(body) } catch (_) { return send(res, 400, { message: 'bad json' }) }
        const existing = files.get(filePath)
        if (existing && payload.sha !== existing.sha) {
          return send(res, 409, { message: `${filePath} does not match ${payload.sha}` })
        }
        if (!existing && payload.sha) {
          return send(res, 422, { message: 'sha given for a file that does not exist' })
        }
        const text = Buffer.from(payload.content || '', 'base64').toString('utf8')
        const next = { text, sha: sha(text) }
        files.set(filePath, next)
        return send(res, existing ? 200 : 201, {
          content: { path: filePath, sha: next.sha },
          commit: { message: payload.message, sha: sha(payload.message + next.sha) },
        })
      })
      return
    }
  }

  send(res, 404, { message: 'Not Found' })
})

server.listen(Number(process.argv[2]) || 4020, () => {
  console.log('fake-github listening on', server.address().port)
})
