import { temArmazenamento, SEM_ARMAZENAMENTO, body, send, subValida, subHash, putJSON, fone11 } from "../lib/core.js";
// Cliente ativa avisos no celular (confirmação e lembrete).
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { erro: "Use POST." });
  if (!temArmazenamento()) return send(res, 503, { erro: SEM_ARMAZENAMENTO });
  try {
  const b = body(req), fone = fone11(b.fone);
  if (!subValida(b.sub) || fone.length < 10) return send(res, 400, { erro: "Dados inválidos." });
  await putJSON(`subs/cli/${fone}/${subHash(b.sub)}.json`, b.sub);
  send(res, 200, { ok: true });
  } catch (e) { console.error(e); send(res, 500, { erro: "Falha ao salvar." }); }
}
