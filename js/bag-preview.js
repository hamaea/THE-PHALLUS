import * as THREE from '../vendor/three.module.min.js';
import { Leaf, Textures } from './book-3d.js';
import { spreadState } from './book-surfaces.js';
import { PAPER } from './imposition.js';
import { configurationKey } from './commerce.js';
import { PAGE_LAYERS } from './paper-motion.js';

// One small renderer/texture worker for the whole bag, with no animation loop.
// Each thumbnail is a rendered instance of the same folded paper Leaf model.
const previews = new Map();
export function mountBagPreviews(root, items) {
  let disposed = false, renderer, textures, textureError;
  const leaves = [], resources = [];
  const dispose = () => {
    disposed = true;
    leaves.splice(0).forEach(leaf => leaf.dispose());
    resources.forEach(object => { object.geometry?.dispose(); object.material?.dispose(); });
    textures?.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
  };
  (async () => {
    try {
      for (const item of items) {
        if (disposed) return;
        const target = [...root.querySelectorAll('[data-bag-preview]')].find(el => el.dataset.bagPreview === item.id);
        if (!target) continue;
        const key = configurationKey(item.book);
        if (!previews.has(key)) {
          if (!renderer) {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            renderer.setSize(320, 228); renderer.setPixelRatio(1);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            textures = new Textures(() => {}, message => { textureError = new Error(message); textures.dispose(); });
          }
          const scene = new THREE.Scene(); scene.background = new THREE.Color('#ffffff');
          const camera = new THREE.OrthographicCamera(-1.15, 1.15, .82, -.82, .1, 15);
          camera.position.set(0, -.4, 7); camera.lookAt(0, 0, 0);
          scene.add(new THREE.HemisphereLight('#ffffff', '#d6d1c8', 2.6));
          const light = new THREE.DirectionalLight('#ffffff', 3);
          light.position.set(-1.5, 2.5, 5); light.castShadow = true;
          light.shadow.mapSize.set(256, 256); light.shadow.bias = -.0002;
          Object.assign(light.shadow.camera, {left:-2,right:2,top:2,bottom:-2,near:.1,far:12}); scene.add(light);
          const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({opacity:.12}));
          floor.position.z = -.018; floor.receiveShadow = true; scene.add(floor); resources.push(floor);
          const layers = [spreadState(item.book, 1).left, spreadState(item.book, 17).right];
          const pages = spreadState(item.book, 2);
          const promises = [];
          for (const [side, descriptor] of [['left',layers[0]],['right',layers[1]],['left',pages.left],['right',pages.right]]) {
            const leaf = new Leaf(scene, side, Boolean(descriptor.cover)); leaves.push(leaf);
            leaf.openAmount = descriptor.cover ? 1 : 0;
            leaf.deform(0, 0, descriptor.cover ? PAGE_LAYERS.coverBaseZ : PAGE_LAYERS.restingZ);
            promises.push(leaf.textures(textures, {...descriptor.surface,previewWidth:256}, {...descriptor.folio,previewWidth:256}));
          }
          // A thin stack keeps the cover overhang physically visible.
          for (const side of [-1,1]) {
            const stack = new THREE.Mesh(new THREE.BoxGeometry(PAPER.widthMm/210,PAPER.heightMm/210,.012),
              new THREE.MeshStandardMaterial({color:'#edece8',roughness:1}));
            stack.position.set(side*.5,0,PAGE_LAYERS.coverBaseZ+.006); scene.add(stack); resources.push(stack);
          }
          await Promise.all(promises);
          if (disposed) return;
          if (textureError) throw textureError;
          renderer.render(scene, camera);
          light.shadow.dispose();
          previews.set(key, renderer.domElement.toDataURL('image/png'));
          while (previews.size > 24) previews.delete(previews.keys().next().value);
          leaves.splice(0).forEach(leaf => leaf.dispose());
          resources.splice(0).forEach(object => { object.removeFromParent(); object.geometry.dispose(); object.material.dispose(); });
        }
        if (!disposed && target.isConnected) {
          const image = document.createElement('img'); image.src = previews.get(key);
          image.alt = `${item.kind === 'first' ? 'Original' : 'Custom'} Edition miniature 3D book`;
          image.width = 320; image.height = 228; target.replaceChildren(image);
        }
      }
    } catch (error) {
      if (!disposed) root.querySelectorAll('[data-bag-preview]:empty').forEach(target => { target.textContent = 'PREVIEW UNAVAILABLE'; });
      console.warn('Bag preview:', error.message);
    } finally { dispose(); }
  })();
  return dispose;
}
