/* Motor de cálculo — replica as fórmulas da planilha "Controle Financeiro do Casal".
   Sem dependência de DOM: roda no navegador (global Engine) e no Node (testes). */
(function (root) {
  'use strict';

  const WHO = { eu: 'Eu', esp: 'Esposa' };

  // ---------- datas (sempre strings ISO, sem fuso) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const monthKey = (y, m) => `${y}-${pad(m)}`;
  const keyOf = (iso) => iso.slice(0, 7);
  const parseKey = (k) => ({ y: +k.slice(0, 4), m: +k.slice(5, 7) });
  const monthIdx = (k) => { const p = parseKey(k); return p.y * 12 + p.m - 1; };
  const addMonths = (k, n) => { const i = monthIdx(k) + n; return monthKey(Math.floor(i / 12), (i % 12) + 1); };
  const daysIn = (k) => { const p = parseKey(k); return new Date(p.y, p.m, 0).getDate(); };
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

  // ---------- cartões ----------
  const cardByName = (st, name) => st.cards.find((c) => c.name === name);

  /** Compra no cartão a partir do dia de fechamento entra no mês seguinte. */
  function entraNoMes(st, iso, pay) {
    const k = keyOf(iso);
    const card = cardByName(st, pay);
    if (card && num(card.close) > 0 && +iso.slice(8, 10) >= card.close) return addMonths(k, 1);
    return k;
  }

  // sufixo mostrado ao lado de itens da segunda pessoa (usa o nome configurado)
  const tagOf = (st, who) => (who === WHO.esp ? ` (${(st.names && st.names.esp) || 'esposa'})` : '');

  const listOf = (st, who) => (who === WHO.esp ? st.esp : st.eu);

  /** Lançamentos de uma pessoa que entram em `month`. */
  function logged(st, who, month) {
    return listOf(st, who).filter((e) => e.date && entraNoMes(st, e.date, e.pay) === month);
  }
  const loggedSum = (st, who, month, cat) =>
    logged(st, who, month).filter((e) => e.cat === cat).reduce((s, e) => s + num(e.val), 0);

  // ---------- contas fixas ----------
  function fixedInfo(st, f, month, today) {
    const lancado = round2(loggedSum(st, f.who, month, f.name));
    const pendente = lancado > 0 ? 0 : num(f.val);
    let status = 'Pago';
    if (!(lancado > 0)) {
      status = 'Pendente';
      if (f.due && (today || todayISO()) > `${month}-${pad(Math.min(f.due, daysIn(month)))}`) status = 'Atrasado';
    }
    return { lancado, pendente, noGasto: lancado > 0 ? lancado : num(f.val), status };
  }

  // ---------- parcelas e dívidas ----------
  function installInfo(st, p, month, today) {
    const complete = p.desc && num(p.val) > 0 && num(p.n) > 0 && num(p.total) > 0 && p.start;
    if (!complete) {
      return { complete: false, active: false, noMes: 0, pendente: 0, status: 'Preencha os dados', label: '—',
        restam: null, falta: null, termina: null, venc: 'A negociar' };
    }
    const P = monthIdx(month) - monthIdx(keyOf(p.start));
    const Q = p.n + P;
    const active = P >= 0 && Q <= p.total;
    const noMes = active ? p.val : 0;
    const restam = P < 0 ? p.total - p.n + 1 : Math.max(p.total - Q + 1, 0);
    const falta = round2(restam * p.val);
    const termina = addMonths(keyOf(p.start), p.total - p.n);

    // evita duplicar: pagamento lançado com a mesma categoria é reconhecido como a parcela
    let pendente = 0;
    if (active) {
      const isGeneral = st.lists.general.includes(p.cat);
      if (!isGeneral) {
        pendente = Math.max(p.val - loggedSum(st, p.who, month, p.cat), 0);
      } else {
        const hit = logged(st, p.who, month).some((e) => e.cat === p.cat && Math.abs(num(e.val) - p.val) <= 0.005);
        pendente = hit ? 0 : p.val;
      }
      pendente = round2(pendente);
    }
    let status;
    if (P < 0) status = 'A iniciar';
    else if (Q > p.total) status = 'Quitado';
    else if (noMes > 0 && pendente < 0.005) status = 'Paga no mês';
    else if (Q === p.total) status = 'Última parcela';
    else status = 'Em andamento';
    return { complete: true, active, noMes, pendente, status, restam, falta, termina,
      label: active ? `${Q}/${p.total}` : '—', venc: p.due ? `dia ${p.due}` : '—' };
  }

  // ---------- resumo por pessoa/mês ----------
  /** Gastos de `who` em `month`: lançados + contas fixas previstas + parcelas pendentes, por categoria. */
  function spending(st, who, month, today) {
    const byCat = {};
    const add = (c, v) => { if (v) byCat[c] = (byCat[c] || 0) + v; };
    let lancado = 0, fixas = 0, parcelas = 0;
    for (const e of logged(st, who, month)) { add(e.cat, num(e.val)); lancado += num(e.val); }
    for (const f of st.fixed.filter((x) => x.who === who && x.name)) {
      const i = fixedInfo(st, f, month, today); add(f.name, i.pendente); fixas += i.pendente;
    }
    for (const p of st.inst.filter((x) => x.who === who)) {
      const i = installInfo(st, p, month, today); add(p.cat, i.pendente); parcelas += i.pendente;
    }
    return { total: round2(lancado + fixas + parcelas), lancado, fixas, parcelas, byCat };
  }

  const salaryOf = (st, month) => {
    const s = st.sal[month] || {};
    const inRange = monthIdx(month) >= monthIdx(st.firstMonth);
    const vale = (v, dflt) => (v == null || v === '' ? (inRange ? num(dflt) : 0) : num(v));
    return { eu: num(s.eu), esp: num(s.esp), vr: vale(s.vr, st.vales && st.vales.vr), va: vale(s.va, st.vales && st.vales.va) };
  };

  function topCategories(byCat, total, n = 5) {
    const arr = Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const top = arr.slice(0, n);
    const outros = Math.max(total - top.reduce((s, x) => s + x.value, 0), 0);
    if (outros > 0.005) top.push({ name: 'Outros', value: round2(outros) });
    return top;
  }

  /** Gastos totais (casal) de um mês — usado na evolução e no acumulado. */
  function monthTotals(st, month, today) {
    const g1 = spending(st, WHO.eu, month, today).total;
    const g2 = spending(st, WHO.esp, month, today).total;
    const s = salaryOf(st, month);
    const receitas = s.eu + s.esp + s.vr + s.va;
    return { receitas, gastos: round2(g1 + g2), gEu: g1, gEsp: g2, saldo: round2(receitas - g1 - g2) };
  }

  // ---------- visão geral do mês ----------
  function summary(st, month, today) {
    today = today || todayISO();
    const eu = spending(st, WHO.eu, month, today);
    const esp = spending(st, WHO.esp, month, today);
    const sal = salaryOf(st, month);
    const receitas = sal.eu + sal.esp + sal.vr + sal.va;
    const gastos = round2(eu.total + esp.total);
    const saldo = round2(receitas - gastos);

    const prevKey = addMonths(month, -1);
    const prev = monthTotals(st, prevKey, today);
    const hasPrev = monthIdx(prevKey) >= monthIdx(st.firstMonth);
    const prevData = hasPrev ? prev : { receitas: 0, gastos: 0, saldo: 0 };

    // vales x mercado
    const mEu = round2(eu.byCat['Mercado'] || 0), mEsp = round2(esp.byCat['Mercado'] || 0);
    const mercado = round2(mEu + mEsp);
    const valeEu = Math.min(mercado, sal.vr);
    const valeEsp = Math.min(mercado - valeEu, sal.va);
    const excedente = round2(Math.max(mercado - sal.vr - sal.va, 0));
    const excEu = mercado === 0 ? 0 : round2((excedente * mEu) / mercado);
    const excEsp = round2(excedente - excEu);
    const coberEu = round2(mEu - excEu), coberEsp = round2(mEsp - excEsp);
    const saiSalEu = round2(eu.total - coberEu), saiSalEsp = round2(esp.total - coberEsp);

    // acumulado no ano (soma da sobra de jan até o mês)
    const y = parseKey(month).y;
    let acumulado = 0;
    for (let m = 1; m <= parseKey(month).m; m++) {
      const k = monthKey(y, m);
      if (monthIdx(k) < monthIdx(st.firstMonth)) continue;
      acumulado += monthTotals(st, k, today).saldo;
    }

    // cartões no mês
    const cartoes = st.cards.map((c) => {
      const f = (who) => round2(logged(st, who, month).filter((e) => e.pay === c.name).reduce((s, e) => s + num(e.val), 0));
      const a = f(WHO.eu), b = f(WHO.esp);
      return { name: c.name, close: c.close, due: c.due, eu: a, esp: b, total: round2(a + b) };
    });

    // a pagar no mês
    const aPagar = [];
    st.fixed.filter((f) => f.name).forEach((f) => {
      const i = fixedInfo(st, f, month, today);
      if (i.status !== 'Pago') aPagar.push({ key: (f.due || 99) * 100, nome: f.name + tagOf(st, f.who),
        valor: num(f.val), venc: f.due ? `dia ${f.due}` : '—', status: i.status });
    });
    st.inst.filter((p) => p.desc).forEach((p) => {
      const i = installInfo(st, p, month, today);
      if (!i.complete) { aPagar.push({ key: 10000, nome: `${p.desc}${tagOf(st, p.who)} — a negociar`, valor: null, venc: '—', status: 'A negociar' }); return; }
      if (i.active && i.pendente > 0.005) {
        const late = p.due && today > `${month}-${pad(Math.min(p.due, daysIn(month)))}`;
        aPagar.push({ key: (p.due || 99) * 100, nome: `${p.desc} ${i.label}${tagOf(st, p.who)}`,
          valor: i.pendente, venc: i.venc, status: late ? 'Atrasado' : 'Pendente' });
      }
    });
    aPagar.sort((a, b) => a.key - b.key);
    const aPagarTotal = round2(aPagar.reduce((s, x) => s + num(x.valor), 0));

    const insts = st.inst.map((p) => installInfo(st, p, month, today));
    return {
      month, receitas, gastos, saldo, sal,
      prev: prevData, hasPrev, acumulado: round2(acumulado),
      eu, esp,
      topEu: topCategories(eu.byCat, eu.total), topEsp: topCategories(esp.byCat, esp.total),
      mercado: { eu: mEu, esp: mEsp, total: mercado, valeEu, valeEsp, excedente, excEu, excEsp, coberEu, coberEsp,
        sobra: round2(sal.vr + sal.va - valeEu - valeEsp) },
      sobraEu: round2(sal.eu - saiSalEu), sobraEsp: round2(sal.esp - saiSalEsp),
      pctEu: sal.eu > 0 ? saiSalEu / sal.eu : 0, pctEsp: sal.esp > 0 ? saiSalEsp / sal.esp : 0,
      saiSalEu, saiSalEsp,
      cartoes, aPagar, aPagarTotal,
      parcelasAtivas: insts.filter((i) => i.complete && i.status !== 'Quitado').length,
      faltaParcelas: round2(insts.reduce((s, i) => s + num(i.falta), 0)),
    };
  }

  /** Série dos últimos 12 meses terminando em `month`. */
  function evolution(st, month, today) {
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const k = addMonths(month, -i);
      const t = monthTotals(st, k, today || todayISO());
      out.push({ month: k, receitas: t.receitas, gastos: t.gastos, saldo: t.saldo });
    }
    return out;
  }

  const api = { WHO, monthKey, keyOf, parseKey, monthIdx, addMonths, daysIn, todayISO, round2, entraNoMes, logged,
    fixedInfo, installInfo, spending, salaryOf, monthTotals, summary, evolution };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
