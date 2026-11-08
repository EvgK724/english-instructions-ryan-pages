const $=id=>document.getElementById(id);
let registration=null,saving=false,ready=false,currentVersionReady=false,refreshEpoch=0;
function show(text){$('offline-status').textContent=text;}
function request(worker,type,onProgress){return new Promise((resolve,reject)=>{
  if(!worker)return reject(new Error('worker'));
  const channel=new MessageChannel();let timer;
  function timeout(){clearTimeout(timer);timer=setTimeout(()=>{channel.port1.close();reject(new Error('timeout'));},90000);}
  timeout();channel.port1.onmessage=event=>{timeout();const data=event.data;if(data.type==='PROGRESS'){onProgress?.(data);return;}clearTimeout(timer);channel.port1.close();data.type==='ERROR'?reject(new Error(data.code)):resolve(data);};
  worker.postMessage({type},[channel.port2]);
});}
function buttonState(){
  $('save-offline').disabled=saving||!registration;
  $('save-offline').textContent=saving?'Сохраняем…':registration?.waiting?'Скачать обновление':ready&&!currentVersionReady?'Скачать текущую версию':ready?'Проверить сохранение':'Сохранить весь набор';
  $('offline-shortcut').textContent=ready?'✓ Без интернета':'↓ Сохранить офлайн';
}
async function refresh(){
  if(!registration||saving)return;
  const epoch=++refreshEpoch;
  try{const state=await request(registration.active,'STATUS');if(epoch!==refreshEpoch||saving)return;Object.assign($('offline-status').dataset,{version:state.version,cachedVersion:state.cachedVersion||'',files:state.count,cacheHits:state.cacheHits,networkRequests:state.networkRequests});ready=state.ready;currentVersionReady=state.ready&&state.cachedVersion===state.version;
    if(registration.waiting)show('Доступно обновление. Сначала скачаем весь новый набор; текущий сохранится до завершения.');
    else if(state.ready&&state.cachedVersion===state.version)show('Весь набор сохранён: 12 карточек, голос Ryan, шрифты и оформление. Можно заниматься без интернета в этом браузере.');
    else if(state.ready){ready=true;show('Предыдущий набор сохранён. Скачайте текущую версию, пока есть интернет.');$('save-offline').textContent='Скачать текущую версию';}
    else show('Сохраните весь набор один раз: карточки, Ryan и оформление будут доступны без интернета.');
  }catch{if(epoch!==refreshEpoch||saving)return;ready=false;currentVersionReady=false;show('Не удалось проверить сохранение. Откройте приложение с интернетом и повторите попытку.');}
  buttonState();
}
async function save(){
  if(!registration||saving)return;++refreshEpoch;saving=true;buttonState();show('Начинаем сохранение всего набора…');
  try{
    const isUpdate=!!registration.waiting;
    const worker=registration.waiting||registration.active;
    await request(worker,'SAVE',p=>show(`Сохраняем файлы: ${p.done} из ${p.total}…`));
    ready=true;currentVersionReady=true;show('Весь набор сохранён. Карточки и Ryan готовы к занятиям без интернета.');
    if(navigator.storage?.persist){try{await navigator.storage.persist();}catch{}}
    if(isUpdate){$('reload-offline').hidden=false;show('Новая версия полностью сохранена. Нажмите «Открыть обновление», чтобы перейти к ней.');}
  }catch(error){show(error.message==='quota'?'Не хватило места. Освободите память браузера и повторите сохранение.':error.message==='version'?'Доступна новая версия. Обновите страницу с интернетом и сохраните набор ещё раз.':error.message==='busy'?'Сохранение уже идёт в другой вкладке. Дождитесь завершения и проверьте готовность.':'Не удалось сохранить весь набор. Проверьте интернет и попробуйте ещё раз. Ранее сохранённая версия остаётся доступной.');}
  finally{saving=false;buttonState();}
}
$('save-offline').addEventListener('click',save);
$('reload-offline').addEventListener('click',()=>location.reload());
window.addEventListener('online',()=>{registration?.update().catch(()=>{});refresh();});
window.addEventListener('offline',refresh);
$('tab-install').addEventListener('click',refresh);
$('offline-shortcut').addEventListener('click',refresh);
if('serviceWorker'in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(async reg=>{
    registration=reg;
    reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')refresh();});});
    await navigator.serviceWorker.ready;await refresh();
  }).catch(()=>{show('Этот браузер не разрешил офлайн-сохранение. Откройте приложение в обычном режиме Safari с интернетом.');buttonState();});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(ready){$('reload-offline').hidden=false;}if(!saving)refresh();});
}else{show('Офлайн-сохранение недоступно в этом браузере. Карточки и звук работают при подключении к интернету.');buttonState();}
