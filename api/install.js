import { body, send, putJSON } from "../lib/core.js";
// Conta aparelhos: visitantes (navegador) e apps instalados na tela inicial.
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { erro: "Use POST." });
  const b = body(req);
  const device = String(b.device || ""), modo = b.modo === "app" ? "app" : "web", app = b.app === "painel" ? "painel" : "cliente";
  if (!/^[a-z0-9]{8,40}$/.test(device)) return send(res, 400, { erro: "Dispositivo inválido." });
  await putJSON(`inst/${app}/${modo}/${device}.json`, { t: new Date().toISOString() });
  send(res, 200, { ok: true });
}
