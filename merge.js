/* Regra de mescla compartilhada por cliente e servidor.
   Cada registro: { t: instante da edição, v: valor, del: true se apagado, s: nº de sequência do servidor }.
   Vence a edição mais recente; empate resolve de forma determinística. */
(function (root) {
  'use strict';
  const wins = (a, b) => {                      // a (novo) vence b (atual)?
    if (!b) return true;
    if (a.t !== b.t) return a.t > b.t;
    return JSON.stringify([a.del, a.v]) > JSON.stringify([b.del, b.v]);
  };
  const valid = (k, it) => typeof k === 'string' && k.length < 80 && it && typeof it.t === 'number' && isFinite(it.t);
  /** Mescla `incoming` em `items`. `nextSeq` (opcional) carimba o que mudou. Devolve as chaves alteradas. */
  function mergeItems(items, incoming, nextSeq) {
    const changed = [];
    for (const [k, it] of Object.entries(incoming || {})) {
      if (!valid(k, it)) continue;
      if (wins(it, items[k])) {
        items[k] = { t: it.t, v: it.del ? null : it.v, del: !!it.del };
        if (nextSeq) items[k].s = nextSeq(); else if (it.s != null) items[k].s = it.s;
        changed.push(k);
      }
    }
    return changed;
  }
  const api = { mergeItems, wins };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Merge = api;
})(typeof self !== 'undefined' ? self : this);
