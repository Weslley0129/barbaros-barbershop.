import { temArmazenamento, SEM_ARMAZENAMENTO, body, send, index, fone11, setStatus, spNow, toMin, LOJA, INATIVO, pushAdmin, readJSON, quando } from "../lib/core.js";
// Cancelamento feito pelo cliente (até 30 min antes).
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { erro: "Use POST." });
  if (!temArmazenamento()) return send(res, 503, { erro: SEM_ARMAZENAMENTO });
  try {
    const b = body(req), fone = fone11(b.fone);
    const it = (await index()).find(x => x.id === b.id && x.fone === fone);
    if (!it) return send(res, 404, { erro: "Agendamento não encontrado." });
    if (INATIVO.includes(it.status)) return send(res, 200, { ok: true });
    const now = spNow(), antes = it.data > now.date || (it.data === now.date && it.i - now.min > LOJA.cancelarAteMin);
    if (!antes) return send(res, 400, { erro: "Cancelamento só até 30 min antes. Fale no WhatsApp." });
    await setStatus(it.id, "cancelado");
    const d = await readJSON(it.path);
    await pushAdmin({ title: "Agendamento cancelado", body: `${d?.nome || "Cliente"} cancelou ${quando(it.data, it.hora)}`, tag: "ag-" + it.id }).catch(() => {});
    send(res, 200, { ok: true });
  } catch (e) { console.error(e); send(res, 500, { erro: "Não foi possível cancelar agora." }); }
}
