import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await context.addInitScript(()=>sessionStorage.setItem('the-phallus.introduction.v1','played'));
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8000',slides=()=>page.locator('.home-slides'),poster=()=>page.locator('[data-poster-exhibition]'),book=()=>page.locator('[data-book-viewer="first"]');
async function screen(index){await page.waitForFunction(index=>{const h=document.querySelector('.home-slides');return h?.dataset.homeScreen===String(index)&&!h.dataset.transitioning;},index);}
async function posterReady(number){await page.waitForFunction(number=>{const h=document.querySelector('[data-poster-exhibition]');return h?.dataset.posterActive===String(number)&&h.dataset.posterMotion==='idle'&&h.dataset.posterReady==='true';},number);}
async function corner(left=false){return poster().evaluate((host,left)=>{
 const rect=host.getBoundingClientRect(),aspect=rect.width/rect.height,compact=aspect<.9,half=compact?Math.max(1.85,1.56/aspect):Math.max(2.62,2.44/aspect),scale=compact?1.07:1.18;
 return {x:rect.left+rect.width/2+((left?-.9:.9)*scale)/(2*half*aspect)*rect.width,y:rect.top+rect.height/2+1.3*scale/(2*half)*rect.height};
},left);}
try{
 await mkdir('tmp/pdfs',{recursive:true});await page.goto(base+'/#/home');await page.waitForFunction(()=>document.querySelector('[data-book-viewer]')?.dataset.ready==='true');
 assert.equal(await slides().getAttribute('data-home-screen'),'0');assert.equal(await page.locator('.home-screen').count(),2);
 assert.ok(Number(await book().getAttribute('data-display-scale'))>1.1);assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
 const header=await page.locator('.site-header').boundingBox();await page.screenshot({path:'tmp/pdfs/home-enlarged-book.png'});
 await page.mouse.move(700,300);await page.mouse.wheel(0,16);await page.waitForTimeout(240);assert.equal(await slides().getAttribute('data-home-screen'),'0');
 const started=Date.now();await page.mouse.wheel(0,120);await page.waitForTimeout(250);
 const midway=await page.locator('.home-slide-track').evaluate(element=>new DOMMatrix(getComputedStyle(element).transform).m42),height=await slides().evaluate(element=>element.clientHeight);
 assert.ok(midway<0&&midway>-height);assert.deepEqual(await page.locator('.site-header').boundingBox(),header);
 assert.deepEqual(await page.locator('.home-screen').evaluateAll(elements=>elements.map(element=>[getComputedStyle(element).opacity,getComputedStyle(element).backgroundColor])),[['1','rgb(255, 255, 255)'],['1','rgb(255, 255, 255)']]);
 await screen(1);assert.ok(Date.now()-started>=600&&Date.now()-started<1000);await posterReady(1);
 const landed=await page.locator('.home-slide-track').evaluate(element=>new DOMMatrix(getComputedStyle(element).transform).m42);assert.ok(Math.abs(landed+height)<.1);
 assert.equal(await poster().getAttribute('data-poster-count'),'8');await page.screenshot({path:'tmp/pdfs/home-poster-exhibition.png'});
 for(let number=2;number<=8;number++){await poster().focus();await page.keyboard.press('ArrowRight');await posterReady(number);assert.equal(await poster().getAttribute('data-poster-front'),`${String(number).padStart(2,'0')} FIRST EDITION`);assert.equal(await poster().getAttribute('data-poster-back'),`${String(number).padStart(2,'0')}B FIRST EDITION`);}
 await page.keyboard.press('ArrowRight');await posterReady(1);await page.keyboard.press('ArrowLeft');await posterReady(8);
 // Pick a visible neighboring sheet, then lift each bottom corner of the active one.
 const rect=await poster().boundingBox(),point={x:rect.x+rect.width*.75,y:rect.y+rect.height*.34};await page.mouse.click(point.x,point.y);
 await page.waitForFunction(()=>document.querySelector('[data-poster-exhibition]').dataset.posterMotion==='idle');
 for(const left of [false,true]){
  const c=await corner(left);await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x,c.y-180,{steps:16});
  await page.waitForFunction(()=>Number(document.querySelector('[data-poster-exhibition]').dataset.posterCurl)>.65);
  const active=await poster().getAttribute('data-poster-active');await page.mouse.wheel(0,-200);assert.equal(await slides().getAttribute('data-home-screen'),'1');
  await page.screenshot({path:`tmp/pdfs/poster-curl-${left?'left':'right'}.png`});await page.mouse.up();await posterReady(Number(active));
  assert.equal(await poster().getAttribute('data-poster-active'),active);assert.equal(await poster().getAttribute('data-poster-curl'),'0.0000');
 }
 await page.waitForTimeout(250);await page.mouse.wheel(0,-140);await screen(0);assert.deepEqual(await page.locator('.site-header').boundingBox(),header);
 assert.equal(await book().getAttribute('data-book-state'),'0');await book().locator('[data-book-step="1"]').click();await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.bookState==='1'&&document.querySelector('[data-book-viewer]').dataset.motion==='idle');
 assert.equal(await slides().evaluate(element=>element.scrollTop),0);assert.equal((await page.locator('.home-screen').first().boundingBox()).y,header.height);
 await page.getByRole('button',{name:'Open colophon',exact:true}).click();await page.mouse.wheel(0,200);assert.equal(await slides().getAttribute('data-home-screen'),'0');await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const cdp=await context.newCDPSession(page),touch={x:20,y:620};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:20,y:450}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await screen(1);await posterReady(Number(await poster().getAttribute('data-poster-active')));
 await page.screenshot({path:'tmp/pdfs/home-posters-mobile.png'});
 await poster().focus();await page.keyboard.press('PageUp');await screen(0);
 const reduced=await browser.newContext({reducedMotion:'reduce'}),reducedPage=await reduced.newPage();await reducedPage.goto(base+'/#/home');await reducedPage.locator('[data-book-viewer]').focus();await reducedPage.keyboard.press('PageDown');
 await reducedPage.waitForFunction(()=>document.querySelector('.home-slides').dataset.homeScreen==='1'&&!document.querySelector('.home-slides').dataset.transitioning);await reduced.close();
 assert.deepEqual(errors,[]);console.log('PASS: viewport-fit enlarged book, 650ms shared translation, fixed masthead, white/opaque screens, deliberate scroll/swipe, eight paired A2 sheets, selection, both corner curls/returns, interaction locks, mobile and reduced motion.');
}catch(error){await page.screenshot({path:'tmp/pdfs/home-exhibition-failure.png'});console.error(errors);throw error;}finally{await browser.close();}
