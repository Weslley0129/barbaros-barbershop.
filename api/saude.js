import { temArmazenamento, putJSON, readJSON, remove, versaoAgenda, send, spNow } from "../lib/core.js";
// Verificação de saúde: grava, lê e apaga uma chave de teste no banco e confere se a configuração essencial existe.
// Não expõe dados de clientes nem segredos — só "ok" ou "falta".
export default async function handler(req, res) {
  const cfg = {
    banco: temArmazenamento() ? "ok" : "falta",
    pinPainel: process.env.ADMIN_PIN ? "ok" : "falta",
    notificacoes: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? "ok" : "falta",
    lembretes: process.env.CRON_SECRET ? "ok" : "falta",
  };
  const t0 = Date.now();
  let gravacao = "falha", erro = null;
  try {
    const k = "saude/teste.json", v = { t: t0 };
    await putJSON(k, v);
    const lido = await readJSON(k);
    await remove(k);
    gravacao = lido && lido.t === t0 ? "ok" : "falha (leitura diferente)";
  } catch (e) { erro = String(e.message || e).slice(0, 120); }
  let versao = null; try { versao = await versaoAgenda(); } catch {}
  const tudoOk = gravacao === "ok" && Object.values(cfg).every(x => x === "ok");
  send(res, tudoOk ? 200 : 503, { ok: tudoOk, gravacao, erro, ms: Date.now() - t0, versao, ...cfg, horaSP: spNow().date + " " + spNow().min });
}
