import {cards} from './data.js';
const $ = id => document.getElementById(id);
const player = $('audio');
const storageKey = 'english-instructions-card-v1';
const panels = ['contents','help','install'];
let current = 0, pointerStart = null, wheelUntil = 0, playRequest = 0, pendingPlay = false;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function hashIndex(){try{return cards.findIndex(c=>c.id===decodeURIComponent(location.hash.slice(1)));}catch{return -1;}}
function storedIndex(){try{return cards.findIndex(c=>c.id===localStorage.getItem(storageKey));}catch{return -1;}}
function audioUI(){
  const playing = !player.paused && !player.ended;
  $('play-icon').textContent = ''; $('play-icon').dataset.state=playing?'pause':'play';
  $('play-label').textContent = playing ? 'Пауза · Ryan' : pendingPlay ? 'Загрузка…' : player.ended ? 'Ещё раз · Ryan' : player.currentTime > 0 ? 'Продолжить · Ryan' : 'Слушать · Ryan';
  $('listen').setAttribute('aria-label',playing?'Пауза':pendingPlay?'Загрузка аудио. Нажмите, чтобы отменить':player.ended?'Слушать ещё раз. Голос Ryan':player.currentTime>0?'Продолжить. Голос Ryan':'Слушать выражение и пример. Голос Ryan');
  $('listen').setAttribute('aria-busy',String(pendingPlay));
  $('restart').disabled = !player.getAttribute('src');
}
function stopAudio(){
  ++playRequest; pendingPlay=false; player.pause();
  player.removeAttribute('src'); player.load();
  $('audio-error').hidden=true; $('audio-error').textContent='';audioUI();
}
function showAudioError(){pendingPlay=false;$('audio-error').textContent='Не удалось загрузить запись. Проверьте интернет и нажмите «Слушать» ещё раз.';$('audio-error').hidden=false;audioUI();}
async function playAudio(fromStart=false){
  const request=++playRequest;
  $('audio-error').hidden=true;
  if(player.error || player.getAttribute('src')!==cards[current].audio){player.src=cards[current].audio;player.load();}
  if(fromStart || player.ended){try{player.currentTime=0;}catch{}}
  pendingPlay=true;audioUI();
  try{await player.play();if(request!==playRequest)return;pendingPlay=false;audioUI();}
  catch(error){if(request!==playRequest)return;pendingPlay=false;if(error.name!=='AbortError')showAudioError();else audioUI();}
}
$('listen').addEventListener('click',()=>{if(pendingPlay || (!player.paused&&!player.ended)){++playRequest;pendingPlay=false;player.pause();audioUI();}else playAudio();});
$('restart').addEventListener('click',()=>playAudio(true));
for(const event of ['play','pause','ended','loadedmetadata'])player.addEventListener(event,audioUI);
player.addEventListener('error',()=>{if(player.getAttribute('src'))showAudioError();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){++playRequest;pendingPlay=false;player.pause();audioUI();}});
function render(index,{historyMode='push',announce=true}={}){
  if(!Number.isInteger(index)||index<0||index>=cards.length)return;
  const direction=index>=current?1:-1;stopAudio();current=index;const card=cards[index];
  document.body.dataset.theme=card.theme;
  for(const key of ['phrase','meaning','example','group','note'])$(key).textContent=card[key];
  $('phrase').classList.toggle('short',card.phrase.length<13);
  $('counter').textContent=`${String(index+1).padStart(2,'0')} / ${cards.length}`;
  $('menu').setAttribute('aria-label',`Карточка ${index+1} из ${cards.length}. Открыть карточки и помощь`);
  $('previous').disabled=index===0;
  $('next').textContent=index===cards.length-1?'↺':'→';
  $('next').setAttribute('aria-label',index===cards.length-1?'В начало подборки':'Следующая карточка');
  document.title=`${card.phrase} | English — шаг за шагом`;
  document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.body).getPropertyValue('--bg').trim();
  if(historyMode!=='none')history[historyMode==='replace'?'replaceState':'pushState']({card:card.id},'',`#${card.id}`);
  try{localStorage.setItem(storageKey,card.id);}catch{}
  if(announce){const phrase=document.createElement('span'),example=document.createElement('span');phrase.lang='en';phrase.textContent=card.phrase;example.lang='en';example.textContent=card.example;$('announcement').replaceChildren(document.createTextNode(`${index+1} из ${cards.length}. `),phrase,document.createTextNode(` ${card.meaning} Пример: `),example);}
  document.querySelectorAll('.card-link').forEach((el,i)=>el.setAttribute('aria-current',String(i===index)));
  $('story').classList.remove('enter','release');$('story').style.transform='';$('story').style.opacity='';
  if(!reduced()&&announce){$('story').style.setProperty('--arrival',`${direction*64}px`);void $('story').offsetWidth;$('story').classList.add('enter');}
  if(announce && window.scrollY>0)window.scrollTo({top:0,behavior:'instant'});
}
function haptic(){if(!reduced()&&typeof navigator.vibrate==='function'){try{navigator.vibrate(12);}catch{}}}
function next(){haptic();render((current+1)%cards.length);}
function previous(){if(current>0){haptic();render(current-1);}}
$('next').addEventListener('click',next);$('previous').addEventListener('click',previous);
window.addEventListener('popstate',()=>render(Math.max(0,hashIndex()),{historyMode:'none'}));
window.addEventListener('hashchange',()=>{const i=hashIndex();if(i>=0&&i!==current)render(i,{historyMode:'none'});});
window.addEventListener('keydown',event=>{
  if($('overview').open||event.ctrlKey||event.altKey||event.metaKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable)return;
  if(event.key==='ArrowRight'||event.key==='PageDown'||(event.key===' '&&event.target===document.body)){event.preventDefault();next();}
  if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();previous();}
  if(event.key==='Home'){event.preventDefault();render(0);}
  if(event.key==='End'){event.preventDefault();render(cards.length-1);}
});
function resetDrag(){pointerStart=null;$('story').style.transform='';$('story').style.opacity='';$('story').classList.add('release');}
$('card').addEventListener('pointerdown',event=>{
  if(!event.isPrimary){resetDrag();return;}
  if(event.target.closest('button,a')||(event.pointerType==='mouse'&&event.button!==0))return;
  pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId};$('story').classList.remove('enter','release');
  if(event.pointerType==='mouse')$('card').setPointerCapture(event.pointerId);
});
$('card').addEventListener('pointermove',event=>{
  if(!pointerStart||event.pointerId!==pointerStart.id||reduced())return;
  const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;
  if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)*1.2){resetDrag();return;}
  if(Math.abs(dx)<Math.abs(dy)*1.2)return;
  const distance=Math.max(-120,Math.min(120,dx*.6));
  $('story').style.transform=`translate3d(${distance}px,0,0) rotate(${distance/90}deg)`;$('story').style.opacity=String(1-Math.abs(distance)/600);
});
$('card').addEventListener('pointerup',event=>{
  if(!pointerStart||event.pointerId!==pointerStart.id)return;
  const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;resetDrag();
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)dx<0?next():previous();
});
$('card').addEventListener('pointercancel',resetDrag);$('card').addEventListener('lostpointercapture',resetDrag);window.addEventListener('blur',resetDrag);
$('card').addEventListener('wheel',event=>{if(Math.abs(event.deltaX)<35||Math.abs(event.deltaX)<Math.abs(event.deltaY)||event.ctrlKey)return;event.preventDefault();if(Date.now()<wheelUntil)return;wheelUntil=Date.now()+450;event.deltaX>0?next():previous();},{passive:false});
function selectPanel(id,focus=false){for(const name of panels){$(name).hidden=name!==id;$('tab-'+name).setAttribute('aria-selected',String(name===id));$('tab-'+name).tabIndex=name===id?0:-1;}if(focus)$('tab-'+id).focus();$('overview').scrollTop=0;}
$('menu').addEventListener('click',()=>{++playRequest;pendingPlay=false;player.pause();audioUI();selectPanel('contents');$('overview').showModal();});
$('offline-shortcut').addEventListener('click',()=>{++playRequest;pendingPlay=false;player.pause();audioUI();selectPanel('install');$('overview').showModal();});
$('close').addEventListener('click',()=>$('overview').close());
$('overview').addEventListener('close',()=>$('menu').focus());
$('overview').addEventListener('click',event=>{if(event.target===$('overview')){const r=$('overview').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('overview').close();}});
for(const[i,id]of panels.entries()){
  $('tab-'+id).addEventListener('click',()=>selectPanel(id));
  $('tab-'+id).addEventListener('keydown',event=>{let target=null;if(event.key==='ArrowRight')target=panels[(i+1)%panels.length];if(event.key==='ArrowLeft')target=panels[(i+panels.length-1)%panels.length];if(event.key==='Home')target=panels[0];if(event.key==='End')target=panels.at(-1);if(target){event.preventDefault();selectPanel(target,true);}});
}
for(const[i,card]of cards.entries()){
  const button=document.createElement('button');button.className='card-link';
  const num=document.createElement('span');num.className='num';num.textContent=String(i+1).padStart(2,'0');
  const text=document.createElement('span');text.lang='en';text.textContent=card.phrase;button.append(num,text);
  button.addEventListener('click',()=>{render(i);$('overview').close();});$('card-list').append(button);
}
const initial=hashIndex();render(initial>=0?initial:Math.max(0,storedIndex()),{historyMode:'replace',announce:false});
