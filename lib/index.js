/**
 * dsh-mineru host half.
 *
 * Provides:
 *  - `mineru_parse_pdf` tool  : parse a PDF through the local MinerU CLI,
 *                               then convert the produced Markdown to a
 *                               standalone HTML (pandoc --embed-resources),
 *                               and register the output in the library index.
 *  - `mineru_list_parses` tool: list all registered parsed documents.
 *  - Web routes:
 *       GET  /mineru/api/list         -> library index JSON
 *       POST /mineru/api/parse        -> call the same parse pipeline
 *       POST /mineru/api/pick         -> open a native zenity file/directory chooser
 *       GET  /mineru/preview/<id>     -> serve the final standalone HTML
 *       GET  /mineru/download/<id>    -> download the MinerU zip
 *
 * Storage:
 *   library root:  $DSH_MINERU_LIBRARY  (default ~/Downloads/mineru-outputs)
 *   index file:    $DSH_MINERU_INDEX    (default ~/.dsh/mineru-library.json)
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const HOME = os.homedir()
export const DEFAULT_LIB_ROOT = process.env.DSH_MINERU_LIBRARY || path.join(HOME, 'Downloads', 'mineru-outputs')
export const DEFAULT_INDEX_FILE = process.env.DSH_MINERU_INDEX || path.join(HOME, '.dsh', 'mineru-library.json')
export const DEFAULT_MINERU_BIN = (() => {
  const candidate = process.env.MINERU_BIN || path.join(HOME, '.local', 'bin', 'mineru')
  try {
    fs.accessSync(candidate, fs.constants.X_OK)
    return candidate
  } catch {
    return 'mineru'
  }
})()
export const LIB_ROOT = DEFAULT_LIB_ROOT
export const INDEX_FILE = DEFAULT_INDEX_FILE

export const MINERU_SETTINGS_NS = settingsNamespace('dsh-mineru')

/**
 * User-facing settings for the MinerU plugin. Stored through the DSH settings
 * service (`ctx.settings`) and rendered in the DSH Settings page by the client
 * half. Path fields default to the same environment-variable-aware values the
 * host has always used.
 */
export const MineruSettingsSchema = z.object({
  libraryRoot: z.string().default(DEFAULT_LIB_ROOT),
  indexFile: z.string().default(DEFAULT_INDEX_FILE),
  mineruBin: z.string().default(DEFAULT_MINERU_BIN),
  defaultBackend: z.string().default('pipeline'),
  defaultMethod: z.string().default('auto'),
  defaultEffort: z.string().default(''),
  defaultLang: z.string().default(''),
})

/** Runtime settings seam: filled when the settings service is available. */
let settingsSeam = null
/**
 * The plugin's current live configuration. Prefers the DSH settings service,
 * then environment variables, then the compiled defaults.
 */
function currentConfig() {
  if (settingsSeam !== null) {
    try {
      const value = settingsSeam.get()
      if (value !== null && typeof value === 'object') return value
    } catch (_) { /* fall through to env defaults */ }
  }
  return {
    libraryRoot: process.env.DSH_MINERU_LIBRARY || DEFAULT_LIB_ROOT,
    indexFile: process.env.DSH_MINERU_INDEX || DEFAULT_INDEX_FILE,
    mineruBin: process.env.MINERU_BIN || DEFAULT_MINERU_BIN,
    defaultBackend: 'pipeline',
    defaultMethod: 'auto',
    defaultEffort: '',
    defaultLang: '',
  }
}

function ensureDirs(cfg = currentConfig()) {
  fs.mkdirSync(cfg.libraryRoot, { recursive: true })
  fs.mkdirSync(path.dirname(cfg.indexFile), { recursive: true })
}

