import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ASSETS } from '../js/assets.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>errors.push(`${request.url()}: ${request.failure()?.errorText}`));
await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};});
try {
 await page.goto((process.env.PROTOTYPE_URL||'http://127.0.0.1:8000')+'/#/assembly');await page.locator('.no-webgl').waitFor();
 const portrait=ASSETS.find(a=>a.orientation==='vertical'),card=page.locator(`.gallery-photo[data-asset="${portrait.id}"]`),target=n=>page.locator(`.page-target[data-page="${n}"]`);
 await card.click();await target(2).click();assert.equal(await card.getAttribute('data-used'),'true');
 await page.locator('[data-action="assembly-next"]').click();await card.click();
 assert.equal(await page.locator('.reader-spread').getAttribute('data-spread'),'2');
 assert.equal(await page.locator('[data-book-viewer]').getAttribute('data-selected-asset'),'');
 await target(2).click();assert.equal(await card.getAttribute('data-used'),'false');
 await card.click();await target(3).click();assert.equal(await card.getAttribute('data-used'),'true');
 const book=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-phallus.prototype.v3')).book);
 assert.equal(book.placements.length,1);assert.deepEqual(book.placements[0].pages,[3]);assert.deepEqual(errors,[]);
 console.log('PASS: WebGL-disabled used-image navigation, click-to-clear, reuse after removal and unique placement.');
}catch(error){console.error(errors);throw error;}finally{await browser.close();}
