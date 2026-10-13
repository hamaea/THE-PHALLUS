import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { ASSETS } from '../js/assets.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))failed.push(r.url());});
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8000';await mkdir('tmp/pdfs',{recursive:true});
const action=name=>page.locator(`[data-action="${name}"]`),target=n=>page.locator(`.page-target[data-page="${n}"]`);
const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('the-phallus.prototype.v3')));
const host=()=>page.locator('[data-book-viewer]').first();
const build=()=>page.getByRole('link',{name:'Build a Custom Edition',exact:true}).click();
async function nav(name){
 if(name==='HOME'){await page.getByRole('link',{name:'THE PHALLUS',exact:true}).click();return;}
 if(name==='ABOUT'){await page.goto(base+'/?mapping=1#/about');return;}
 await page.getByRole('button',{name:'Open colophon',exact:true}).click();await page.getByRole('navigation').getByRole('link',{name,exact:typeof name==='string'}).click();
}
async function assemblyAction(name){const options=page.locator('.assembly-options');if(!await options.evaluate(element=>element.open))await options.locator('summary').click();await action(name).click();}
const settled=async index=>{await page.waitForFunction(i=>{const h=document.querySelector('[data-book-viewer]');return h?.dataset.bookState===String(i)&&h.dataset.motion==='idle'&&h.dataset.ready==='true';},index);};
async function world(x,y){return page.evaluate(async({x,y})=>{
 const THREE=await import('/vendor/three.module.min.js'),rect=document.querySelector('.book-stage').getBoundingClientRect(),aspect=rect.width/rect.height;
 const half=Math.max((297/210+2*12.7/210)*.62,(1+12.7/210)*1.22/aspect)/Number(document.querySelector('[data-book-viewer]').dataset.displayScale||1),camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,30);
 const center=Number(document.querySelector('[data-book-viewer]').dataset.centerX||0);
 camera.position.set(center,-1.3,7);camera.lookAt(center,0,0);camera.updateMatrixWorld();const p=new THREE.Vector3(x,y,.07).project(camera);
 return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};},{x,y});}