function loadIndex(cfg = currentConfig()) {
  try {
    const raw = fs.readFileSync(cfg.indexFile, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveIndex(entries, cfg = currentConfig()) {
  ensureDirs(cfg)
  const tmp = `${cfg.indexFile}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2))
  fs.renameSync(tmp, cfg.indexFile)
}

function findEntry(id, cfg = currentConfig()) {
  return loadIndex(cfg).find((e) => e.id === id) || null
}

function upsertEntry(entry, cfg = currentConfig()) {
  const entries = loadIndex(cfg)
  const i = entries.findIndex((e) => e.id === entry.id)
  if (i >= 0) entries[i] = entry
  else entries.unshift(entry)
  saveIndex(entries, cfg)
  return entry
}

function renameEntry(id, title, cfg = currentConfig()) {
  const entries = loadIndex(cfg)
  const i = entries.findIndex((e) => e.id === id)
  if (i < 0) return null
  entries[i].title = title
  saveIndex(entries, cfg)
  return entries[i]
}

function deleteEntry(id, cfg = currentConfig()) {
  const entries = loadIndex(cfg)
  const i = entries.findIndex((e) => e.id === id)
  if (i < 0) return false
  const [removed] = entries.splice(i, 1)
  saveIndex(entries, cfg)
  // Remove only the plugin-owned output directory. The source PDF is never
  // deleted (it may live elsewhere in the user's filesystem).
  if (removed?.html !== undefined) {
    const docDir = path.dirname(removed.html)
    if (docDir && docDir !== path.parse(docDir).root && fs.existsSync(docDir)) {
      try { fs.rmSync(docDir, { recursive: true, force: true }) } catch (_) { /* keep index clean even if a file is busy */ }
    }
  }
  return true
}

function safeBase(input) {
  const base = path.basename(String(input || 'doc')).replace(/\.pdf$/i, '')
  return base.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'doc'
}

function makeId(base) {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${safeBase(base)}-${ts}`
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const onStdout = typeof opts.onStdout === 'function' ? opts.onStdout : null
    const onStderr = typeof opts.onStderr === 'function' ? opts.onStderr : null
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${path.join(HOME, '.local', 'bin')}${path.delimiter}${process.env.PATH || ''}` },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      const s = String(d)
      stdout += s
      if (onStdout !== null) onStdout(s)
    })
    child.stderr.on('data', (d) => {
      const s = String(d)
      stderr += s
      if (onStderr !== null) onStderr(s)
    })
    child.on('error', (err) => reject(new Error(`spawn ${cmd} failed: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim() || stdout.trim() || '(no output)'}`))
    })
  })
}

const parseJobs = new Map()
let parseJobSeq = 0

/**
 * Pull `Label: 12%` progress lines out of MinerU's stderr. We deliberately
 * keep this forgiving: any percentage line updates the job stage/percent, so
 * the UI can show a live progress bar even if the CLI's exact phase layout
 * changes between releases.
 */
function extractMineruProgress(chunk) {
  const out = []
  const re = /([A-Za-z][A-Za-z _-]+):\s*(\d+)%/g
  let m
  while ((m = re.exec(chunk)) !== null) {
    const label = m[1].trim()
    const lower = label.toLowerCase()
    // Ignore model-download/loading progress; only render parse-phase bars.
    if (/(loading|downloading|checkpoint|shards?)\b/i.test(lower)) continue
    if (!/(layout|table|ocr|text|formula|equation|pipeline|processing|pages?)\b/i.test(lower)) continue
    const percent = Math.max(0, Math.min(100, parseInt(m[2], 10) || 0))
    let stage = lower
    if (/layout/.test(lower)) stage = 'layout'
    else if (/table/.test(lower)) stage = 'table'
    else if (/ocr|text/.test(lower)) stage = 'ocr'
    else if (/formula|equation/.test(lower)) stage = 'formula'
    out.push({ stage, percent, message: `${label} ${percent}%` })
  }
  return out
}

function startParseJob(args) {
  const id = `job-${Date.now()}-${++parseJobSeq}`
  const job = {
    id,
    status: 'running',
    stage: 'starting',
    percent: 0,
    message: '',
    pdf: String(args?.pdf || ''),
    createdAt: new Date().toISOString(),
    result: null,
    error: null,
  }
  parseJobs.set(id, job)
  const onProgress = (patch) => {
    Object.assign(job, patch)
    job.updatedAt = new Date().toISOString()
  }
  parsePdf(args || {}, { onProgress }).then((entry) => {
    job.status = 'done'
    job.stage = 'done'
    job.percent = 100
    job.message = 'done'
    job.result = entry
    job.updatedAt = new Date().toISOString()
  }).catch((err) => {
    job.status = 'error'
    job.stage = 'error'
    job.message = err instanceof Error ? err.message : String(err)
    job.error = job.message
    job.updatedAt = new Date().toISOString()
  })
  return job
}

function walkFiles(dir, ext, excludeDirs = new Set()) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    let st
    try { st = fs.statSync(p) } catch { continue }
    if (st.isDirectory()) {
      if (!excludeDirs.has(name)) out.push(...walkFiles(p, ext, excludeDirs))
    } else if (name.toLowerCase().endsWith(ext)) {
      out.push(p)
    }
  }
  return out
}

function statSize(file) {
  try { return fs.statSync(file).size } catch { return 0 }
}

function findPdfMarkdown(docDir, base) {
  const mds = walkFiles(docDir, '.md', new Set(['extracted', '__MACOSX']))
  if (mds.length === 0) return null
  if (mds.length === 1) return mds[0]
  const prefer = mds.filter((p) => path.basename(p).toLowerCase().includes(base.toLowerCase()))
  return (prefer.length > 0 ? prefer[0] : mds[0])
}

function findZip(docDir, base) {
  const zips = walkFiles(docDir, '.zip', new Set(['extracted', '__MACOSX']))
  if (zips.length === 0) return null
  if (zips.length === 1) return zips[0]
  const prefer = zips.filter((p) => path.basename(p).toLowerCase().includes(base.toLowerCase()))
  if (prefer.length > 0) {
    return prefer.sort((a, b) => statSize(b) - statSize(a))[0]
  }
  return zips.sort((a, b) => statSize(b) - statSize(a))[0]
}

function convertMdToHtml(md, html, title) {
  return new Promise((resolve, reject) => {
    const args = [
      '-s',
      '--embed-resources',
      '--resource-path', path.dirname(md),
      '--metadata', `title=${title}`,
      '-o', html,
      md,
    ]
    const child = spawn('pandoc', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('error', (err) => reject(new Error(`spawn pandoc failed: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`pandoc exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

function unzipZip(zip, targetDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-o', zip, '-d', targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('error', (err) => reject(new Error(`spawn unzip failed: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`unzip exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

/**
 * Some MinerU backends/methods write the intermediate artifacts directly to
 * the output directory instead of producing a zip. To honour the plugin's
 * "keep the intermediate zip" contract, package those artifacts into a zip
 * ourselves. The final HTML and any existing zip are excluded from the archive.
 */
function createFallbackZip(docDir, outZip, htmlName) {
  const script = [
    'import os, zipfile, sys',
    'root, out, skip_name = sys.argv[1], sys.argv[2], sys.argv[3]',
    'zf = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)',
    'try:',
    '  for dirpath, dirnames, filenames in os.walk(root):',
    '    for f in filenames:',
    '      if f == skip_name or f.endswith(".zip"): continue',
    '      full = os.path.join(dirpath, f)',
    '      zf.write(full, os.path.relpath(full, root))',
    'finally:',
    '  zf.close()',
  ].join('\n')
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', script, docDir, outZip, htmlName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('error', (err) => reject(new Error(`spawn python3 failed: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`python zip failed with code ${code}: ${stderr.trim()}`))
    })
  })
}

