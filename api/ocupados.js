import { index, mesesPrefixos, spNow, INATIVO, send } from "../lib/core.js";
// Horários ocupados (sem dados pessoais) para o app do cliente.
export default async function handler(req, res) {
  try {
    const hoje = spNow().date, dias = {};
    for (const it of await index({ prefixes: mesesPrefixos() })) {
      if (it.data < hoje || INATIVO.includes(it.status)) continue;
      (dias[it.data] ||= []).push({ i: it.i, f: it.i + it.min, b: it.barb });
    }
    send(res, 200, { dias });
  } catch (e) { console.error(e); send(res, 500, { erro: "Falha ao carregar horários." }); }
}
