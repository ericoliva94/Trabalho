/* Interface do app. Usa Engine (cálculos) e Store (dados compartilhados). */
(function () {
  'use strict';
  const E = Engine;
  const store = Store.createStore();
  const $ = (s) => document.querySelector(s);
  const app = $('#app');

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (n) => fmt.format(Math.round((n || 0) * 100) / 100);
  const pct = (n) => Math.round((n || 0) * 100) + '%';
  const monthName = (k, long) => {
    const p = E.parseKey(k);
    return new Date(p.y, p.m - 1, 1).toLocaleDateString('pt-BR', long ? { month: 'long', year: 'numeric' } : { month: 'short' }).replace('.', '');
  };
  const dateBR = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
  const uid = Store.uid;
  const COLORS = ['#22e07a', '#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#7b8f89'];

  const ui = { view: 'home', sub: null, who: 'casal', month: null };
  const st = () => store.state;
  const nameOf = (who) => (who === 'Esposa' ? st().names.esp : st().names.eu);
  const colOf = (who) => (who === 'Esposa' ? 'esp' : 'eu');
  const payOptions = () => ['', ...st().lists.pagto, ...st().cards.map((c) => c.name)];
  const today = () => E.todayISO();
  const clampMonth = (k) => (E.monthIdx(k) < E.monthIdx(st().firstMonth) ? st().firstMonth : k);
  if (!ui.month) ui.month = clampMonth(today().slice(0, 7));

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  const DEMO = !!window.DEMO;   // versão de demonstração: sem servidor

  /** Confirmação dentro da página (os diálogos nativos são bloqueados em alguns visualizadores). */
  function ask(msg, o) {
    o = o || {};
    return new Promise((resolve) => {
      const d = document.createElement('div'); d.className = 'modal'; d.style.zIndex = 70;
      d.innerHTML = `<div class="sheet" role="alertdialog" aria-modal="true"><h3>${esc(msg)}</h3><div class="actions"><span class="sp"></span>
        ${o.info ? '' : '<button class="btn" data-r="0">Cancelar</button>'}<button class="btn ${o.danger ? 'danger' : 'primary'}" data-r="1">${esc(o.ok || 'OK')}</button></div></div>`;
      d.addEventListener('click', (e) => { const r = e.target.dataset && e.target.dataset.r; if (r != null || e.target === d) { d.remove(); resolve(r === '1'); } });
      document.body.appendChild(d); d.querySelector('[data-r="1"]').focus();
    });
  }

  // ---------- ícones ----------
  const IC = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>',
    gastos: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    metas: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    mais: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  };

  // ---------- modal genérico ----------
  function sheet(o) {
    const m = $('#modal');
    const fields = o.fields.map((f) => {
      let input;
      const v = o.values[f.name] == null ? '' : o.values[f.name];
      if (f.type === 'select') {
        const opts = typeof f.options === 'function' ? f.options(o.values) : f.options;
        input = `<select name="${f.name}">${opts.map((x) => { const [val, lab] = Array.isArray(x) ? x : [x, x || '—'];
          return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
      } else if (f.type === 'number') input = `<input name="${f.name}" type="number" inputmode="decimal" step="${f.step || '0.01'}" value="${esc(v)}">`;
      else if (f.type === 'textarea') input = `<textarea name="${f.name}">${esc(v)}</textarea>`;
      else input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.type === 'text' || !f.type ? 'autocomplete="off"' : ''}>`;
      return `<label class="f ${f.full ? 'full' : ''}">${esc(f.label)}${input}</label>`;
    }).join('');
    m.innerHTML = `<form class="sheet" novalidate><h3>${esc(o.title)}</h3><div class="fields">${fields}</div>
      <div class="actions">${o.onDelete ? '<button type="button" class="btn danger" data-x="del">Excluir</button>' : ''}<span class="sp"></span>
      <button type="button" class="btn" data-x="cancel">Cancelar</button><button class="btn primary">Salvar</button></div></form>`;
    m.hidden = false;
    const form = m.querySelector('form');
    const read = () => { const out = {}; o.fields.forEach((f) => { const el = form.elements[f.name]; out[f.name] = f.type === 'number' ? num(el.value) : el.value.trim(); }); return out; };
    const close = () => { m.hidden = true; m.innerHTML = ''; };
    m.onclick = (e) => { if (e.target === m) close(); };
    form.addEventListener('click', (e) => {
      const x = e.target.dataset.x;
      if (x === 'cancel') close();
      if (x === 'del') ask('Excluir este item?', { ok: 'Excluir', danger: true }).then((yes) => { if (yes) { o.onDelete(); close(); } });
    });
    if (o.onChange) form.addEventListener('change', (e) => {
      if (!o.onChange(e.target.name, read())) return;
      const cur = read(); close(); sheet({ ...o, values: { ...o.values, ...cur } });
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = read(); const err = o.validate ? o.validate(val) : '';
      if (err) { toast(err); return; }
      o.onSave(val); close();
    });
    const first = form.querySelector('input:not([type=date]),select'); if (first && o.focus) first.focus();
  }

  // ---------- lançar / editar gasto ----------
  function lancar(entry, who) {
    const edit = !!entry;
    const w = who || (edit ? entry.__who : (Store.prefs.get().me || 'Eu'));
    const base = edit ? entry : { id: uid(), date: today(), cat: '', val: null, pay: '', desc: '' };
    const catsFor = (ww) => (ww === 'Esposa' ? st().lists.catEsp : st().lists.catEu);
    sheet({
      title: edit ? 'Editar gasto' : 'Lançar gasto', focus: !edit,
      values: { who: w, date: base.date, cat: base.cat || catsFor(w)[0], val: base.val, pay: base.pay, desc: base.desc },
      fields: [
        { name: 'who', label: 'De quem', type: 'select', options: [['Eu', st().names.eu], ['Esposa', st().names.esp]], full: true },
        { name: 'val', label: 'Valor (R$)', type: 'number' }, { name: 'date', label: 'Data', type: 'date' },
        { name: 'cat', label: 'Categoria', type: 'select', options: (v) => catsFor(v.who) },
        { name: 'pay', label: 'Pago com', type: 'select', options: payOptions },
        { name: 'desc', label: 'Descrição (opcional)', full: true },
      ],
      onChange: (name) => name === 'who',
      validate: (v) => (!(v.val > 0) ? 'Informe o valor' : !v.date ? 'Informe a data' : ''),
      onSave: (v) => {
        if (edit && v.who !== w) store.remove(`${colOf(w)}:${base.id}`);
        store.put(`${colOf(v.who)}:${base.id}`, { id: base.id, date: v.date, cat: v.cat, val: v.val, pay: v.pay, desc: v.desc });
        if (!edit) Store.prefs.set({ me: v.who });
        const k = E.entraNoMes(st(), v.date, v.pay);
        if (k !== ui.month) { ui.month = k; toast(`Lançado — entra em ${monthName(k, true)}`); } else toast('Lançado');
      },
      onDelete: edit ? () => store.remove(`${colOf(w)}:${base.id}`) : null,
    });
  }

  // ---------- componentes ----------
  function monthBar() {
    return `<div class="monthbar"><button class="btn sm" data-act="mprev" aria-label="Mês anterior">‹</button>
      <div class="m">${esc(monthName(ui.month, true))}</div><button class="btn sm" data-act="mnext" aria-label="Próximo mês">›</button></div>`;
  }
  function donut(parts, total) {
    const R = 54, C = 2 * Math.PI * R; let off = 0;
    const arcs = parts.map((p, i) => {
      const len = total > 0 ? (p.value / total) * C : 0;
      const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="17" stroke-dasharray="${Math.max(len - 1.5, 0)} ${C}" stroke-dashoffset="${-off}"/>`;
      off += len; return s;
    }).join('');
    return `<div class="donut"><svg viewBox="0 0 140 140" width="150" height="150"><circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--line)" stroke-width="17"/>${arcs}</svg>
      <div class="c"><b>${brl(total)}</b><span class="lbl">este mês</span></div></div>`;
  }
  function evolutionChart(evo) {
    const W = 320, H = 150, pl = 8, pr = 8, pt = 12, pb = 20;
    const max = Math.max(1, ...evo.flatMap((e) => [e.receitas, e.gastos]));
    const x = (i) => pl + (i * (W - pl - pr)) / (evo.length - 1), y = (v) => pt + (1 - v / max) * (H - pt - pb);
    const line = (key) => evo.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e[key]).toFixed(1)}`).join(' ');
    const area = `${line('receitas')} L${x(evo.length - 1)},${H - pb} L${x(0)},${H - pb}Z`;
    const labels = evo.map((e, i) => (i % 2 === 1 || i === evo.length - 1 ? `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${esc(monthName(e.month))}</text>` : '')).join('');
    const last = evo.length - 1;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e gastos dos últimos 12 meses">
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22e07a" stop-opacity=".35"/><stop offset="1" stop-color="#22e07a" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#ga)"/><path d="${line('receitas')}" fill="none" stroke="#22e07a" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="${line('gastos')}" fill="none" stroke="#ff5d5d" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="${x(last)}" cy="${y(evo[last].receitas)}" r="3.5" fill="#22e07a"/><circle cx="${x(last)}" cy="${y(evo[last].gastos)}" r="3.5" fill="#ff5d5d"/>${labels}</svg>`;
  }
  const variation = (cur, prev, goodUp) => {
    if (!prev) return '<span class="lbl">sem mês anterior</span>';
    const d = (cur - prev) / Math.abs(prev), good = goodUp ? d >= 0 : d <= 0;
    return `<span class="${good ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%</span>`;
  };

  // ---------- início ----------
  function viewHome() {
    const sm = E.summary(st(), ui.month, today());
    const evo = E.evolution(st(), ui.month, today());
    const prevSaldo = sm.prev.saldo;
    const saldoCmp = !sm.hasPrev || !prevSaldo ? 'Sem dados do mês anterior'
      : `${sm.saldo >= prevSaldo ? '▲' : '▼'} ${Math.abs(Math.round(((sm.saldo - prevSaldo) / Math.abs(prevSaldo)) * 100))}% em relação ao mês anterior`;
    const scopeKey = { casal: 'casal', Eu: 'eu', Esposa: 'esp' }[ui.who] || 'casal';
    const merged = {};
    if (scopeKey !== 'esp') Object.entries(sm.eu.byCat).forEach(([k, v]) => { merged[k] = (merged[k] || 0) + v; });
    if (scopeKey !== 'eu') Object.entries(sm.esp.byCat).forEach(([k, v]) => { merged[k] = (merged[k] || 0) + v; });
    const total = scopeKey === 'eu' ? sm.eu.total : scopeKey === 'esp' ? sm.esp.total : sm.gastos;
    const parts = (() => { const top = Object.entries(merged).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      const head = top.slice(0, 5), rest = total - head.reduce((s, x) => s + x.value, 0);
      if (rest > 0.005) head.push({ name: 'Outros', value: rest }); return head; })();
    const m = sm.mercado;
    const plan = st().plan[ui.month] || { items: Store.DEFAULT_PLAN.map((t) => ({ t, done: false })) };
    const goals = st().goals.filter((g) => g.name);

    return `${monthBar()}
    <section class="card glow"><div class="lbl">Saldo do Mês</div><div class="big ${sm.saldo < 0 ? 'down' : ''}">${brl(sm.saldo)}</div>
      <div class="lbl">${sm.hasPrev && prevSaldo ? `<span class="${sm.saldo >= prevSaldo ? 'up' : 'down'}">${saldoCmp.split(' ')[0]}</span> ${saldoCmp.split(' ').slice(1).join(' ')}` : saldoCmp}</div>
      <div class="lbl" style="margin-top:6px">Acumulado no ano: <b>${brl(sm.acumulado)}</b></div></section>
    <div class="tiles">
      <div class="tile g"><div class="a up">↑</div><div class="lbl">Receitas</div><div class="n">${brl(sm.receitas)}</div><div class="lbl">${variation(sm.receitas, sm.prev.receitas, true)}</div></div>
      <div class="tile r"><div class="a down">↓</div><div class="lbl">Gastos</div><div class="n down">${brl(sm.gastos)}</div><div class="lbl">${variation(sm.gastos, sm.prev.gastos, false)}</div></div>
      <div class="tile b"><div class="a blue">◆</div><div class="lbl">Resultado</div><div class="n ${sm.saldo < 0 ? 'down' : ''}">${brl(sm.saldo)}</div></div>
    </div>

    <section class="card"><h2>Meus Gastos <small>${brl(total)}</small></h2>
      <div class="seg" role="group" aria-label="Quem">${[['casal', 'Casal'], ['Eu', st().names.eu], ['Esposa', st().names.esp]].map(([k, l]) =>
        `<button data-act="who" data-v="${k}" aria-pressed="${ui.who === k}">${esc(l)}</button>`).join('')}</div>
      ${total > 0 ? `<div class="donutwrap">${donut(parts, total)}<div class="legend">${parts.map((p, i) =>
        `<div><i style="background:${COLORS[i % COLORS.length]}"></i><span>${esc(p.name)}</span><b>${pct(p.value / total)}</b></div>`).join('')}</div></div>`
        : '<div class="empty">Sem gastos neste mês.</div>'}</section>

    <section class="card"><h2>Evolução Financeira <small>12 meses</small></h2>${evolutionChart(evo)}
      <div class="pair" style="margin-top:8px"><div class="tile g"><div class="lbl">Receitas</div><div class="n">${variation(sm.receitas, sm.prev.receitas, true)}</div></div>
      <div class="tile r"><div class="lbl">Gastos</div><div class="n">${variation(sm.gastos, sm.prev.gastos, false)}</div></div></div></section>

    <section class="card"><h2>Números de cada um</h2>
      ${[['Eu', sm.sal.eu, sm.saiSalEu, sm.sobraEu, sm.pctEu], ['Esposa', sm.sal.esp, sm.saiSalEsp, sm.sobraEsp, sm.pctEsp]].map(([w, sal, sai, sobra, p]) => `
      <div style="margin-bottom:14px"><div class="kv"><span>${esc(nameOf(w))} · salário</span><b>${brl(sal)}</b></div>
      <div class="kv"><span>Gastos do salário</span><b>${brl(sai)}</b></div><div class="kv"><span>Sobra do salário</span><b class="${sobra < 0 ? 'down' : 'up'}">${brl(sobra)}</b></div>
      <div class="lbl" style="margin:6px 0 4px">${pct(p)} do salário comprometido</div><div class="bar ${p > 1 ? 'red' : p > 0.8 ? 'amber' : ''}"><i style="width:${Math.min(p, 1) * 100}%"></i></div></div>`).join('')}</section>

    <section class="card"><h2>A pagar no mês <small>${sm.aPagar.length ? brl(sm.aPagarTotal) : ''}</small></h2>
      ${sm.aPagar.length ? sm.aPagar.map((a) => `<div class="item" style="cursor:default"><div class="grow"><div class="t">${esc(a.nome)}</div><div class="s">${esc(a.venc)}</div></div>
        <div class="amt">${a.valor == null ? '—' : brl(a.valor)}<div><span class="chip ${a.status === 'A negociar' ? 'mute' : a.status}">${esc(a.status)}</span></div></div></div>`).join('')
        : '<div class="empty">Tudo pago neste mês ✔</div>'}</section>

    <section class="card"><h2>Vales × Mercado</h2>
      <div class="kv"><span>Mercado do casal</span><b>${brl(m.total)}</b></div><div class="kv"><span>Vale refeição usado</span><b>${brl(m.valeEu)}</b></div>
      <div class="kv"><span>Vale alimentação usado</span><b>${brl(m.valeEsp)}</b></div><div class="kv"><span>Mercado acima dos vales</span><b class="${m.excedente > 0 ? 'down' : ''}">${brl(m.excedente)}</b></div>
      <div class="kv"><span>Vale que sobrou no mês</span><b class="up">${brl(m.sobra)}</b></div></section>

    <section class="card"><h2>Cartões no mês</h2>${sm.cartoes.length ? sm.cartoes.map((c) => `<div class="item" style="cursor:default"><div class="ico b">▭</div>
      <div class="grow"><div class="t">${esc(c.name)}</div><div class="s">fecha dia ${c.close} · vence dia ${c.due} · ${esc(st().names.eu)} ${brl(c.eu)} · ${esc(st().names.esp)} ${brl(c.esp)}</div></div><div class="amt">${brl(c.total)}</div></div>`).join('')
      : '<div class="empty">Nenhum cartão cadastrado.</div>'}</section>

    <section class="card"><h2>Metas ${E.parseKey(ui.month).y}</h2>${goals.length ? goals.map(goalItem).join('') : '<div class="empty">Cadastre suas metas na aba Metas.</div>'}</section>

    <section class="card"><h2>Planejamento do Mês <button class="btn sm" data-act="planedit">Editar</button></h2>
      ${plan.items.map((it, i) => `<div class="check ${it.done ? 'on' : ''}" data-act="plantoggle" data-i="${i}" role="checkbox" aria-checked="${!!it.done}" tabindex="0"><div class="bx">${it.done ? '✓' : ''}</div><span>${esc(it.t)}</span></div>`).join('')}</section>`;
  }
  function goalItem(g) {
    const p = g.target > 0 ? Math.min((g.saved || 0) / g.target, 1) : 0;
    return `<div class="item" data-act="goal" data-id="${esc(g.id)}"><div class="ico">◎</div><div class="grow"><div class="t">${esc(g.name)}</div>
      <div class="s">${g.target > 0 ? `${brl(g.saved)} de ${brl(g.target)}` : 'Defina o objetivo'}</div><div class="bar"><i style="width:${p * 100}%"></i></div></div><div class="amt up">${g.target > 0 ? pct(p) : ''}</div></div>`;
  }

  // ---------- gastos ----------
  function viewGastos() {
    const s = st(); const month = ui.month;
    const rows = [];
    for (const who of ['Eu', 'Esposa']) {
      if (ui.who !== 'casal' && ui.who !== who) continue;
      for (const e of s[colOf(who)]) {
        const k = e.date ? E.entraNoMes(s, e.date, e.pay) : '';
        if (k === month) rows.push({ kind: 'lanc', who, e, sort: e.date, k });
      }
      for (const f of s.fixed.filter((x) => x.who === who && x.name)) {
        const i = E.fixedInfo(s, f, month, today());
        if (i.pendente > 0) rows.push({ kind: 'fixa', who, label: f.name, val: i.pendente, sub: `conta fixa · ${f.due ? 'vence dia ' + f.due : 'sem vencimento'}`, status: i.status, sort: `${month}-${String(f.due || 28).padStart(2, '0')}` });
      }
      for (const p of s.inst.filter((x) => x.who === who)) {
        const i = E.installInfo(s, p, month, today());
        if (i.active && i.pendente > 0) rows.push({ kind: 'parc', who, label: `${p.desc} ${i.label}`, val: i.pendente, sub: 'parcela automática', status: 'Pendente', sort: `${month}-${String(p.due || 28).padStart(2, '0')}` });
      }
    }
    rows.sort((a, b) => (b.sort || '').localeCompare(a.sort || ''));
    const total = rows.reduce((t, r) => t + (r.kind === 'lanc' ? r.e.val : r.val), 0);
    return `${monthBar()}
    <div class="seg">${[['casal', 'Casal'], ['Eu', s.names.eu], ['Esposa', s.names.esp]].map(([k, l]) => `<button data-act="who" data-v="${k}" aria-pressed="${ui.who === k}">${esc(l)}</button>`).join('')}</div>
    <section class="card"><h2>Gastos do mês <small>${brl(total)}</small></h2>
    ${rows.length ? rows.map((r) => r.kind === 'lanc' ? `<div class="item" data-act="edit" data-who="${r.who}" data-id="${esc(r.e.id)}"><div class="ico r">↓</div>
      <div class="grow"><div class="t">${esc(r.e.cat)}</div><div class="s">${dateBR(r.e.date)}${r.e.pay ? ' · ' + esc(r.e.pay) : ''}${r.e.desc ? ' · ' + esc(r.e.desc) : ''}${ui.who === 'casal' ? ' · ' + esc(nameOf(r.who)) : ''}</div></div>
      <div class="amt">${brl(r.e.val)}</div></div>`
      : `<div class="item" style="cursor:default"><div class="ico a">↻</div><div class="grow"><div class="t">${esc(r.label)}</div><div class="s">${esc(r.sub)}${ui.who === 'casal' ? ' · ' + esc(nameOf(r.who)) : ''}</div></div>
      <div class="amt">${brl(r.val)}<div><span class="chip ${r.status}">${esc(r.status)}</span></div></div></div>`).join('')
      : '<div class="empty">Nenhum gasto neste mês. Toque no + para lançar.</div>'}</section>
    <p class="note">Contas fixas e parcelas aparecem sozinhas. Ao lançar o pagamento (mesma categoria), o valor real substitui o previsto. Compra no cartão a partir do dia de fechamento entra na fatura do mês seguinte.</p>`;
  }

  // ---------- metas e dívidas ----------
  function viewMetas() {
    const s = st(), month = ui.month;
    return `<section class="card"><h2>Metas ${E.parseKey(month).y} <button class="btn sm" data-act="goalnew">+ Nova</button></h2>
      ${s.goals.length ? s.goals.map(goalItem).join('') : '<div class="empty">Nenhuma meta ainda.</div>'}</section>
      ${monthBar()}
      <section class="card"><h2>Dívidas e parcelas <button class="btn sm" data-act="instnew">+ Nova</button></h2>
      ${s.inst.length ? s.inst.map((p) => {
        const i = E.installInfo(s, p, month, today());
        const paid = i.complete ? Math.min(Math.max(((E.monthIdx(month) - E.monthIdx(E.keyOf(p.start))) + p.n - 1) / p.total, 0), 1) : 0;
        return `<div class="item" data-act="inst" data-id="${esc(p.id)}"><div class="ico r">%</div><div class="grow"><div class="t">${esc(p.desc)} <span class="lbl">· ${esc(nameOf(p.who))}</span></div>
          <div class="s">${i.complete ? `parcela ${i.label} · falta ${brl(i.falta)} · termina ${esc(monthName(i.termina, true))}` : 'a negociar — preencha os dados'}</div>
          ${i.complete ? `<div class="bar red"><i style="width:${paid * 100}%"></i></div>` : ''}</div>
          <div class="amt">${i.complete ? brl(p.val) : '—'}<div><span class="chip ${i.status === 'Quitado' ? '' : i.complete ? 'amber' : 'mute'}">${esc(i.status)}</span></div></div></div>`;
      }).join('') : '<div class="empty">Sem dívidas cadastradas.</div>'}</section>`;
  }
  function goalSheet(g) {
    const edit = !!g, base = g || { id: uid(), name: '', target: 0, saved: 0 };
    sheet({ title: edit ? 'Editar meta' : 'Nova meta', values: base, focus: !edit,
      fields: [{ name: 'name', label: 'Meta', full: true }, { name: 'target', label: 'Objetivo (R$)', type: 'number' }, { name: 'saved', label: 'Já guardado (R$)', type: 'number' }],
      validate: (v) => (v.name ? '' : 'Dê um nome à meta'),
      onSave: (v) => store.put('goal:' + base.id, { id: base.id, name: v.name, target: v.target || 0, saved: v.saved || 0 }),
      onDelete: edit ? () => store.remove('goal:' + base.id) : null });
  }
  function instSheet(p) {
    const edit = !!p, base = p || { id: uid(), desc: '', who: Store.prefs.get().me || 'Eu', cat: '', val: null, n: 1, total: 1, start: ui.month + '-01', due: null, pay: '' };
    const cats = (w) => ['', ...(w === 'Esposa' ? st().lists.catEsp : st().lists.catEu)];
    sheet({ title: edit ? 'Editar dívida' : 'Nova dívida / parcela', values: { ...base, cat: base.cat }, focus: !edit,
      fields: [
        { name: 'desc', label: 'Descrição', full: true }, { name: 'who', label: 'De quem', type: 'select', options: [['Eu', st().names.eu], ['Esposa', st().names.esp]] },
        { name: 'cat', label: 'Categoria', type: 'select', options: (v) => cats(v.who) }, { name: 'val', label: 'Valor da parcela', type: 'number' },
        { name: 'due', label: 'Vence dia', type: 'number', step: '1' }, { name: 'n', label: 'Parcela nº (do mês abaixo)', type: 'number', step: '1' },
        { name: 'total', label: 'Total de parcelas', type: 'number', step: '1' }, { name: 'start', label: 'Mês dessa parcela', type: 'date', full: true },
      ],
      onChange: (name) => name === 'who',
      validate: (v) => (v.desc ? '' : 'Informe a descrição'),
      onSave: (v) => store.put('inst:' + base.id, { id: base.id, desc: v.desc, who: v.who, cat: v.cat || v.desc, val: v.val, n: v.n, total: v.total, start: v.start, due: v.due, pay: '' }),
      onDelete: edit ? () => store.remove('inst:' + base.id) : null });
  }

  // ---------- mais ----------
  function viewMais() {
    const s = st();
    if (ui.sub) return `<button class="back" data-act="back">‹ Mais</button>` + SUB[ui.sub]();
    const row = (id, ic, t, sub) => `<div class="item" data-act="sub" data-id="${id}"><div class="ico">${ic}</div><div class="grow"><div class="t">${t}</div><div class="s">${sub}</div></div><span class="chev lbl">›</span></div>`;
    return `<section class="card menu">
      ${row('casal', '⇄', 'Casal e sincronização', store.code ? 'Compartilhado — dados em tempo real' : 'Ligue os dois aparelhos')}
      ${row('contas', '▤', 'Contas fixas', `${s.fixed.length} contas que entram sozinhas no mês`)}
      ${row('salarios', '$', 'Salários e vales', 'Valor líquido de cada mês')}
      ${row('cartoes', '▭', 'Cartões', 'Dia de fechamento e vencimento')}
      ${row('categorias', '☰', 'Categorias e formas de pagamento', 'Listas usadas nos lançamentos')}
      ${row('backup', '⇩', 'Backup e dados', 'Exportar, importar, limpar exemplo')}
      ${row('tema', '◐', 'Aparência', 'Escuro ou claro')}</section>`;
  }
  const SUB = {
    contas() {
      const s = st(), month = ui.month;
      return `${monthBar()}<section class="card"><h2>Contas fixas <button class="btn sm" data-act="fixnew">+ Nova</button></h2>
      <p class="note">Entram sozinhas no gasto pelo valor previsto. Ao lançar o pagamento (mesma categoria), o valor real substitui o previsto.</p>
      ${s.fixed.length ? s.fixed.map((f) => { const i = E.fixedInfo(s, f, month, today());
        return `<div class="item" data-act="fix" data-id="${esc(f.id)}"><div class="ico a">▤</div><div class="grow"><div class="t">${esc(f.name)} <span class="lbl">· ${esc(nameOf(f.who))}</span></div>
        <div class="s">${f.due ? 'vence dia ' + f.due : 'sem vencimento'} · previsto ${brl(f.val)}${i.lancado > 0 ? ' · lançado ' + brl(i.lancado) : ''}</div></div>
        <div class="amt">${brl(i.noGasto)}<div><span class="chip ${i.status}">${i.status}</span></div></div></div>`; }).join('') : '<div class="empty">Nenhuma conta fixa.</div>'}</section>`;
    },
    salarios() {
      const s = st(), months = [];
      for (let i = 0; i < 24; i++) months.push(E.addMonths(s.firstMonth, i));
      return `<section class="card"><h2>Vales padrão</h2><p class="note">Valem para todo mês que você não alterar.</p>
        <div class="fields"><label class="f">Vale refeição<input type="number" inputmode="decimal" step="0.01" data-bind="vale" data-k="vr" value="${esc(s.vales.vr)}"></label>
        <label class="f">Vale alimentação<input type="number" inputmode="decimal" step="0.01" data-bind="vale" data-k="va" value="${esc(s.vales.va)}"></label></div></section>
        ${months.map((m) => { const sal = s.sal[m] || {}, t = E.monthTotals(s, m, today()), cur = E.salaryOf(s, m);
          return `<section class="card salcard"><h2>${esc(monthName(m, true)[0].toUpperCase() + monthName(m, true).slice(1))} <button class="btn sm" data-act="salcopy" data-m="${m}">Copiar anterior</button></h2><div class="fields">
          ${[['eu', `Salário ${s.names.eu}`], ['esp', `Salário ${s.names.esp}`], ['vr', 'Vale refeição'], ['va', 'Vale alimentação']].map(([k, l]) =>
            `<label class="f">${esc(l)}<input type="number" inputmode="decimal" step="0.01" data-bind="sal" data-m="${m}" data-k="${k}" value="${sal[k] == null ? '' : esc(sal[k])}" placeholder="${k === 'vr' || k === 'va' ? esc(cur[k]) : '0'}"></label>`).join('')}</div>
          <div class="kv" style="margin-top:10px"><span>Gastos</span><b>${brl(t.gastos)}</b></div><div class="kv"><span>Sobra do casal</span><b class="${t.saldo < 0 ? 'down' : 'up'}">${brl(t.saldo)}</b></div></section>`; }).join('')}`;
    },
    cartoes() {
      const s = st();
      return `<section class="card"><h2>Cartões <button class="btn sm" data-act="cardnew">+ Novo</button></h2>
        <p class="note">Compra no cartão a partir do dia de fechamento entra na fatura (e no gasto) do mês seguinte.</p>
        ${s.cards.length ? s.cards.map((c, i) => `<div class="item" data-act="card" data-i="${i}"><div class="ico b">▭</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">fecha dia ${c.close} · vence dia ${c.due}</div></div></div>`).join('') : '<div class="empty">Nenhum cartão.</div>'}</section>`;
    },
    categorias() {
      const s = st();
      return `<section class="card"><h2>Categorias e pagamentos</h2><p class="note">Uma por linha. Renomear não altera lançamentos antigos.</p>
        ${[['catEu', `Categorias — ${s.names.eu}`], ['catEsp', `Categorias — ${s.names.esp}`], ['general', 'Categorias gerais (parcela só some com valor igual)'], ['pagto', 'Formas de pagamento (os cartões entram sozinhos)']].map(([k, l]) =>
          `<label class="f" style="margin-bottom:12px">${esc(l)}<textarea data-bind="list" data-k="${k}">${esc(s.lists[k].join('\n'))}</textarea></label>`).join('')}</section>`;
    },
    casal() {
      const s = st(), link = store.code ? `${location.origin}${location.pathname}#c=${store.code}` : '';
      const state = { local: 'Só neste aparelho', ok: 'Sincronizado', offline: 'Sem conexão — tentando de novo' }[store.status];
      return `<section class="card"><h2>Quem usa o app</h2>
        <div class="fields"><label class="f">Nome 1<input data-bind="name" data-k="eu" value="${esc(s.names.eu)}"></label><label class="f">Nome 2<input data-bind="name" data-k="esp" value="${esc(s.names.esp)}"></label>
        <label class="f full">Neste aparelho eu sou<select data-bind="me"><option value="Eu"${(Store.prefs.get().me || 'Eu') === 'Eu' ? ' selected' : ''}>${esc(s.names.eu)}</option><option value="Esposa"${Store.prefs.get().me === 'Esposa' ? ' selected' : ''}>${esc(s.names.esp)}</option></select></label></div></section>
        ${DEMO ? `<section class="card"><h2>Compartilhar dados <span class="chip mute">Demonstração</span></h2><p class="note">Nesta demonstração os dados ficam só neste navegador. Na versão com servidor, um link do casal liga os dois celulares e os lançamentos aparecem para os dois em segundos, sem login.</p></section>` : `<section class="card"><h2>Compartilhar dados <span class="chip ${store.status === 'ok' ? '' : 'amber'}">${state}</span></h2>
        ${store.code ? `<p class="note">Mande este link para a outra pessoa abrir no celular. Quem tiver o link acessa os dados — não precisa de login, então não divulgue.</p>
          <div class="code">${esc(link)}</div>
          <div class="actions" style="margin-top:8px"><button class="btn" data-act="copylink">Copiar link</button>${navigator.share ? '<button class="btn primary" data-act="sharelink">Enviar</button>' : ''}<span class="sp"></span></div>
          <div class="kv" style="margin-top:14px"><span>Alterações a enviar</span><b>${store.pendingCount}</b></div>
          <div class="actions"><button class="btn" data-act="syncnow">Sincronizar agora</button><span class="sp"></span><button class="btn danger" data-act="leave">Parar de compartilhar</button></div>`
        : `<p class="note">Os dados ficam só neste aparelho. Para usar em dois celulares, crie um código do casal e abra o link no outro aparelho.</p>
          <button class="btn primary block" data-act="create">Criar link do casal</button>
          <button class="btn block" style="margin-top:10px" data-act="join">Já tenho um código</button>`}
        ${store.error && store.code ? `<p class="note down">Último erro: ${esc(store.error)}</p>` : ''}</section>`}
        <section class="card"><h2>Instalar no celular</h2><p class="note"><b>iPhone/iPad:</b> abra o link no Safari → botão Compartilhar → <i>Adicionar à Tela de Início</i>.<br><b>Android:</b> menu do Chrome → <i>Instalar app</i>.</p></section>`;
    },
    backup() {
      return `<section class="card"><h2>Backup e dados</h2><p class="note">Exporte um arquivo de segurança ou restaure um anterior. Importar substitui os dados atuais (e vale para os dois aparelhos, se compartilhado).</p>
        ${DEMO ? '' : '<button class="btn block" data-act="export">Exportar backup (.json)</button>'}
        <label class="btn block" style="margin-top:10px;text-align:center">Importar backup<input type="file" accept="application/json,.json" data-bind="import" hidden></label>
        <button class="btn danger block" style="margin-top:10px" data-act="clear">Apagar dados de exemplo e começar do zero</button></section>`;
    },
    tema() {
      const cur = Store.prefs.get().theme || 'dark';
      return `<section class="card"><h2>Aparência</h2><div class="seg">${[['dark', 'Escuro'], ['light', 'Claro']].map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div></section>`;
    },
  };
  function fixSheet(f) {
    const edit = !!f, base = f || { id: uid(), name: '', who: Store.prefs.get().me || 'Eu', val: null, due: null, pay: '' };
    sheet({ title: edit ? 'Editar conta fixa' : 'Nova conta fixa', values: base, focus: !edit,
      fields: [{ name: 'name', label: 'Conta (= categoria)', full: true }, { name: 'who', label: 'De quem', type: 'select', options: [['Eu', st().names.eu], ['Esposa', st().names.esp]] },
        { name: 'val', label: 'Valor previsto', type: 'number' }, { name: 'due', label: 'Vence dia', type: 'number', step: '1' }],
      validate: (v) => (v.name ? '' : 'Informe o nome da conta'),
      onSave: (v) => store.put('fixed:' + base.id, { id: base.id, name: v.name, who: v.who, val: v.val || 0, due: v.due, pay: '' }),
      onDelete: edit ? () => store.remove('fixed:' + base.id) : null });
  }
  function cardSheet(i) {
    const cards = st().cards, edit = i != null, base = edit ? cards[i] : { name: '', close: 5, due: 10 };
    sheet({ title: edit ? 'Editar cartão' : 'Novo cartão', values: base, focus: !edit,
      fields: [{ name: 'name', label: 'Nome (ex.: Cartão Nubank)', full: true }, { name: 'close', label: 'Fecha dia', type: 'number', step: '1' }, { name: 'due', label: 'Vence dia', type: 'number', step: '1' }],
      validate: (v) => (v.name ? '' : 'Informe o nome'),
      onSave: (v) => { const next = cards.slice(); const c = { name: v.name, close: v.close || 0, due: v.due || 0 }; if (edit) next[i] = c; else next.push(c); store.put('cfg:cards', next); },
      onDelete: edit ? () => store.put('cfg:cards', cards.filter((_, j) => j !== i)) : null });
  }

  // ---------- render ----------
  const TITLES = { home: 'Visão Geral', gastos: 'Gastos', metas: 'Metas e Dívidas', mais: 'Mais' };
  function render() {
    document.documentElement.dataset.theme = Store.prefs.get().theme || 'dark';
    $('#title').textContent = ui.view === 'mais' && ui.sub ? { casal: 'Casal', contas: 'Contas fixas', salarios: 'Salários e vales', cartoes: 'Cartões', categorias: 'Categorias', backup: 'Backup', tema: 'Aparência' }[ui.sub] : TITLES[ui.view];
    const y = window.scrollY;
    const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.bind;
    if (focused && document.activeElement.tagName !== 'SELECT') return;   // não recria a tela enquanto digita
    app.innerHTML = { home: viewHome, gastos: viewGastos, metas: viewMetas, mais: viewMais }[ui.view]();
    window.scrollTo(0, y);
    const tabs = [['home', 'Início', IC.home], ['gastos', 'Gastos', IC.gastos], ['add', 'Lançar', IC.plus], ['metas', 'Metas', IC.metas], ['mais', 'Mais', IC.mais]];
    $('#nav').innerHTML = `<div class="bottom-in">${tabs.map(([k, l, ic]) => k === 'add'
      ? `<button class="nb add" data-act="lancar" aria-label="Lançar gasto"><b>${ic}</b><span>${l}</span></button>`
      : `<button class="nb" data-nav="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${ic}<span>${l}</span></button>`).join('')}</div>`;
    const sb = $('#sync'); sb.className = 'sync ' + (store.status === 'ok' ? 'ok' : store.status === 'offline' ? 'offline' : '');
    sb.querySelector('span').textContent = { local: 'Neste aparelho', ok: 'Sincronizado', offline: 'Offline' }[store.status];
  }

  // ---------- eventos ----------
  const go = (view, sub) => { ui.view = view; ui.sub = sub || null; window.scrollTo(0, 0); render(); };
  const findIn = (who, id) => { const e = st()[colOf(who)].find((x) => x.id === id); return e && { ...e, __who: who }; };
  const ACTS = {
    mprev: () => { ui.month = E.addMonths(ui.month, -1); render(); },
    mnext: () => { ui.month = E.addMonths(ui.month, 1); render(); },
    who: (el) => { ui.who = el.dataset.v; render(); },
    lancar: () => lancar(),
    edit: (el) => lancar(findIn(el.dataset.who, el.dataset.id), el.dataset.who),
    goal: (el) => goalSheet(st().goals.find((g) => g.id === el.dataset.id)), goalnew: () => goalSheet(),
    inst: (el) => instSheet(st().inst.find((p) => p.id === el.dataset.id)), instnew: () => instSheet(),
    fix: (el) => fixSheet(st().fixed.find((f) => f.id === el.dataset.id)), fixnew: () => fixSheet(),
    card: (el) => cardSheet(+el.dataset.i), cardnew: () => cardSheet(),
    sub: (el) => go('mais', el.dataset.id), back: () => go('mais'),
    plantoggle: (el) => {
      const cur = st().plan[ui.month] || { items: Store.DEFAULT_PLAN.map((t) => ({ t, done: false })) };
      const items = cur.items.map((it, i) => (i === +el.dataset.i ? { ...it, done: !it.done } : it)); store.put('plan:' + ui.month, { items });
    },
    planedit: () => {
      const cur = st().plan[ui.month] || { items: Store.DEFAULT_PLAN.map((t) => ({ t, done: false })) };
      sheet({ title: 'Planejamento do mês', values: { lines: cur.items.map((i) => i.t).join('\n') }, fields: [{ name: 'lines', label: 'Uma tarefa por linha', type: 'textarea', full: true }],
        onSave: (v) => { const done = new Map(cur.items.map((i) => [i.t, i.done]));
          store.put('plan:' + ui.month, { items: v.lines.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ t, done: !!done.get(t) })) }); } });
    },
    salcopy: (el) => {
      const m = el.dataset.m, prev = st().sal[E.addMonths(m, -1)]; if (!prev) { toast('O mês anterior está vazio'); return; }
      store.put('sal:' + m, { ...prev }); toast('Copiado');
    },
    theme: (el) => { Store.prefs.set({ theme: el.dataset.v }); render(); },
    create: async () => {
      const code = Store.newCode(); await store.createCouple(code);
      if (store.status !== 'ok') { store.leaveCouple(); ask('Não foi possível falar com o servidor. Abra o app pelo endereço do site e tente de novo.', { info: true }); } else toast('Link criado — envie para a outra pessoa');
      render();
    },
    join: async () => {
      sheet({ title: 'Entrar no casal', values: { raw: '' }, focus: true, fields: [{ name: 'raw', label: 'Cole o link (ou o código) do casal', full: true }],
        validate: (v) => (/[a-z0-9]{16,64}/.test(v.raw) ? '' : 'Link ou código inválido'),
        onSave: (v) => joinWith(v.raw.match(/[a-z0-9]{16,64}/)[0]) });
    },
    copylink: () => { const l = `${location.origin}${location.pathname}#c=${store.code}`; (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => toast('Link copiado'), () => toast('Selecione o link acima e copie')); },
    sharelink: () => navigator.share({ title: 'Finanças do Casal', text: 'Abra para usar nosso controle financeiro:', url: `${location.origin}${location.pathname}#c=${store.code}` }).catch(() => {}),
    syncnow: async () => { await store.sync(); toast(store.status === 'ok' ? 'Sincronizado' : 'Sem conexão'); render(); },
    leave: () => ask('Parar de compartilhar? Os dados continuam neste aparelho, mas deixam de ser enviados.', { ok: 'Parar', danger: true }).then((yes) => { if (yes) { store.leaveCouple(); render(); } }),
    export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
      a.download = `financas-casal-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); },
    clear: () => ask('Apagar lançamentos, contas fixas, dívidas e salários? Categorias, cartões e metas ficam.', { ok: 'Apagar', danger: true }).then((yes) => { if (yes) { store.clearData(); toast('Dados apagados'); } }),
  };
  async function joinWith(code) {
    if (!code) { toast('Código inválido'); return; }
    if (!(await ask('Entrar neste casal? Os dados deste aparelho serão substituídos pelos compartilhados.', { ok: 'Entrar' }))) return;
    try { await store.joinCouple(code); toast('Conectado!'); go('home'); } catch (e) { ask(String(e.message || e), { info: true }); }
  }
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]'); if (nav) return go(nav.dataset.nav);
    const el = e.target.closest('[data-act]'); if (el && ACTS[el.dataset.act]) ACTS[el.dataset.act](el);
    if (e.target.closest('#sync')) go('mais', 'casal');
  });
  document.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && e.target.dataset && e.target.dataset.act === 'plantoggle') { e.preventDefault(); e.target.click(); } });
  document.addEventListener('change', (e) => {
    const t = e.target, b = t.dataset && t.dataset.bind; if (!b) return;
    const s = st();
    if (b === 'sal') { const cur = { ...(s.sal[t.dataset.m] || {}) }; const v = num(t.value); if (v == null) delete cur[t.dataset.k]; else cur[t.dataset.k] = v; store.put('sal:' + t.dataset.m, cur); }
    else if (b === 'vale') store.put('cfg:vales', { ...s.vales, [t.dataset.k]: num(t.value) || 0 });
    else if (b === 'name') store.put('cfg:names', { ...s.names, [t.dataset.k]: t.value.trim() || (t.dataset.k === 'eu' ? 'Eu' : 'Esposa') });
    else if (b === 'me') { Store.prefs.set({ me: t.value }); toast('Salvo'); }
    else if (b === 'list') store.put('cfg:lists', { ...s.lists, [t.dataset.k]: t.value.split('\n').map((x) => x.trim()).filter(Boolean) });
    else if (b === 'import') { const f = t.files[0]; if (!f) return;
      ask('Importar substitui os dados atuais. Continuar?', { ok: 'Importar', danger: true }).then((yes) => {
        t.value = ''; if (!yes) return;
        f.text().then((x) => { store.importJSON(x); toast('Backup importado'); }).catch((err) => ask(String(err.message || err), { info: true })); }); }
    t.blur(); render();
  });

  // ---------- inicialização ----------
  store.onChange(render);
  const m = location.hash.match(/c=([a-z0-9]{16,64})/);
  render();
  if (m && !DEMO) { history.replaceState(null, '', location.pathname); if (m[1] !== store.code) setTimeout(() => joinWith(m[1]), 300); }
  if (store.code) { store.sync(); }
  store.startPolling();
  if (!DEMO && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
