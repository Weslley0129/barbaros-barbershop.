# Bárbaros Barbershop

App de agendamento da Bárbaros Barbershop (PWA instalável no celular).

- `index.html` — o app completo (serviços, agendamento, Pix com QR Code, cashback, portfólio)
- `manifest.webmanifest`, `sw.js`, `icons/` — instalação no celular e funcionamento offline
- Publicado na Vercel como site estático.

## Endereços

| Para quem | Link |
|---|---|
| Clientes (bio do Instagram) | https://barbaros-barbershop.vercel.app |
| Área do cliente (Conta) | https://barbaros-barbershop.vercel.app/#conta |
| Painel do Barbeiro (com PIN) | https://barbaros-barbershop.vercel.app/painel |

Atalhos que levam ao painel: `/admin`, `/adm`, `/barbeiro`.
No servidor, os endereços ficam em `lib/core.js` (`SITE_URL`, `PAINEL_URL`) e podem ser trocados pelas variáveis de ambiente de mesmo nome na Vercel. `GET /api/config` devolve os endereços oficiais.
