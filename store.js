/* Dados do app como "registros" (chave → valor) que podem ser mesclados entre dois aparelhos.
   Chaves: eu:<id> esp:<id> fixed:<id> inst:<id> goal:<id> sal:<AAAA-MM> plan:<AAAA-MM> cfg:<nome> */
(function (root) {
  'use strict';
  const Merge = root.Merge || (typeof require !== 'undefined' ? require('./merge.js') : null);
  const LS = 'financas-casal:v2';       // dados + estado de sincronização
  const ME = 'financas-casal:me';       // preferências só deste aparelho

  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

  // ---------- dados de exemplo (vindos da planilha original) ----------
  // exemplos extras só na versão de demonstração (window.DEMO), para a apresentação não abrir vazia
  function demoExtras(st) {
    st.esp = [['2026-11-02', 'Mercado', 420, 'Cartão Nubank', 'Compras da semana'], ['2026-11-03', 'Farmácia/Saúde', 89.9, 'Pix', ''],
      ['2026-11-04', 'Lazer/Restaurantes', 135, 'Cartão Inter', 'Jantar'], ['2026-11-06', 'iFood/Delivery', 62.5, 'Cartão Nubank', ''],
      ['2026-11-08', 'Roupas/Beleza', 210, 'Débito', '']].map(([date, cat, val, pay, desc], i) => ({ id: 'demo-es' + i, date, cat, val, pay, desc }));
    st.eu.push({ id: 'demo-eu0', date: '2026-11-07', cat: 'Combustível/Estacionamento', val: 240, pay: 'Débito', desc: '' },
      { id: 'demo-eu1', date: '2026-11-09', cat: 'Lazer/Restaurantes', val: 180, pay: 'Cartão Nubank', desc: 'Almoço com amigos' });
    const g = [[30000, 12500], [8000, 3200], [8000, 4800], [5000, 1000]];
    st.goals.forEach((x, i) => { x.target = g[i][0]; x.saved = g[i][1]; });
    st.goals[2].name = 'Viagem dos sonhos';
    st.sal['2026-12'] = { eu: 5500, esp: 4400 };
    return st;
  }

  function defaults() {
    return root.DEMO ? demoExtras(baseDefaults()) : baseDefaults();
  }
  function baseDefaults() {
    const eu = [['Condomínio', 900, 'Pix', ''], ['Luz', 550, 'Pix', ''], ['TotalPass', 199.9, 'Cartão Inter', ''], ['Internet', 185, 'Pix', ''],
      ['Empréstimo', 437.97, 'Pix', ''], ['Outros', 500, 'Pix', 'Cartão de Crédito Porto'], ['Mercado', 870, '', '']]
      .map(([cat, val, pay, desc], i) => ({ id: 'seed-eu' + i, date: '2026-11-01', cat, val, pay, desc }));
    const fixed = [['Luz', 'Eu', 550, 10], ['Condomínio', 'Eu', 900, 15], ['Internet', 'Eu', 185, 10], ['TotalPass', 'Eu', 199.9, 5],
      ['TotalPass', 'Esposa', 329.9, 5], ['Plano celular', 'Esposa', 130, 5], ['Plano celular irmão', 'Esposa', 70, 5],
      ['iCloud', 'Esposa', 20, 5], ['Assinatura iFood', 'Esposa', 8, 5], ['Anel anticoncepcional', 'Esposa', 110, 5],
      ['HBO', 'Esposa', 56, 5], ['Netflix', 'Esposa', 60, 5], ['Spotify', 'Esposa', 32, 5]]
      .map(([name, who, val, due], i) => ({ id: 'seed-fx' + i, name, who, val, due, pay: '' }));
    return {
      firstMonth: '2026-11',
      names: { eu: 'Eu', esp: 'Esposa' },
      vales: { vr: 738, va: 160 },
      cards: [{ name: 'Cartão Nubank', close: 5, due: 7 }, { name: 'Cartão Inter', close: 5, due: 7 }, { name: 'Cartão Porto Seguro', close: 30, due: 5 }],
      lists: {
        catEu: ['Luz', 'Condomínio', 'Internet', 'TotalPass', 'Condomínio atrasado', 'Dívida CPF Bradesco', 'Empréstimo', 'Mercado',
          'iFood/Delivery', 'Uber/Transporte', 'Combustível/Estacionamento', 'Plano de celular', 'Farmácia/Saúde', 'Lazer/Restaurantes',
          'Roupas/Beleza', 'Assinaturas', 'Educação', 'Pets', 'Água', 'Gás', 'Manutenção da casa', 'Impostos/Taxas', 'Outras dívidas', 'Outros'],
        catEsp: ['TotalPass', 'Plano celular', 'Plano celular irmão', 'iCloud', 'Assinatura iFood', 'HBO', 'Netflix', 'Spotify',
          'Anel anticoncepcional', 'Empréstimo', 'Mercado', 'iFood/Delivery', 'Uber/Transporte', 'Combustível/Estacionamento',
          'Farmácia/Saúde', 'Lazer/Restaurantes', 'Roupas/Beleza', 'Assinaturas', 'Educação', 'Pets', 'Água', 'Gás',
          'Manutenção da casa', 'Impostos/Taxas', 'Outras dívidas', 'Outros'],
        // categorias "gerais": a parcela só some se houver lançamento de valor igual
        general: ['Mercado', 'iFood/Delivery', 'Uber/Transporte', 'Combustível/Estacionamento', 'Plano de celular', 'Farmácia/Saúde',
          'Lazer/Restaurantes', 'Roupas/Beleza', 'Assinaturas', 'Educação', 'Pets', 'Água', 'Gás', 'Manutenção da casa',
          'Impostos/Taxas', 'Outras dívidas', 'Outros'],
        pagto: ['Pix', 'Débito', 'Dinheiro', 'Boleto'],
      },
      eu, esp: [], fixed,
      inst: [
        { id: 'seed-in0', desc: 'Empréstimo', who: 'Eu', cat: 'Empréstimo', val: 437.97, n: 2, total: 3, start: '2026-11-01', due: 3, pay: '' },
        { id: 'seed-in1', desc: 'Empréstimo', who: 'Esposa', cat: 'Empréstimo', val: 700, n: 3, total: 12, start: '2026-11-01', due: null, pay: '' },
        { id: 'seed-in2', desc: 'Condomínio atrasado', who: 'Eu', cat: 'Condomínio atrasado', val: null, n: null, total: null, start: '', due: null, pay: '' },
        { id: 'seed-in3', desc: 'Dívida CPF Bradesco', who: 'Eu', cat: 'Dívida CPF Bradesco', val: null, n: null, total: null, start: '', due: null, pay: '' },
      ],
      sal: { '2026-11': { eu: 5500, esp: 4400 } },
      goals: ['Reserva de emergência', 'Quitar dívidas', 'Viagem', 'Objetivo personalizado'].map((name, i) => ({ id: 'seed-gl' + i, name, target: 0, saved: 0 })),
      plan: {},
    };
  }
  const DEFAULT_PLAN = ['Pagar contas', 'Controlar gastos', 'Investir', 'Guardar para a meta'];

  // estado → registros
  function toItems(st, t) {
    const items = {};
    const put = (k, v) => { items[k] = { t, v, del: false }; };
    for (const [col, arr] of [['eu', st.eu], ['esp', st.esp], ['fixed', st.fixed], ['inst', st.inst], ['goal', st.goals]]) arr.forEach((r) => put(`${col}:${r.id}`, r));
    for (const [m, v] of Object.entries(st.sal)) put('sal:' + m, v);
    for (const [m, v] of Object.entries(st.plan || {})) put('plan:' + m, v);
    for (const k of ['firstMonth', 'names', 'vales', 'cards', 'lists']) put('cfg:' + k, st[k]);
    return items;
  }
  // registros → estado (o que o motor e a interface usam)
  function build(items) {
    const st = defaults();
    st.eu = []; st.esp = []; st.fixed = []; st.inst = []; st.goals = []; st.sal = {}; st.plan = {};
    const cols = { eu: 'eu', esp: 'esp', fixed: 'fixed', inst: 'inst', goal: 'goals' };
    for (const [k, it] of Object.entries(items)) {
      if (it.del) continue;
      const i = k.indexOf(':'), col = k.slice(0, i), id = k.slice(i + 1);
      if (cols[col]) st[cols[col]].push(it.v);
      else if (col === 'sal') st.sal[id] = it.v;
      else if (col === 'plan') st.plan[id] = it.v;
      else if (col === 'cfg') st[id] = it.v;
    }
    st.eu.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id < a.id ? -1 : 1));
    st.esp.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id < a.id ? -1 : 1));
    st.goals.sort((a, b) => a.id < b.id ? -1 : 1);
    return st;
  }

  // ---------- armazenamento local + sincronização ----------
  function createStore(opts) {
    opts = opts || {};
    const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const fetchFn = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    const base = opts.base || '';
    const listeners = new Set();
    let d = { items: null, pending: [], since: 0, code: '' };
    let cache = null, timer = null, syncing = false, status = 'local', lastError = '';

    try { const raw = storage && storage.getItem(LS); if (raw) d = Object.assign(d, JSON.parse(raw)); } catch (e) { /* ignora */ }
    if (!d.items) d.items = toItems(defaults(), 1);
    if (d.code) status = 'offline';

    const saveLocal = () => { try { storage && storage.setItem(LS, JSON.stringify(d)); } catch (e) { /* sem espaço/privado */ } };
    const emit = () => { cache = null; listeners.forEach((f) => f()); };

    function put(key, v) {
      d.items[key] = { t: Math.max(Date.now(), ((d.items[key] || {}).t || 0) + 1), v, del: false };
      if (!d.pending.includes(key)) d.pending.push(key);
      saveLocal(); emit(); schedule();
    }
    function remove(key) {
      d.items[key] = { t: Math.max(Date.now(), ((d.items[key] || {}).t || 0) + 1), v: null, del: true };
      if (!d.pending.includes(key)) d.pending.push(key);
      saveLocal(); emit(); schedule();
    }
    function schedule(ms) {
      if (!d.code) return;
      clearTimeout(timer); timer = setTimeout(sync, ms == null ? 600 : ms);
    }
    async function sync() {
      if (!d.code || syncing || !fetchFn) return;
      syncing = true;
      const sent = {};
      d.pending.forEach((k) => { if (d.items[k]) sent[k] = { t: d.items[k].t, v: d.items[k].v, del: d.items[k].del }; });
      try {
        const r = await fetchFn(`${base}/api/c/${d.code}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ since: d.since, items: sent }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const res = await r.json();
        const changed = Merge.mergeItems(d.items, res.items);
        d.pending = d.pending.filter((k) => !(sent[k] && d.items[k] && d.items[k].t === sent[k].t));
        d.since = Math.max(d.since, res.seq || 0);
        status = 'ok'; lastError = '';
        saveLocal(); if (changed.length) emit(); else listeners.forEach((f) => f());
      } catch (e) { status = 'offline'; lastError = String(e.message || e); listeners.forEach((f) => f()); }
      syncing = false;
      if (d.pending.length && status === 'ok') schedule(300);
    }
    const startPolling = () => {
      if (typeof setInterval === 'undefined') return;
      setInterval(() => { if (d.code && (typeof document === 'undefined' || !document.hidden)) sync(); }, 5000);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
      if (typeof addEventListener !== 'undefined') addEventListener('online', () => sync());
    };

    return {
      get state() { return cache || (cache = build(d.items)); },
      get code() { return d.code; }, get status() { return d.code ? status : 'local'; }, get error() { return lastError; },
      get pendingCount() { return d.pending.length; },
      put, remove, sync, startPolling, onChange: (f) => listeners.add(f),
      /** Cria um casal novo com os dados atuais deste aparelho. */
      createCouple(code) { d.code = code; d.since = 0; d.pending = Object.keys(d.items); saveLocal(); emit(); return sync(); },
      /** Entra num casal existente: os dados do servidor substituem os locais. */
      async joinCouple(code) {
        if (!fetchFn) throw new Error('sem rede');
        const r = await fetchFn(`${base}/api/c/${code}?since=0`, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const res = await r.json();
        if (!Object.keys(res.items).length) throw new Error('Código não encontrado. Confira com quem criou.');
        d = { items: res.items, pending: [], since: res.seq, code };
        status = 'ok'; saveLocal(); emit();
      },
      leaveCouple() { d.code = ''; d.pending = []; d.since = 0; saveLocal(); emit(); },
      exportJSON() { return JSON.stringify({ app: 'financas-casal', v: 2, items: d.items }, null, 1); },
      importJSON(text) {
        const o = JSON.parse(text);
        if (!o || o.app !== 'financas-casal' || !o.items) throw new Error('Arquivo inválido');
        const t = Date.now(); const items = {};
        for (const [k, it] of Object.entries(o.items)) items[k] = { t, v: it.v, del: !!it.del };
        // apaga o que existe e não está no backup; o backup passa a valer
        for (const k of Object.keys(d.items)) if (!items[k] && !d.items[k].del) items[k] = { t, v: null, del: true };
        Merge.mergeItems(d.items, items); d.pending = Object.keys(items); saveLocal(); emit(); schedule(0);
      },
      /** Zera os dados de exemplo e deixa só a configuração (categorias, cartões, nomes). */
      clearData() {
        const t = Date.now();
        for (const [k, it] of Object.entries(d.items)) {
          if (it.del) continue;
          if (/^(eu|esp|fixed|inst|sal|plan):/.test(k)) { d.items[k] = { t: Math.max(t, it.t + 1), v: null, del: true }; d.pending.push(k); }
        }
        d.pending = [...new Set(d.pending)]; saveLocal(); emit(); schedule(0);
      },
    };
  }

  const prefs = {
    get() { try { return JSON.parse(localStorage.getItem(ME)) || {}; } catch (e) { return {}; } },
    set(o) { try { localStorage.setItem(ME, JSON.stringify(Object.assign(prefs.get(), o))); } catch (e) { /* ignora */ } },
  };
  const newCode = () => {
    const a = new Uint8Array(20); (root.crypto || require('crypto').webcrypto).getRandomValues(a);
    return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  };

  const api = { defaults, DEFAULT_PLAN, toItems, build, createStore, prefs, uid, newCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Store = api;
})(typeof self !== 'undefined' ? self : this);
