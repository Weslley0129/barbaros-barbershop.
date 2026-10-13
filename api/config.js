import { SITE_URL, PAINEL_URL, send } from "../lib/core.js";
// Endereços oficiais do app (públicos).
export default function handler(req, res) { send(res, 200, { site: SITE_URL, painel: PAINEL_URL, agendar: SITE_URL + "/#agendar", conta: SITE_URL + "/#conta" }); }
