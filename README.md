# Finanças do Casal

App web (PWA) baseado na planilha *Controle Financeiro do Casal*: gastos de cada pessoa, contas fixas que entram
sozinhas, parcelas e dívidas, vales × mercado, cartões com dia de fechamento, metas e dashboard mensal.
**Sem login** e com **dados compartilhados** entre duas pessoas por um link do casal. Funciona no iPhone/iPad (Safari),
Android e computador, e continua usável offline (sincroniza quando a conexão volta).

## Rodar

```bash
node server.js        # http://localhost:3000  (Node 18+, sem dependências)
npm test              # cálculos (conferidos com a planilha) + sincronização entre 2 aparelhos
```

Variáveis: `PORT` (padrão 3000) e `DATA_DIR` (padrão `./data`, onde ficam os dados do casal — use um disco persistente).

## Compartilhar entre duas pessoas

1. Pessoa 1: **Mais → Casal e sincronização → Criar link do casal** e envia o link.
2. Pessoa 2 abre o link no celular — os dados passam a ser os mesmos nos dois aparelhos.

O link contém um código secreto de 20 caracteres: quem o tiver acessa os dados (é isso que dispensa o login). Não divulgue.
Edições simultâneas são mescladas por registro (vence a mais recente), então lançamentos feitos ao mesmo tempo não se perdem.

## Publicar para usar no celular

O app precisa de HTTPS para instalar/funcionar offline. Qualquer host Node serve (Render, Railway, Fly.io…):
comando de start `node server.js`, com um volume persistente apontado por `DATA_DIR`.

**iPhone:** abra o endereço no Safari → Compartilhar → *Adicionar à Tela de Início*.

## Como os cálculos seguem a planilha

- Compra em cartão a partir do dia de fechamento entra no mês seguinte.
- Contas fixas entram pelo valor previsto até você lançar o pagamento (mesma categoria): o real substitui o previsto.
- Parcelas entram sozinhas no mês certo; um lançamento com a mesma categoria é reconhecido como a parcela (sem duplicar).
- Vales: o vale refeição cobre primeiro o mercado, depois o vale alimentação; o excedente é dividido proporcionalmente.

Arquivos: `engine.js` (cálculos), `merge.js`/`store.js` (dados e sincronização), `server.js`, `app.js` + `styles.css` (interface).
