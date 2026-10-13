import crypto from "node:crypto";
import { temArmazenamento, SEM_ARMAZENAMENTO, remove, brl, body, send, index, listAll, readJSON, putJSON, setStatus, bookingPath, calcServicos, fone11, novoId, limpa, BARBEIROS,
  STATUS, LOJA, subValida, subHash, pushAdmin, pushCliente, quando } from "../lib/core.js";
// API do Painel do Barbeiro, protegida por PIN.
function autorizado(req) {
  const pin = String(req.headers["x-pin"] || ""), ok = String(process.env.ADMIN_PIN || "");
  if (!ok || pin.length !== ok.length) return false;
  return crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(ok));
}
const contar = async p => new Set((await listAll(p)).map(b => b.pathname.split("/").pop())).size;
export default async function handler(req, res) {
  if (!autorizado(req)) { await new Promise(r => setTimeout(r, 800)); return send(res, 401, { erro: "PIN incorreto." }); }
  if (!temArmazenamento()) {
    if (req.method === "GET") return send(res, 200, { items: [], installs: { app: 0, visitantes: 0, painel: 0 }, aviso: SEM_ARMAZENAMENTO });
    return send(res, 503, { erro: SEM_ARMAZENAMENTO });
  }
  try {
    if (req.method === "GET") {
      const [items, app, web, painel] = await Promise.all([index(), listAll("inst/cliente/app/"), listAll("inst/cliente/web/"), contar("inst/painel/app/")]);
      const appIds = new Set(app.map(b => b.pathname.split("/").pop())), visit = new Set([...appIds, ...web.map(b => b.pathname.split("/").pop())]);
      return send(res, 200, { items: items.map(({ path, ...x }) => x), installs: { app: appIds.size, visitantes: visit.size, painel } });
    }
    const b = body(req);
    if (b.action === "get") {
      const ids = (b.ids || []).slice(0, 80), items = await index(), docs = {};
      await Promise.all(items.filter(x => ids.includes(x.id)).map(async x => { const d = await readJSON(x.path); if (d) docs[x.id] = d; }));
      return send(res, 200, { docs });
    }
    if (b.action === "status") {
      if (!STATUS.includes(b.status)) return send(res, 400, { erro: "Status inválido." });
      const it = (await index()).find(x => x.id === b.id); if (!it) return send(res, 404, { erro: "Não encontrado." });
      await setStatus(it.id, b.status);
      if (b.status === "confirmado") await pushCliente(it.fone, { title: "Horário confirmado ✂️", body: `Te esperamos ${quando(it.data, it.hora)} na Bárbaros.`, tag: "ag-" + it.id }).catch(() => {});
      let enviados = 0;
      if (b.status === "concluido" || b.status === "faltou") {
        const d = await readJSON(it.path), nome = (d?.nome || "").split(" ")[0] || "cliente";
        if (b.status === "concluido") {
          const cb = d?.pay === "app" ? Math.round(((d.preco || 0) - (d.cbUsado || 0)) * LOJA.cashback * 100) / 100 : 0;
          enviados = await pushCliente(it.fone, { title: `Valeu pela visita, ${nome}! ✂️`, body: `Foi um prazer cuidar do seu visual na Bárbaros.${cb ? ` Você ganhou ${brl(cb)} de cashback para o próximo corte.` : ""} Quando quiser, agende o próximo pelo app.`, tag: "obrigado-" + it.id, url: "/#agendar" }).catch(() => 0);
        } else {
          enviados = await pushCliente(it.fone, { title: "Sentimos sua falta hoje ✂️", body: `Seu horário das ${it.hora} passou, ${nome}. Toque aqui para escolher um novo horário.`, tag: "falta-" + it.id, url: "/#agendar" }).catch(() => 0);
        }
        return send(res, 200, { ok: true, enviados });
      }
      if (b.status === "cancelado") await pushCliente(it.fone, { title: "Horário cancelado", body: `Seu horário de ${quando(it.data, it.hora)} foi cancelado pela barbearia. Fale com a gente no WhatsApp.`, tag: "ag-" + it.id }).catch(() => {});
      return send(res, 200, { ok: true });
    }
    if (b.action === "pago") { await putJSON(`pago/${b.id}.json`, { t: Date.now() }); return send(res, 200, { ok: true }); }
    if (b.action === "novo") {
      const a = b.booking || {}, sv = calcServicos(a.svcIds); if (!sv) return send(res, 400, { erro: "Escolha o serviço." });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.data || "") || !/^\d{2}:\d{2}$/.test(a.hora || "")) return send(res, 400, { erro: "Dia ou hora inválidos." });
      const items = await index();
      const id = /^[A-Z0-9]{5,12}$/.test(a.id || "") && !items.some(x => x.id === a.id) ? a.id : novoId();
      const preco = Number.isFinite(+a.preco) && +a.preco >= 0 ? +a.preco : sv.preco, cbUsado = Math.max(0, +a.cbUsado || 0);
      const barb = BARBEIROS.some(x => x.id === a.barb) ? a.barb : BARBEIROS[0].id;
      const doc = { id, nome: limpa(a.nome, 60), fone: fone11(a.fone), servicos: sv.servicos, svcIds: sv.ids, preco, min: sv.min, aPartir: sv.aPartir,
        data: a.data, hora: a.hora, barb, barbNome: BARBEIROS.find(x => x.id === barb).nome, pay: a.pay === "app" ? "app" : "loja", cbUsado,
        cbGanho: a.pay === "app" ? Math.round((preco - cbUsado) * LOJA.cashback * 100) / 100 : 0, criado: new Date().toISOString(), origem: "painel" };
      await putJSON(bookingPath(doc), doc); await setStatus(id, "confirmado");
      return send(res, 200, { ok: true, id });
    }
    if (b.action === "apagar") {
      const id = String(b.id || ""); if (!/^[A-Z0-9]{5,12}$/.test(id)) return send(res, 400, { erro: "Código inválido." });
      const alvo = [...(await index()).filter(x => x.id === id).map(x => x.path), ...(await listAll(`st/${id}/`)).map(x => x.pathname), ...(await listAll(`pago/${id}.json`)).map(x => x.pathname), ...(await listAll(`lemb/${id}.json`)).map(x => x.pathname)];
      for (const p of alvo) await remove(p);
      return send(res, 200, { ok: true, apagados: alvo.length });
    }
    if (b.action === "sub") {
      if (!subValida(b.sub)) return send(res, 400, { erro: "Inscrição inválida." });
      await putJSON(`subs/admin/${subHash(b.sub)}.json`, b.sub);
      return send(res, 200, { ok: true });
    }
    if (b.action === "teste") { const n = await pushAdmin({ title: "Notificações ativadas ✅", body: "Você vai receber aqui os novos agendamentos e cancelamentos." }); return send(res, 200, { ok: true, enviados: n }); }
    send(res, 400, { erro: "Ação desconhecida." });
  } catch (e) { console.error(e); send(res, 500, { erro: "Falha no servidor." }); }
}
