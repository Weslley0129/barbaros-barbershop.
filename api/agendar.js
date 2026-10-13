import { body, send, limpa, calcServicos, validaHorario, conflito, index, mesesPrefixos, bookingPath, putJSON, setStatus,
  fone11, toMin, novoId, BARBEIROS, LOJA, saldoCliente, pushAdmin, quando, brl } from "../lib/core.js";
// Recebe um agendamento do app do cliente, valida as regras da casa e avisa o barbeiro.
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { erro: "Use POST." });
  try {
    const b = body(req);
    const nome = limpa(b.nome, 60), fone = fone11(b.fone);
    if (!nome) return send(res, 400, { erro: "Digite seu nome." });
    if (fone.length < 10) return send(res, 400, { erro: "Digite um WhatsApp com DDD." });
    const sv = calcServicos(b.svcIds); if (!sv) return send(res, 400, { erro: "Escolha pelo menos um serviço." });
    if (!/^\d{2}:\d{2}$/.test(b.hora || "")) return send(res, 400, { erro: "Horário inválido." });
    const data = String(b.data || ""), i = toMin(b.hora);
    const erro = validaHorario(data, i, sv.min); if (erro) return send(res, 400, { erro });
    const items = await index({ prefixes: mesesPrefixos() });
    const ids = BARBEIROS.map(x => x.id);
    const pedido = b.barb && ids.includes(b.barb) ? [b.barb] : ids;
    const barb = pedido.find(id => !conflito(items, data, i, sv.min, id));
    if (!barb) return send(res, 409, { erro: "Esse horário acabou de ser ocupado. Escolha outro." });
    let id = /^[A-Z0-9]{5,12}$/.test(b.id || "") && !items.some(x => x.id === b.id) ? b.id : novoId();
    let cbUsado = Math.max(0, Math.min(Number(b.cbUsado) || 0, sv.preco));
    if (cbUsado > 0) { const todos = await index(); cbUsado = Math.min(cbUsado, await saldoCliente(todos, fone)); }
    const pay = b.pay === "app" ? "app" : "loja";
    const doc = { id, nome, fone, servicos: sv.servicos, svcIds: sv.ids, preco: sv.preco, min: sv.min, aPartir: sv.aPartir, data, hora: b.hora, barb,
      barbNome: b.barb && ids.includes(b.barb) ? BARBEIROS.find(x => x.id === barb).nome : "Quem estiver disponível",
      pay, cbUsado, cbGanho: pay === "app" ? Math.round((sv.preco - cbUsado) * LOJA.cashback * 100) / 100 : 0,
      criado: new Date().toISOString(), origem: "app", device: limpa(b.device, 40) };
    await putJSON(bookingPath(doc), doc);
    await setStatus(id, "pendente");
    await pushAdmin({ title: "Novo agendamento", body: `${nome} · ${sv.servicos.join(" + ")} · ${quando(data, b.hora)} · ${brl(sv.preco - cbUsado)}`, tag: "ag-" + id }).catch(e => console.error(e));
    send(res, 200, { ok: true, id, barb, cbUsado });
  } catch (e) { console.error(e); send(res, 500, { erro: "Não foi possível registrar agora. Tente de novo." }); }
}
