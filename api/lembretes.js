import { index, readJSON, putJSON, spNow, INATIVO, pushCliente, pushAdmin, quando } from "../lib/core.js";
// Tarefa diária (18h de Brasília): lembra os clientes de amanhã e manda o resumo do dia ao barbeiro.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) { res.statusCode = 401; return res.end("unauthorized"); }
  const amanha = spNow(1).date;
  const items = (await index({ prefixes: [`b/${amanha}`] })).filter(x => !INATIVO.includes(x.status)).sort((a, b) => a.i - b.i);
  let enviados = 0;
  for (const it of items) {
    if (await readJSON(`lemb/${it.id}.json`)) continue;
    const d = await readJSON(it.path);
    enviados += await pushCliente(it.fone, { title: "Lembrete: amanhã é dia de Bárbaros ✂️", body: `${d?.servicos?.join(" + ") || "Seu horário"} ${quando(it.data, it.hora)}. Se precisar cancelar, avise até 30 min antes.`, tag: "lemb-" + it.id }).catch(() => 0);
    await putJSON(`lemb/${it.id}.json`, { t: Date.now() });
  }
  if (items.length) await pushAdmin({ title: `Amanhã: ${items.length} agendamento${items.length > 1 ? "s" : ""}`, body: `Primeiro às ${items[0].hora}. Toque para ver a agenda.`, tag: "resumo" }).catch(() => {});
  res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true, amanha, total: items.length, enviados }));
}
