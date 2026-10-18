/* Attacke Pinguin — lightweight 3D renderer (Three.js) */
(() => {
  const canvas = document.getElementById("game3d");
  if (!canvas) return;
  if (!window.THREE) {
    const fallback = document.getElementById("game");
    if (fallback) fallback.style.opacity = "1";
    canvas.style.display = "none";
    return;
  }
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(960, 600, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#cfe5ec");
  scene.fog = new THREE.Fog("#cfe5ec", 900, 2300);
  const camera3d = new THREE.PerspectiveCamera(48, 960 / 600, 1, 3500);
  const hemi = new THREE.HemisphereLight("#effbff", "#617c89", 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff6dc", 2.6);
  sun.position.set(-300, 800, 450); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000,6000), new THREE.MeshStandardMaterial({color:"#d7edf2",roughness:0.95}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-2; ground.receiveShadow=true; scene.add(ground);
  const grid = new THREE.GridHelper(6000, 75, "#aacbd5", "#c3dce3"); grid.position.y=-1.5; scene.add(grid);
  const entityMeshes = new Map();
  const renderIds = new WeakMap();
  let nextRenderId = 1;
  function renderId(item) {
    if (item.id !== undefined && item.id !== null) return String(item.id);
    if (!renderIds.has(item)) renderIds.set(item, nextRenderId++);
    return String(renderIds.get(item));
  }
  const mat = (color, roughness=0.8) => new THREE.MeshStandardMaterial({color,roughness});
  const mats = {
    body: mat("#202b35"), belly: mat("#f5f7f5"), beak: mat("#f7a83e"), eye: mat("#101820"),
    normal:mat("#c74343"), heavy:mat("#e27b32"), ice:mat("#39b9d5"), armored:mat("#687783"),
    elite:mat("#d83c91"), boss:mat("#7e45b8"), crystal:mat("#39d9a7"), phantom:mat("#5144a8"),
    snow:mat("#ffffff"), shot:mat("#ffffff"), wall:mat("#79a5b1"), house:mat("#e8f8fc")
  };
  const skinColors = { classic:"#202b35", arctic:"#52cde8", magma:"#c84b35", forest:"#2b7a56", royal:"#7652b8", gold:"#d6a72c" };
  function makePenguin(skin="classic", down=false) {
    const g = new THREE.Group();
    const color = down ? "#737e83" : (skinColors[skin] || skinColors.classic);
    const body = new THREE.Mesh(new THREE.SphereGeometry(17,20,16), mat(color));
    body.scale.set(0.82,1.12,0.78); body.position.y=22; body.castShadow=true; g.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(11,18,14), mats.belly);
    belly.scale.set(0.82,1.0,0.36); belly.position.set(0,20,9); g.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(10,18,14), mat(color));
    head.position.set(0,39,2); head.castShadow=true; g.add(head);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.8,10,8), mats.belly);
    eye.position.set(4,40,10); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.9,8,6), mats.eye);
    pupil.position.set(4.5,40,11.3); g.add(pupil);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(3.2,9,8), mats.beak);
    beak.rotation.x=Math.PI/2; beak.rotation.z=-Math.PI/2; beak.position.set(0,36,13); g.add(beak);
    for (const side of [-1,1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(4,10,8), mat(color));
      wing.scale.set(0.7,1.5,0.55); wing.position.set(side*13,23,0); wing.rotation.z=side*0.2; g.add(wing);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(4,10,8), mats.beak);
      foot.scale.set(1.3,0.45,1.7); foot.position.set(side*6,3,3); g.add(foot);
    }
    return g;
  }
  function makeEnemy(type="normal", radius=16) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(radius,18,14), mats[type] || mats.normal);
    body.position.y=radius+2; body.castShadow=true; g.add(body);
    const eyeMat = mat("#fff8ed");
    for (const side of [-1,1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(Math.max(2,radius*0.13),8,6), eyeMat);
      eye.position.set(side*radius*0.28,radius*1.12,radius*0.78); g.add(eye);
    }
    if(type==="boss") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius+8,3,8,32),mat("#d9b8ff"));
      ring.rotation.x=Math.PI/2; ring.position.y=4; g.add(ring);
      const spikes = new THREE.Mesh(new THREE.ConeGeometry(radius*0.2,radius*0.65,6),mat("#c9e6ff"));
      for(let i=0;i<6;i++){const s=spikes.clone();s.position.set(Math.cos(i*Math.PI/3)*radius*0.75,radius*1.85,Math.sin(i*Math.PI/3)*radius*0.75);g.add(s);}
    }
    return g;
  }
  function getMesh(id, create) {
    if(!entityMeshes.has(id)){const mesh=create();scene.add(mesh);entityMeshes.set(id,mesh);}
    return entityMeshes.get(id);
  }
  function syncList(items, prefix, create, place) {
    const alive = new Set();
    for(const item of items||[]) {
      const id=prefix+renderId(item); alive.add(id);
      const mesh=getMesh(id,()=>create(item));
      place(mesh,item);
    }
    for(const [id,mesh] of entityMeshes) if(id.startsWith(prefix)&&!alive.has(id)){scene.remove(mesh);entityMeshes.delete(id);}
  }
  window.render3DWorld = function() {
    if(typeof world === "undefined" || typeof localPlayer !== "function") return;
    const players=world.players||[], enemies=world.enemies||[];
    syncList(players,"p:",p=>makePenguin(p.skin,!p.alive),(m,p)=>{
      m.position.set(p.x,0,p.y); m.rotation.y=-(p.angle||0); m.visible=true;
      const body=m.children[0]; if(body) body.material.color.set(p.alive?(skinColors[p.skin]||skinColors.classic):"#737e83");
      m.scale.setScalar(p.alive?1:0.85);
    });
    syncList(enemies,"e:",e=>makeEnemy(e.type,e.r||16),(m,e)=>{
      m.position.set(e.x,0,e.y); m.visible=e.hp>0;
      const s=e.type==="boss"?1.35:1; m.scale.setScalar(s);
      m.rotation.y += 0.01;
    });
    syncList(world.snowballs||[],"s:",d=>{
      const m=new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(4,d.r||8),1),mats.snow);m.castShadow=true;return m;
    },(m,d)=>{m.position.set(d.x,Math.sin(performance.now()/240+d.x)*2+7,d.y);m.visible=d.amount>0;});
    syncList(world.shots||[],"t:",s=>{
      const m=new THREE.Mesh(new THREE.SphereGeometry(s.r||5,10,8),mats.shot);return m;
    },(m,s)=>m.position.set(s.x,12,s.y));
    syncList(world.walls||[],"w:",w=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w.w,18,w.h),mats.wall);m.castShadow=true;m.receiveShadow=true;return m;
    },(m,w)=>m.position.set(w.x+w.w/2,9,w.y+w.h/2));
    syncList(world.houses||[],"h:",h=>{
      const g=new THREE.Group();const base=new THREE.Mesh(new THREE.SphereGeometry(1,18,12,0,Math.PI*2,0,Math.PI/2),mats.house);base.scale.set(h.w/2,28,h.h/2);base.position.y=4;base.castShadow=true;g.add(base);return g;
    },(m,h)=>m.position.set(h.x+h.w/2,0,h.y+h.h/2));
    const player=localPlayer();
    if(player) {
      const target=new THREE.Vector3(player.x,0,player.y);
      camera3d.position.set(player.x,650,player.y+520);
      camera3d.lookAt(target.x,0,target.z);
    }
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(1,Math.floor(rect.width*renderer.getPixelRatio()));
    const h=Math.max(1,Math.floor(rect.height*renderer.getPixelRatio()));
    if(canvas.width!==w||canvas.height!==h) renderer.setSize(rect.width,rect.height,false);
    camera3d.aspect=rect.width/Math.max(1,rect.height); camera3d.updateProjectionMatrix();
    renderer.render(scene,camera3d);
  };
})();
