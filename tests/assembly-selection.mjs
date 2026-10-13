import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { ASSETS } from '../js/assets.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const runtimeRequire=createRequire(process.env.PLAYWRIGHT_MODULE?`${process.env.PLAYWRIGHT_MODULE}/package.json`:import.meta.url),{PNG}=runtimeRequire('pngjs');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
const base=process.env.PROTOTYPE_URL||'http://127.0.0.1:8000',errors=[];
page.on('pageerror',error=>errors.push(error.message));
const portraits=ASSETS.filter(a=>a.orientation==='vertical'),landscape=ASSETS.find(a=>a.orientation==='horizontal');
const host=()=>page.locator('[data-book-viewer="assembly"]'),card=asset=>page.locator(`.gallery-photo[data-asset="${asset.id}"]`);
const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('the-phallus.prototype.v3')));
async function settled(index){await page.waitForFunction(index=>{const h=document.querySelector('[data-book-viewer="assembly"]');return h?.dataset.bookState===String(index)&&h.dataset.motion==='idle'&&h.dataset.ready==='true';},index);}
async function world(x,y=.15){return page.evaluate(async({x,y})=>{
 const THREE=await import('/vendor/three.module.min.js'),host=document.querySelector('[data-book-viewer="assembly"]'),rect=host.querySelector('.book-stage').getBoundingClientRect(),aspect=rect.width/rect.height;
 const half=Math.max((297/210+2*12.7/210)*.62,(1+12.7/210)*1.22/aspect),camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,30);
 const center=Number(host.dataset.centerX);camera.position.set(center,-1.3,7);camera.lookAt(center,0,0);camera.updateMatrixWorld();
 const p=new THREE.Vector3(x,y,.07).project(camera);return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
},{x,y});}
async function beginDrag(asset,x){
 await card(asset).scrollIntoViewIfNeeded();const bounds=await card(asset).boundingBox(),point=await world(x);
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y-18,{steps:4});await page.mouse.move(point.x,point.y,{steps:12});
 await page.waitForFunction(()=>document.querySelector('[data-book-viewer="assembly"]').dataset.dropPages);
}
async function drop(asset,x){await beginDrag(asset,x);await page.mouse.up();await settled(Number(await host().getAttribute('data-book-state')));}
async function clickPage(x){const p=await world(x);await page.mouse.click(p.x,p.y);await settled(Number(await host().getAttribute('data-book-state')));}
async function color(x){
 const point=await world(x),box=await host().locator('.book-stage').boundingBox(),png=PNG.sync.read(await host().locator('.book-stage').screenshot());
 const px=Math.round((point.x-box.x)*png.width/box.width),py=Math.round((point.y-box.y)*png.height/box.height),samples=[];
 for(let dy=-10;dy<=10;dy++)for(let dx=-10;dx<=10;dx++){const i=((py+dy)*png.width+px+dx)*4;samples.push([...png.data.subarray(i,i+3)]);}
 return [0,1,2].map(channel=>samples.reduce((sum,s)=>sum+s[channel],0)/samples.length);
}
try{
 await mkdir('tmp/pdfs',{recursive:true});await page.goto(base+'/#/assembly');await settled(2);
 const scene=await host().getAttribute('data-scene-id'),blank=await color(-.35);
 await beginDrag(portraits[0],-.35);assert.equal(await host().getAttribute('data-drop-pages'),'2');
 const grey=await color(-.35);assert.ok(grey.reduce((a,b)=>a+b)<blank.reduce((a,b)=>a+b)-40,'Grey drop feedback must visibly change the page.');
 assert.ok(Math.max(...grey)-Math.min(...grey)<12,'Drop feedback should be neutral grey.');
 await page.screenshot({path:'tmp/pdfs/assembly-grey-drop.png'});await page.mouse.up();await settled(2);
 assert.deepEqual((await stored()).book.placements[0].pages,[2]);
 assert.equal(await card(portraits[0]).getAttribute('data-used'),'true');assert.equal(await card(portraits[0]).getAttribute('draggable'),'false');
 assert.equal(await card(portraits[0]).locator('img').evaluate(img=>getComputedStyle(img).filter),'grayscale(1)');
 const revision=(await stored()).book.revision;
 const p=await world(.35);await page.evaluate(({assetId,p})=>{
  const transfer=new DataTransfer();transfer.setData('application/x-phallus-asset',assetId);
  document.querySelector('.book-stage canvas').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:p.x,clientY:p.y}));
 },{assetId:portraits[0].id,p});
 assert.equal((await stored()).book.revision,revision,'Stale/forced drops cannot duplicate an image.');
 await drop(portraits[1],.35);await page.mouse.move(20,80);const normal=await color(-.35),hover=await world(-.35);
 await page.mouse.move(hover.x,hover.y);await page.waitForFunction(()=>document.querySelector('[data-book-viewer="assembly"]').dataset.hoverPages==='2');
 const lighter=await color(-.35);assert.ok(lighter.reduce((a,b)=>a+b)>normal.reduce((a,b)=>a+b)+15,'Hover should visibly lighten photography.');
 await page.screenshot({path:'tmp/pdfs/assembly-hover.png'});await page.mouse.move(20,80);assert.equal(await host().getAttribute('data-hover-pages'),null);
 // Turning an occupied page must not clear it.
 const edge=await world(-.9),end=await world(-.7);await page.mouse.move(edge.x,edge.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:10});await page.mouse.up();await settled(1);
 assert.equal((await stored()).book.placements.length,2);
 await card(portraits[0]).click();await settled(2);
 for(let i=3;i<=5;i++){await host().locator('[data-book-step="1"]').click();await settled(i);}
 await page.evaluate(()=>{document.querySelector('[data-book-viewer="assembly"]').addEventListener('booknavigate',event=>{event.currentTarget.dataset.visited=(event.currentTarget.dataset.visited||'')+event.detail.bookIndex+',';});});
 await card(portraits[0]).click();await settled(2);
 const visited=(await host().getAttribute('data-visited')).split(',').filter(Boolean).map(Number).filter((value,index,values)=>!index||value!==values[index-1]);
 assert.deepEqual(visited,[5,4,3,2],'Used-image navigation should turn through actual facing pages.');
 assert.equal(await host().getAttribute('data-selected-asset'),'');assert.equal((await stored()).book.placements.length,2);
 await clickPage(-.35);assert.equal((await stored()).book.pages[1].placementId,null);assert.equal(await card(portraits[0]).getAttribute('data-used'),'false');
 await drop(portraits[0],.35);assert.equal(await card(portraits[1]).getAttribute('data-used'),'false');assert.deepEqual((await stored()).book.placements[0].pages,[3]);
 await beginDrag(landscape,-.35);assert.equal(await host().getAttribute('data-drop-pages'),'2,3');await page.mouse.up();await settled(2);
 assert.equal((await stored()).book.placements.length,1);assert.deepEqual((await stored()).book.placements[0].pages,[2,3]);
 const spreadHover=await world(.35);await page.mouse.move(spreadHover.x,spreadHover.y);assert.equal(await host().getAttribute('data-hover-pages'),'2,3');
 await clickPage(.35);assert.equal((await stored()).book.placements.length,0);assert.equal(await card(landscape).getAttribute('data-used'),'false');
 await drop(portraits[0],-.35);await page.reload();await settled(2);assert.equal(await card(portraits[0]).getAttribute('data-used'),'true');
 assert.equal(await card(portraits[0]).getAttribute('draggable'),'false');
 // Native touch taps on used photographs locate them; upward drags replace.
 await page.setViewportSize({width:390,height:844});await host().locator('[data-book-step="1"]').click();await settled(3);
 const cdp=await context.newCDPSession(page);await card(portraits[0]).scrollIntoViewIfNeeded();let box=await card(portraits[0]).boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(2);
 await card(portraits[1]).scrollIntoViewIfNeeded();box=await card(portraits[1]).boundingBox();const pickup={x:box.x+box.width/2,y:box.y+box.height/2},destination=await world(-.35);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pickup]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pickup.x,y:pickup.y-20}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[destination]});await page.waitForFunction(()=>document.querySelector('[data-book-viewer="assembly"]').dataset.dropPages==='2');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(2);assert.equal(await card(portraits[0]).getAttribute('data-used'),'false');
 assert.equal(await card(portraits[1]).getAttribute('data-used'),'true');await page.screenshot({path:'tmp/pdfs/assembly-mobile-selection.png'});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[destination]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(2);assert.equal((await stored()).book.placements.length,0);
 assert.ok(scene);assert.deepEqual(errors,[]);
 console.log('PASS: visible grey drop/white hover, non-repeatable images, used-gallery animated navigation, click-to-clear, full-spread replacement/removal, reload persistence and native mobile touch.');
}catch(error){await page.screenshot({path:'tmp/pdfs/assembly-selection-failure.png'});console.error(errors);throw error;}
finally{await browser.close();}
