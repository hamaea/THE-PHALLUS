import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateBookPdf, generatePurchasedPdf, generateOrderPdf } from '../js/pdf.js';
import { createBook, createFirstEdition, placeAsset, finishBook, setCover, spreadNumbers } from '../js/book.js';
import { ASSETS, assetById as assets } from '../js/assets.js';
import { addFirstEdition, addCustomEdition, simulateCheckout } from '../js/commerce.js';
globalThis.self=globalThis; await import('../vendor/pdf-lib.min.js');
const portrait=ASSETS.find(a=>a.orientation==='vertical'),landscape=ASSETS.find(a=>a.orientation==='horizontal');
const bytes=asset=>readFile(new URL(`../${asset.src}`,import.meta.url)),output=new URL('../tmp/pdfs/',import.meta.url);
const commandsOf=(pdf,page)=>page.node.Contents().asArray().map(ref=>new TextDecoder().decode(globalThis.PDFLib.decodePDFRawStream(pdf.context.lookup(ref)).decode())).join('\n');
const imagesOf=pdf=>pdf.context.enumerateIndirectObjects().filter(([,o])=>o.dict?.get(globalThis.PDFLib.PDFName.of('Subtype'))?.toString()==='/Image');
// Old saved editions can contain repeats. Export must retain those selections;
// these fixtures deliberately model them without permitting new repeated input.
function legacyPlacement(book, page, asset) {
 return placeAsset(book, page, asset, { restoringLegacy: true });
}
test('duplex proof has 18 exact A2 sides, preserving two independent top-page rotations per photo side',async()=>{
 await mkdir(output,{recursive:true});const data=await generateBookPdf(createBook(),assets,bytes,{proof:true});await writeFile(new URL('imposition-proof.pdf',output),data);
 const pdf=await globalThis.PDFLib.PDFDocument.load(data);assert.equal(pdf.getPageCount(),18);
 for(const page of pdf.getPages()) {assert.ok(Math.abs(page.getWidth()-420*72/25.4)<.01);assert.ok(Math.abs(page.getHeight()-594*72/25.4)<.01);}
 for(const page of pdf.getPages().filter((_,i)=>i>=2&&i%2===0)) assert.equal((commandsOf(pdf,page).match(/-1 0 0 -1 [\d.]+ [\d.]+ cm/g)||[]).length,2);
});
test('custom mixed page/spread export keeps original JPEG reuse, nine reverse layouts and purchase gate',async()=>{
 let book=createBook('pdf-photos');for(let i=0;i<17;i++) {
  const pair=spreadNumbers(i);if(i%2) for(const n of pair) book=legacyPlacement(book,n,portrait);else book=legacyPlacement(book,pair[0],landscape);
 }
 book=finishBook(setCover(book,portrait.id));await assert.rejects(()=>generatePurchasedPdf([],'unpaid','unpaid',assets,bytes));
 const paid=simulateCheckout(addCustomEdition([],book),[]),data=await generatePurchasedPdf(paid.orders,paid.order.id,paid.order.items[0].id,assets,bytes);
 await writeFile(new URL('assembled-photo-check.pdf',output),data);
 const pdf=await globalThis.PDFLib.PDFDocument.load(data);assert.equal(pdf.getPageCount(),18);assert.equal(imagesOf(pdf).length,11);
});
test('a 2–3 spread is independently clipped onto sheets 01 and 02 without copying the whole photo twice',async()=>{
 const fixture={id:'spread-halves',src:'tests/fixtures/spread-halves.jpg',width:840,height:594,orientation:'horizontal'}, fixtureAssets=new Map([[fixture.id,fixture]]);
 let book=createBook('split-proof');for(let i=0;i<17;i++) book=legacyPlacement(book,spreadNumbers(i)[0],fixture);
 // End pages use preserved half frames to make this eight-sheet pixel proof uniform.
 book.placements.find(p=>p.pages[0]===1).frame={x:-1,width:2};book.placements.find(p=>p.pages[0]===32).frame={x:0,width:2};
 book=finishBook(book);const data=await generateBookPdf(book,fixtureAssets,bytes,{debug:false});await writeFile(new URL('spread-halves-proof.pdf',output),data);
 const pdf=await globalThis.PDFLib.PDFDocument.load(data),commands=commandsOf(pdf,pdf.getPages()[2]),halfWidth=pdf.getPages()[2].getWidth()/2;
 const offsets=[...commands.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm/g)];assert.equal(offsets.filter(m=>Math.abs(Number(m[1])+halfWidth)<.01).length,2);
 assert.equal(imagesOf(pdf).length,11);
});
test('first edition embeds all 18 untouched source layouts rather than interpreting them as page photos',async()=>{
 const data=await generateBookPdf(createFirstEdition(),assets,bytes);await writeFile(new URL('first-edition-duplex.pdf',output),data);
 const pdf=await globalThis.PDFLib.PDFDocument.load(data);assert.equal(pdf.getPageCount(),18);assert.equal(imagesOf(pdf).length,18);
 for(const page of pdf.getPages()) assert.equal((commandsOf(pdf,page).match(/ Do/g)||[]).length,1);
});
test('complete order PDF keeps copies contiguous, includes every A2 side and identifies book boundaries',async()=>{
 let book=createBook('order-custom');
 const verticals=ASSETS.filter(asset=>asset.orientation==='vertical'),horizontals=ASSETS.filter(asset=>asset.orientation==='horizontal');
 for(let i=0;i<17;i++) book=placeAsset(book,spreadNumbers(i)[0],i===0?verticals[0]:i===16?verticals[1]:horizontals[i-1]);
 book=finishBook(book);
 const bag=addCustomEdition(addCustomEdition(addFirstEdition([]),book),book),order=simulateCheckout(bag,[]).order;
 const data=await generateOrderPdf(order,assets,bytes);await writeFile(new URL('complete-order-check.pdf',output),data);
 const pdf=await globalThis.PDFLib.PDFDocument.load(data);assert.equal(pdf.getPageCount(),54);
 for(const page of pdf.getPages()) {
  assert.ok(Math.abs(page.getWidth()-420*72/25.4)<.01);assert.ok(Math.abs(page.getHeight()-594*72/25.4)<.01);
 }
 assert.notEqual(pdf.getPage(18).ref.toString(),pdf.getPage(36).ref.toString());
 assert.equal(commandsOf(pdf,pdf.getPage(18)),commandsOf(pdf,pdf.getPage(36)));
 assert.equal(commandsOf(pdf,pdf.getPage(20)),commandsOf(pdf,pdf.getPage(38)));
 const labels=pdf.catalog.lookup(globalThis.PDFLib.PDFName.of('PageLabels')).lookup(globalThis.PDFLib.PDFName.of('Nums'));
 assert.deepEqual([0,2,4].map(i=>labels.get(i).asNumber()),[0,18,36]);
 assert.ok(pdf.catalog.get(globalThis.PDFLib.PDFName.of('Outlines')));
 await assert.rejects(()=>generateOrderPdf({status:'unpaid',items:order.items},assets,bytes));
});