async function parsePdf(args, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
  const progress = (patch) => {
    if (onProgress !== null) onProgress(patch)
  }
  const cfg = currentConfig()
  const pdf = String(args?.pdf || '').trim()
  if (pdf === '') throw new Error('pdf path is required')
  const pdfPath = path.resolve(pdf.replace(/^~(?=$|\/)/, HOME))
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`)
  const base = safeBase(pdfPath)
  const id = makeId(base)
  const docDir = path.join(cfg.libraryRoot, id)
  ensureDirs(cfg)
  fs.mkdirSync(docDir, { recursive: true })
  progress({ stage: 'starting', percent: 0, message: 'MinerU 启动中…' })

  const backend = String(args?.backend || cfg.defaultBackend || 'pipeline').trim()
  const method = String(args?.method || cfg.defaultMethod || 'auto').trim()
  const effort = String(args?.effort || cfg.defaultEffort || '').trim()
  const lang = String(args?.lang || cfg.defaultLang || '').trim()

  const mineruArgs = ['-p', pdfPath, '-o', docDir]
  if (method) mineruArgs.push('--method', method)
  if (backend) mineruArgs.push('--backend', backend)
  if (effort) mineruArgs.push('--effort', effort)
  if (lang) mineruArgs.push('--lang', lang)

  let mineruLog = ''
  try {
    const onStderr = onProgress === null
      ? undefined
      : (chunk) => {
          const patches = extractMineruProgress(chunk)
          for (const patch of patches) progress(patch)
        }
    const r = await run(cfg.mineruBin || 'mineru', mineruArgs, { onStderr })
    mineruLog = `${r.stdout}\n${r.stderr}`.trim()
  } catch (err) {
    // Keep the directory so a half-finished run is inspectable; rethrow with context.
    throw new Error(`MinerU parse failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  progress({ stage: 'html', percent: 85, message: 'MinerU 解析完成，转换 HTML…' })

  let zip = findZip(docDir, base)
  const extractedDir = path.join(docDir, 'extracted')
  let md = findPdfMarkdown(docDir, base)
  if (md === null && zip !== null) {
    fs.mkdirSync(extractedDir, { recursive: true })
    await unzipZip(zip, extractedDir)
    md = findPdfMarkdown(extractedDir, base)
  }
  if (md === null) {
    throw new Error(`No Markdown output found under ${docDir}; MinerU log: ${mineruLog.slice(0, 1000)}`)
  }

  const title = String(args?.title || '').trim() || safeBase(pdfPath)
  const htmlPath = path.join(docDir, `${id}.html`)
  await convertMdToHtml(md, htmlPath, title)

  progress({ stage: 'finalize', percent: 95, message: '生成 zip / 入库…' })
  // Guarantee a zip even when the active MinerU backend writes the
  // intermediate files directly instead of producing one.
  if (zip === null) {
    const fallbackZip = path.join(docDir, `${id}.zip`)
    try {
      await createFallbackZip(docDir, fallbackZip, `${id}.html`)
      if (fs.existsSync(fallbackZip)) zip = fallbackZip
    } catch (err) {
      console.warn(`[dsh-mineru] fallback zip creation failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const entry = {
    id,
    title,
    pdf: pdfPath,
    html: htmlPath,
    md,
    zip: zip || null,
    backend,
    method,
    effort,
    lang,
    createdAt: new Date().toISOString(),
    sizes: {
      zip: zip ? statSize(zip) : 0,
      html: statSize(htmlPath),
      md: statSize(md),
    },
    mineruLog: mineruLog.slice(0, 2000),
  }
  upsertEntry(entry, cfg)
  return entry
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
  })
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => {
      try {
        resolve(data.trim() === '' ? {} : JSON.parse(data))
      } catch (err) {
        reject(new Error(`invalid JSON body: ${err.message}`))
      }
    })
    req.on('error', reject)
  })
}

function notFoundRoute(res, msg = 'not found') {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(msg)
}

/** Current settings view for the /mineru/api/settings route. */
function settingsView() {
  const descriptor = settingsSeam === null ? undefined : settingsSeam.describe()
  return {
    available: settingsSeam !== null,
    value: currentConfig(),
    revision: descriptor?.revision,
    applies: descriptor?.applies || 'live',
  }
}

function serveFile(res, file, contentType, downloadName) {
  if (!file || !fs.existsSync(file)) {
    notFoundRoute(res, 'file not found')
    return
  }
  const headers = {
    'content-type': contentType,
    'cache-control': 'no-cache',
  }
  if (downloadName) {
    headers['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
  }
  res.writeHead(200, headers)
  fs.createReadStream(file).pipe(res)
}

/**
 * Open a native GTK file/directory chooser through zenity.
 * Returns the selected absolute path, or null when the user cancels.
 * Used by the client settings page and parse modal so users do not have to
 * type host paths by hand.
 */
function pickPath(mode) {
  const args = ['--file-selection', '--title=MinerU 选择路径']
  if (mode === 'directory') {
    args.push('--directory')
  } else if (mode !== 'file') {
    return Promise.reject(new Error('mode must be "file" or "directory"'))
  }
  return new Promise((resolve, reject) => {
    const child = spawn('zenity', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (err) => reject(new Error(`spawn zenity failed: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else if (code === 1) {
        resolve(null)
      } else {
        reject(new Error(stderr.trim() || `zenity exited with code ${code}`))
      }
    })
  })
}

