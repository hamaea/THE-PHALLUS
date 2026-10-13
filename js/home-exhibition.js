import { assetById, assetUrl } from './assets.js';
import { unfoldedSurfaces } from './book-surfaces.js';

export const SLIDE_SETTINGS = Object.freeze({ duration: 650, threshold: 90, windowMs: 220, cooldownMs: 200, swipeDistance: 72 });
export function homeExhibition(book) {
  return `<div class="home-slides" data-home-screen="0"><div class="home-slide-track">
    <section class="home-screen" data-home-panel="0" aria-label="Assembled book"><div class="home-preview">${book}</div>
      <h1 class="visually-hidden">THE PHALLUS</h1></section>
    <section class="home-screen" data-home-panel="1" aria-label="Unfolded poster exhibition" aria-hidden="true" inert>
      <div class="poster-exhibition" data-poster-exhibition tabindex="0" role="region" aria-label="Eight unfolded A2 posters" aria-describedby="poster-instructions">
        <p id="poster-instructions" class="visually-hidden">Click exposed sheets or use left and right arrows to select a poster. Lift either bottom corner to reveal its reverse. Use Page Up to return to the book, or swipe on the white margin.</p>
        <span class="poster-loading">LOADING POSTERS</span><span class="poster-status visually-hidden" role="status"></span>
        <div class="poster-fallback" hidden>${Array.from({length:8},(_,i)=>`<button type="button" data-poster-select="${i}" aria-label="Select poster ${String(i+1).padStart(2,'0')}"><img src="${assetUrl(assetById.get(unfoldedSurfaces(i).front.assetId),{preview:true})}" alt="Complete A2 photographic sheet ${i+1}" loading="lazy" draggable="false"></button>`).join('')}</div>
      </div></section>
    </div><span class="home-screen-status visually-hidden" role="status"></span></div>`;
}

export function mountHomeExhibition(root, setBookActive=()=>{}) {
  const viewport=root.querySelector('.home-slides'); if(!viewport) return ()=>{};
  const track=viewport.querySelector('.home-slide-track'),panels=[...viewport.querySelectorAll('.home-screen')],posterHost=viewport.querySelector('[data-poster-exhibition]');
  const events=new AbortController(),options={signal:events.signal},reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let index=0,disposed=false,transitioning=false,accumulated=0,lastWheel=0,cooldown=0,consumed=false,touch=null,timer,poster,pending;
  const busy=()=>root.inert||document.body.classList.contains('intro-playing')||root.querySelector('[data-pointer-active="true"], [data-image-drag="true"], [data-poster-interacting="true"]')||
    root.querySelector('[data-poster-motion="curl"], [data-poster-motion="arrange"]')||[...root.querySelectorAll('[data-motion]')].some(host=>host.dataset.motion!=='idle');
  function ensurePoster(){
    if(!pending) pending=import('./poster-exhibition.js').then(({PosterExhibition})=>{
      if(disposed) return;poster=new PosterExhibition(posterHost);poster.setVisible(index===1);
    }).catch(error=>{if(!disposed){posterHost.querySelector('.poster-loading').textContent='POSTER PREVIEW UNAVAILABLE';posterHost.querySelector('.poster-fallback').hidden=false;console.warn(error);}});
  }
  function finish(){
    if(!transitioning) return;clearTimeout(timer);transitioning=false;delete viewport.dataset.transitioning;
    panels.forEach((panel,i)=>{panel.inert=i!==index;panel.setAttribute('aria-hidden',String(i!==index));});
    poster?.setVisible(index===1);setBookActive(index===0);viewport.querySelector('.home-screen-status').textContent=index?'Unfolded poster exhibition':'Assembled book';
    if(panels[1-index].contains(document.activeElement)) (index?posterHost:panels[0].querySelector('[data-book-viewer]')).focus({preventScroll:true});
  }
  function slide(next){
    if(next===index||transitioning||busy()) return;
    index=next;transitioning=true;viewport.dataset.homeScreen=String(index);viewport.dataset.transitioning='true';accumulated=0;
    cooldown=performance.now()+SLIDE_SETTINGS.duration+SLIDE_SETTINGS.cooldownMs;
    panels.forEach(panel=>{panel.inert=true;panel.setAttribute('aria-hidden','false');});
    if(index===1){ensurePoster();poster?.setVisible(true);}
    else setBookActive(true);
    track.style.transform=`translate3d(0, ${-100*index}%, 0)`;
    if(reduced.matches) finish();else timer=setTimeout(finish,SLIDE_SETTINGS.duration+50);
  }
  track.addEventListener('transitionend',event=>{if(event.target===track&&event.propertyName==='transform') finish();},options);
  document.querySelector('.site-title').addEventListener('click',event=>{if(location.hash==='#/home'){event.preventDefault();slide(0);}},options);
  viewport.addEventListener('wheel',event=>{
    if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)) return;
    event.preventDefault();const now=performance.now(),gap=now-lastWheel;lastWheel=now;
    if(gap>SLIDE_SETTINGS.windowMs)consumed=false;
    if(consumed)return;
    if(transitioning||now<cooldown||busy()){accumulated=0;return;}
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
    if(gap>SLIDE_SETTINGS.windowMs||Math.sign(delta)!==Math.sign(accumulated)) accumulated=0;
    accumulated+=delta;
    if(Math.abs(accumulated)>=SLIDE_SETTINGS.threshold&&gap>0){const next=accumulated>0?1:0;if(next!==index){consumed=true;slide(next);}}
  },{...options,passive:false});
  viewport.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'||transitioning||busy()||event.target.closest('button,a,input,select,summary')) return;
    touch={id:event.pointerId,x:event.clientX,y:event.clientY};viewport.setPointerCapture(event.pointerId);
  },options);
  viewport.addEventListener('pointermove',event=>{
    if(!touch||touch.id!==event.pointerId) return;
    const dx=event.clientX-touch.x,dy=event.clientY-touch.y;
    if(Math.abs(dy)<SLIDE_SETTINGS.swipeDistance||Math.abs(dy)<Math.abs(dx)*1.25) return;
    event.preventDefault();touch=null;slide(dy<0?1:0);
  },options);
  const endTouch=()=>{touch=null;};viewport.addEventListener('pointerup',endTouch,options);viewport.addEventListener('pointercancel',endTouch,options);
  viewport.addEventListener('keydown',event=>{
    if(!['PageDown','PageUp'].includes(event.key)||busy()) return;
    event.preventDefault();slide(event.key==='PageDown'?1:0);
  },options);
  return ()=>{disposed=true;events.abort();clearTimeout(timer);poster?.dispose();};
}