try{
 if(process.env.BROWSER_SCOPE!=='assembly'){
 await page.goto(base+'/?mapping=1',{waitUntil:'networkidle'});await page.getByText('DEVELOPMENT — PHYSICAL MAPPING',{exact:true}).click();await host().scrollIntoViewIfNeeded();await host().locator('canvas').waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.ready==='true');
 await page.screenshot({path:'tmp/pdfs/home.png',fullPage:true});await host().locator('.book-stage').screenshot({path:'tmp/pdfs/closed-book.png'});
 const coverCorner=await world(1.02,-.70);await page.mouse.move(coverCorner.x,coverCorner.y);await page.mouse.down();await page.mouse.move(coverCorner.x,coverCorner.y-180,{steps:12});
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.motion==='curl');
 assert.ok((await host().locator('.book-debug-info').textContent()).includes('Flat inner folio: insideFront'));
 await page.mouse.up();await settled(0);
 assert.equal(await page.locator('.hero img').count(),0);assert.ok(Number(await host().getAttribute('data-center-x'))>.5);
 await host().locator('[data-book-step="1"]').click();await settled(1);assert.equal(Number(await host().getAttribute('data-center-x')),0);
 assert.equal(await host().locator('.book-status').innerText(),'1');
 await host().locator('.book-stage').screenshot({path:'tmp/pdfs/open-book.png'});
 // Actual horizontal pointer capture turns the first leaf to facing 2–3.
 const edge=await world(.96,.12),end=await world(-.90,.12);
 await page.mouse.move(edge.x,edge.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:24});await page.mouse.up();await settled(2);
 assert.equal(await host().locator('.book-status').innerText(),'2 | 3');
 // Corner gesture deforms the paper but never changes the reading cursor.
 const corner=await world(.96,-.64);await page.mouse.move(corner.x,corner.y);await page.mouse.down();await page.mouse.move(corner.x+4,corner.y-210,{steps:18});
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.motion==='curl');
 await page.waitForTimeout(400);await host().locator('.book-stage').screenshot({path:'tmp/pdfs/curled-book.png'});await page.mouse.up();await settled(2);
 // A short horizontal drag cancels; the corner's horizontal gesture still turns.
 const short=await world(.96,.1);await page.mouse.move(short.x,short.y);await page.mouse.down();await page.mouse.move(short.x-12,short.y,{steps:5});await page.waitForTimeout(130);await page.mouse.up();await settled(2);
 const backEdge=await world(-.96,.1),backEnd=await world(.9,.1);await page.mouse.move(backEdge.x,backEdge.y);await page.mouse.down();await page.mouse.move(backEnd.x,backEnd.y,{steps:24});await page.mouse.up();await settled(1);
 await host().focus();await page.keyboard.press('ArrowRight');await settled(2);await page.keyboard.press('ArrowLeft');await settled(1);await page.keyboard.press('ArrowRight');await settled(2);
 // Distance and momentum use real pointer timestamps, including reversal.
 async function dragProgress(points, pause=0) {
   const start=await world(.76,.1),other=await world(-.24,.1),travel=start.x-other.x;
   await page.mouse.move(start.x,start.y);await page.mouse.down();
   for(const [progress,delay] of points){await page.waitForTimeout(delay);await page.mouse.move(start.x-travel*progress,start.y);}
   if(pause)await page.waitForTimeout(pause);await page.mouse.up();
 }
 await dragProgress(Array.from({length:10},(_,i)=>[(i+1)*.032,60]),120);await settled(3);
 await dragProgress([[.025,12],[.09,28]]);await settled(4);
 await dragProgress([[.04,100],[.08,100]],120);await settled(4);
 await dragProgress([[.25,80],[.55,80],[.45,20],[.3,25]]);await settled(4);
 await page.getByText('DEVELOPMENT — ACTIVE TEXTURES',{exact:true}).click();
 const curlLeaf=await host().getAttribute('data-right-leaf');
 await host().locator('[data-book-debug-curl]').selectOption('right');await page.waitForTimeout(500);
 const folioInfo=await host().locator('.book-debug-info').textContent();
 assert.ok(folioInfo.includes('PAGE 7')&&folioInfo.includes('BACK 04B FIRST EDITION.jpg / topRight'));
 assert.ok(folioInfo.includes('Flat inner folio: 8 · 04B FIRST EDITION.jpg / bottomRight'));
 assert.equal(await host().getAttribute('data-active-leaf'),curlLeaf);
 await host().locator('.book-stage').screenshot({path:'tmp/pdfs/paired-folios.png'});
 await host().locator('[data-book-debug-curl]').selectOption('');await settled(4);
 assert.equal(await host().getAttribute('data-right-leaf'),curlLeaf);
 await host().locator('[data-book-step="1"]').click();
 await page.waitForFunction(()=>{const h=document.querySelector('[data-book-viewer]');return h.dataset.motion==='turn'&&+h.dataset.motionProgress>.05&&+h.dataset.motionProgress<.7;});
 const turningLeaf=await host().getAttribute('data-active-leaf'),turningGeometry=await host().getAttribute('data-active-geometry');
 assert.equal(await host().getAttribute('data-book-state'),'4');await settled(5);
 assert.equal(await host().getAttribute('data-left-leaf'),turningLeaf);
 assert.equal(await host().getAttribute('data-active-geometry'),turningGeometry);
 await host().locator('[data-book-debug-curl]').selectOption('left');await page.waitForTimeout(400);
 assert.ok((await host().locator('.book-debug-info').textContent()).includes('Flat inner folio: 7 · 04B FIRST EDITION.jpg / topRight'));
 await host().locator('[data-book-debug-curl]').selectOption('');await settled(5);
 await host().locator('[data-book-step="-1"]').click();await settled(4);
 console.log('PASS: slow-half release, short flick, tiny drag, opposite flick, stable landing mesh and both paired folio surfaces.');
 for(let i=5;i<=18;i++){await host().locator('[data-book-step="1"]').click();await settled(i);}
 assert.equal(await host().locator('.book-status').innerText(),'END');assert.ok(Number(await host().getAttribute('data-texture-count'))<=18);assert.ok(Number(await host().getAttribute('data-center-x'))<-.5);
 await host().locator('.book-stage').screenshot({path:'tmp/pdfs/back-book.png'});await host().focus();await page.keyboard.press('Home');await settled(0);
 console.log('PASS: front/back covers, all 32 pages, horizontal drag, curl/release, cancellation, buttons and keyboard.');
 }else{await page.goto(base+'/?mapping=1',{waitUntil:'networkidle'});await settled(0);}
 await nav('ABOUT');await page.locator('#app').getByText('PHOTO BY E. HAMABUCHI',{exact:false}).waitFor();
 await nav('HOME');assert.equal(await page.locator('.hero img').count(),0);
 await action('add-first').click();await build();await page.getByRole('heading',{level:1,name:'ASSEMBLY',exact:true}).waitFor();await settled(2);
 assert.equal(await page.locator('.gallery-photo').count(),41);assert.equal(await page.locator('.photo-row').count(),2);
 assert.equal(await page.locator('.photo-row').first().getAttribute('data-orientation'),'horizontal');
 assert.equal(await page.locator('.photo-row').last().getAttribute('data-orientation'),'vertical');
 assert.deepEqual((await page.locator('.photo-row').allTextContents()).map(text=>text.trim()),['','']);assert.equal(await page.locator('.cover-editor').count(),0);
 assert.equal(await host().locator('.book-fallback').isVisible(),false);
 await assemblyAction('finish');assert.ok((await page.locator('.validation').innerText()).includes('32 empty reader pages'));
 await page.getByText('DEVELOPMENT — ACTIVE TEXTURES',{exact:true}).click();await host().locator('[data-book-debug-curl]').selectOption('right');await page.waitForTimeout(400);
 assert.ok((await host().locator('.book-debug-info').textContent()).includes('Flat inner folio: 4 · 02B CUSTOM EDITION.jpg / bottomRight'));
 await host().locator('[data-book-debug-curl]').selectOption('');await settled(2);await page.getByText('DEVELOPMENT — ACTIVE TEXTURES',{exact:true}).click();
 const vertical=page.locator('.gallery-photo[data-asset="IMG_3962"]'),horizontal=page.locator('.gallery-photo[data-asset="IMG_3971"]');
 async function dropPhoto(card,x) {
   const p=await world(x,.12),box=await host().locator('canvas').boundingBox();
   await card.dragTo(host().locator('canvas'),{targetPosition:{x:p.x-box.x,y:p.y-box.y}});await settled(Number(await host().getAttribute('data-book-state')));
 }
 async function selectPhoto(card){if(await card.getAttribute('aria-pressed')!=='true')await card.click();}
 async function clickPage(x){const p=await world(x,.12);await page.mouse.click(p.x,p.y);await settled(Number(await host().getAttribute('data-book-state')));}
 const scene=await host().getAttribute('data-scene-id'),leftLeaf=await host().getAttribute('data-left-leaf'),rightLeaf=await host().getAttribute('data-right-leaf');
 await dropPhoto(vertical,-.5);assert.deepEqual((await stored()).book.placements[0].pages,[2]);
 await dropPhoto(page.locator(`.gallery-photo[data-asset="${ASSETS.filter(a=>a.orientation==='vertical')[1].id}"]`),.5);assert.equal((await stored()).book.placements.length,2);
 await dropPhoto(horizontal,-.5);assert.deepEqual((await stored()).book.placements[0].pages,[2,3]);assert.equal((await stored()).book.placements.length,1);
 await dropPhoto(page.locator('.photo-row[data-orientation="horizontal"] .gallery-photo').first(),.5);assert.equal((await stored()).book.placements.length,1);
 await dropPhoto(vertical,.5);assert.equal((await stored()).book.pages[1].placementId,null);assert.ok((await stored()).book.pages[2].placementId);
 await assemblyAction('remove-placement');await settled(2);assert.equal((await stored()).book.pages[2].placementId,null);
 assert.equal(await host().getAttribute('data-scene-id'),scene);assert.equal(await host().getAttribute('data-left-leaf'),leftLeaf);assert.equal(await host().getAttribute('data-right-leaf'),rightLeaf);
 const beforeMiss=(await stored()).book.revision;await vertical.dragTo(host().locator('canvas'),{targetPosition:{x:4,y:4}});assert.equal((await stored()).book.revision,beforeMiss);
 await host().focus();await page.keyboard.press('Home');await settled(0);await dropPhoto(vertical,.5);assert.equal((await stored()).book.revision,beforeMiss);
 assert.equal((await stored()).book.cover.assetId,null);await host().locator('[data-book-step="1"]').click();await settled(1);
 await selectPhoto(horizontal);await clickPage(.5);assert.equal((await stored()).book.revision,beforeMiss);
 await selectPhoto(vertical);await clickPage(.5);
 await host().locator('[data-book-step="1"]').click();await settled(2);
 for(let i=2;i<=16;i++){await selectPhoto(page.locator(`.gallery-photo[data-asset="${ASSETS.filter(a=>a.orientation==='horizontal')[i-2].id}"]`));await clickPage(-.5);if(i<16){await host().locator('[data-book-step="1"]').click();await settled(i+1);}}
 await host().locator('[data-book-step="1"]').click();await settled(17);await selectPhoto(page.locator(`.gallery-photo[data-asset="${ASSETS.filter(a=>a.orientation==='vertical')[2].id}"]`));await clickPage(-.5);
 assert.ok((await stored()).book.pages.every(p=>p.placementId));assert.equal((await stored()).book.placements.length,17);
 await page.screenshot({path:'tmp/pdfs/assembly.png'});await page.reload();await settled(17);await assemblyAction('finish');await page.getByRole('heading',{level:1,name:'FINISHED ASSEMBLY',exact:true}).waitFor();
 await host().scrollIntoViewIfNeeded();await host().locator('canvas').waitFor();await host().locator('[data-book-step="1"]').click();await settled(1);await host().locator('[data-book-step="1"]').click();await settled(2);
 assert.equal(await host().locator('.book-status').innerText(),'2 | 3');await host().locator('.book-stage').screenshot({path:'tmp/pdfs/custom-book.png'});
 await page.getByText('DEVELOPMENT — ACTIVE TEXTURES',{exact:true}).click();await host().locator('[data-book-debug-curl]').selectOption('right');await page.waitForTimeout(400);
 assert.ok((await host().locator('.book-debug-info').textContent()).includes('Flat inner folio: 4 · 02B CUSTOM EDITION.jpg / bottomRight'));
 await host().locator('[data-book-debug-curl]').selectOption('');await settled(2);
 await page.locator('[data-setting="numberedProof"]').check();const expected=[[1,32,2,31],[3,30,4,29],[5,28,6,27],[7,26,8,25],[9,24,10,23],[11,22,12,21],[13,20,14,19],[15,18,16,17]];
 for(let i=0;i<8;i++){
 const q=await page.locator('.poster-quadrant').evaluateAll(es=>es.map(e=>[Number(e.dataset.readerPage),Number(e.dataset.rotation)]));
 assert.deepEqual(q.map(a=>a[0]),expected[i]);assert.deepEqual(q.map(a=>a[1]),[180,180,0,0]);if(i<7)await action('poster-next').click();}
 await page.locator('[data-setting="numberedProof"]').uncheck();await action('edit').click();await page.getByRole('heading',{level:1,name:'ASSEMBLY',exact:true}).waitFor();await settled(2);
 await selectPhoto(page.locator(`.gallery-photo[data-asset="${ASSETS.filter(a=>a.orientation==='horizontal')[16].id}"]`));await clickPage(.5);
 const cartScene=await host().getAttribute('data-scene-id');await action('cart-assembly').click();
 assert.equal((await stored()).book.completed,true);assert.equal(await host().getAttribute('data-scene-id'),cartScene);
 assert.equal(await host().getAttribute('data-book-state'),'2');
 await nav(/^BAG/);await page.getByRole('link',{name:'VIEW SAVED EDITION'}).last().click();await page.locator('.finished-viewers').waitFor();
 await nav(/^BAG/);await page.getByRole('link',{name:'PROCEED TO CHECKOUT'}).click();await action('checkout').click();await page.getByRole('heading',{level:1,name:'EXPORT',exact:true}).waitFor();
 assert.equal(await action('export-pdf').count(),2);await action('export-pdf').last().click();await page.getByRole('link',{name:'DOWNLOAD EDITION PDF'}).waitFor({timeout:30000});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'DOWNLOAD EDITION PDF'}).click();const download=await downloadPromise;await download.saveAs('tmp/pdfs/browser-export.pdf');
 await nav('HOME');await action('add-first').click();await build();
 page.once('dialog',d=>d.dismiss());await action('reset').click();assert.equal((await stored()).book.completed,true);page.once('dialog',d=>d.accept());await action('reset').click();
 assert.ok((await stored()).book.pages.every(p=>!p.placementId));assert.equal((await stored()).orders.length,1);assert.equal((await stored()).bag[0].kind,'first');
 console.log('PASS: gallery, actual-facing drag/drop, replacement, removal, completion, custom 3D, all print sheets, snapshots, checkout, worker PDF, reset and persistence.');
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/assembly');await settled(2);
 const cdp=await context.newCDPSession(page),portraitCard=page.locator('.gallery-photo[data-asset="IMG_3962"]');
 await portraitCard.scrollIntoViewIfNeeded();const bounds=await portraitCard.boundingBox(),drop=await world(-.5,.12);
 const pickup={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pickup]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pickup.x,y:pickup.y-20}]});
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.imageDrag==='true');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[drop]});
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.dropPages==='2');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(2);
 assert.ok((await stored()).book.pages[1].placementId);assert.equal(await page.locator('.photo-drag-preview').count(),0);
 const rows=page.locator('.photo-row'),rowBounds=await rows.first().boundingBox(),beforeScroll=await rows.evaluateAll(rows=>rows.map(row=>row.scrollLeft));
 const swipe={x:rowBounds.x+260,y:rowBounds.y+rowBounds.height/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[swipe]});
 for(let i=1;i<=6;i++){await page.waitForTimeout(20);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipe.x-i*25,y:swipe.y}]});}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
 const afterScroll=await rows.evaluateAll(rows=>rows.map(row=>row.scrollLeft));assert.ok(afterScroll[0]>beforeScroll[0]);assert.equal(afterScroll[1],beforeScroll[1]);
 await page.screenshot({path:'tmp/pdfs/mobile-assembly.png'});
 console.log('PASS: native touch gallery drag/drop and independent horizontal gallery swipe.');
 // Mobile equivalent pointer gestures, portrait fit and no horizontal overflow.
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/home');await host().scrollIntoViewIfNeeded();await host().locator('canvas').waitFor();
 await host().focus();await page.keyboard.press('Home');await settled(0);await host().locator('[data-book-step="1"]').click();await settled(1);
 const mobileCorner=await world(.95,-.64);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mobileCorner.x,y:mobileCorner.y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mobileCorner.x,y:mobileCorner.y-95}]});
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.motion==='curl');
 await page.waitForTimeout(300);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await settled(1);
 const mobileEdge=await world(.95,.1),mobileEnd=await world(-.9,.1);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[mobileEdge]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[mobileEnd]});
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer]').dataset.motion==='turn');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(2);
 // A relaxed, short touch drag from the outer half commits in either
 // direction. A browser touch cancellation retains the last turn intent.
 const mobileTravel=(await world(1,.1)).x-(await world(0,.1)).x;
 async function easyTouch(direction,endType,index){
   const start=await world(direction*.55,.1);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
   for(let step=1;step<=3;step++){
     await page.waitForTimeout(80);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-direction*mobileTravel*.16*step/3,y:start.y}]});
   }
   await page.waitForTimeout(180);
   await cdp.send('Input.dispatchTouchEvent',{type:endType,touchPoints:[]});await settled(index);
 }
 await easyTouch(1,'touchEnd',3);await easyTouch(-1,'touchEnd',2);await easyTouch(1,'touchCancel',3);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'tmp/pdfs/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);console.log('PASS: mobile fit, native curl/turn and clean console/network.');
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};});
 await page.reload();await host().scrollIntoViewIfNeeded();await page.locator('.no-webgl').waitFor();
 assert.equal(await host().locator('.book-fallback').getAttribute('open'),'');await action('reader-next').click();
 assert.equal(await host().locator('.reader-spread').getAttribute('data-spread'),'2');
 assert.deepEqual(errors,[]);console.log('PASS: WebGL-disabled reading fallback and navigation.');
 await page.goto(base+'/#/assembly');await page.locator('.no-webgl').waitFor();await portraitCard.click();
 assert.equal(await host().getAttribute('data-selected-asset'),'');
 await target(2).click();assert.equal((await stored()).book.pages[1].placementId,null);
 assert.equal(await portraitCard.getAttribute('data-used'),'false');
 await portraitCard.click();await target(3).click();
 assert.ok((await stored()).book.pages[2].placementId);assert.deepEqual(errors,[]);
 console.log('PASS: WebGL-disabled Assembly assignment fallback.');
}catch(error){console.error('Browser errors:',errors);console.error('Failed assets:',failed);console.error('Current body:',await page.locator('body').innerText());throw error;}
finally{await browser.close();}
