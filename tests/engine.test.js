const assert = require('assert');
const E = require('../engine.js');
const S = require('../store.js');
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.005, `${m}: esperado ${b}, veio ${a}`);

const st = S.defaults();
const sm = E.summary(st, '2026-11', '2026-11-20');

// valores conferidos à mão contra as fórmulas da planilha original
near(sm.eu.total, 3642.87, 'gastos eu');          // 7 lançamentos; fixas e parcela Eu já lançadas
near(sm.esp.total, 1515.9, 'gastos esposa');      // 9 contas fixas (815,90) + parcela empréstimo (700)
near(sm.gastos, 5158.77, 'gastos casal');
near(sm.receitas, 10798, 'receitas');             // 5500 + 4400 + vales 738 + 160
near(sm.saldo, 5639.23, 'saldo');
near(sm.mercado.valeEu, 738, 'vale refeição usado'); // mercado 870 > vale 738
near(sm.mercado.valeEsp, 132, 'vale alimentação cobre o resto');
near(sm.mercado.excedente, 0, 'mercado dentro dos dois vales');
near(sm.mercado.sobra, 28, 'vale que sobrou');
near(sm.saiSalEu, 3642.87 - 870, 'gasto que sai do salário');

// cartão: compra no dia >= fechamento entra no mês seguinte
assert.strictEqual(E.entraNoMes(st, '2026-11-04', 'Cartão Inter'), '2026-11');
assert.strictEqual(E.entraNoMes(st, '2026-11-05', 'Cartão Inter'), '2026-12');
assert.strictEqual(E.entraNoMes(st, '2026-12-31', 'Cartão Porto Seguro'), '2027-01');
assert.strictEqual(E.entraNoMes(st, '2026-11-05', 'Pix'), '2026-11');

// parcelas: empréstimo 2/3 em nov → 3/3 em dez → quitado em jan
const p = st.inst[0];
assert.strictEqual(E.installInfo(st, p, '2026-12', '2026-12-01').label, '3/3');
assert.strictEqual(E.installInfo(st, p, '2027-01', '2027-01-01').status, 'Quitado');
assert.strictEqual(E.installInfo(st, st.inst[2], '2026-11').status, 'Preencha os dados');
// pagamento lançado reconhecido como a parcela (não duplica) em nov; em dez entra sozinha
near(E.installInfo(st, p, '2026-11', '2026-11-20').pendente, 0, 'parcela já lançada');
near(E.installInfo(st, p, '2026-12', '2026-12-01').pendente, 437.97, 'parcela de dezembro');

// conta fixa: sem lançamento fica pendente/atrasada; lançamento troca previsto por real
const luz = st.fixed[0];
assert.strictEqual(E.fixedInfo(st, luz, '2026-11', '2026-11-20').status, 'Pago');
assert.strictEqual(E.fixedInfo(st, luz, '2026-12', '2026-12-09').status, 'Pendente');
assert.strictEqual(E.fixedInfo(st, luz, '2026-12', '2026-12-11').status, 'Atrasado');

// mês anterior ao primeiro mês da planilha não gera comparação
assert.strictEqual(sm.hasPrev, false);
assert.strictEqual(E.evolution(st, '2026-11').length, 12);
console.log('engine: todos os testes passaram');
