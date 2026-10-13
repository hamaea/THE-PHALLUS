import * as THREE from '../vendor/three.module.min.js';
import { Leaf, Textures } from './book-3d.js';
import { unfoldedSurfaces } from './book-surfaces.js';
import { spring } from './paper-motion.js';

const W=2,H=2*594/420;
const slots=[[-1.65,.92,.62],[1.65,.92,.62],[-1.65,-.92,.62],[1.65,-.92,.62],[-.64,1.68,.53],[.64,1.68,.53],[0,-1.77,.53]];
export class PosterExhibition {
  constructor(host){
    this.host=host;this.active=0;this.visible=true;this.events=new AbortController();this.leaves=[];this.frame=null;this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.status=host.querySelector('.poster-status');this.fallback=host.querySelector('.poster-fallback');
    const options={signal:this.events.signal};
    host.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();this.select((this.active+(event.key==='ArrowRight'?1:7))%8);}},options);
    this.fallback.addEventListener('click',event=>{const button=event.target.closest('[data-poster-select]');if(button)this.select(Number(button.dataset.posterSelect));},options);
    try { this.renderer=new THREE.WebGLRenderer({antialias:true}); }
    catch {host.classList.add('poster-no-webgl');this.fallback.hidden=false;host.querySelector('.poster-loading').remove();this.updateStatus();this.layoutFallback();return;}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label','A2 poster stack. Click exposed sheets; lift either bottom corner.');host.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#ffffff');this.camera=new THREE.OrthographicCamera(-4,4,3,-3,.1,30);
    this.camera.position.set(0,0,10);this.camera.lookAt(0,0,0);this.pointer=new THREE.Vector2();this.raycaster=new THREE.Raycaster();
    this.scene.add(new THREE.HemisphereLight('#ffffff','#dedbd6',2.6));
    const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(-2,3,7);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
    Object.assign(light.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:18});light.shadow.bias=-.0002;light.shadow.normalBias=.008;light.shadow.radius=3;this.scene.add(light);
    this.floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:.13}));this.floor.position.z=-.04;this.floor.receiveShadow=true;this.scene.add(this.floor);
    this.textures=new Textures(()=>this.invalidate(),message=>{this.status.textContent=message;});
    for(let i=0;i<8;i++){
      const leaf=new Leaf(this.scene,'right',false,{width:W,height:H}),surfaces=unfoldedSurfaces(i);
      leaf.index=i;leaf.descriptor={surface:surfaces.front,folio:surfaces.back};leaf.descriptors=[surfaces.front,surfaces.back];leaf.front.visible=false;leaf.back.visible=false;this.leaves.push(leaf);
    }
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);
    host.addEventListener('pointerdown',event=>this.down(event),options);host.addEventListener('pointermove',event=>this.move(event),options);
    host.addEventListener('pointerup',event=>this.up(event),options);host.addEventListener('pointercancel',event=>this.up(event,true),options);
    host.addEventListener('lostpointercapture',event=>{if(this.gesture)this.up(event,true);},options);
    this.fit();this.updateStatus();this.loadFront(0,1024).then(()=>{if(!this.disposed)host.querySelector('.poster-loading')?.remove();});this.loadBack(0);
    // Decode preview fronts sequentially, instead of eight original A2 files.
    this.queue=Promise.resolve();for(let i=1;i<8;i++)this.queue=this.queue.then(()=>this.disposed?null:this.loadFront(i,512));
  }
  loadFront(index,width){
    const leaf=this.leaves[index];if(leaf.previewWidth>=width)return leaf.frontReady;
    leaf.previewWidth=width;const descriptor={...leaf.descriptor.surface,previewWidth:width};leaf.descriptors[0]=descriptor;
    const generation=leaf.frontGeneration=(leaf.frontGeneration||0)+1;
    leaf.frontReady=this.textures.get(descriptor).then(texture=>{
      if(this.disposed||leaf.frontGeneration!==generation||!texture)return;
      leaf.frontMaterial.map=texture;leaf.frontMaterial.needsUpdate=true;leaf.front.visible=true;this.retain();this.invalidate();
    }).catch(error=>{if(!this.disposed)this.status.textContent=error.message;});return leaf.frontReady;
  }
  loadBack(index){
    const leaf=this.leaves[index];if(leaf.backReady)return leaf.backReady;
    leaf.descriptors[1]={...leaf.descriptor.folio,previewWidth:1024};
    return leaf.backReady=this.textures.get(leaf.descriptors[1]).then(texture=>{
      if(this.disposed||!texture)return;leaf.backMaterial.map=texture;leaf.backMaterial.needsUpdate=true;leaf.back.visible=true;this.retain();this.invalidate();
    }).catch(error=>{if(!this.disposed)this.status.textContent=error.message;});
  }
  retain(){this.textures.retain(new Set(this.leaves.flatMap(leaf=>[JSON.stringify(leaf.descriptors[0]),...(leaf.index===this.active?[JSON.stringify(leaf.descriptors[1])]:[])])));}
  updateStatus(){
    this.host.dataset.posterActive=String(this.active+1);this.host.dataset.posterCount='8';
    this.status.textContent=`Poster ${this.active+1} of 8`;
    this.fallback.querySelectorAll('button').forEach((button,index)=>button.setAttribute('aria-pressed',String(index===this.active)));
  }
  select(index){
    if(this.gesture||this.curl)return;
    this.active=index;this.updateStatus();if(!this.renderer){this.layoutFallback();return;}
    this.loadFront(index,1024);this.loadBack(index);this.arrange();this.retain();this.invalidate();
  }
  arrange(instant=false){
    instant=instant||this.reduced.matches;
    const compact=this.host.clientWidth/this.host.clientHeight<.9;
    this.leaves.forEach(leaf=>{
      const rank=(leaf.index-this.active+8)%8;
      const pose=rank===0?[0,0,compact?1.07:1.18]:compact?[((rank%2?-1:1)*(.22+.07*rank)),.5-.15*rank,.9-.025*rank]:slots[rank-1];
      leaf.target={x:pose[0],y:pose[1],scale:pose[2],z:rank===0?.15:.015+(8-rank)*.012};
      if(instant||!leaf.pose)leaf.pose={...leaf.target};
    });this.moving=!instant;this.host.dataset.posterMotion=this.moving?'arrange':'idle';
  }
  fit(){
    if(this.disposed||!this.renderer)return;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h,false);const aspect=w/h,compact=aspect<.9;
    const half=compact?Math.max(1.85,1.56/aspect):Math.max(2.62,2.44/aspect);
    Object.assign(this.camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.camera.updateProjectionMatrix();
    this.arrange(true);this.invalidate();
  }
  hit(event){
    const box=this.host.getBoundingClientRect();this.pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);this.scene.updateMatrixWorld();
    const hit=this.raycaster.intersectObjects(this.leaves.filter(leaf=>leaf.front.visible).map(leaf=>leaf.front),false)[0];if(!hit)return null;
    const leaf=this.leaves.find(leaf=>leaf.front===hit.object),local=leaf.group.worldToLocal(hit.point.clone());
    const u=local.x/W,v=local.y/H+.5;return{leaf,corner:v<.22&&(u<.28||u>.72),left:u<.5};
  }
  down(event){
    if(event.button>0||this.curl||this.moving)return;const hit=this.hit(event);if(!hit)return;
    this.gesture={...hit,id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false};this.host.dataset.posterInteracting='true';
    this.host.focus({preventScroll:true});this.host.setPointerCapture(event.pointerId);
  }
  move(event){
    const gesture=this.gesture;
    if(!gesture){const hit=this.hit(event);this.host.style.cursor=hit?.corner&&hit.leaf.index===this.active?'ns-resize':hit?'pointer':'default';return;}
    if(event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.dragging){
      if(gesture.leaf.index!==this.active||!gesture.corner||dy>-7||-dy<Math.abs(dx)*1.15)return;
      gesture.dragging=true;gesture.leaf.curlCorner=gesture.left?'left':'right';
      this.curl={leaf:gesture.leaf,value:0,velocity:0,target:0,released:false};this.host.dataset.posterMotion='curl';this.loadBack(this.active);
    }
    event.preventDefault();this.curl.target=THREE.MathUtils.clamp(-dy/(this.host.clientHeight*.32),0,1);this.invalidate();
  }
  up(event,cancelled=false){
    const gesture=this.gesture;if(!gesture||event.pointerId!==gesture.id)return;this.gesture=null;
    if(this.host.hasPointerCapture(event.pointerId))this.host.releasePointerCapture(event.pointerId);
    if(this.curl){this.curl.target=0;this.curl.released=true;this.invalidate();}
    else{delete this.host.dataset.posterInteracting;if(!cancelled&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<7)this.select(gesture.leaf.index);}
  }
  setVisible(visible){this.visible=visible;if(visible)this.invalidate();else{cancelAnimationFrame(this.frame);this.frame=null;this.lastTime=null;}}
  invalidate(){if(this.renderer&&!this.disposed&&this.visible&&!this.frame)this.frame=requestAnimationFrame(time=>this.animate(time));}
  animate(time){
    this.frame=null;if(this.disposed||!this.visible)return;const dt=this.lastTime?Math.min((time-this.lastTime)/1000,.032):.016;this.lastTime=time;
    const blend=1-Math.exp(-dt*13);let moving=false;
    for(const leaf of this.leaves){
      for(const key of ['x','y','scale','z']){const difference=leaf.target[key]-leaf.pose[key];if(Math.abs(difference)>.0003){leaf.pose[key]+=difference*blend;moving=true;}else leaf.pose[key]=leaf.target[key];}
      const p=leaf.pose;leaf.group.scale.set(p.scale,p.scale,1);leaf.group.position.set(p.x-W*p.scale/2,p.y,p.z);
    }
    this.moving=moving;
    if(this.curl){
      const curl=this.curl,target=curl.leaf.backMaterial.map?curl.target:0;[curl.value,curl.velocity]=spring(curl.value,curl.velocity,target,dt);
      curl.leaf.deform(0,curl.value,curl.leaf.pose.z);this.host.dataset.posterCurl=curl.value.toFixed(4);
      if(curl.released&&curl.value===0&&curl.velocity===0){this.curl=null;delete this.host.dataset.posterInteracting;}
      else this.invalidate();
    }
    this.host.dataset.posterMotion=this.curl?'curl':moving?'arrange':'idle';
    this.host.dataset.posterReady=String(Boolean(this.leaves[this.active].frontMaterial.map&&this.leaves[this.active].backMaterial.map));
    this.host.dataset.posterFront=this.leaves[this.active].descriptor.surface.assetId;this.host.dataset.posterBack=this.leaves[this.active].descriptor.folio.assetId;
    this.renderer.render(this.scene,this.camera);if(moving)this.invalidate();
  }
  layoutFallback(){
    this.host.dataset.posterMotion='idle';this.fallback.querySelectorAll('button').forEach((button,i)=>{
      const rank=(i-this.active+8)%8;button.style.setProperty('--poster-rank',rank);button.style.zIndex=String(8-rank);
    });
  }
  dispose(){
    this.disposed=true;this.events.abort();cancelAnimationFrame(this.frame);this.resize?.disconnect();this.textures?.dispose();
    this.leaves.forEach(leaf=>leaf.dispose());if(this.scene)for(const light of this.scene.children)light.shadow?.map?.dispose();
    this.floor?.geometry.dispose();this.floor?.material.dispose();this.renderer?.dispose();this.renderer?.forceContextLoss();this.renderer?.domElement.remove();
  }
}
