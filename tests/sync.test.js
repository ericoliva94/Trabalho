// Dois "aparelhos" sincronizando pelo servidor real, com dados no disco temporário.
const assert = require('assert'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const S = require('../store.js');
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const PORT = 3917, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-'));
const srv = cp.spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DATA_DIR: dir }, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://localhost:${PORT}`;

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break; } catch (e) { await wait(100); } }
  const A = S.createStore({ storage: mem(), base }), B = S.createStore({ storage: mem(), base });
  const code = S.newCode();
  await A.createCouple(code);
  assert.strictEqual(A.status, 'ok');
  await B.joinCouple(code);
  assert.strictEqual(B.state.eu.length, 7, 'B recebe os dados de A');

  // lançamentos simultâneos em aparelhos diferentes
  A.put('eu:a1', { id: 'a1', date: '2026-11-10', cat: 'Mercado', val: 100, pay: '', desc: '' });
  B.put('esp:b1', { id: 'b1', date: '2026-11-11', cat: 'Mercado', val: 50, pay: '', desc: '' });
  await A.sync(); await B.sync(); await A.sync();
  assert.ok(A.state.esp.some((e) => e.id === 'b1') && B.state.eu.some((e) => e.id === 'a1'), 'ambos veem os dois lançamentos');

  // edição e exclusão se propagam
  B.put('eu:a1', { id: 'a1', date: '2026-11-10', cat: 'Mercado', val: 120, pay: '', desc: 'editado' });
  await B.sync(); await A.sync();
  assert.strictEqual(A.state.eu.find((e) => e.id === 'a1').val, 120);
  A.remove('esp:b1'); await A.sync(); await B.sync();
  assert.ok(!B.state.esp.some((e) => e.id === 'b1'), 'exclusão propaga');

  // offline: edita sem rede e sincroniza depois
  const C = S.createStore({ storage: mem(), base: 'http://localhost:1' });
  await C.createCouple(code).catch(() => {});
  assert.strictEqual(C.status, 'offline');

  // código inexistente é recusado; código mal formado também
  await assert.rejects(() => S.createStore({ storage: mem(), base }).joinCouple(S.newCode()));
  assert.strictEqual((await fetch(base + '/api/c/../../etc')).status, 404);
  assert.strictEqual((await fetch(base + '/server.js')).status, 404, 'não serve arquivos fora da lista');
  assert.strictEqual((await fetch(base + '/')).status, 200);
  console.log('sync: todos os testes passaram');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
