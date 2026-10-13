import test from 'node:test';
import assert from 'node:assert/strict';
import { createBook, createFirstEdition, placeAsset, removePlacement, setCover, finishBook, completion, getSpread, assertBook, pageImageFrame, placementForPage, spreadNumbers, pagesForAsset } from '../js/book.js';
import { IMPOSITION_MAP, FOLIO_MAP, READER_MAP, getPoster, printPlan, QUADRANTS } from '../js/imposition.js';
import { addFirstEdition, addCustomEdition, removeBagItem, simulateCheckout, exportItem, changeQuantity, bagTotal, quantityOf } from '../js/commerce.js';
import { initialState, loadState, saveState, STORAGE_KEY, LEGACY_STORAGE_KEY, V2_STORAGE_KEY } from '../js/storage.js';
import { ASSETS, assetById as assets, chooseHero } from '../js/assets.js';
import { HERO_ASSETS } from '../js/assets-data.js';
import { posterView, readerSpread } from '../js/views.js';
import { readerSurface, coverSurface, spreadState, foldedFolioSurface, unfoldedSurfaces } from '../js/book-surfaces.js';
import { turnProfile, curlPoint, gestureKind, spring } from '../js/paper-motion.js';
const vertical = ASSETS.find(a => a.orientation === 'vertical'), horizontal = ASSETS.find(a => a.orientation === 'horizontal');
function filledBook() {
  let book = createBook('test-book');
  const landscapes = ASSETS.filter(asset => asset.orientation === 'horizontal'), portraits = ASSETS.filter(asset => asset.orientation === 'vertical');
  for (let i = 0; i < 17; i++) book = placeAsset(book, spreadNumbers(i)[0], i === 0 ? portraits[1] : i === 16 ? portraits[2] : landscapes[i - 1]);
  return finishBook(book);
}
test('conventional facing pages cover all 32 positions exactly once, including single ends', () => {
  const book = createBook(), seen = [];
  for (let i = 0; i < 17; i++) {
    const numbers = getSpread(book, i).map(p => p.pageNumber); seen.push(...numbers);
    assert.deepEqual(numbers, i === 0 ? [1] : i === 16 ? [32] : [2 * i, 2 * i + 1]);
  }
  assert.deepEqual(seen, Array.from({length:32}, (_, i) => i + 1));
  assert.throws(() => getSpread(book, 17));
  assert.equal((readerSpread(book, 0, {editing:true}).match(/class="page-target /g) || []).length, 1);
});
test('all 32 drop anchors place portraits singly and landscapes on actual facing pages', () => {
  for (let n = 1; n <= 32; n++) {
    const portrait = placeAsset(createBook(), n, vertical), book = placeAsset(createBook(), n, horizontal);
    assert.deepEqual(portrait.placements[0].pages, [n]);
    const pair = n === 1 || n === 32 ? [n] : [Math.floor(n / 2) * 2, Math.floor(n / 2) * 2 + 1];
    assert.deepEqual(book.placements[0].pages, pair);
    assert.equal(completion(book).filledSlots, pair.length); assertBook(book, assets);
    if (pair.length === 2) assert.equal(book.pages[pair[0] - 1].placementId, book.pages[pair[1] - 1].placementId);
  }
});
test('replacement and removal clear both halves of a shared placement without disturbing other pages', () => {
  let book = placeAsset(createBook(), 2, horizontal); book = placeAsset(book, 3, vertical);
  assert.equal(placementForPage(book, 2), null); assert.equal(placementForPage(book, 3).type, 'page');
  book = placeAsset(book, 2, ASSETS.filter(asset => asset.orientation === 'vertical')[1]); book = placeAsset(book, 3, horizontal);
  assert.equal(book.placements.length, 1);
  book = placeAsset(book, 4, ASSETS.filter(asset => asset.orientation === 'horizontal')[1]); book = removePlacement(book, 3);
  assert.equal(placementForPage(book, 2), null); assert.equal(placementForPage(book, 3), null);
  assert.equal(placementForPage(book, 4).type, 'spread'); assertBook(book, assets);
});
test('photographs cannot repeat; a facing spread uses one image and clearing/replacement makes it available again', () => {
  let book = placeAsset(createBook(), 2, horizontal);
  assert.deepEqual(pagesForAsset(book, horizontal.id), [2,3]);
  const original = structuredClone(book);
  assert.throws(() => placeAsset(book, 4, horizontal), /already in your book/);
  assert.throws(() => placeAsset(book, 3, horizontal), /already in your book/);
  assert.deepEqual(book, original);
  book = placeAsset(book, 3, vertical);
  assert.deepEqual(pagesForAsset(book, horizontal.id), []);
  assert.throws(() => placeAsset(book, 4, vertical), /already in your book/);
  book = removePlacement(book, 3); book = placeAsset(book, 4, vertical);
  assert.deepEqual(pagesForAsset(book, vertical.id), [4]);
  assertBook(book, assets);
});
test('one continuous 2–3 source supplies distinct page portions to reader, 3D and distant print quadrants', () => {
  const book = placeAsset(createBook(), 3, horizontal), left = pageImageFrame(book, 2), right = pageImageFrame(book, 3);
  assert.equal(left.placement, right.placement); assert.equal(left.x, 0); assert.equal(right.x, -1);
  assert.equal(left.width, 2); assert.equal(right.width, 2);
  assert.equal((readerSpread(book, 1).match(/<img /g) || []).length, 1);
  assert.ok(posterView(book, 0).includes('data-part="left"'));
  assert.ok(posterView(book, 1).includes('data-part="right"'));
  assert.deepEqual(readerSurface(book, 2).frame, {x:0,width:2}); assert.deepEqual(readerSurface(book, 3).frame, {x:-1,width:2});
});
test('all eight corrected photo maps pair with matching printed folio numbers', () => {
  const expected = [[1,32,2,31],[3,30,4,29],[5,28,6,27],[7,26,8,25],[9,24,10,23],[11,22,12,21],[13,20,14,19],[15,18,16,17]];
  expected.forEach((numbers, i) => {
    const poster = getPoster(filledBook(), i);
    assert.deepEqual(poster.quadrants.map(q => q.pageNumber), numbers);
    assert.deepEqual(poster.quadrants.map(q => q.rotation), [180,180,0,0]);
    for (const q of poster.quadrants) {
      const mapping = READER_MAP[q.pageNumber - 1];
      assert.equal(mapping.sheet, i + 1); assert.equal(mapping.quadrant, q.position);
      assert.equal(mapping.reverse.pageNumber, q.pageNumber);
      assert.deepEqual(mapping.reverse.rect, QUADRANTS[{topLeft:'topRight',topRight:'topLeft',bottomLeft:'bottomRight',bottomRight:'bottomLeft'}[q.position]]);
      assert.equal(mapping.side, q.pageNumber % 2 ? 'right' : 'left');
    }
  });
  for (const [n, sheet, quadrant] of [[1,1,'topLeft'],[2,1,'bottomLeft'],[7,4,'topLeft'],[8,4,'bottomLeft'],[31,1,'bottomRight'],[32,1,'topRight']]) {
    assert.equal(READER_MAP[n-1].sheet, sheet); assert.equal(READER_MAP[n-1].quadrant, quadrant);
  }
  assert.equal(printPlan(filledBook(), {duplex:true}).length, 18); assert.equal(IMPOSITION_MAP.length, 8);
  assert.deepEqual(FOLIO_MAP.map(sheet=>sheet.quadrants.map(q=>q.pageNumber)),
    [[32,1,31,2],[30,3,29,4],[28,5,27,6],[26,7,25,8],[24,9,23,10],[22,11,21,12],[20,13,19,14],[18,15,17,16]], 'Working B assignment remains unchanged.');
});
test('completion and revision validity still track 32 positions', () => {
  assert.throws(() => finishBook(createBook())); const book = filledBook();
  assert.equal(completion(book).filledSlots, 32); assert.equal(book.placements.length, 17);
  assert.equal(placeAsset(book, 2, vertical).completed, false); assert.equal(completion(placeAsset(book, 2, vertical)).emptySlots, 1);
  assert.equal(setCover(book, vertical.id).completed, false); assert.equal(completion(removePlacement(book, 3)).emptySlots, 2);
});
test('validation rejects old 1–2 spreads, cross-spread pairs and broken page references', () => {
  let book = placeAsset(createBook(), 2, horizontal);
  book.placements[0].pages = [1,2]; book.placements[0].leftPage = 1; book.placements[0].rightPage = 2;
  assert.throws(() => assertBook(book, assets), /occupancy/);
  book = placeAsset(createBook(), 2, horizontal); book.pages[2].placementId = null;
  assert.throws(() => assertBook(book, assets), /reference/);
  assert.throws(() => placeAsset(book, 33, horizontal));
});
test('immutable bag snapshots, quantity grouping and export permission stay intact', () => {
  let bag = addFirstEdition([]); assert.equal(addFirstEdition(bag).length, 1);
  assert.equal(addFirstEdition(bag)[0].quantity,2);
  assert.throws(() => addCustomEdition(bag, createBook())); const book = filledBook(); bag = addCustomEdition(bag, book);
  assert.equal(addCustomEdition(bag, book).length, 2); book.pages[0].placementId = null;
  assert.ok(bag[1].book.pages[0].placementId);
  const paid = simulateCheckout(bag, []); assert.equal(paid.bag.length, 0);
  assert.equal(exportItem(paid.orders, paid.order.id, bag[1].id).kind, 'custom');
  assert.throws(() => exportItem([], 'missing', bag[1].id)); assert.equal(removeBagItem(bag, bag[1].id).length, 1);
});
test('quantities update totals, zero removes items, and different configurations remain separate', () => {
  let book = filledBook(), bag = addCustomEdition(addFirstEdition([]),book);
  bag = addCustomEdition(bag,book);
  assert.equal(bag.length,2); assert.equal(quantityOf(bag[1]),2); assert.equal(bagTotal(bag),240);
  const identical = {...structuredClone(book),id:'another-book',revision:999};
  bag = addCustomEdition(bag,identical); assert.equal(bag.length,2); assert.equal(bag[1].quantity,3);
  const newPhoto = ASSETS.filter(asset=>asset.orientation==='vertical')[4];
  book = finishBook(placeAsset(book,1,newPhoto)); bag = addCustomEdition(bag,book);
  assert.equal(bag.length,3); assert.notEqual(bag[1].book.placements[0]?.assetId,bag[2].book.placements.at(-1)?.assetId);
  const order = simulateCheckout(bag,[]).order;
  bag = changeQuantity(bag,bag[0].id,-1); assert.equal(bag.length,2);
  bag = changeQuantity(bag,bag[0].id,-1); assert.equal(bag[0].quantity,2);
  assert.equal(order.items[1].quantity,3); assert.deepEqual(order.actions,{viewed:false,downloaded:false});
  assert.throws(()=>changeQuantity(bag,bag[0].id,-2));
});
test('v3 persistence round trips the conventional model and reports unavailable storage', () => {
  const memory = new Map(), storage = {getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}, state = initialState();
  state.book = filledBook(); state.bag = addCustomEdition([], state.book); state.ui.assemblySpread = 16;
  saveState(storage, state); assert.deepEqual(loadState(storage, assets).state, state);
  storage.setItem(STORAGE_KEY, '{broken'); assert.ok(loadState(storage, assets).warning); assert.ok(saveState(null, state));
});
test('v2 migration preserves both old source halves, bag/orders and untouched raw backup', () => {
  const old = initialState(); old.version = 2; old.book = createBook('old');
  const p = {id:'old-spread',assetId:horizontal.id,type:'spread',orientation:'horizontal',pages:[1,2],leftPage:1,rightPage:2};
  old.book.placements = [p]; old.book.pages[0].placementId = old.book.pages[1].placementId = p.id;
  const raw = JSON.stringify(old), memory = new Map([[V2_STORAGE_KEY,raw]]), storage = {getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
  const result = loadState(storage, assets); assert.equal(result.migrated, true);
  assert.deepEqual(pageImageFrame(result.state.book, 1).x, 0); assert.deepEqual(pageImageFrame(result.state.book, 2).x, -1);
  assert.equal(result.state.book.placements.length, 2); saveState(storage, result.state); assert.equal(memory.get(V2_STORAGE_KEY), raw);
});
test('v1 migration preserves original backup, snapshots and orders under the new reading order', () => {
  const book = {id:'old-v1',revision:60,completed:true,cover:createBook().cover,pages:Array.from({length:32},(_,i)=>({pageNumber:i+1,
    placements:[{assetId:horizontal.id,orientation:'horizontal',occupiedSlots:[0,1]}]}))};
  const item={id:'legacy',kind:'custom',title:'Custom',book};
  const raw=JSON.stringify({version:1,book,bag:[item],ui:{assemblySpread:7},orders:[{id:'old-order',status:'simulated-paid',items:[item]}]});
  const memory=new Map([[LEGACY_STORAGE_KEY,raw]]),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
  const result=loadState(storage,assets); assert.equal(result.migrated,true); assert.equal(result.state.book.completed,false);
  assert.equal(result.state.book.placements.length,17); assert.equal(result.state.orders[0].items[0].id,'legacy');
  saveState(storage,result.state);assert.equal(memory.get(LEGACY_STORAGE_KEY),raw);
});
test('first edition uses real sheet crops; full 3D reading sequence includes both covers and all pages', () => {
  const book=createFirstEdition(), seen=[];
  assertBook(book,assets,{allowFirstEdition:true}); assert.ok(book.pages.every(p=>!p.placeholder));
  for(let i=0;i<19;i++) for(const surface of Object.values(spreadState(book,i))) if(surface?.pageNumber) seen.push(surface.pageNumber);
  assert.deepEqual(seen,Array.from({length:32},(_,i)=>i+1));
  assert.equal(readerSurface(book,7).assetId,'04 FIRST EDITION');
  assert.deepEqual(readerSurface(book,7,true).rect,{x:.5,y:0,width:.5,height:.5});
});
test('all six heroes are individually selectable; gallery IDs and names stay unique',()=>{
  assert.equal(HERO_ASSETS.length,6);
  HERO_ASSETS.forEach((asset,i)=>assert.equal(chooseHero(()=>i/6).id,asset.id));
  assert.equal(new Set(ASSETS.map(a=>a.id)).size,ASSETS.length); assert.equal(ASSETS.length,41);
});
test('unfolded posters use eight complete paired sheets, EXIF photo rotation and mirrored back coordinates',()=>{
  for(let index=0;index<8;index++) {
    const {front,back}=unfoldedSurfaces(index),mapping=READER_MAP[index*2];
    assert.equal(front.assetId,mapping.sourceId);assert.equal(back.assetId,mapping.reverse.firstId);
    assert.equal(front.rotation,180);assert.equal(back.flipX,true);
    assert.equal(front.rect,undefined);assert.equal(back.rect,undefined);
    assert.equal(front.contain,true);assert.equal(back.contain,true);
  }
  assert.throws(()=>unfoldedSurfaces(8));
});
test('paper deformations preserve the spine, settle flat and restrict curling to the corner',()=>{
  for(const p of [0,.3,.5,.8,1]) assert.deepEqual(turnProfile(p,1)[0],[0,0]);
  assert.ok(Math.abs(turnProfile(1,1).at(-1)[0]+1)<1e-6);
  assert.deepEqual(curlPoint(0,.5,1,1.414,1),[0,0,0]);
  assert.deepEqual(curlPoint(1,1,1,1.414,1),[1,.707,0]);
  assert.ok(curlPoint(1,0,1,1.414,1)[2]>.15);
  assert.equal(gestureKind(-100,-20,true),'turn'); assert.equal(gestureKind(5,-100,true),'curl');
  let value=1,velocity=0;for(let i=0;i<200;i++) [value,velocity]=spring(value,velocity,0,1/60);
  assert.deepEqual([value,velocity],[0,0]);
});

test('both supplied covers use the same EXIF-correct panels; selected photos and B crops keep their frames', () => {
  const book = createFirstEdition(), custom = createBook();
  for (const [part,x,y,rotation] of [['front',.5,.5,0],['back',0,.5,0],['insideFront',.5,0,180],['insideBack',0,0,180]]) {
    assert.deepEqual(coverSurface(book,part).rect, {x:.5-x,y:.5-y,width:.5,height:.5});
    assert.equal(coverSurface(book,part).rotation, (rotation+180)%360);
    assert.deepEqual(coverSurface(custom,part).rect, coverSurface(book,part).rect);
    assert.equal(coverSurface(custom,part).rotation, coverSurface(book,part).rotation);
    assert.equal(coverSurface(custom,part).assetId, 'custom:00. COVER');
    const selected = createBook(); selected.cover.assetId = ASSETS[0].id;
    assert.deepEqual(coverSurface(selected,part).rect, {x,y,width:.5,height:.5});
    assert.equal(coverSurface(selected,part).rotation, rotation);
    assert.equal(coverSurface(selected,part).imposedPhoto, true);
    assert.equal(coverSurface(book,part).contain, undefined);
    assert.deepEqual(coverSurface(book,part,true).rect, {x:1-x-.5,y,width:.5,height:.5});
    assert.deepEqual(coverSurface(custom,part,true).rect, coverSurface(book,part,true).rect);
    assert.equal(coverSurface(custom,part,true).assetId, '00B CUSTOM EDITION');
  }
  const seen = new Set();
  for (const mapping of READER_MAP) {
    const surface = readerSurface(book, mapping.pageNumber);
    assert.deepEqual(surface.rect, {x:.5-mapping.rect.x,y:.5-mapping.rect.y,width:.5,height:.5});
    assert.equal(surface.rotation, (mapping.rotation+180)%360);
    seen.add(`${surface.assetId}:${surface.rect.x}:${surface.rect.y}`);
  }
  assert.equal(seen.size,32);
  assert.deepEqual(readerSurface(book,1).rect, QUADRANTS.bottomRight);
  assert.equal(readerSurface(book,1).rotation,0);
});

test('both inner folios use distinct paired quadrants of the same B sheet for every folded leaf and cover', () => {
  for (const book of [createFirstEdition(), filledBook()]) {
    for (let number = 1; number <= 32; number++) {
      const mapping = READER_MAP[number - 1], mate = mapping.reverse.foldedMate;
      const leaf = { pageNumber: number }, underside = readerSurface(book, number, true);
      const flat = foldedFolioSurface(book, leaf);
      assert.equal(mate.pageNumber, number % 2 ? number + 1 : number - 1);
      assert.equal(READER_MAP[mate.pageNumber - 1].sheet, mapping.sheet);
      assert.equal(flat.assetId, underside.assetId);
      assert.equal(flat.pageNumber, mate.pageNumber);
      assert.notDeepEqual(flat.rect, underside.rect);
      assert.equal(flat.rect.x, underside.rect.x);
      assert.equal(flat.rotation, mate.rotation);
      assert.equal(flat.flipX, false); assert.equal(underside.flipX, true);
    }
    for (const part of ['front', 'back', 'insideFront', 'insideBack']) {
      const underside = coverSurface(book, part, true);
      const flat = foldedFolioSurface(book, { surface: coverSurface(book, part) });
      assert.equal(flat.assetId, underside.assetId); assert.notDeepEqual(flat.rect, underside.rect);
      assert.equal(flat.rect.x, underside.rect.x); assert.equal(flat.flipX, false);
    }
  }
});

test('configurable maximum corner travel increases upward and inward displacement by 20%', () => {
  const old = curlPoint(1, 0, 1, 297 / 210, 1, { maxFoldDistance: 1 });
  const extended = curlPoint(1, 0, 1, 297 / 210, 1);
  assert.ok(Math.abs((1 - extended[0]) / (1 - old[0]) - 1.2) < 1e-10);
  assert.ok(Math.abs((extended[1] + 297 / 420) / (old[1] + 297 / 420) - 1.2) < 1e-10);
  assert.ok(Math.abs(extended[2] / old[2] - 1.2) < 1e-10);
});

test('corner fold has physical 30–60–90 proportions, expands with lift, and stays on its page', async () => {
  const {curlRegion} = await import('../js/paper-motion.js');
  const region = curlRegion(1, 1);
  assert.ok(Math.abs(region.horizontal / region.vertical - Math.sqrt(3)) < 1e-10);
  assert.ok(region.horizontal > .8); assert.ok(region.vertical < .55);
  assert.ok(curlRegion(1, .2).horizontal < curlRegion(1, .7).horizontal);
  assert.ok(curlPoint(.55, .02, 1, 297 / 210, 1)[2] > .08, 'The bottom fold reaches far inward.');
  for (const amount of [.01,.2,.5,.8,1]) for (let i=0;i<=40;i++) for(let j=0;j<=40;j++) {
    const [x,y,z]=curlPoint(i/40,j/40,1,297/210,amount);
    assert.ok(Number.isFinite(x+y+z)); assert.ok(x >= -1e-9 && x <= 1+1e-9);
    assert.ok(y >= -297/420-1e-9 && y <= 297/420+1e-9); assert.ok(z >= 0 && z < .4);
  }
});

test('release decisions combine adjustable progress, flick velocity and opposite-direction cancellation', async () => {
  const {turnRelease, TURN_SETTINGS, releaseVelocity}=await import('../js/paper-motion.js');
  assert.equal(turnRelease(.31,.1).target,1);
  assert.equal(turnRelease(.15,0).target,1, 'A short deliberate drag now commits without a flick.');
  assert.equal(turnRelease(.08,2).target,1);
  assert.equal(turnRelease(.18,.8).target,1);
  assert.equal(turnRelease(.07,.1).target,0);
  assert.equal(turnRelease(.04,7).target,0);
  assert.equal(turnRelease(.7,-1.4).target,1, 'Velocity alone must not undo a clear turn.');
  assert.equal(turnRelease(.12,-2,TURN_SETTINGS,.08).target,1, 'Retain intent after crossing the shorter threshold.');
  assert.equal(turnRelease(.05,0,TURN_SETTINGS,.2).target,0, 'Returning to the starting edge still cancels.');
  assert.equal(turnRelease(.6,-2,TURN_SETTINGS,.25).target,1, 'A page dragged far across remains committed.');
  assert.equal(turnRelease(.34,-2,TURN_SETTINGS,.03).target,1, 'Release jitter must not cancel a completed drag.');
  assert.equal(turnRelease(.34,-2,TURN_SETTINGS,.2).target,0, 'A substantial reversal still cancels.');
  assert.equal(turnRelease(.31,0,{...TURN_SETTINGS,completeProgress:.3}).target,1);
  assert.equal(releaseVelocity([{time:0,progress:0},{time:80,progress:.16}],80),2);
  assert.equal(releaseVelocity([{time:0,progress:0},{time:100,progress:.2}],250),0);
});
test('turn completion and cancellation settle monotonically even with excessive or opposite initial velocity', async () => {
  const {advanceTurn}=await import('../js/paper-motion.js');
  for(const target of [0,1]) for(const start of [.02,.2,.6,.98]) for(const initial of [-120,-4,0,4,120]) {
    let value=start,velocity=initial;
    for(let frame=0;frame<150 && value!==target;frame++) {
      const previous=value;[value,velocity]=advanceTurn(value,velocity,target,1/60,30);
      assert.ok(target ? value>=previous&&value<=1 : value<=previous&&value>=0);
    }
    assert.equal(value,target); assert.equal(velocity,0);
  }
});
test('critical release motion retains momentum, settles without bouncing and distinguishes turn speeds', async () => {
  const {advanceTurn, TURN_SETTINGS}=await import('../js/paper-motion.js');
  const first=advanceTurn(.2,1.5,1,1/60,TURN_SETTINGS.flickOmega);
  assert.ok(first[0]>.2 && first[0]<.3 && first[1]>0);
  const duration=(start,velocity,omega)=>{
    let value=start,frames=0;
    while(frames<200 && (value!==1||velocity!==0)) {
      const old=value;[value,velocity]=advanceTurn(value,velocity,1,1/60,omega);
      assert.ok(value>=old&&value<=1);frames++;
    }
    assert.equal(value,1);return frames/60;
  };
  const quick=duration(.16,2,TURN_SETTINGS.flickOmega),normal=duration(0,0,TURN_SETTINGS.buttonOmega),slow=duration(.42,0,TURN_SETTINGS.slowOmega);
  assert.ok(quick>=.25&&quick<=.4);assert.ok(normal>=.4&&normal<=.6);assert.ok(slow>=.6&&slow<=.8);
  assert.ok(quick<normal&&normal<slow);
});
test('closed covers center independently and opening/closing centers shift continuously with the same turn progress', async () => {
  const {bookCenter}=await import('../js/paper-motion.js');
  assert.equal(bookCenter(0),.5); assert.equal(bookCenter(18),-.5);assert.equal(bookCenter(2),0);
  assert.equal(bookCenter(0,1),0);assert.equal(bookCenter(17,1),-.5);
  assert.equal(bookCenter(1,1,-1),.5);assert.equal(bookCenter(18,1,-1),0);
  for(let i=1;i<=100;i++) assert.ok(bookCenter(0,i/100)<=bookCenter(0,(i-1)/100));
});
test('turn layers meet the exact landing/resting plane and keep the old destination below the turned verso', async () => {
  const {turnLayers,PAGE_LAYERS}=await import('../js/paper-motion.js');
  assert.equal(turnLayers(0).activeZ,PAGE_LAYERS.restingZ);
  assert.equal(turnLayers(1).activeZ,PAGE_LAYERS.restingZ);
  assert.equal(turnLayers(1).revealedZ,PAGE_LAYERS.restingZ);
  for(let i=50;i<=100;i++) {
    const p=turnLayers(i/100);
    assert.ok(p.activeZ-PAGE_LAYERS.thickness/2>p.destinationZ+PAGE_LAYERS.thickness/2);
  }
});
test('open covers keep a fixed hinge and base height with physically separated thin paper stacks', async () => {
  const {coverSupport,PAGE_LAYERS}=await import('../js/paper-motion.js');
  for(const amount of [0,.25,.5,.75,1]) assert.equal(coverSupport(0,amount),0);
  assert.equal(coverSupport(1,0),0);
  assert.ok(Math.abs(PAGE_LAYERS.restingZ+coverSupport(1,1)-PAGE_LAYERS.coverBaseZ)<1e-10);
  for(let i=0;i<16;i++) assert.ok(PAGE_LAYERS.coverBaseZ+(i+.5)*PAGE_LAYERS.foldedThickness<PAGE_LAYERS.restingZ);
});
