import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const runtimeRequire=createRequire(process.env.PLAYWRIGHT_MODULE?`${process.env.PLAYWRIGHT_MODULE}/package.json`:import.meta.url);
const {PNG}=runtimeRequire('pngjs');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('requestfailed',request=>errors.push(`${request.url()}: ${request.failure()?.errorText}`));
const host=()=>page.locator('[data-book-viewer]');
const pose=async()=>JSON.parse(await host().getAttribute('data-cover-pose'));
async function settled(index){await page.waitForFunction(index=>{const h=document.querySelector('[data-book-viewer]');return h?.dataset.bookState===String(index)&&h.dataset.motion==='idle'&&h.dataset.ready==='true';},index);}
async function edge(direction,x,y=.1){return page.evaluate(async ({direction,x,y})=>{
  const THREE=await import('/vendor/three.module.min.js'),{PAGE_LAYERS}=await import('/js/paper-motion.js');
  const host=document.querySelector('[data-book-viewer]'),rect=host.querySelector('.book-stage').getBoundingClientRect(),aspect=rect.width/rect.height;
  const index=Number(host.dataset.bookState),cover=index===0||index===18||index===1&&direction<0||index===17&&direction>0,width=cover?1+12.7/210:1;
  const half=Math.max((297/210+2*12.7/210)*.62,(1+12.7/210)*1.22/aspect)/Number(host.dataset.displayScale||1),center=Number(host.dataset.centerX);
  const camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,30);
  camera.position.set(center,-1.3,7);camera.lookAt(center,0,0);camera.updateMatrixWorld();
  const point=new THREE.Vector3(x??direction*width*.95,y,PAGE_LAYERS.restingZ).project(camera);
  return{x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2,travel:width/(2*half*aspect)*rect.width};
},{direction,x,y});}
async function hold(direction,progress,startFraction=.95){
  const point=await edge(direction);point.x+=direction*(startFraction-.95)*point.travel;
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  await page.mouse.move(point.x-direction*point.travel*progress,point.y,{steps:14});
  await page.waitForFunction(progress=>{const h=document.querySelector('[data-book-viewer]');return h.dataset.motion==='turn'&&Math.abs(Number(h.dataset.motionProgress)-progress)<.0001;},progress);
  assert.equal(await host().getAttribute('data-cover-count'),'2');
  return point;
}
async function land(direction,part,from,to){
  await hold(direction,.9999);const before=(await pose())[part];
  await page.mouse.up();await settled(to);const after=(await pose())[part];
  assert.equal(after.id,before.id);assert.equal(after.geometry,before.geometry);
  assert.equal(after.z,before.z);assert.equal(after.width,before.width);assert.equal(after.height,before.height);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(before.vertices[i][j]-after.vertices[i][j])<.001,'No cover jump between final animation and resting geometry.');
  assert.equal(await host().getAttribute('data-cover-count'),'2');
}
async function photograph(side,label,distance=.91){
  const box=await host().locator('.book-stage').boundingBox(),png=PNG.sync.read(await host().locator('.book-stage').screenshot());
  const colors=[];
  for(const y of [-.5,-.25,0,.25,.5]){
    const point=await edge(0,side*distance,y),x=Math.round((point.x-box.x)*png.width/box.width),row=Math.round((point.y-box.y)*png.height/box.height);
    const i=(row*png.width+x)*4;colors.push([...png.data.subarray(i,i+3)]);
  }
  assert.ok(colors.some(color=>Math.max(...color)-Math.min(...color)>25),`${label}: photograph was covered by a blank paper surface (${JSON.stringify(colors)}).`);
}
async function releaseSamples(){return page.evaluate(()=>new Promise(resolve=>{
  const values=[];function sample(){const h=document.querySelector('[data-book-viewer]');values.push(Number(h.dataset.motionProgress));
    if(h.dataset.motion==='idle')resolve(values);else requestAnimationFrame(sample);}sample();
}));}
async function interruptDrag(direction,progress,kind,index){
  await page.evaluate(()=>document.querySelector('.book-stage').addEventListener('gotpointercapture',event=>{
    event.currentTarget.dataset.testPointer=String(event.pointerId);
  },{once:true}));
  const point=await hold(direction,progress);
  assert.equal(await page.evaluate(kind=>{
    const stage=document.querySelector('.book-stage'),pointerId=Number(stage.dataset.testPointer);
    if(!stage.hasPointerCapture(pointerId))return false;
    if(kind==='capture')stage.releasePointerCapture(pointerId);
    else stage.dispatchEvent(new PointerEvent('pointercancel',{pointerId,bubbles:true,clientX:0,clientY:0}));
    return true;
  },kind),true);
  // Capture release is processed before the next native pointer event.
  await page.mouse.move(point.x-direction*point.travel*progress,point.y);
  await settled(index);await page.mouse.up();
}
try{
  await mkdir('tmp/pdfs',{recursive:true});await page.goto((process.env.PROTOTYPE_URL||'http://127.0.0.1:8000')+'/?mapping=1#/home',{waitUntil:'networkidle'});await page.locator('#introduction').waitFor({state:'hidden'});await settled(0);
  await page.getByText('DEVELOPMENT — PHYSICAL MAPPING',{exact:true}).click();
  const initial=await pose();await host().locator('.book-stage').screenshot({path:'tmp/pdfs/physical-cover.png'});
  // Pause a real drag to inspect the inside artwork while it is attached.
  await hold(1,.55);await host().locator('.book-stage').screenshot({path:'tmp/pdfs/cover-opening-midway.png'});
  const contained = await page.evaluate(async()=>{
    const THREE=await import('/vendor/three.module.min.js'),host=document.querySelector('[data-book-viewer]'),stage=host.querySelector('.book-stage'),aspect=stage.clientWidth/stage.clientHeight;
    const half=Math.max((297/210+2*12.7/210)*.62,(1+12.7/210)*1.22/aspect)/Number(host.dataset.displayScale),x=Number(host.dataset.centerX),y=Number(host.dataset.centerY||0);
    const camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,30);camera.position.set(x,y-1.3,7);camera.lookAt(x,y,0);camera.updateMatrixWorld();
    return Object.values(JSON.parse(host.dataset.coverPose)).flatMap(cover=>cover.vertices).every(point=>Math.abs(new THREE.Vector3(...point).project(camera).y)<1);
  });
  assert.ok(contained,'The enlarged cover must remain within the viewport while turning.');
  await page.mouse.up();await settled(1);
  assert.equal((await pose()).front.id,initial.front.id);
  const open=await pose();await host().locator('.book-stage').screenshot({path:'tmp/pdfs/physical-first-spread.png'});
  for(let index=2;index<=5;index++){
    await host().locator('[data-book-step="1"]').click();await settled(index);
    assert.deepEqual((await pose()).front,open.front,'The inside front cover does not move as interior pages change.');
    assert.deepEqual((await pose()).back,open.back,'The back cover stays below the pages.');
  }
  for(let index=4;index>=1;index--){await host().locator('[data-book-step="-1"]').click();await settled(index);}
  assert.deepEqual((await pose()).front,open.front);
  await land(-1,'front',1,0);assert.equal((await pose()).front.id,initial.front.id);
  await land(1,'front',0,1);await land(-1,'front',1,0);
  await host().focus();await page.keyboard.press('End');await settled(18);
  await land(-1,'back',18,17);const openBack=await pose();
  await host().locator('[data-book-step="-1"]').click();await settled(16);assert.deepEqual((await pose()).back,openBack.back);
  await host().locator('[data-book-step="1"]').click();await settled(17);
  await land(1,'back',17,18);await land(-1,'back',18,17);await land(1,'back',17,18);
  assert.equal((await pose()).back.id,initial.back.id);
  // The previously white rectangles: early revealed page 3, the inside
  // front/back covers, and page 32 under the closing back cover.
  await host().focus();await page.keyboard.press('Home');await settled(0);
  await host().locator('[data-book-step="1"]').click();await settled(1);
  await hold(1,.1);await photograph(1,'Page 3 during the first interior turn');
  await host().locator('.book-stage').screenshot({path:'tmp/pdfs/revealed-page-3.png'});
  await page.mouse.up();await settled(1);
  await hold(1,.36);const point=await edge(1);
  await page.mouse.move(point.x-point.travel*.37,point.y);await page.waitForTimeout(15);
  await page.mouse.move(point.x-point.travel*.34,point.y);await page.mouse.up();await settled(2);
  await hold(-1,.55);await photograph(-1,'Inside front cover during backward turn');await page.mouse.up();await settled(1);
  await host().locator('[data-book-step="1"]').click();await settled(2);
  await hold(1,.55);const reverse=await edge(1);
  await page.mouse.move(reverse.x-reverse.travel*.45,reverse.y);await page.waitForTimeout(20);
  await page.mouse.move(reverse.x-reverse.travel*.25,reverse.y);await page.mouse.up();
  const samples=await releaseSamples();await settled(2);
  assert.ok(samples.every((value,i)=>!i||value<=samples[i-1]+1e-6),'Cancelled turn must return without an outward rebound.');
  // Short, slow drags work from the newly enlarged interaction area in both
  // directions. Relaxing after crossing the threshold retains turn intent.
  await hold(1,.16,.55);await page.mouse.up();await settled(3);
  await hold(-1,.16,.55);await page.mouse.up();await settled(2);
  await hold(1,.2);const relaxed=await edge(1);
  await page.mouse.move(relaxed.x-relaxed.travel*.12,relaxed.y);await page.waitForTimeout(150);
  await page.mouse.up();await settled(3);
  await hold(1,.2);const returned=await edge(1);
  await page.mouse.move(returned.x-returned.travel*.04,returned.y);await page.waitForTimeout(150);
  await page.mouse.up();await settled(3);
  // Real capture loss and browser cancellation events can omit coordinates.
  await interruptDrag(1,.16,'capture',4);
  await interruptDrag(-1,.16,'cancel',3);
  await interruptDrag(1,.025,'capture',3);
  await page.screenshot({path:'tmp/pdfs/easier-page-turns.png'});
  await host().focus();await page.keyboard.press('End');await settled(18);
  await host().locator('[data-book-step="-1"]').click();await settled(17);
  await host().locator('[data-book-step="-1"]').click();await settled(16);
  await hold(1,.55);await photograph(1,'Inside back cover under page 31');
  await host().locator('.book-stage').screenshot({path:'tmp/pdfs/revealed-inside-back.png'});await page.mouse.up();await settled(17);
  await hold(1,.7);await photograph(-1,'Page 32 under the closing back cover');await page.mouse.up();await settled(18);
  // Hold the next source request to prove turns do not expose undecoded paper.
  let unblock,requested;const waiting=new Promise(resolve=>{unblock=resolve;});const seen=new Promise(resolve=>{requested=resolve;});
  await page.route(/\/02(?:%20| )FIRST(?:%20| )EDITION\.jpg$/,async route=>{requested();await waiting;await route.continue();});
  try{
    await page.reload();await settled(0);await page.getByText('DEVELOPMENT — PHYSICAL MAPPING',{exact:true}).click();await host().locator('[data-book-step="1"]').click();await settled(1);await seen;
    await host().locator('[data-book-step="1"]').click();await page.waitForTimeout(120);
    assert.equal(await host().getAttribute('data-motion-progress'),'0.00000','Wait flat while the next photograph loads.');
    await photograph(1,'Current page while adjacent texture is delayed',.35);
    unblock();await settled(2);
  }finally{unblock();}
  assert.deepEqual(errors,[]);
  console.log('PASS: stable covers, continuous landings, revealed photographs, delayed-texture gating, short drags in both directions, release hysteresis, capture-loss/cancellation and rebound-free settling.');
}catch(error){
  console.error('Viewer diagnostics:',await host().evaluate(element=>({...element.dataset,message:element.querySelector('.book-message')?.textContent})).catch(()=>null),errors);
  throw error;
}finally{await browser.close();}
