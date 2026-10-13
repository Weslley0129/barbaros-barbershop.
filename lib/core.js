// Núcleo do servidor da Bárbaros: armazenamento (Vercel Blob privado), regras da agenda e notificações push.
import crypto from "node:crypto";
import webpush from "web-push";

export const TZ = "America/Sao_Paulo";
export const LOJA = {
  abre: [2, 3, 4, 5, 6], // ter–sáb (0 = dom)
  inicio: 9 * 60, fim: 19 * 60, almoco: [12 * 60 + 30, 13 * 60 + 30],
  antecedenciaMin: 60, cancelarAteMin: 30, cashback: 0.05, diasAgenda: 21,
};
export const BARBEIROS = [{ id: "b1", nome: "Barbeiro titular" }];
export const SERV = {
  corte: { nome: "Corte", preco: 40, min: 40 },
  barba: { nome: "Barba", preco: 20, min: 30 },
  sob: { nome: "Sobrancelha", preco: 10, min: 10, aPartir: true },
  cb: { nome: "Corte + Barba", preco: 60, min: 60 },
  cbs: { nome: "Corte + Barba + Sobrancelha", preco: 70, min: 70, aPartir: true },
  col: { nome: "Coloração · só aplicação", preco: 40, min: 40 },
  colp: { nome: "Coloração com produto da casa", preco: 60, min: 40 },
  luzes: { nome: "Luzes", preco: 90, min: 60, aPartir: true },
};
export const STATUS = ["pendente", "confirmado", "concluido", "cancelado", "faltou"];
export const INATIVO = ["cancelado", "faltou"];

/* ---------- armazenamento ---------- */
// Em produção usa @vercel/blob (store privado). Com MOCK_BLOB=1 usa memória (testes locais).
const MEM = globalThis.__MEMBLOB || (globalThis.__MEMBLOB = new Map());
let blob = null;
async function B() { if (!blob) blob = await import("@vercel/blob"); return blob; }
const mock = () => process.env.MOCK_BLOB === "1";
// Há armazenamento configurado? (Blob conectado ao projeto na Vercel)
export const temArmazenamento = () => mock() || !!process.env.BLOB_READ_WRITE_TOKEN || !!(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN);
export const SEM_ARMAZENAMENTO = "A agenda online ainda não foi ativada (armazenamento não conectado na Vercel).";

