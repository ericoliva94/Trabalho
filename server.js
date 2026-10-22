#!/usr/bin/env node
/* Servidor do app: entrega os arquivos estáticos e sincroniza os dados do casal.
   Sem dependências. Uso:  node server.js   (PORT=3000, DATA_DIR=./data) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { mergeItems } = require('./merge.js');

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ROOT = __dirname;
const MAX_BODY = 2 * 1024 * 1024, MAX_ITEMS = 30000;
const STATIC = new Set(['index.html', 'styles.css', 'engine.js', 'merge.js', 'store.js', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const CODE_RE = /^[a-z0-9]{16,64}$/;

fs.mkdirSync(DATA_DIR, { recursive: true });
const docs = new Map();          // cache em memória
const queues = new Map();        // serializa escritas por casal

function load(code) {
  if (docs.has(code)) return docs.get(code);
  let doc = { seq: 0, items: {} };
  try { doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, code + '.json'), 'utf8')); } catch (e) { /* novo */ }
  docs.set(code, doc);
  return doc;
}
function persist(code, doc) {
  const file = path.join(DATA_DIR, code + '.json'), tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, file);
}
const since = (doc, n) => {
  const items = {};
  for (const [k, it] of Object.entries(doc.items)) if ((it.s || 0) > n) items[k] = it;
  return { seq: doc.seq, items };
};

// limite simples por IP: 120 requisições / minuto
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 60000);
  h.push(now); hits.set(ip, h);
  return h.length > 120;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (!h.some((t) => now - t < 60000)) hits.delete(ip); }, 60000).unref();

function json(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });
  const m = url.pathname.match(/^\/api\/c\/([^/]+)$/);
  if (!m || !CODE_RE.test(m[1])) return json(res, 404, { error: 'código inválido' });
  const code = m[1];
  const sinceN = Math.max(+url.searchParams.get('since') || 0, 0);
  if (req.method === 'GET') return json(res, 200, since(load(code), sinceN));
  if (req.method !== 'POST') return json(res, 405, { error: 'método' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'corpo inválido' }); }
  const prev = queues.get(code) || Promise.resolve();
  const job = prev.then(() => {
    const doc = load(code);
    if (Object.keys(doc.items).length + Object.keys(body.items || {}).length > MAX_ITEMS) throw new Error('limite');
    const changed = mergeItems(doc.items, body.items, () => ++doc.seq);
    if (changed.length) persist(code, doc);
    return since(doc, Math.max(+body.since || 0, 0));
  });
  queues.set(code, job.catch(() => {}));
  try { json(res, 200, await job); } catch (e) { json(res, 413, { error: String(e.message) }); }
}

function serveStatic(req, res, url) {
  let name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (!STATIC.has(name)) { res.writeHead(404); return res.end('não encontrado'); }
  fs.readFile(path.join(ROOT, name), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream',
      'Cache-Control': name === 'sw.js' ? 'no-cache' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
  if (limited(ip)) return json(res, 429, { error: 'muitas requisições' });
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(() => json(res, 500, { error: 'erro interno' }));
  serveStatic(req, res, url);
}).listen(PORT, () => console.log(`Finanças do Casal em http://localhost:${PORT}  (dados em ${DATA_DIR})`));
