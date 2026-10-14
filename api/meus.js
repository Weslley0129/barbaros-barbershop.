import { temArmazenamento, SEM_ARMAZENAMENTO, index, saldoCliente, fone11, send } from "../lib/core.js";
// Situação dos agendamentos do cliente (só os códigos que ele tem no aparelho e que batem com o telefone).
export default async function handler(req, res) {
  if (!temArmazenamento()) return send(res, 503, { erro: SEM_ARMAZENAMENTO });
  try {
    const fone = fone11(req.query.fone), ids = String(req.query.ids || "").split(",").filter(Boolean).slice(0, 60);
    if (fone.length < 10 || !ids.length) return send(res, 200, { status: {} });
    const items = await index();
    const meus = items.filter(x => x.fone === fone && ids.includes(x.id));
    const status = Object.fromEntries(meus.map(x => [x.id, { status: x.status, pago: x.pago, data: x.data, hora: x.hora }]));
    const saldo = meus.length ? await saldoCliente(items, fone) : null;
    // códigos que não existem mais no servidor (agenda limpa/apagada): o app tira da lista do cliente
    const faltam = ids.filter(id => !items.some(x => x.id === id));
    send(res, 200, { status, saldo, faltam });
  } catch (e) { console.error(e); send(res, 500, { erro: "Falha ao consultar." }); }
}
