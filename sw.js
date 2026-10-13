const C="barbaros-v5";
const CORE=["/","/painel","/manifest.webmanifest","/painel.webmanifest","/icons/icon-192.png","/icons/icon-512.png","/icons/apple-touch-icon.png","/icons/painel-192.png","/icons/painel-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET"||u.pathname.startsWith("/api/"))return;
  if(r.mode==="navigate"){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(u.pathname,cp));return res}).catch(()=>caches.match(u.pathname).then(m=>m||caches.match("/"))));return}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok&&(u.origin===location.origin||/fonts\.(googleapis|gstatic)|cdnjs/.test(r.url))){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})));
});
self.addEventListener("push",e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(x){d={body:e.data&&e.data.text()}}
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title||"Bárbaros Barbershop",{body:d.body||"",icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",tag:d.tag,renotify:!!d.tag,data:{url:d.url||"/"}}),
    self.clients.matchAll({type:"window"}).then(ws=>ws.forEach(w=>w.postMessage("atualizar")))
  ]));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();const url=(e.notification.data&&e.notification.data.url)||"/";
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{
    const alvo=new URL(url,self.location.origin);
    for(const w of ws){const wu=new URL(w.url);if(wu.pathname===alvo.pathname&&"focus" in w){w.postMessage("atualizar");return w.focus()}}
    return self.clients.openWindow(url);
  }));
});
