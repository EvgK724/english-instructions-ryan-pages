/* English — шаг за шагом. Only local study assets are cached. */
const VERSION='20261108-5';
const BASE=self.registration.scope;
const PREFIX=`english-instructions-offline-${encodeURIComponent(new URL(BASE).pathname)}-`;
const CACHE=PREFIX+VERSION;
const META=new URL('./__offline_ready__',BASE).href;
let saving=null;
let networkRequests=0,cacheHits=0;
const networkFallbacks=[];
const url=path=>new URL(path,BASE).href;
async function metadata(cache){const res=await cache.match(META);return res?res.json():null;}
async function complete(cache,meta){if(!meta?.assets?.length)return false;const present=await Promise.all(meta.assets.map(path=>cache.match(url(path))));return present.every(Boolean);}
async function readyCache(checkAll=false){
  const names=(await caches.keys()).filter(n=>n.startsWith(PREFIX));const ready=[];
  for(const name of names){const cache=await caches.open(name),meta=await metadata(cache);if(meta&&(!checkAll||await complete(cache,meta)))ready.push({name,cache,meta});}
  ready.sort((a,b)=>b.meta.savedAt-a.meta.savedAt);return ready.find(x=>x.name===CACHE)||ready[0]||null;
}
async function status(){const ready=await readyCache(true);return{type:'STATUS',version:VERSION,ready:!!ready,cachedVersion:ready?.meta.version||null,count:ready?.meta.assets.length||0,savedAt:ready?.meta.savedAt||null,networkRequests,cacheHits,networkFallbacks};}
async function saveAll(send){
  const existing=await caches.open(CACHE),oldMeta=await metadata(existing);
  if(oldMeta&&await complete(existing,oldMeta)){send({type:'READY',version:VERSION,count:oldMeta.assets.length});return;}
  const res=await fetch(url('./offline-assets.json'),{cache:'no-store',credentials:'same-origin',redirect:'error'});networkRequests++;
  if(!res.ok)throw new Error('manifest');const manifest=await res.json();
  if(manifest.version!==VERSION||!Array.isArray(manifest.assets)||manifest.assets.length<20)throw new Error('version');
  if(manifest.assets.some(a=>!/^\.\/[a-zA-Z0-9/_.-]+$/.test(a.path)||a.path.includes('..')||!(/^[a-f0-9]{64}$/).test(a.sha256)))throw new Error('manifest');
  await caches.delete(CACHE);const candidate=await caches.open(CACHE);
  try{
    let done=0;
    for(const asset of manifest.assets){
      const response=await fetch(url(asset.path),{cache:'no-store',credentials:'same-origin',redirect:'error'});networkRequests++;
      if(!response.ok||response.status!==200)throw new Error('asset');
      const body=await response.arrayBuffer();
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==asset.sha256||body.byteLength!==asset.bytes)throw new Error('integrity');
      await candidate.put(url(asset.path),new Response(body,{status:200,headers:response.headers}));
      send({type:'PROGRESS',done:++done,total:manifest.assets.length});
    }
    const meta={version:VERSION,savedAt:Date.now(),assets:manifest.assets.map(a=>a.path)};
    if(!await complete(candidate,meta))throw new Error('incomplete');
    await candidate.put(META,new Response(JSON.stringify(meta),{headers:{'Content-Type':'application/json'}}));
    send({type:'READY',version:VERSION,count:meta.assets.length});
    await self.skipWaiting();
  }catch(error){await caches.delete(CACHE);throw error;}
}
self.addEventListener('install',()=>{});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE),meta=await metadata(cache);
  if(meta&&await complete(cache,meta)){for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);}
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  const port=event.ports[0];if(!port)return;const send=value=>port.postMessage(value);
  if(event.data?.type==='STATUS'){event.waitUntil(status().then(send).catch(()=>send({type:'STATUS',version:VERSION,ready:false,error:true})));return;}
  if(event.data?.type==='SAVE'){
    if(saving){send({type:'ERROR',code:'busy'});return;}
    saving=saveAll(send).catch(error=>send({type:'ERROR',code:error.name==='QuotaExceededError'?'quota':error.message==='version'?'version':'download'})).finally(()=>{saving=null;});event.waitUntil(saving);
  }
});
function rangeResponse(response,range){
  return response.arrayBuffer().then(buffer=>{
    const size=buffer.byteLength,match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
    const invalid=()=>new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    if(!match||(!match[1]&&!match[2]))return invalid();
    let start,end;
    if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();start=Math.max(0,size-suffix);end=size-1;}
    else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return invalid();
    const headers=new Headers(response.headers);headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
    return new Response(buffer.slice(start,end+1),{status:206,headers});
  });
}
self.addEventListener('fetch',event=>{
  const request=event.request,u=new URL(request.url);
  if(request.method!=='GET'||u.origin!==new URL(BASE).origin||!u.href.startsWith(BASE))return;
  if(u.pathname.endsWith('/sw.js')||u.pathname.endsWith('/offline-assets.json'))return;
  event.respondWith((async()=>{
    const ready=await readyCache();
    if(ready){
      const isHome=request.mode==='navigate'&&(u.pathname===new URL(BASE).pathname||u.pathname===new URL('./index.html',BASE).pathname);
      const cached=isHome?(await ready.cache.match(url('./app-shell.txt'))||await ready.cache.match(url('./index.html'))):await ready.cache.match(request,{ignoreSearch:false});
      if(cached){cacheHits++;if(isHome){const headers=new Headers(cached.headers);headers.set('Content-Type','text/html; charset=utf-8');return new Response(await cached.arrayBuffer(),{status:200,headers});}const range=request.headers.get('Range');return range?rangeResponse(cached,range):cached;}
    }
    networkRequests++;networkFallbacks.push(u.pathname);if(networkFallbacks.length>20)networkFallbacks.shift();return fetch(request);
  })());
});