export async function putJSON(path, obj) {
  if (mock()) { MEM.set(path, { body: JSON.stringify(obj), at: new Date() }); return; }
  const { put } = await B();
  await put(path, JSON.stringify(obj), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
}
export async function readJSON(path) {
  if (mock()) { const v = MEM.get(path); return v ? JSON.parse(v.body) : null; }
  const { get } = await B();
  const r = await get(path, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text());
}
export async function listAll(prefix) {
  if (mock()) return [...MEM.keys()].filter(k => k.startsWith(prefix)).map(k => ({ pathname: k, url: k, uploadedAt: MEM.get(k).at }));
  const { list } = await B();
  let out = [], cursor;
  do { const r = await list({ prefix, cursor, limit: 1000 }); out = out.concat(r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}
export async function remove(pathOrUrl) {
  if (mock()) { MEM.delete(pathOrUrl); return; }
  const { del } = await B(); await del(pathOrUrl);
}

/* ---------- tempo em São Paulo ---------- */
export function spNow(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour) * 60 + (+p.minute) };
}
export const dow = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const hm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
export const toMin = s => { const [a, b] = s.split(":").map(Number); return a * 60 + b; };
export const fone11 = s => String(s || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(-11);
export const brl = v => "R$ " + (Math.round(v * 100) / 100).toFixed(2).replace(".", ",");
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const quando = (data, hora) => { const [, m, d] = data.split("-"); return `${DOW[dow(data)]} ${d}/${m} às ${hora}`; };
export const novoId = () => (Date.now().toString(36).slice(-5) + crypto.randomBytes(3).toString("hex").slice(0, 3)).toUpperCase();

/* ---------- índice de agendamentos (lido do nome dos arquivos) ---------- */
// b/<data>/<HHMM>-<min>-<barb>-<id>-<fone>.json
const RX = /^b\/(\d{4}-\d{2}-\d{2})\/(\d{4})-(\d+)-([a-z0-9]+)-([A-Z0-9]+)-(\d{0,11})\.json$/;
export const bookingPath = b => `b/${b.data}/${b.hora.replace(":", "")}-${b.min}-${b.barb}-${b.id}-${fone11(b.fone)}.json`;

export async function index({ prefixes = ["b/"] } = {}) {
  const [bl, st, pg] = await Promise.all([
    Promise.all(prefixes.map(listAll)).then(a => a.flat()),
    listAll("st/"), listAll("pago/"),
  ]);
  const status = {};
  for (const s of st) { const m = s.pathname.match(/^st\/([A-Z0-9]+)\/(\d+)-([a-z]+)\.json$/); if (!m) continue; const [, id, ts, v] = m; if (!status[id] || +ts > status[id].ts) status[id] = { ts: +ts, v }; }
  const pago = new Set(pg.map(p => (p.pathname.match(/^pago\/([A-Z0-9]+)\.json$/) || [])[1]).filter(Boolean));
  const out = [];
  for (const b of bl) {
    const m = b.pathname.match(RX); if (!m) continue;
    const [, data, hhmm, min, barb, id, fone] = m;
    const i = +hhmm.slice(0, 2) * 60 + +hhmm.slice(2);
    out.push({ id, data, hora: hm(i), i, min: +min, barb, fone, path: b.pathname, status: status[id]?.v || "pendente", pago: pago.has(id) });
  }
  return out;
}
export const mesesPrefixos = () => { const a = spNow().date.slice(0, 7), b = spNow(LOJA.diasAgenda + 2).date.slice(0, 7); return [...new Set([`b/${a}`, `b/${b}`])]; };

export async function setStatus(id, v) { await putJSON(`st/${id}/${Date.now()}-${v}.json`, { v }); }

/* ---------- regras ---------- */
export function calcServicos(ids) {
  const set = [...new Set((ids || []).filter(x => SERV[x]))];
  if (!set.length) return null;
  const list = set.map(x => SERV[x]);
  let min = list.reduce((a, s) => a + s.min, 0);
  if (set.includes("corte") && set.includes("barba")) min -= 10;
  return { ids: set, servicos: list.map(s => s.nome), preco: list.reduce((a, s) => a + s.preco, 0), min, aPartir: list.some(s => s.aPartir) };
}
export function validaHorario(data, i, min, { admin = false } = {}) {
  const now = spNow(), lim = spNow(LOJA.diasAgenda).date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Data inválida.";
  if (admin) return null;
  if (data < now.date || data > lim) return "Escolha uma data dentro das próximas 3 semanas.";
  if (!LOJA.abre.includes(dow(data))) return "A barbearia não abre nesse dia.";
  const f = i + Math.max(min, 10);
  if (i < LOJA.inicio || f > LOJA.fim) return "Fora do horário de funcionamento.";
  if (i < LOJA.almoco[1] && f > LOJA.almoco[0]) return "Esse horário cai no almoço.";
  if (data === now.date && i < now.min + LOJA.antecedenciaMin) return "Agende com pelo menos 1h de antecedência.";
  return null;
}
export function conflito(items, data, i, min, barb, ignoreId) {
  const f = i + Math.max(min, 10);
  return items.some(x => x.id !== ignoreId && x.data === data && !INATIVO.includes(x.status) && x.barb === barb && i < x.i + x.min && f > x.i);
}
export async function saldoCliente(items, fone) {
  const meus = items.filter(x => x.fone && x.fone === fone11(fone));
  const docs = await Promise.all(meus.map(x => readJSON(x.path)));
  let cb = 0;
  meus.forEach((x, k) => {
    const d = docs[k]; if (!d) return;
    const pago = (d.preco || 0) - (d.cbUsado || 0);
    if (x.status === "concluido" && d.pay === "app") cb += Math.round(pago * LOJA.cashback * 100) / 100;
    if (x.status !== "cancelado") cb -= d.cbUsado || 0;
  });
  return Math.max(0, Math.round(cb * 100) / 100);
}

/* ---------- push ---------- */
let vapidOk = false;
function vapid() {
  if (!vapidOk && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://barbaros-barbershop.vercel.app", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    vapidOk = true;
  }
  return vapidOk;
}
export const subHash = sub => crypto.createHash("sha1").update(String(sub.endpoint)).digest("hex").slice(0, 16);
export function subValida(sub) { return sub && typeof sub.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.keys && sub.keys.p256dh && sub.keys.auth; }
export async function pushTo(prefix, payload) {
  if (mock()) { (globalThis.__PUSHES ||= []).push({ prefix, payload }); return 1; }
  if (!vapid()) return 0;
  const subs = await listAll(prefix);
  let n = 0;
  await Promise.all(subs.map(async b => {
    const s = await readJSON(b.pathname); if (!s) return;
    try { await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 60 * 60 * 12 }); n++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await remove(b.pathname).catch(() => {}); }
  }));
  return n;
}
export const pushAdmin = p => pushTo("subs/admin/", { url: "/painel", ...p });
export const pushCliente = (fone, p) => fone11(fone) ? pushTo(`subs/cli/${fone11(fone)}/`, { url: "/#conta", ...p }) : 0;

/* ---------- http ---------- */
export function body(req) { const b = req.body; if (!b) return {}; if (typeof b === "string") { try { return JSON.parse(b); } catch { return {}; } } return b; }
export function send(res, code, obj) { res.statusCode = code; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(obj)); }
export const limpa = (s, n = 80) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