/** Register the host half. */
export const inject = ['tools', 'webServer']

export function apply(ctx) {
  const tools = ctx.tools
  const webServer = ctx.webServer

  // ── User-facing settings ───────────────────────────────────────────────
  // Register the namespace with the DSH settings provider so the Settings
  // page (client half) can render and persist the MinerU preferences. The DSH
  // settings RPC domain only serves allowlisted namespaces to configuration
  // clients, so the client reads and writes THIS namespace through the
  // plugin's own /mineru/api/settings routes below.
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(MINERU_SETTINGS_NS, MineruSettingsSchema)
    settingsSeam = {
      get: () => scope.get(),
      update: (patch, expectedRevision) =>
        sctx.settings.update(MINERU_SETTINGS_NS, patch, expectedRevision),
      describe: () => {
        const descriptor = sctx.settings
          .describe({ redactSecrets: true })
          .find((candidate) => candidate.ns === MINERU_SETTINGS_NS)
        return descriptor || undefined
      },
    }
    sctx.effect(() => () => {
      settingsSeam = null
    }, 'dsh-mineru: settings seam')
  })

  ctx.effect(() => tools.register(defineTool({
    name: 'mineru_parse_pdf',
    description:
      'Run local MinerU to parse a PDF into Markdown, then convert it to a standalone HTML (pandoc). ' +
      'Keeps the intermediate MinerU zip and the final HTML in the DSH MinerU library. ' +
      'Returns the document id plus local paths and preview/download URLs for the DSH web client.',
    parameters: {
      pdf: { type: 'string', description: 'Absolute path to the PDF (or any MinerU-supported file) to parse.' },
      title: { type: 'string', description: 'Optional HTML title. Defaults to the filename.' },
      backend: { type: 'string', description: 'MinerU backend: pipeline (default), vlm-engine, hybrid-engine, vlm-http-client, hybrid-http-client.' },
      method: { type: 'string', description: 'MinerU method: auto (default), txt, or ocr.' },
      effort: { type: 'string', description: 'Hybrid effort: medium (default) or high.' },
      lang: { type: 'string', description: 'Optional document language for OCR (e.g. ch).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      try {
        const entry = await parsePdf(args || {})
        return JSON.stringify({
          ok: true,
          id: entry.id,
          title: entry.title,
          pdfPath: entry.pdf,
          htmlPath: entry.html,
          zipPath: entry.zip,
          mdPath: entry.md,
          previewUrl: `/mineru/preview/${entry.id}`,
          downloadUrl: entry.zip ? `/mineru/download/${entry.id}` : null,
        }, null, 2)
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2)
      }
    },
  })), 'dsh-mineru: mineru_parse_pdf tool')

  ctx.effect(() => tools.register(defineTool({
    name: 'mineru_list_parses',
    description: 'List all PDFs parsed by the DSH MinerU plugin (title, id, paths, dates).',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute() {
      return JSON.stringify(loadIndex(currentConfig()), null, 2)
    },
  })), 'dsh-mineru: mineru_list_parses tool')

  // ── API: list ──────────────────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/mineru/api/list',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      sendJson(res, 200, { ok: true, entries: loadIndex(currentConfig()) })
    },
  }), 'dsh-mineru: /mineru/api/list route')

  // ── API: parse ─────────────────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/mineru/api/parse',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const job = startParseJob(payload || {})
        sendJson(res, 202, { ok: true, job: { id: job.id } })
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }), 'dsh-mineru: /mineru/api/parse route')

  // ── API: async parse job progress ───────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/mineru/api/jobs',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const match = /^\/mineru\/api\/jobs\/([^/?#]+)/.exec(req.url || '')
      if (match === null) {
        notFoundRoute(res)
        return
      }
      const id = decodeURIComponent(match[1])
      const job = parseJobs.get(id)
      if (job === undefined) {
        notFoundRoute(res, 'job not found')
        return
      }
      // Keep polling lightweight: do not return the full parse entry, just the
      // finished document id. The client refreshes the list after completion.
      const { result, ...safeJob } = job
      safeJob.resultId = result ? result.id : null
      sendJson(res, 200, { ok: true, job: safeJob })
    },
  }), 'dsh-mineru: /mineru/api/jobs route')

  // ── API: rename document ───────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/mineru/api/rename',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const id = typeof payload?.id === 'string' ? payload.id.trim() : ''
        const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
        if (id === '' || title === '') {
          sendJson(res, 400, { ok: false, error: 'id and title are required' })
          return
        }
        const entry = renameEntry(id, title)
        if (entry === null) {
          sendJson(res, 404, { ok: false, error: `document not found: ${id}` })
          return
        }
        sendJson(res, 200, { ok: true, entry })
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }), 'dsh-mineru: /mineru/api/rename route')

  // ── API: delete document ───────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/mineru/api/delete',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const id = typeof payload?.id === 'string' ? payload.id.trim() : ''
        if (id === '') {
          sendJson(res, 400, { ok: false, error: 'id is required' })
          return
        }
        const deleted = deleteEntry(id)
        if (!deleted) {
          sendJson(res, 404, { ok: false, error: `document not found: ${id}` })
          return
        }
        sendJson(res, 200, { ok: true, deleted: true })
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }), 'dsh-mineru: /mineru/api/delete route')

  // ── API: settings ──────────────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/mineru/api/settings',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, ...settingsView() })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      if (settingsSeam === null) {
        sendJson(res, 501, {
          ok: false,
          error: 'settings service is unavailable in this deployment',
        })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const patch = payload?.patch
        if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
          sendJson(res, 400, { ok: false, error: 'patch must be an object' })
          return
        }
        const expectedRevision = typeof payload?.expectedRevision === 'number'
          ? payload.expectedRevision
          : undefined
        await settingsSeam.update(patch, expectedRevision)
        sendJson(res, 200, { ok: true, ...settingsView() })
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }), 'dsh-mineru: /mineru/api/settings route')

  // ── API: path picker ───────────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/mineru/api/pick',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const mode = payload?.mode === 'file' || payload?.mode === 'directory'
          ? payload.mode
          : 'directory'
        const picked = await pickPath(mode)
        sendJson(res, 200, { ok: true, path: picked })
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }), 'dsh-mineru: /mineru/api/pick route')

  // ── Preview ────────────────────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/mineru/preview',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      const match = /^\/mineru\/preview\/([^/?#]+)/.exec(req.url || '')
      if (match === null) {
        notFoundRoute(res)
        return
      }
      const id = decodeURIComponent(match[1])
      const entry = findEntry(id)
      if (entry === null || !entry.html || !fs.existsSync(entry.html)) {
        notFoundRoute(res, 'no preview available')
        return
      }
      serveFile(res, entry.html, 'text/html; charset=utf-8')
    },
  }), 'dsh-mineru: /mineru/preview route')

  // ── Download zip ───────────────────────────────────────────────────────
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/mineru/download',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }
      const match = /^\/mineru\/download\/([^/?#]+)/.exec(req.url || '')
      if (match === null) {
        notFoundRoute(res)
        return
      }
      const id = decodeURIComponent(match[1])
      const entry = findEntry(id)
      if (entry === null || !entry.zip || !fs.existsSync(entry.zip)) {
        notFoundRoute(res, 'zip not found')
        return
      }
      serveFile(res, entry.zip, 'application/zip', path.basename(entry.zip))
    },
  }), 'dsh-mineru: /mineru/download route')
}

export default { inject, apply }
