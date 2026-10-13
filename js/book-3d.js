import * as THREE from '../vendor/three.module.min.js';
import { assetById, assetUrl } from './assets.js';
import { BOOK_STATES, spreadState, foldedFolioSurface } from './book-surfaces.js';
import { turnProfile, curlPoint, gestureKind, spring, TURN_SETTINGS, turnRelease, releaseVelocity, advanceTurn, PAGE_LAYERS, turnLayers, bookCenter, coverSupport } from './paper-motion.js';
import { PAPER, READER_MAP, COVER_MAP, photographicSource } from './imposition.js';
import { spreadPages, pagesForAsset, placementForPage } from './book.js';

const W = PAPER.widthMm / 210, H = PAPER.heightMm / 210, M = PAPER.overhangMm / 210;
const VIEW_LENGTH = Math.hypot(1.3, 7), VIEW_SIN = 1.3 / VIEW_LENGTH, VIEW_COS = 7 / VIEW_LENGTH;
const MAX_LIFT = Math.max(...Array.from({length:51},(_,i)=>turnProfile(i/50,W+M).at(-1)[1]));
// Reserve the full projected lift above a stationary book, so turning pages
// fit without moving the camera or the controls up and down.
const HOME_HALF_HEIGHT = (H + 2*M)*VIEW_COS/2 + MAX_LIFT*VIEW_SIN + .025;
const positions = new Map();
const keyOf = descriptor => JSON.stringify(descriptor);
function paperThickness(material, side) {
  const highlight = side === 1 ? { color: { value: new THREE.Color('#ffffff') }, amount: { value: 0 } } : null;
  if (highlight) material.userData.highlight = highlight;
  material.onBeforeCompile = shader => {
    shader.uniforms.paperFaceOffset = { value: side * PAGE_LAYERS.thickness / 2 };
    shader.vertexShader = 'uniform float paperFaceOffset;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * paperFaceOffset;');
    if (highlight) {
      shader.uniforms.paperHighlightColor = highlight.color; shader.uniforms.paperHighlightAmount = highlight.amount;
      shader.fragmentShader = 'uniform vec3 paperHighlightColor;\nuniform float paperHighlightAmount;\n' + shader.fragmentShader.replace(
        '#include <colorspace_fragment>', '#include <colorspace_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, paperHighlightColor, paperHighlightAmount);');
    }
  };
  material.customProgramCacheKey = () => `paper-face:${side}`;
}
export class Textures {
  constructor(invalidate, fail) {
    this.invalidate = invalidate; this.fail = fail; this.cache = new Map(); this.requests = new Map(); this.counter = 0; this.disposed = false;
    this.worker = new Worker(new URL('./texture-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const request = this.requests.get(data.id); this.requests.delete(data.id);
      if (!request || this.disposed) { data.bitmap?.close(); return; }
      if (data.error) { this.cache.delete(request.key); request.reject(new Error(data.error)); return; }
      const texture = new THREE.CanvasTexture(data.bitmap);
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
      texture.flipY = false;
      this.cache.set(request.key, { texture, bitmap: data.bitmap, used: performance.now() });
      request.resolve(texture); this.trim(); this.invalidate();
    };
    this.worker.onerror = () => this.fail('Preview images could not be decoded. Reload to retry.');
  }
  get(descriptor) {
    const key = keyOf(descriptor), existing = this.cache.get(key);
    if (existing) { existing.used = performance.now(); return existing.promise || Promise.resolve(existing.texture); }
    const asset = assetById.get(descriptor.assetId);
    if (descriptor.assetId && !asset) return Promise.reject(new Error(`Missing preview asset: ${descriptor.assetId}`));
    const id = ++this.counter;
    const promise = new Promise((resolve, reject) => this.requests.set(id, { key, resolve, reject }));
    this.cache.set(key, { promise, used: performance.now() });
    this.worker.postMessage({ id, descriptor, url: asset ? assetUrl(asset, { preview: true }) : null });
    return promise;
  }
  retain(keys) { this.keep = keys; this.trim(); }
  trim() {
    const keys = this.keep || new Set();
    const unused = [...this.cache].filter(([key, item]) => item.texture && !keys.has(key)).sort((a, b) => a[1].used - b[1].used);
    while (this.cache.size > 18 && unused.length) {
      const [key, item] = unused.shift(); item.texture.dispose(); item.bitmap.close(); this.cache.delete(key);
    }
  }
  dispose() {
    this.disposed = true; this.worker.terminate();
    for (const item of this.cache.values()) { item.texture?.dispose(); item.bitmap?.close(); }
    for (const request of this.requests.values()) request.resolve(null);
    this.cache.clear(); this.requests.clear();
  }
}
const mirror = (descriptor, side) => ({ ...descriptor, flipX: Boolean(descriptor.flipX) !== (side === 'left') });
export class Leaf {
  constructor(scene, side, cover = false, { width, height } = {}) {
    this.side = side; this.width = width ?? W + (cover ? M : 0); this.height = height ?? H + (cover ? 2 * M : 0);
    this.geometry = new THREE.PlaneGeometry(this.width, this.height, 48, 36);
    this.geometry.translate(this.width / 2, 0, 0);
    this.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.original = this.geometry.attributes.position.array.slice();
    const options = { color: '#ffffff', roughness: .97, metalness: 0 };
    this.frontMaterial = new THREE.MeshStandardMaterial({ ...options, side: THREE.FrontSide });
    this.backMaterial = new THREE.MeshStandardMaterial({ ...options, side: THREE.BackSide });
    paperThickness(this.frontMaterial, 1); paperThickness(this.backMaterial, -1);
    this.front = new THREE.Mesh(this.geometry, this.frontMaterial); this.back = new THREE.Mesh(this.geometry, this.backMaterial);
    this.group = new THREE.Group(); this.group.add(this.front, this.back);
    this.group.scale.x = side === 'left' ? -1 : 1;
    this.group.position.z = PAGE_LAYERS.restingZ;
    this.front.castShadow = true; this.front.receiveShadow = true; this.back.receiveShadow = true;
    this.back.castShadow = true; scene.add(this.group);
    this.cover = cover;
  }
  deform(turn = 0, curl = 0, z = PAGE_LAYERS.restingZ) {
    const profile = turnProfile(turn, this.width), positions = this.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = this.original[i * 3], y = this.original[i * 3 + 1];
      const u = x / this.width, v = y / this.height + .5;
      const column = Math.round(u * 48), p = profile[column];
      const support = this.cover ? coverSupport(u, this.openAmount || 0) : 0;
      if (curl > 0) {
        const leftCorner = this.curlCorner === 'left', q = curlPoint(leftCorner ? 1 - u : u, v, this.width, this.height, curl);
        positions.setXYZ(i, leftCorner ? this.width - q[0] : q[0], q[1], q[2] + support);
      }
      else positions.setXYZ(i, p[0], y, p[1] + support);
    }
    positions.needsUpdate = true; this.geometry.computeVertexNormals(); this.geometry.computeBoundingSphere();
    this.group.position.z = z;
  }
  async textures(cache, front, back) {
    this.descriptors = [mirror(front, this.side), mirror(back, this.side)];
    const generation = this.generation = (this.generation || 0) + 1;
    const [a, b] = await Promise.all(this.descriptors.map(d => cache.get(d)));
    if (this.disposed || generation !== this.generation || !a || !b) return;
    this.frontMaterial.map = a; this.backMaterial.map = b;
    this.frontMaterial.needsUpdate = this.backMaterial.needsUpdate = true;
    cache.invalidate();
  }
  adopt(side, descriptor, cache, landedPhoto = null) {
    this.side = side; this.group.scale.x = side === 'left' ? -1 : 1;
    this.descriptor = descriptor;
    if (this.cover) this.openAmount = descriptor.surface.part.startsWith('inside') ? 1 : 0;
    this.deform(0, 0, PAGE_LAYERS.restingZ);
    // At a completed turn the old backside is the new resting photograph.
    if (landedPhoto) { this.frontMaterial.map = landedPhoto; this.frontMaterial.needsUpdate = true; }
    return this.textures(cache, descriptor.surface, descriptor.folio);
  }
  async updateFront(cache, surface) {
    this.descriptor = { ...this.descriptor, surface };
    this.descriptors[0] = mirror(surface, this.side);
    const generation = this.generation = (this.generation || 0) + 1;
    const [front, back] = await Promise.all([cache.get(this.descriptors[0]),
      this.backMaterial.map || cache.get(this.descriptors[1])]);
    if (this.disposed || generation !== this.generation || !front) return;
    this.frontMaterial.map = front; this.frontMaterial.needsUpdate = true;
    if (!this.backMaterial.map && back) { this.backMaterial.map = back; this.backMaterial.needsUpdate = true; }
    cache.invalidate();
  }
  dispose() {
    this.disposed = true; this.group.removeFromParent(); this.geometry.dispose(); this.frontMaterial.dispose(); this.backMaterial.dispose();
  }
  highlight(color, amount) {
    const highlight = this.frontMaterial.userData.highlight;
    highlight.color.value.set(color).convertLinearToSRGB(); highlight.amount.value = amount;
  }
}
export class Book3D {
  constructor(host, book) {
    this.host = host; this.book = book; this.id = `${host.dataset.bookViewer}:${book.id}:${book.revision}`;
    this.editable = host.dataset.bookEditable === 'true';
    this.index = host.dataset.bookInitial !== undefined ? Number(host.dataset.bookInitial) : positions.get(this.id) || 0;
    this.leaves = []; this.staticObjects = []; this.disposed = false;
    this.viewport = host.querySelector('.book-stage'); this.status = host.querySelector('.book-status');
    this.message = host.querySelector('.book-message'); this.events = new AbortController();
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#ffffff');
    this.host.dataset.sceneId = this.scene.uuid;
    this.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
    this.camera.position.set(0, -1.3, 7); this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.viewport.append(this.renderer.domElement); this.renderer.domElement.setAttribute('aria-label', 'Interactive book. Drag outer edges to turn; lift a bottom corner to reveal the folio.' + (this.editable ? ' Click a placed photograph to clear it.' : ''));
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#d6d1c8', 2.6));
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(-1.5, 2.5, 5); light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024); Object.assign(light.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .1, far: 12 });
    light.shadow.bias = -.0002; light.shadow.normalBias = .008; light.shadow.radius = 3; this.scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: .16 }));
    floor.position.z = -.018; floor.receiveShadow = true; this.scene.add(floor); this.staticObjects.push(floor);
    this.textures = new Textures(() => this.invalidate(), message => this.error(message));
    this.resize = new ResizeObserver(() => this.fit()); this.resize.observe(this.viewport);
    this.active = true; this.intersects = true;
    this.observe = new IntersectionObserver(entries => { this.intersects = entries[0].intersectionRatio > 0; this.setActive(this.active); }); this.observe.observe(host);
    this.visible = true; this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    const options = { signal: this.events.signal };
    this.viewport.addEventListener('pointerdown', event => this.down(event), options);
    this.viewport.addEventListener('pointermove', event => this.move(event), options);
    this.viewport.addEventListener('pointerleave', () => { if (!this.gesture) this.clearHover(); }, options);
    this.viewport.addEventListener('pointerup', event => this.up(event), options);
    this.viewport.addEventListener('pointercancel', event => this.up(event, true), options);
    this.viewport.addEventListener('lostpointercapture', event => { if (this.gesture) this.up(event, true); }, options);
    this.viewport.addEventListener('dragover', event => {
      if (this.dragAsset && this.highlightDrop(event, this.dragAsset)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
    }, options);
    this.viewport.addEventListener('dragleave', event => { if (!this.viewport.contains(event.relatedTarget)) this.clearDropHighlight(); }, options);
    this.viewport.addEventListener('drop', event => {
      if (!this.editable) return;
      const assetId = this.dragAsset || event.dataTransfer.getData('application/x-phallus-asset');
      const page = this.highlightDrop(event, assetId); event.preventDefault();
      this.setImageDrag(null); if (page) this.assign(page, assetId);
    }, options);
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.error('3D context interrupted. Reload, or use the reading view below.'); }, options);
    host.addEventListener('click', event => { const button = event.target.closest('[data-book-step]'); if (button) this.step(Number(button.dataset.bookStep)); }, options);
    host.addEventListener('change', event => {
      if (!event.target.matches('[data-book-debug-curl]') || this.dragAsset) return;
      const side = event.target.value;
      if (this.motion === this.debugMotion && this.motion) {
        this.motion.target = 0; this.motion.released = true; this.invalidate();
        event.target.value = ''; return;
      }
      if (side && !this.motion && this[side]) {
        this.debugMotion = this.start('curl', this[side], side === 'right' ? 1 : -1);
        this.debugMotion.target = 1; this.invalidate();
      } else event.target.value = '';
    }, options);
    host.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); if (event.key === 'Home' || event.key === 'End') this.jump(event.key === 'Home' ? 0 : 18);
        else this.step(event.key === 'ArrowRight' ? 1 : -1);
      }
    }, options);
    this.drawState(); this.fit();
  }
  error(message) { if (!this.disposed) { this.message.textContent = message; this.host.dataset.error = 'true'; this.host.querySelector('.book-fallback').hidden = false; this.host.querySelector('.book-fallback').open = true; } }
  updateBook(book) {
    this.clearHover(); this.clearDropHighlight();
    this.book = book; this.id = `${this.host.dataset.bookViewer}:${book.id}:${book.revision}`;
    this.updating = true; this.host.dataset.ready = 'false';
    const generation = this.updateGeneration = (this.updateGeneration || 0) + 1;
    const state = spreadState(book, this.index);
    const changes = [];
    for (const side of ['left', 'right']) {
      const leaf = this[side], entry = state[side];
      if (leaf && entry && keyOf(leaf.descriptor.surface) !== keyOf(entry.surface)) changes.push(leaf.updateFront(this.textures, entry.surface));
    }
    this.state = state; this.updateStatus(); this.prefetch(); this.invalidate();
    return Promise.all(changes).catch(error => this.error(error.message)).finally(() => {
      if (generation === this.updateGeneration) { this.updating = false; this.invalidate(); }
    });
  }
  assign(pageNumber, assetId) {
    this.host.dispatchEvent(new CustomEvent('bookassign', { bubbles: true, detail: { pageNumber, assetId } }));
  }
  setImageDrag(assetId) {
    if (assetId && pagesForAsset(this.book, assetId).length) assetId = null;
    if (assetId) this.navigationTarget = null;
    this.clearHover();
    this.dragAsset = assetId; this.host.dataset.imageDrag = assetId ? 'true' : 'false';
    if (!assetId) this.clearDropHighlight();
  }
  clearDropHighlight() {
    this.dropPages = []; delete this.host.dataset.dropPages; this.paintHighlights();
  }
  clearHover() {
    this.hoverPages = []; delete this.host.dataset.hoverPages; this.paintHighlights();
  }
  hover(hit) {
    if (!this.editable || this.motion || this.dragAsset || this.updating) { this.clearHover(); return; }
    const placement = placementForPage(this.book, hit?.leaf.descriptor.pageNumber);
    const pages = placement?.pages || [];
    if (pages.join(',') === (this.hoverPages || []).join(',')) return;
    this.hoverPages = pages;
    if (pages.length) this.host.dataset.hoverPages = pages.join(','); else delete this.host.dataset.hoverPages;
    this.paintHighlights();
  }
  paintHighlights() {
    for (const leaf of [this.left, this.right]) {
      if (!leaf) continue;
      const number = leaf.descriptor?.pageNumber, drop = this.dropPages?.includes(number), hover = this.hoverPages?.includes(number);
      leaf.highlight(drop ? '#a6a6a6' : '#ffffff', drop ? .55 : hover ? .22 : 0);
    }
    this.invalidate();
  }
  highlightDrop(event, assetId) {
    this.clearDropHighlight();
    const asset = assetById.get(assetId);
    if (!this.editable || this.motion || !asset || pagesForAsset(this.book, assetId).length) return null;
    const hit = this.hit(event), number = hit?.leaf.descriptor.pageNumber;
    if (!number) return null;
    const pages = asset.orientation === 'horizontal' ? spreadPages(number) : [number];
    if (asset.orientation === 'horizontal' && pages.length !== 2) return null;
    this.dropPages = pages; this.paintHighlights();
    this.host.dataset.dropPages = pages.join(','); this.invalidate(); return number;
  }
  addLeaf(side, descriptor, z = PAGE_LAYERS.restingZ) {
    if (!descriptor) return null;
    const leaf = new Leaf(this.scene, side, descriptor.cover); leaf.group.position.z = z;
    this.leaves.push(leaf);
    leaf.ready = leaf.textures(this.textures, descriptor.surface, descriptor.folio).catch(error => this.error(error.message));
    leaf.descriptor = descriptor;
    if (leaf.cover) { leaf.openAmount = descriptor.surface.part.startsWith('inside') ? 1 : 0; leaf.deform(0, 0, z); }
    return leaf;
  }
  clearLeaves() { for (const leaf of this.leaves) leaf.dispose(); this.leaves = []; }
  drawState(reuse = {}) {
    this.clearHover(); this.clearDropHighlight();
    this.host.dataset.ready = 'false';
    // Two permanent flaps of the one folded cover sheet. Each owns exactly
    // one shared front/back geometry; there are no background cover copies.
    if (!this.covers) this.covers = {
      front: this.addLeaf('right', spreadState(this.book, 0).right),
      back: this.addLeaf('right', spreadState(this.book, 17).right),
    };
    const kept = new Set([...Object.values(reuse).filter(Boolean), ...Object.values(this.covers)]);
    for (const leaf of this.leaves) if (!kept.has(leaf)) leaf.dispose();
    this.leaves = Object.values(this.covers);
    const state = spreadState(this.book, this.index); this.state = state;
    for (const [part, cover] of Object.entries(this.covers)) {
      const side = part === 'front' ? (this.index === 0 ? 'right' : 'left') : (this.index === 18 ? 'left' : 'right');
      const descriptor = part === 'front' ? spreadState(this.book, this.index === 0 ? 0 : 1)[side]
        : spreadState(this.book, this.index === 18 ? 18 : 17)[side];
      const expected = [descriptor.surface, descriptor.folio].map(d => mirror(d, side));
      if (cover.side !== side || expected.some((d, i) => keyOf(d) !== keyOf(cover.descriptors[i]))) {
        cover.adopt(side, descriptor, this.textures).catch(error => this.error(error.message));
      }
    }
    this.makeStack();
    for (const side of ['left', 'right']) {
      const leaf = reuse[side], descriptor = state[side];
      if (descriptor?.cover) {
        this[side] = this.covers[descriptor.surface.part === 'front' || descriptor.surface.part === 'insideFront' ? 'front' : 'back'];
      } else if (leaf && descriptor) {
        this.leaves.push(leaf);
        leaf.adopt(side, descriptor, this.textures).catch(error => this.error(error.message));
        this[side] = leaf;
      } else this[side] = this.addLeaf(side, descriptor);
    }
    this.updateStatus(); this.prefetch(); this.invalidate();
  }
  makeStack() {
    for (const object of this.stacks || []) { object.removeFromParent(); object.geometry.dispose(); object.material.dispose(); }
    this.stacks = [];
    // Sixteen folded leaves, two photographic outer surfaces per leaf. Hidden
    // folios live inside these packets; curling lifts only the exposed layer.
    const turned = Math.max(0, Math.min(16, this.index - 1));
    for (const [side, count] of [['left', turned], ['right', 16 - turned]]) {
      if (!count) continue;
      // The exposed folded packet is rendered by the textured Leaf. Stack
      // meshes represent only the hidden packets below it, never its face.
      for (let i = 0; i < Math.max(0, count - 1); i++) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 1, 1), new THREE.MeshStandardMaterial({ color: i % 2 ? '#f9f8f4' : '#e8e6e0', roughness: 1 }));
        mesh.position.set((side === 'left' ? -1 : 1) * (W / 2 + i * .00015), 0,
          PAGE_LAYERS.coverBaseZ + (i + .5) * PAGE_LAYERS.foldedThickness);
        mesh.receiveShadow = true; this.scene.add(mesh); this.stacks.push(mesh);
      }
    }
  }
  updateStatus() {
    const state = spreadState(this.book, this.index);
    this.status.textContent = this.index === 0 ? 'COVER' : this.index === 18 ? 'END'
      : [state.left?.pageNumber, state.right?.pageNumber].filter(Boolean).join(' | ');
    this.host.dataset.bookState = String(this.index); this.host.dataset.motion = this.motion?.kind || 'idle';
    this.host.querySelector('[data-book-step="-1"]').disabled = this.index === 0;
    this.host.querySelector('[data-book-step="1"]').disabled = this.index === 18;
    positions.set(this.id, this.index);
    const info = this.host.querySelector('.book-debug-info');
    this.host.dataset.leftLeaf = this.left?.group.uuid || '';
    this.host.dataset.rightLeaf = this.right?.group.uuid || '';
    this.host.dataset.frontCover = this.covers.front.group.uuid;
    this.host.dataset.backCover = this.covers.back.group.uuid;
    this.host.dataset.coverCount = String(this.leaves.filter(leaf => leaf.cover && leaf !== this.motion?.underlying).length);
    if (info) info.textContent = ['left', 'right'].map(side => {
      const entry = state[side]; if (!entry) return `${side}: closed`;
      const mapping = entry.pageNumber ? READER_MAP[entry.pageNumber - 1] : COVER_MAP[entry.surface.part];
      const source = this.book.edition === 'first' ? entry.pageNumber ? mapping : photographicSource(mapping.quadrant, mapping.rotation) : null;
      return `${side}: ${entry.pageNumber ? `PAGE ${entry.pageNumber} · SHEET ${mapping.sheet}` : entry.surface.part} · ${mapping.quadrant}${source ? ` → raw ${source.sourceQuadrant}, ${source.sourceRotation}°` : ''} · FRONT ${assetById.get(entry.surface.assetId)?.name || 'empty'} · BACK ${assetById.get(entry.folio.assetId)?.name} / ${entry.pageNumber ? mapping.reverse.quadrant : mapping.reverseQuadrant}`;
    }).join('\n');
    if (info && this.motion?.kind === 'curl') {
      const surface = this.motion.underlying.descriptor.surface;
      const quadrant = this.motion.leaf.descriptor.pageNumber
        ? READER_MAP[this.motion.leaf.descriptor.pageNumber - 1].reverse.foldedMate.quadrant
        : COVER_MAP[surface.part].reverseQuadrant;
      info.textContent += `\nFlat inner folio: ${surface.pageNumber || surface.part} · ${assetById.get(surface.assetId)?.name} / ${quadrant}`;
    }
    this.host.dispatchEvent(new CustomEvent('booknavigate', { bubbles: true,
      detail: { readerSpread: Math.max(0, Math.min(16, this.index - 1)), bookIndex: this.index } }));
  }
  prefetch() {
    const keep = new Set(this.leaves.flatMap(leaf => (leaf.descriptors || []).map(keyOf)));
    for (const index of [this.index - 1, this.index + 1]) {
      if (index < 0 || index >= BOOK_STATES) continue;
      const state = spreadState(this.book, index);
      for (const side of ['left', 'right']) if (state[side]) {
        for (const surface of [state[side].surface, state[side].folio]) {
          const descriptor = mirror(surface, side); keep.add(keyOf(descriptor));
          this.textures.get(descriptor).catch(error => this.error(error.message));
        }
      }
    }
    this.textures.retain(keep);
  }
  fit() {
    if (this.disposed) return;
    const w = this.viewport.clientWidth, h = this.viewport.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h, original = Math.max((H + 2 * M) * .62, (W + M) * 1.22 / aspect);
    // Camera zoom changes only the homepage display, never physical page data.
    const enlarged = this.host.dataset.bookViewer === 'first' && this.host.closest('.home-screen');
    const halfHeight = enlarged ? Math.max(original / 1.3, HOME_HALF_HEIGHT, (W + M) * 1.055 / aspect) : original;
    this.host.dataset.displayScale = (original / halfHeight).toFixed(3);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect; this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.host.style.setProperty('--book-footprint', `${Math.min(w, 2 * (W + M) / (2 * halfHeight * aspect) * w)}px`);
    this.camera.updateProjectionMatrix(); this.invalidate();
    this.center();
    const bottom = new THREE.Vector3(0, -(H + 2 * M) / 2, PAGE_LAYERS.coverBaseZ).project(this.camera);
    const belowBook = h - (1 - bottom.y) * h / 2;
    this.host.style.setProperty('--book-controls-offset', `${Math.max(0, belowBook - 12)}px`);
  }
  center(progress = 0, direction = 1) {
    const x = bookCenter(this.index, progress, direction, W + M);
    this.camera.position.set(x, -1.3, 7); this.camera.lookAt(x, 0, 0); this.camera.updateMatrixWorld();
    this.host.dataset.centerX = x.toFixed(6);
    this.host.dataset.centerY = '0.000000';
  }
  hit(event) {
    const rect = this.viewport.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.scene.updateMatrixWorld();
    const leaves = [this.left, this.right].filter(Boolean);
    const intersection = this.raycaster.intersectObjects(leaves.map(leaf => leaf.front), false)[0];
    if (!intersection) return null;
    const leaf = leaves.find(leaf => leaf.front === intersection.object);
    const local = leaf.group.worldToLocal(intersection.point.clone());
    const u = local.x / leaf.width, v = local.y / leaf.height + .5;
    return { side: leaf.side, leaf, u, v, corner: u > .7 && v < .25, edge: u > TURN_SETTINGS.edgeStart };
  }
  down(event) {
    if (this.motion || this.gesture || this.dragAsset || event.button > 0) return;
    const hit = this.hit(event), occupied = placementForPage(this.book, hit?.leaf.descriptor.pageNumber);
    if (!hit || !hit.edge && !hit.corner && !(this.editable && (this.host.dataset.selectedAsset || occupied))) return;
    this.navigationTarget = null; this.clearHover();
    this.host.focus({preventScroll:true});
    const travel = hit.leaf.width / (this.camera.right - this.camera.left) * this.viewport.clientWidth;
    this.gesture = { ...hit, id: event.pointerId, x: event.clientX, y: event.clientY, travel, kind: null,
      maxProgress: 0,
      samples: [{ time: event.timeStamp, progress: 0 }] };
    this.host.dataset.pointerActive = 'true';
    this.viewport.setPointerCapture(event.pointerId); this.viewport.style.cursor = 'grabbing';
  }
  move(event) {
    const gesture = this.gesture;
    if (!gesture) {
      const hit = this.hit(event); this.hover(hit);
      this.viewport.style.cursor = hit?.corner ? 'ns-resize' : hit?.edge ? 'grab' : this.hoverPages?.length ? 'pointer' : 'default'; return;
    }
    if (event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    const kind = gesture.kind || gestureKind(dx, dy, gesture.corner);
    if (!kind) return;
    if (kind === 'turn' && !gesture.edge) return;
    const direction = gesture.side === 'right' ? 1 : -1;
    if (kind === 'turn' && (this.index + direction < 0 || this.index + direction >= BOOK_STATES)) return;
    if (!gesture.kind) { gesture.kind = kind; this.start(kind, gesture.leaf, direction); }
    event.preventDefault();
    this.motion.target = kind === 'curl' ? THREE.MathUtils.clamp(-dy / (this.viewport.clientHeight * .32), 0, 1)
      : THREE.MathUtils.clamp(-dx * direction / gesture.travel, 0, 1);
    if (kind === 'turn') this.trackVelocity(gesture, event);
    this.invalidate();
  }
  trackVelocity(gesture, event) {
    const direction = gesture.side === 'right' ? 1 : -1;
    const progress = -(event.clientX - gesture.x) * direction / gesture.travel;
    gesture.maxProgress = Math.max(gesture.maxProgress, THREE.MathUtils.clamp(progress, 0, 1));
    gesture.samples.push({ time: event.timeStamp, progress });
    gesture.samples = gesture.samples.filter(sample => event.timeStamp - sample.time <= TURN_SETTINGS.velocityWindowMs);
  }
  up(event, cancelled = false) {
    const gesture = this.gesture; if (!gesture || event.pointerId !== gesture.id) return;
    this.gesture = null;
    delete this.host.dataset.pointerActive;
    if (!cancelled && !gesture.kind && this.editable && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 6 && this.hit(event)?.leaf === gesture.leaf) {
      if (this.host.dataset.selectedAsset) {
        const page = this.highlightDrop(event, this.host.dataset.selectedAsset);
        if (page) this.assign(page, this.host.dataset.selectedAsset);
        this.clearDropHighlight();
      } else if (placementForPage(this.book, gesture.leaf.descriptor.pageNumber)) {
        this.host.dispatchEvent(new CustomEvent('bookclear', { bubbles: true, detail: { pageNumber: gesture.leaf.descriptor.pageNumber } }));
      }
    }
    if (this.motion) {
      this.motion.released = true;
      if (this.motion.kind === 'curl') this.motion.target = 0;
      else {
        // Cancellation/capture-loss events may have zeroed coordinates. Use
        // the last real drag position so a clear turn can still complete.
        if (!cancelled) this.trackVelocity(gesture, event);
        const velocity = cancelled ? 0 : releaseVelocity(gesture.samples, event.timeStamp);
        const progress = cancelled ? this.motion.target : THREE.MathUtils.clamp(
          -(event.clientX - gesture.x) * (gesture.side === 'right' ? 1 : -1) / gesture.travel, 0, 1);
        const decision = turnRelease(progress, velocity, TURN_SETTINGS, gesture.maxProgress - progress);
        this.motion.target = decision.target; this.motion.omega = decision.omega;
        this.motion.releaseVelocity = velocity;
      }
      this.invalidate();
    }
    if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
    this.viewport.style.cursor = 'default';
  }
  start(kind, leaf, direction) {
    this.clearHover(); this.clearDropHighlight();
    const motion = this.motion = { kind, leaf, direction, value: 0, velocity: 0, target: 0, released: false,
      omega: TURN_SETTINGS.buttonOmega, resourcesReady: kind !== 'turn' };
    if (kind === 'turn') {
      const next = spreadState(this.book, this.index + direction), side = direction === 1 ? 'right' : 'left';
      const landingSide = direction === 1 ? 'left' : 'right';
      const landing = next[landingSide];
      if (leaf.cover) {
        motion.coverStart = leaf.openAmount;
        motion.coverEnd = landing.surface.part.startsWith('inside') ? 1 : 0;
      }
      // A folded leaf's outside verso is the next photographic reader page.
      // Its B ink is inside the folded paper and appears only when corner-lifted.
      const verso = landing ? { ...landing.surface, flipX: !landing.surface.flipX } : leaf.descriptor.folio;
      motion.destination = direction === 1 ? this.left : this.right;
      const exposed = next[side];
      motion.revealed = exposed?.cover
        ? this.covers[exposed.surface.part === 'insideFront' ? 'front' : 'back']
        : this.addLeaf(side, exposed, turnLayers(0).revealedZ);
      Promise.all([leaf.textures(this.textures, leaf.descriptor.surface, verso), motion.revealed?.ready]).then(() => {
        if (this.motion === motion) {
          motion.resourcesReady = Boolean(leaf.frontMaterial.map && leaf.backMaterial.map &&
            (!motion.revealed || motion.revealed.frontMaterial.map && motion.revealed.backMaterial.map));
          this.invalidate();
        }
      }).catch(error => this.error(error.message));
    } else {
      // Both inner faces belong to the same B sheet, in distinct folded
      // quadrants. The upper photo naturally occludes this flat paper layer.
      const surface = foldedFolioSurface(this.book, leaf.descriptor);
      motion.underlying = this.addLeaf(leaf.side, { ...leaf.descriptor, surface },
        PAGE_LAYERS.restingZ - PAGE_LAYERS.foldedThickness);
      if (leaf.cover) {
        motion.underlying.openAmount = leaf.openAmount;
        motion.underlying.deform(0, 0, PAGE_LAYERS.restingZ - PAGE_LAYERS.foldedThickness);
      }
      motion.underlying.back.visible = false;
      motion.underlying.group.visible = false;
    }
    // Depth follows physical layers; renderOrder is not used to bypass them.
    this.prefetch();
    this.updateStatus(); this.invalidate();
    return motion;
  }
  step(direction, automatic = false) {
    if (!automatic) this.navigationTarget = null;
    if (this.motion || this.gesture || this.dragAsset || this.index + direction < 0 || this.index + direction >= BOOK_STATES) return;
    const leaf = direction === 1 ? this.right : this.left; if (!leaf) return;
    const motion = this.start('turn', leaf, direction); motion.target = 1; motion.released = true;
    if (automatic) motion.omega = TURN_SETTINGS.flickOmega;
  }
  jump(index) { this.navigationTarget = null; if (!this.motion && !this.gesture && !this.dragAsset) { this.index = index; this.drawState(); this.center(); } }
  navigateTo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= BOOK_STATES || this.gesture || this.dragAsset) return;
    this.navigationTarget = index; this.continueNavigation();
  }
  continueNavigation() {
    if (this.navigationTarget == null || this.motion) return;
    if (this.index === this.navigationTarget) { this.navigationTarget = null; this.host.focus({preventScroll:true}); }
    else this.step(this.navigationTarget > this.index ? 1 : -1, true);
  }
  setActive(active) {
    this.active = active; this.visible = active && this.intersects;
    this.host.dataset.renderActive = String(this.visible);
    if (this.visible) this.invalidate(); else { cancelAnimationFrame(this.frame); this.frame = null; this.lastTime = null; }
  }
  invalidate() { if (!this.disposed && !this.frame && this.visible) this.frame = requestAnimationFrame(time => this.animate(time)); }
  animate(time) {
    this.frame = null; if (this.disposed) return;
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, .032) : .016; this.lastTime = time;
    const motion = this.motion;
    if (motion) {
      if (motion.kind === 'turn') {
        // Do not show the wrong verso while its real adjacent texture decodes.
        const target = motion.resourcesReady ? motion.target : 0;
        [motion.value, motion.velocity] = advanceTurn(motion.value, motion.velocity, target, dt,
          motion.released ? motion.omega : TURN_SETTINGS.dragOmega);
        const layers = turnLayers(motion.value);
        if (motion.leaf.cover) {
          const ease = motion.value * motion.value * (3 - 2 * motion.value);
          motion.leaf.openAmount = motion.coverStart + (motion.coverEnd - motion.coverStart) * ease;
        }
        motion.leaf.deform(motion.value, 0, motion.leaf.cover ? PAGE_LAYERS.restingZ : layers.activeZ);
        if (motion.destination && !motion.destination.cover) motion.destination.group.position.z = layers.destinationZ;
        if (motion.revealed && !motion.revealed.cover) motion.revealed.group.position.z = layers.revealedZ;
        this.center(motion.value, motion.direction);
      } else {
        [motion.value, motion.velocity] = spring(motion.value, motion.velocity, motion.target, dt);
        motion.leaf.deform(0, motion.value);
        motion.underlying.group.visible = motion.value > .002;
      }
      if (motion.released && motion.value === motion.target && motion.velocity === 0) {
        let reuse = { left: this.left, right: this.right };
        if (motion.kind === 'turn' && motion.target === 1) {
          this.index += motion.direction;
          motion.leaf.frontMaterial.map = motion.leaf.backMaterial.map;
          motion.leaf.frontMaterial.needsUpdate = true;
          reuse = motion.direction === 1 ? { left: motion.leaf, right: motion.revealed }
            : { left: motion.revealed, right: motion.leaf };
        }
        this.motion = null; this.debugMotion = null; this.drawState(reuse); this.center(); this.continueNavigation();
      } else if (motion.value !== motion.target || motion.velocity || motion.released) this.invalidate();
      if (this.host.querySelector('.book-debug-info')) {
        this.host.dataset.motionProgress = motion.value.toFixed(5);
        this.host.dataset.activeLeaf = motion.leaf.group.uuid;
        this.host.dataset.activeGeometry = motion.leaf.geometry.uuid;
      }
    }
    this.renderer.render(this.scene, this.camera);
    if (this.host.querySelector('.book-debug-info')) this.host.dataset.coverPose = JSON.stringify(Object.fromEntries(
      Object.entries(this.covers).map(([part, leaf]) => [part, {
        id: leaf.group.uuid, geometry: leaf.geometry.uuid, width: leaf.width, height: leaf.height, z: leaf.group.position.z,
        vertices: [0, 48, leaf.geometry.attributes.position.count - 1].map(i =>
          new THREE.Vector3().fromBufferAttribute(leaf.geometry.attributes.position, i).applyMatrix4(leaf.group.matrixWorld).toArray()),
      }])));
    this.host.dataset.textureCount = String(this.textures.cache.size);
    this.host.dataset.ready = String(!this.updating && this.leaves.every(leaf => leaf.frontMaterial.map && leaf.backMaterial.map));
    if (this.host.dataset.ready === 'true') this.host.dataset.textureRevision = String(this.book.revision);
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.events.abort(); this.resize.disconnect(); this.observe.disconnect();
    this.textures.dispose(); this.clearLeaves();
    for (const object of [...this.staticObjects, ...(this.stacks || [])]) { object.geometry.dispose(); object.material.dispose(); }
    for (const light of this.scene.children) light.shadow?.map?.dispose();
    this.renderer.renderLists.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
