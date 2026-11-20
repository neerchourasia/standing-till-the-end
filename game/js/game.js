// ---------- constants ----------
const S = 2;                 // world units per tile
const COLS = 90, ROWS = 70;   // bigger forest
const DAY = 150;             // seconds per day/night cycle
const T_GRASS = 0, T_TREE = 1, T_WATER = 2, T_BUSH = 3, T_DEN = 4;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const solidT = t => t === T_WATER; // trees can be walked through; water and map edges still block

// ---------- three.js setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color(0x9fd3ff), NIGHT_SKY = new THREE.Color(0x0a0f2a);
const WHITE = new THREE.Color(1, 1, 1), MOON = new THREE.Color(0x8899ff);
scene.background = new THREE.Color(0x9fd3ff);
scene.fog = new THREE.Fog(0x9fd3ff, 30, 90);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);

const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x3a5a2a, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0015;
scene.add(sun); scene.add(sun.target);

// procedural grass texture: noisy blades and dark/light patches
function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4f8f3a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(35,85,28,0.35)' : 'rgba(125,185,75,0.3)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 3 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(45, 34);
  return t;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(COLS * S * 3, ROWS * S * 3),
  new THREE.MeshLambertMaterial({ color: 0xc8d8b0, map: makeGrassTexture() })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(COLS * S / 2, 0, ROWS * S / 2);
ground.receiveShadow = true;
scene.add(ground);

// shared geometry & materials
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),   // animal parts: converted to soft ellipsoids in M()
  plate: new THREE.BoxGeometry(1, 1, 1), // square tiles (water, den), kept as blocks
  sph: new THREE.SphereGeometry(1, 12, 9),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
};
const L = c => new THREE.MeshLambertMaterial({ color: c });
// procedural textures: bark streaks and mottled leaves, drawn on a canvas
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function drawBark(g, n) {
  g.fillStyle = '#6b4a2b';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = Math.random() < 0.6 ? 'rgba(35,22,10,0.45)' : 'rgba(150,115,75,0.35)';
    g.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 2, 10 + Math.random() * 60);
  }
}
function drawLeaves(g, n) {
  g.fillStyle = '#2f7a36';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(20,60,25,0.5)' : 'rgba(120,190,80,0.45)';
    g.beginPath();
    g.ellipse(Math.random() * n, Math.random() * n, 3 + Math.random() * 6, 2 + Math.random() * 4, Math.random() * 3, 0, 6.28);
    g.fill();
  }
}

const MAT = {
  trunk: new THREE.MeshLambertMaterial({ color: 0xffffff, map: canvasTexture(256, drawBark) }),
  leaf1: new THREE.MeshLambertMaterial({ color: 0xffffff, map: canvasTexture(256, drawLeaves) }),
  leaf2: new THREE.MeshLambertMaterial({ color: 0xdfffd6, map: canvasTexture(256, drawLeaves) }),
  water: new THREE.MeshPhongMaterial({ color: 0x2a6fb8, shininess: 80 }),
  bush: L(0x2e6b2e), berry: L(0xe0304a), denG: L(0x3a2e22), denHole: L(0x140e08),
  fox: L(0xe8731c), white: L(0xffffff), dark: L(0x222222),
  rabbit: L(0xc9c3b8), wolf: L(0x4a4f57), wolfDark: L(0x333740),
  bear: L(0x5a3b22), bearDark: L(0x3b2615),
  deer: L(0xb08050), deerDark: L(0x5a3a22), antler: L(0x6b5a40),
  badgerGrey: L(0x6e6a64), badgerWhite: L(0xd8d4cc),
  squirrel: L(0x9a6a3a),
  boar: L(0x4a3a30), boarDark: L(0x2e2620), boarSnout: L(0xc08a80), boarHead: L(0x7a6250),
  hBrown: L(0x7a4a2a), hChest: L(0xf0e6d2), hDark: L(0x3a2418),
  oBrown: L(0x8a7a60), oLight: L(0xe6d8b8), oHead: L(0x9c8a6a), oTuft: L(0x6a5a40),
  dGreen: L(0x2a7a3a), dGrey: L(0x8c8a80), dBill: L(0xe8a020), dBrown: L(0x6a4a2a),
  cBlack: L(0x1e1e24), cGrey: L(0x555560),
  eBrown: L(0x4a3626), eWhite: L(0xf5f5f0), eBeak: L(0xe8c040),
  sBrown: L(0x8a6a4a), sHead: L(0x7a5a3a), sBib: L(0x222222), sWing: L(0x6a4a2a),
  hGrey: L(0x9aa4ad), hLeg: L(0x6a6a50), hBeak: L(0xd08a30),
  pGrey: L(0x8a94a0), pHead: L(0x7a8490), pNeck: L(0x4a7a6a), pWing: L(0x6a7480),
  hogSpine: L(0x3a2a1a), hogBody: L(0x7a5a3a), hogFace: L(0xd8c8a8),
  coonGrey: L(0x8a8a8a), coonDark: L(0x222222),
  mooseBrown: L(0x5a3e28), mooseDark: L(0x4a3020), mooseSnout: L(0x6a4a34),
  lynxTan: L(0xb08a5a), lynxRuff: L(0xe8dcc0), lynxDark: L(0x4a3020),
  fSlate: L(0x5a6070), fChest: L(0xe8e4dc), fDark: L(0x4a5060), fBeak: L(0x333333),
  sbGrey: L(0x9a9a92), sbBlack: L(0x222222), sbLeg: L(0xd0a060), sbWing: L(0x6a6a64), sbBeak: L(0x888888),
};
const yellowEye = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });

// mesh helper: geometry, material, position, scale
function M(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  if (geo === GEO.box) geo = GEO.sph; // limbs, heads and wings become rounded ellipsoids
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- models ----------
function makeTree() {
  const g = new THREE.Group();
  g.add(M(GEO.cyl, MAT.trunk, 0, 0.7, 0, 0.18, 1.4, 0.18));
  g.add(M(GEO.cone, MAT.leaf1, 0, 2.0, 0, 1.1, 1.8, 1.1));
  g.add(M(GEO.cone, MAT.leaf2, 0, 2.9, 0, 0.8, 1.4, 0.8));
  return g;
}
function makeBush() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.bush, 0, 0.5, 0, 0.7, 0.6, 0.7));
  const berries = new THREE.Group();
  for (const [x, y, z] of [[0.6, 0.85, 0.25], [-0.55, 0.9, 0.4], [0.1, 0.95, -0.62]])
    berries.add(M(GEO.sph, MAT.berry, x, y, z, 0.13, 0.13, 0.13));
  g.add(berries);
  return { g, berries };
}
function makeRabbit() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.rabbit, 0, 0.35, 0, 0.32, 0.28, 0.4));
  g.add(M(GEO.sph, MAT.rabbit, 0, 0.6, 0.3, 0.2, 0.2, 0.2));
  g.add(M(GEO.box, MAT.rabbit, -0.07, 0.9, 0.3, 0.07, 0.4, 0.04));
  g.add(M(GEO.box, MAT.rabbit, 0.07, 0.9, 0.3, 0.07, 0.4, 0.04));
  g.add(M(GEO.sph, MAT.white, 0, 0.4, -0.38, 0.1, 0.1, 0.1));
  return g;
}
function makeFox() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.fox, 0, 0.6, 0, 0.42, 0.36, 0.75));
  g.add(M(GEO.sph, MAT.white, 0, 0.5, 0.35, 0.3, 0.25, 0.3));
  g.add(M(GEO.sph, MAT.fox, 0, 0.95, 0.6, 0.3, 0.28, 0.3));
  g.add(M(GEO.sph, MAT.white, 0, 0.86, 0.9, 0.14, 0.12, 0.22));
  g.add(M(GEO.sph, MAT.dark, 0, 0.92, 1.1, 0.05, 0.05, 0.05));
  g.add(M(GEO.sph, MAT.dark, -0.13, 1.02, 0.8, 0.05, 0.05, 0.05));
  g.add(M(GEO.sph, MAT.dark, 0.13, 1.02, 0.8, 0.05, 0.05, 0.05));
  g.add(M(GEO.cone, MAT.fox, -0.16, 1.3, 0.55, 0.1, 0.3, 0.1));
  g.add(M(GEO.cone, MAT.fox, 0.16, 1.3, 0.55, 0.1, 0.3, 0.1));
  for (const x of [-0.2, 0.2]) for (const z of [-0.42, 0.42])
    g.add(M(GEO.box, MAT.dark, x, 0.22, z, 0.12, 0.45, 0.12));
  g.add(M(GEO.sph, MAT.fox, 0, 0.75, -0.9, 0.16, 0.16, 0.5));
  g.add(M(GEO.sph, MAT.white, 0, 0.72, -1.2, 0.17, 0.17, 0.17));
  return g;
}
function makeDeer() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.deer, 0, 1.0, 0, 0.45, 0.4, 0.8));          // body
  g.add(M(GEO.box, MAT.deer, 0, 1.35, 0.6, 0.2, 0.5, 0.2));        // neck
  g.add(M(GEO.box, MAT.deer, 0, 1.7, 0.8, 0.3, 0.3, 0.45));        // head
  g.add(M(GEO.box, MAT.deerDark, 0, 1.65, 1.05, 0.18, 0.16, 0.12)); // muzzle
  g.add(M(GEO.box, MAT.antler, -0.12, 2.0, 0.7, 0.04, 0.4, 0.04));
  g.add(M(GEO.box, MAT.antler, 0.12, 2.0, 0.7, 0.04, 0.4, 0.04));
  for (const x of [-0.2, 0.2]) for (const z of [-0.5, 0.5])
    g.add(M(GEO.box, MAT.deerDark, x, 0.5, z, 0.1, 1.0, 0.1));    // legs
  g.add(M(GEO.sph, MAT.white, 0, 1.2, -0.85, 0.12, 0.12, 0.12));  // white tail
  g.add(M(GEO.sph, MAT.dark, -0.1, 1.75, 0.95, 0.04, 0.04, 0.04));
  g.add(M(GEO.sph, MAT.dark, 0.1, 1.75, 0.95, 0.04, 0.04, 0.04));
  return g;
}
function makeBear() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.bear, 0, 0.75, 0, 0.7, 0.55, 0.9));          // body
  g.add(M(GEO.sph, MAT.bear, 0, 1.05, 0.75, 0.4, 0.38, 0.4));       // head
  g.add(M(GEO.sph, MAT.bearDark, 0, 0.95, 1.1, 0.2, 0.16, 0.25));   // snout
  g.add(M(GEO.sph, MAT.dark, 0, 1.0, 1.35, 0.06, 0.06, 0.06));      // nose
  g.add(M(GEO.sph, MAT.bear, -0.25, 1.4, 0.65, 0.15, 0.15, 0.15));  // ears
  g.add(M(GEO.sph, MAT.bear, 0.25, 1.4, 0.65, 0.15, 0.15, 0.15));
  for (const x of [-0.35, 0.35]) for (const z of [-0.5, 0.5])
    g.add(M(GEO.box, MAT.bearDark, x, 0.25, z, 0.25, 0.5, 0.25));   // legs
  g.add(M(GEO.sph, MAT.dark, -0.18, 1.2, 1.0, 0.05, 0.05, 0.05));
  g.add(M(GEO.sph, MAT.dark, 0.18, 1.2, 1.0, 0.05, 0.05, 0.05));
  return g;
}

function makeBadger() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.badgerGrey, 0, 0.5, 0, 0.45, 0.4, 0.75));       // body
  g.add(M(GEO.sph, MAT.badgerWhite, 0, 0.62, 0.6, 0.3, 0.28, 0.3));    // head
  g.add(M(GEO.box, MAT.dark, 0, 0.75, 0.55, 0.1, 0.08, 0.35));         // head stripe
  g.add(M(GEO.sph, MAT.dark, 0, 0.6, 0.92, 0.08, 0.08, 0.08));         // nose
  for (const x of [-0.25, 0.25]) for (const z of [-0.4, 0.4])
    g.add(M(GEO.box, MAT.dark, x, 0.17, z, 0.14, 0.34, 0.14));         // legs
  g.add(M(GEO.sph, MAT.badgerGrey, 0, 0.55, -0.8, 0.1, 0.1, 0.2));     // tail
  return g;
}
function makeSquirrel() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.squirrel, 0, 0.35, 0, 0.22, 0.22, 0.34));       // body
  g.add(M(GEO.sph, MAT.squirrel, 0, 0.55, 0.3, 0.17, 0.17, 0.17));     // head
  g.add(M(GEO.sph, MAT.dark, -0.07, 0.6, 0.45, 0.03, 0.03, 0.03));     // eyes
  g.add(M(GEO.sph, MAT.dark, 0.07, 0.6, 0.45, 0.03, 0.03, 0.03));
  for (const x of [-0.1, 0.1]) for (const z of [-0.2, 0.2])
    g.add(M(GEO.box, MAT.dark, x, 0.1, z, 0.06, 0.2, 0.06));           // legs
  g.add(M(GEO.sph, MAT.squirrel, 0, 0.6, -0.5, 0.15, 0.32, 0.12));     // bushy tail
  return g;
}
function makeBoar() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.boar, 0, 0.6, 0, 0.6, 0.5, 0.9));               // body
  g.add(M(GEO.box, MAT.boarHead, 0, 0.7, 1.0, 0.5, 0.45, 0.45));           // head
  g.add(M(GEO.box, MAT.boarSnout, 0, 0.6, 1.3, 0.3, 0.22, 0.14));      // snout
  for (const x of [-0.15, 0.15]) g.add(M(GEO.cone, MAT.white, x, 0.5, 1.2, 0.07, 0.32, 0.07)); // tusks
  for (const x of [-0.3, 0.3]) for (const z of [-0.5, 0.5])
    g.add(M(GEO.box, MAT.boarDark, x, 0.25, z, 0.2, 0.5, 0.2));          // legs
  g.add(M(GEO.sph, MAT.dark, -0.2, 0.85, 1.15, 0.05, 0.05, 0.05));
  g.add(M(GEO.sph, MAT.dark, 0.2, 0.85, 1.15, 0.05, 0.05, 0.05));
  return g;
}

function makeHawk() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.hBrown, 0, 0.45, 0, 0.3, 0.3, 0.6));        // body
  g.add(M(GEO.sph, MAT.hChest, 0, 0.4, 0.25, 0.22, 0.2, 0.3));     // chest
  g.add(M(GEO.sph, MAT.hBrown, 0, 0.66, 0.5, 0.18, 0.18, 0.18));   // head
  g.add(M(GEO.box, MAT.hDark, 0, 0.62, 0.72, 0.07, 0.08, 0.12));   // hooked beak
  g.add(M(GEO.sph, yellowEye, -0.09, 0.7, 0.6, 0.03, 0.03, 0.03));
  g.add(M(GEO.sph, yellowEye, 0.09, 0.7, 0.6, 0.03, 0.03, 0.03));
  g.add(M(GEO.box, MAT.hBrown, -0.5, 0.5, 0, 0.8, 0.05, 0.4));     // wings
  g.add(M(GEO.box, MAT.hBrown, 0.5, 0.5, 0, 0.8, 0.05, 0.4));
  g.add(M(GEO.box, MAT.hDark, 0, 0.42, -0.6, 0.25, 0.04, 0.4));    // tail
  return g;
}
function makeOwl() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.oBrown, 0, 0.5, 0, 0.36, 0.45, 0.36));      // body
  g.add(M(GEO.sph, MAT.oHead, 0, 0.98, 0, 0.3, 0.28, 0.28));       // head
  g.add(M(GEO.sph, MAT.oLight, 0, 0.96, 0.24, 0.22, 0.2, 0.07));   // facial disc
  g.add(M(GEO.sph, yellowEye, -0.1, 1.0, 0.3, 0.13, 0.13, 0.06));  // big eyes
  g.add(M(GEO.sph, yellowEye, 0.1, 1.0, 0.3, 0.13, 0.13, 0.06));
  g.add(M(GEO.cone, MAT.oTuft, -0.18, 1.3, 0, 0.07, 0.2, 0.07));   // ear tufts
  g.add(M(GEO.cone, MAT.oTuft, 0.18, 1.3, 0, 0.07, 0.2, 0.07));
  g.add(M(GEO.box, MAT.oTuft, -0.4, 0.5, 0, 0.12, 0.5, 0.3));      // wings
  g.add(M(GEO.box, MAT.oTuft, 0.4, 0.5, 0, 0.12, 0.5, 0.3));
  return g;
}
function makeDuck() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.dGrey, 0, 0.42, 0, 0.42, 0.3, 0.6));        // body
  g.add(M(GEO.sph, MAT.dGreen, 0, 0.72, 0.42, 0.2, 0.2, 0.2));     // head
  g.add(M(GEO.box, MAT.dBill, 0, 0.66, 0.65, 0.2, 0.07, 0.2));     // bill
  g.add(M(GEO.box, MAT.dBrown, 0, 0.5, 0, 0.5, 0.06, 0.25));       // wing patch
  g.add(M(GEO.box, MAT.dGrey, 0, 0.5, -0.6, 0.2, 0.15, 0.2));      // tail
  for (const x of [-0.12, 0.12]) g.add(M(GEO.box, MAT.dBill, x, 0.1, 0, 0.05, 0.2, 0.05)); // feet
  return g;
}
function makeCrow() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.cBlack, 0, 0.42, 0, 0.3, 0.28, 0.55));      // body
  g.add(M(GEO.sph, MAT.cBlack, 0, 0.62, 0.38, 0.2, 0.2, 0.2));     // head
  g.add(M(GEO.box, MAT.cGrey, 0, 0.6, 0.6, 0.08, 0.07, 0.2));      // beak
  g.add(M(GEO.sph, yellowEye, -0.08, 0.66, 0.5, 0.03, 0.03, 0.03));
  g.add(M(GEO.sph, yellowEye, 0.08, 0.66, 0.5, 0.03, 0.03, 0.03));
  g.add(M(GEO.box, MAT.cBlack, -0.35, 0.45, 0, 0.6, 0.06, 0.4));   // wings
  g.add(M(GEO.box, MAT.cBlack, 0.35, 0.45, 0, 0.6, 0.06, 0.4));
  g.add(M(GEO.box, MAT.cBlack, 0, 0.42, -0.6, 0.2, 0.04, 0.35));   // tail
  return g;
}

function makeEagle() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.eBrown, 0, 0.45, 0, 0.34, 0.32, 0.62));      // body
  g.add(M(GEO.sph, MAT.eWhite, 0, 0.7, 0.5, 0.2, 0.2, 0.2));        // white head
  g.add(M(GEO.box, MAT.eBeak, 0, 0.66, 0.72, 0.08, 0.09, 0.14));    // hooked beak
  g.add(M(GEO.sph, yellowEye, -0.09, 0.74, 0.6, 0.03, 0.03, 0.03));
  g.add(M(GEO.sph, yellowEye, 0.09, 0.74, 0.6, 0.03, 0.03, 0.03));
  g.add(M(GEO.box, MAT.eBrown, -0.55, 0.5, 0, 0.9, 0.05, 0.45));    // wings
  g.add(M(GEO.box, MAT.eBrown, 0.55, 0.5, 0, 0.9, 0.05, 0.45));
  g.add(M(GEO.box, MAT.eWhite, 0, 0.42, -0.6, 0.3, 0.04, 0.4));     // white tail
  return g;
}
function makeSparrow() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.sBrown, 0, 0.3, 0, 0.22, 0.2, 0.36));        // body
  g.add(M(GEO.sph, MAT.sHead, 0, 0.45, 0.27, 0.14, 0.14, 0.14));    // head
  g.add(M(GEO.sph, MAT.sBib, 0, 0.38, 0.35, 0.1, 0.08, 0.06));      // dark bib
  g.add(M(GEO.box, MAT.hLeg, 0, 0.42, 0.42, 0.05, 0.04, 0.08));     // beak
  g.add(M(GEO.box, MAT.sWing, -0.3, 0.32, 0, 0.5, 0.03, 0.25));     // wings
  g.add(M(GEO.box, MAT.sWing, 0.3, 0.32, 0, 0.5, 0.03, 0.25));
  g.add(M(GEO.box, MAT.sWing, 0, 0.3, -0.4, 0.12, 0.03, 0.25));     // tail
  return g;
}
function makeHeron() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.hGrey, 0, 0.9, 0, 0.35, 0.25, 0.6));         // body
  g.add(M(GEO.box, MAT.hGrey, 0, 1.35, 0.5, 0.12, 0.6, 0.12));      // long neck
  g.add(M(GEO.sph, MAT.hGrey, 0, 1.7, 0.6, 0.12, 0.12, 0.12));      // head
  g.add(M(GEO.box, MAT.hBeak, 0, 1.66, 0.8, 0.06, 0.06, 0.35));     // long beak
  g.add(M(GEO.sph, yellowEye, -0.05, 1.72, 0.66, 0.025, 0.025, 0.025));
  g.add(M(GEO.sph, yellowEye, 0.05, 1.72, 0.66, 0.025, 0.025, 0.025));
  for (const x of [-0.1, 0.1]) g.add(M(GEO.box, MAT.hLeg, x, 0.45, 0, 0.03, 0.9, 0.03)); // stilt legs
  g.add(M(GEO.box, MAT.hGrey, 0, 0.9, -0.5, 0.2, 0.1, 0.3));        // tail
  return g;
}
function makePigeon() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.pGrey, 0, 0.4, 0, 0.3, 0.28, 0.5));          // body
  g.add(M(GEO.sph, MAT.pNeck, 0, 0.55, 0.35, 0.12, 0.12, 0.12));    // green neck patch
  g.add(M(GEO.sph, MAT.pHead, 0, 0.6, 0.42, 0.16, 0.16, 0.16));     // head
  g.add(M(GEO.box, MAT.dark, 0, 0.58, 0.6, 0.04, 0.04, 0.1));       // beak
  g.add(M(GEO.box, MAT.pWing, -0.3, 0.42, 0, 0.5, 0.04, 0.3));      // wings
  g.add(M(GEO.box, MAT.pWing, 0.3, 0.42, 0, 0.5, 0.04, 0.3));
  g.add(M(GEO.box, MAT.pWing, 0, 0.4, -0.45, 0.2, 0.04, 0.3));      // tail
  return g;
}

function makeFalcon() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.fSlate, 0, 0.42, 0, 0.3, 0.28, 0.55));       // body
  g.add(M(GEO.sph, MAT.fChest, 0, 0.38, 0.2, 0.22, 0.2, 0.3));      // pale chest
  g.add(M(GEO.sph, MAT.fDark, 0, 0.66, 0.45, 0.17, 0.17, 0.17));    // head
  g.add(M(GEO.box, MAT.fBeak, 0, 0.62, 0.62, 0.06, 0.08, 0.1));     // hooked beak
  g.add(M(GEO.sph, yellowEye, -0.08, 0.7, 0.55, 0.03, 0.03, 0.03));
  g.add(M(GEO.sph, yellowEye, 0.08, 0.7, 0.55, 0.03, 0.03, 0.03));
  g.add(M(GEO.box, MAT.fDark, -0.5, 0.48, 0, 0.85, 0.04, 0.4));     // wings
  g.add(M(GEO.box, MAT.fDark, 0.5, 0.48, 0, 0.85, 0.04, 0.4));
  g.add(M(GEO.box, MAT.fDark, 0, 0.4, -0.6, 0.22, 0.04, 0.4));      // tail
  return g;
}
function makeSecretaryBird() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.sbGrey, 0, 1.0, 0, 0.3, 0.3, 0.5));          // body
  g.add(M(GEO.sph, MAT.sbBlack, 0, 1.5, 0.4, 0.15, 0.15, 0.15));    // head
  g.add(M(GEO.box, MAT.sbBlack, 0, 1.62, 0.15, 0.05, 0.25, 0.05));  // crest feathers
  g.add(M(GEO.box, MAT.sbBeak, 0, 1.45, 0.6, 0.05, 0.05, 0.2));     // beak
  g.add(M(GEO.sph, yellowEye, -0.07, 1.53, 0.52, 0.03, 0.03, 0.03));
  g.add(M(GEO.sph, yellowEye, 0.07, 1.53, 0.52, 0.03, 0.03, 0.03));
  for (const x of [-0.12, 0.12]) g.add(M(GEO.box, MAT.sbLeg, x, 0.45, 0, 0.04, 0.9, 0.04)); // long legs
  g.add(M(GEO.box, MAT.sbWing, -0.4, 1.0, 0, 0.6, 0.06, 0.35));     // wings
  g.add(M(GEO.box, MAT.sbWing, 0.4, 1.0, 0, 0.6, 0.06, 0.35));
  g.add(M(GEO.box, MAT.sbBlack, 0, 0.95, -0.6, 0.25, 0.05, 0.35));  // tail
  return g;
}

function makeHedgehog() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.hogBody, 0, 0.35, 0, 0.4, 0.35, 0.5));        // body
  for (let i = 0; i < 14; i++) {                                      // spines
    const a = i / 14 * Math.PI * 2;
    g.add(M(GEO.cone, MAT.hogSpine, Math.cos(a) * 0.3, 0.55 + Math.sin(i * 1.7) * 0.05, Math.sin(a) * 0.35 - 0.05, 0.05, 0.22, 0.05));
  }
  g.add(M(GEO.sph, MAT.hogFace, 0, 0.3, 0.45, 0.2, 0.2, 0.2));       // face
  g.add(M(GEO.sph, MAT.dark, 0, 0.3, 0.64, 0.05, 0.05, 0.05));       // nose
  g.add(M(GEO.sph, MAT.dark, -0.1, 0.36, 0.55, 0.03, 0.03, 0.03));   // eyes
  g.add(M(GEO.sph, MAT.dark, 0.1, 0.36, 0.55, 0.03, 0.03, 0.03));
  for (const x of [-0.15, 0.15]) for (const z of [-0.2, 0.2])
    g.add(M(GEO.sph, MAT.dark, x, 0.1, z, 0.07, 0.12, 0.07));         // legs
  return g;
}
function makeRaccoon() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.coonGrey, 0, 0.5, 0, 0.4, 0.36, 0.7));        // body
  g.add(M(GEO.sph, MAT.coonGrey, 0, 0.75, 0.6, 0.28, 0.26, 0.28));   // head
  g.add(M(GEO.sph, MAT.coonDark, 0, 0.75, 0.78, 0.25, 0.16, 0.12));  // black mask
  g.add(M(GEO.sph, MAT.white, -0.1, 0.8, 0.85, 0.04, 0.04, 0.04));   // eyes
  g.add(M(GEO.sph, MAT.white, 0.1, 0.8, 0.85, 0.04, 0.04, 0.04));
  g.add(M(GEO.cone, MAT.coonDark, -0.2, 1.02, 0.55, 0.08, 0.16, 0.08)); // ears
  g.add(M(GEO.cone, MAT.coonDark, 0.2, 1.02, 0.55, 0.08, 0.16, 0.08));
  for (const x of [-0.2, 0.2]) for (const z of [-0.35, 0.35])
    g.add(M(GEO.sph, MAT.coonDark, x, 0.2, z, 0.1, 0.2, 0.1));        // legs
  g.add(M(GEO.sph, MAT.coonGrey, 0, 0.6, -0.9, 0.15, 0.15, 0.4));     // striped tail
  g.add(M(GEO.sph, MAT.coonDark, 0, 0.6, -1.0, 0.16, 0.16, 0.08));
  return g;
}
function makeMoose() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.mooseBrown, 0, 1.5, 0, 0.7, 0.6, 1.1));       // body
  g.add(M(GEO.sph, MAT.mooseDark, 0, 2.1, 1.2, 0.35, 0.4, 0.5));     // head
  g.add(M(GEO.sph, MAT.mooseSnout, 0, 1.85, 1.5, 0.3, 0.25, 0.35));  // snout
  g.add(M(GEO.cyl, MAT.antler, -0.35, 2.7, 1.1, 0.04, 0.6, 0.04));   // antlers
  g.add(M(GEO.cyl, MAT.antler, 0.35, 2.7, 1.1, 0.04, 0.6, 0.04));
  g.add(M(GEO.sph, MAT.antler, -0.5, 3.0, 1.1, 0.25, 0.1, 0.05));
  g.add(M(GEO.sph, MAT.antler, 0.5, 3.0, 1.1, 0.25, 0.1, 0.05));
  for (const x of [-0.4, 0.4]) for (const z of [-0.6, 0.6])
    g.add(M(GEO.sph, MAT.bearDark, x, 0.75, z, 0.14, 0.8, 0.14));    // long legs
  g.add(M(GEO.sph, MAT.mooseDark, 0, 1.6, -1.2, 0.15, 0.15, 0.15));  // stub tail
  return g;
}
function makeLynx() {
  const g = new THREE.Group();
  g.add(M(GEO.sph, MAT.lynxTan, 0, 0.5, 0, 0.35, 0.32, 0.6));        // body
  g.add(M(GEO.sph, MAT.lynxTan, 0, 0.75, 0.5, 0.25, 0.25, 0.25));    // head
  g.add(M(GEO.sph, MAT.lynxRuff, 0, 0.65, 0.6, 0.2, 0.15, 0.15));    // cheek ruff
  g.add(M(GEO.cone, MAT.lynxTan, -0.18, 1.02, 0.45, 0.08, 0.22, 0.08)); // tufted ears
  g.add(M(GEO.cone, MAT.lynxTan, 0.18, 1.02, 0.45, 0.08, 0.22, 0.08));
  g.add(M(GEO.sph, yellowEye, -0.1, 0.8, 0.72, 0.03, 0.03, 0.03));   // eyes
  g.add(M(GEO.sph, yellowEye, 0.1, 0.8, 0.72, 0.03, 0.03, 0.03));
  for (const x of [-0.2, 0.2]) for (const z of [-0.4, 0.4])
    g.add(M(GEO.sph, MAT.lynxDark, x, 0.25, z, 0.08, 0.3, 0.08));    // long legs
  g.add(M(GEO.sph, MAT.lynxTan, 0, 0.55, -0.8, 0.1, 0.1, 0.4));      // short tail
  g.add(M(GEO.sph, MAT.lynxDark, 0, 0.5, -1.1, 0.1, 0.1, 0.1));      // black tip
  return g;
}

// ---------- animal definitions ----------
const ANIMALS = {
  fox:    { name: 'Fox',    desc: 'Balanced all-rounder. Hunts rabbits.', speed: 1.0, dmg: 1.0, hunger: 0.9, thirst: 1.2, diet: 'omni', scale: 1.0, cam: 7, build: makeFox },
  deer:   { name: 'Deer',   desc: 'Fast runner, but grazes only. Full damage.', speed: 1.3, dmg: 1.0, hunger: 0.8, thirst: 1.0, diet: 'herb', scale: 1.4, cam: 9, build: makeDeer },
  bear:   { name: 'Bear',   desc: 'Slow but tough. Takes 60% damage. Eats a lot.', speed: 0.8, dmg: 0.6, hunger: 1.4, thirst: 1.0, diet: 'omni', scale: 1.6, cam: 9, build: makeBear },
  rabbit: { name: 'Rabbit', desc: 'Very fast but fragile. Takes 140% damage. Grazes only.', speed: 1.35, dmg: 1.4, hunger: 0.7, thirst: 1.1, diet: 'herb', scale: 1.8, cam: 5, build: makeRabbit },
  wolf:     { name: 'Wolf',     desc: 'Fast pack hunter. Hunts rabbits only, no berries.', speed: 1.2, dmg: 1.0, hunger: 1.1, thirst: 1.0, diet: 'carn', scale: 1.0, cam: 8, build: makeWolf },
  badger:   { name: 'Badger',   desc: 'Stubborn and sturdy. Takes 50% damage. Forages.', speed: 0.7, dmg: 0.5, hunger: 1.0, thirst: 1.0, diet: 'omni', scale: 1.1, cam: 6, build: makeBadger },
  squirrel: { name: 'Squirrel', desc: 'Tiny and quick. Takes 160% damage. Grazes only.', speed: 1.5, dmg: 1.6, hunger: 0.6, thirst: 1.0, diet: 'herb', scale: 0.9, cam: 4, build: makeSquirrel },
  boar:     { name: 'Wild Boar', desc: 'Heavy and tough. Takes 80% damage. Eats anything.', speed: 1.0, dmg: 0.8, hunger: 1.2, thirst: 1.0, diet: 'omni', scale: 1.4, cam: 8, build: makeBoar },
};
Object.assign(ANIMALS, {
  hawk: { name: 'Hawk', desc: 'Soaring raptor. Hold SPACE to fly over trees and water. Hunts rabbits only.', speed: 1.3, dmg: 1.0, hunger: 1.0, thirst: 1.0, diet: 'carn', flies: true, scale: 1.0, cam: 7, build: makeHawk },
  owl: { name: 'Owl', desc: 'Silent night hunter. Faster at night. Hold SPACE to fly. Hunts rabbits only.', speed: 1.0, dmg: 0.9, hunger: 0.9, thirst: 1.0, diet: 'carn', flies: true, nightSpeed: 1.4, scale: 1.0, cam: 7, build: makeOwl },
  duck: { name: 'Duck', desc: 'Swims across ponds. Grazes only. Cannot fly.', speed: 1.1, dmg: 0.9, hunger: 0.8, thirst: 0.6, diet: 'herb', swims: true, scale: 1.0, cam: 6, build: makeDuck },
  crow: { name: 'Crow', desc: 'Clever scavenger. Hold SPACE to fly. Takes 130% damage. Eats anything.', speed: 1.2, dmg: 1.3, hunger: 0.7, thirst: 1.0, diet: 'omni', flies: true, scale: 0.8, cam: 5, build: makeCrow },
  eagle:   { name: 'Eagle',   desc: 'Powerful raptor. Hold SPACE to fly. Speed 140%. Hunts rabbits only.', speed: 1.4, dmg: 1.1, hunger: 1.1, thirst: 1.0, diet: 'carn', flies: true, scale: 1.2, cam: 8, build: makeEagle },
  sparrow: { name: 'Sparrow', desc: 'Tiny and very quick. Hold SPACE to fly. Takes 150% damage. Grazes only.', speed: 1.4, dmg: 1.5, hunger: 0.6, thirst: 1.0, diet: 'herb', flies: true, scale: 0.6, cam: 4, build: makeSparrow },
  heron:   { name: 'Heron',   desc: 'Long-legged wader. Walks through ponds. Eats anything. Cannot fly.', speed: 0.9, dmg: 1.0, hunger: 1.0, thirst: 0.7, diet: 'omni', swims: true, scale: 1.3, cam: 8, build: makeHeron },
  pigeon:  { name: 'Pigeon',  desc: 'Steady flyer. Hold SPACE to fly. Grazes only.', speed: 1.1, dmg: 1.0, hunger: 0.8, thirst: 1.0, diet: 'herb', flies: true, scale: 0.9, cam: 5, build: makePigeon },
  falcon:    { name: 'Falcon',         desc: 'Fastest diver. Hold SPACE to fly. Speed 160%. Hunts rabbits only.', speed: 1.6, dmg: 1.0, hunger: 1.1, thirst: 1.0, diet: 'carn', flies: true, scale: 1.0, cam: 7, build: makeFalcon },
  secretary: { name: 'Secretary Bird', desc: 'Long-legged snake hunter. Hold SPACE to fly. Eats anything.', speed: 1.0, dmg: 0.9, hunger: 1.2, thirst: 1.0, diet: 'omni', flies: true, scale: 1.3, cam: 8, build: makeSecretaryBird },
  hedgehog: { name: 'Hedgehog', desc: 'Spiky and slow. Takes 70% damage. Eats anything.', speed: 0.8, dmg: 0.7, hunger: 0.8, thirst: 0.8, diet: 'omni', scale: 0.8, cam: 4, build: makeHedgehog },
  raccoon:  { name: 'Raccoon',  desc: 'Clever forager. Eats anything. Takes 90% damage.', speed: 1.0, dmg: 0.9, hunger: 1.0, thirst: 1.0, diet: 'omni', scale: 1.0, cam: 6, build: makeRaccoon },
  moose:    { name: 'Moose',    desc: 'Huge and calm. Takes 40% damage. Grazes only.', speed: 0.9, dmg: 0.4, hunger: 1.8, thirst: 1.2, diet: 'herb', scale: 1.8, cam: 12, build: makeMoose },
  lynx:     { name: 'Lynx',     desc: 'Stealthy and fast. Hunts rabbits only.', speed: 1.45, dmg: 0.9, hunger: 1.1, thirst: 1.0, diet: 'carn', scale: 1.1, cam: 7, build: makeLynx },
});

// ---------- unlocks, best-days records, abilities ----------
// coin price to buy each animal; animals not listed are free from the start
const PRICE = { bear: 10, badger: 10, wolf: 15, boar: 12, hawk: 15, crow: 12, owl: 18, heron: 20, eagle: 25, falcon: 25, secretary: 30, hedgehog: 8, raccoon: 12, moose: 20, lynx: 22 };
for (const k in ANIMALS) {
  ANIMALS[k].price = PRICE[k] || 0;
  ANIMALS[k].ability = 'dash';        // Shift: quick burst of speed
}
ANIMALS.bear.ability = 'roar';        // Shift: scare nearby wolves
ANIMALS.badger.ability = 'heal';      // Shift: heal 20 health
let bestDays = {};
function saveBest() { writeAccount(); }

// coins: earned by surviving dawns and catching rabbits; spent buying animals
// coins, purchases and best days belong to the signed-in account (see accounts below)
let currentUser = null;
let coins = 0;
let owned = [];
function saveEcon() { writeAccount(); }
function addCoins(n) { coins += n; saveEcon(); }
function isUnlocked(k) {
  return (ANIMALS[k].price || 0) === 0 || owned.includes(k);
}
function buyAnimal(key) {
  if (isUnlocked(key)) return;
  const price = ANIMALS[key].price;
  if (coins < price) {
    $('menuMsg').textContent = 'Need ' + (price - coins) + ' more coins. Earn them by surviving dawns and catching rabbits.';
    return;
  }
  coins -= price;
  owned.push(key);
  saveEcon();
  $('menuMsg').textContent = 'Bought the ' + ANIMALS[key].name + '!';
  $('cards').innerHTML = '';
  buildMenu();
}

// ---------- game state ----------
let map, bush, rabbits, wolves, P, denX, denY;
let time, day, over, darkness, spawnTimer, msg = '', msgT = 0;
let world = null, bushes = [], trees = [], playerMesh = null, ANI = ANIMALS.fox, animalKey = 'fox';
let paused = true, moving = false;
let pets = []; // tamed companions: {kind, x, y, hp, alertCool, forageCool, abT, mesh}
const MAX_PETS = 4;
let critters = []; // wild squirrels, deer and ducks
let abilityCool = 0, dashT = 0, shake = 0, flashA = 0, rainT = 0, rainCool = 70;
let flashEl = null;
const $ = id => document.getElementById(id);
const keys = {};

function tileAt(x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T_TREE;
  return map[ty][tx];
}
function say(t) { msg = t; msgT = 3; }

function freeSpot(minD) {
  for (let i = 0; i < 500; i++) {
    const x = rnd(1, COLS - 1), y = rnd(1, ROWS - 1);
    const t = tileAt(x, y);
    if (!solidT(t) && t !== T_DEN && Math.hypot(x - P.x, y - P.y) >= minD) return { x, y };
  }
  return { x: 2, y: 2 };
}
function addRabbit() {
  const s = freeSpot(4);
  const mesh = makeRabbit();
  world.add(mesh);
  rabbits.push({ x: s.x, y: s.y, t: 0, vx: 0, vy: 0, mesh, ph: Math.random() * 6 });
}

function buildWorld() {
  if (world) scene.remove(world);
  world = new THREE.Group();
  scene.add(world);
  bushes = [];
  trees = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const t = map[y][x];
    const cx = (x + 0.5) * S, cz = (y + 0.5) * S;
    if (t === T_TREE) {
      const tr = makeTree();
      tr.position.set(cx + rnd(-0.7, 0.7), 0, cz + rnd(-0.7, 0.7)); // off-centre, so not in rows
      tr.rotation.y = Math.random() * 6.28;
      trees.push({ g: tr, ph: Math.random() * 6 });
      tr.scale.setScalar(rnd(1.6, 2.2));  // taller trees
      world.add(tr);
    } else if (t === T_WATER) {
      world.add(M(GEO.plate, MAT.water, cx, 0.08, cz, S, 0.16, S));
    } else if (t === T_BUSH) {
      const b = makeBush();
      b.g.position.set(cx + rnd(-0.5, 0.5), 0, cz + rnd(-0.5, 0.5));
      world.add(b.g);
      bushes.push({ x, y, berries: b.berries });
    } else if (t === T_DEN) {
      world.add(M(GEO.plate, MAT.denG, cx, 0.03, cz, S, 0.06, S));
    }
  }
  // scattered rocks and fallen logs (decoration only, not solid)
  const rockMat = L(0x8a8780);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (map[y][x] !== T_GRASS || bush[y][x] !== 0 || Math.random() > 0.02) continue;
    const cx = (x + 0.5) * S, cz = (y + 0.5) * S;
    if (Math.random() < 0.6) {
      world.add(M(GEO.sph, rockMat, cx, 0.15, cz, rnd(0.3, 0.6), rnd(0.2, 0.35), rnd(0.3, 0.6)));
    } else {
      const log = M(GEO.cyl, MAT.trunk, cx, 0.2, cz, 0.2, 1.4, 0.2);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = Math.random() * 3;
      world.add(log);
    }
  }
  const dcx = (denX + 0.5) * S, dcz = (denY + 0.5) * S;
  world.add(M(GEO.sph, MAT.denHole, dcx, 0.1, dcz, 1.2, 0.5, 1.2));
}

// start a new run as the given animal
function init(key) {
  animalKey = key;
  ANI = ANIMALS[key];
  map = []; bush = [];
  for (let y = 0; y < ROWS; y++) {
    map.push([]); bush.push([]);
    for (let x = 0; x < COLS; x++) {
      map[y].push(T_GRASS); bush[y].push(0);
      const n = Math.sin(x * 0.3) + Math.cos(y * 0.37) + Math.sin((x * 0.7 + y * 0.5) * 0.4);
      if (Math.random() < 0.22) map[y][x] = T_TREE; // random placement, no wave pattern
      else if (Math.random() < 0.04) map[y][x] = T_BUSH;
    }
  }
  for (let p = 0; p < 4; p++) {
    const cx = Math.floor(rnd(6, COLS - 6)), cy = Math.floor(rnd(6, ROWS - 6)), r = rnd(2, 3.5);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
      if (Math.hypot(x - cx, y - cy) < r) map[y][x] = T_WATER;
  }
  const sx = Math.floor(COLS / 2), sy = Math.floor(ROWS / 2);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (Math.hypot(x - sx, y - sy) < 6 && solidT(map[y][x])) map[y][x] = T_GRASS;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (Math.hypot(x - (sx - 7), y - sy) < 2.5) map[y][x] = T_WATER;
  denX = sx + 3; denY = sy + 3;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    map[denY + dy][denX + dx] = T_DEN;
    bush[denY + dy][denX + dx] = 0;
  }

  P = { x: sx + 0.5, y: sy + 0.5, h: 0, alt: 0, hp: 100, hunger: 100, thirst: 100, energy: 100 };
  time = 0; day = 1; over = false; darkness = 0; spawnTimer = 0;
  pets = []; abilityCool = 0; dashT = 0; rainT = 0; rainCool = 70; flashA = 0; shake = 0;
  msg = ''; msgT = 0;

  buildWorld();

  if (playerMesh) scene.remove(playerMesh);
  playerMesh = ANI.build();
  playerMesh.scale.setScalar(ANI.scale);
  scene.add(playerMesh);

  rabbits = [];
  for (let i = 0; i < 30; i++) addRabbit();
  spawnCritters();
  wolves = [];
  for (let i = 0; i < 4; i++) {
    const s = freeSpot(15);
    const mesh = makeWolf();
    world.add(mesh);
    wolves.push({ x: s.x, y: s.y, t: 0, a: rnd(0, 6.28), cool: 0, h: 0, mesh });
  }
  say('Find food and water. Wolves come out at dusk. Sleep in the den!');
}

function makeWolf() {
  const g = new THREE.Group();
  g.add(M(GEO.box, MAT.wolf, 0, 1.0, 0, 0.75, 0.65, 1.5));
  for (const x of [-0.25, 0.25]) for (const z of [-0.5, 0.5])
    g.add(M(GEO.box, MAT.wolfDark, x, 0.4, z, 0.18, 0.8, 0.18));
  g.add(M(GEO.box, MAT.wolf, 0, 1.35, 0.95, 0.55, 0.5, 0.6));
  g.add(M(GEO.box, MAT.wolfDark, 0, 1.25, 1.4, 0.3, 0.25, 0.5));
  g.add(M(GEO.box, MAT.wolf, -0.2, 1.7, 0.85, 0.14, 0.22, 0.1));
  g.add(M(GEO.box, MAT.wolf, 0.2, 1.7, 0.85, 0.14, 0.22, 0.1));
  g.add(M(GEO.sph, eyeMat, -0.15, 1.45, 1.25, 0.07, 0.07, 0.07));
  g.add(M(GEO.sph, eyeMat, 0.15, 1.45, 1.25, 0.07, 0.07, 0.07));
  g.add(M(GEO.box, MAT.wolf, 0, 1.15, -1.05, 0.22, 0.22, 0.9));
  g.scale.setScalar(1.2);
  return g;
}

// ---------- simulation ----------
// ghost = airborne (ignores trees and water); swim = water is passable
function blockedFor(x, y, r, isWolf, ghost = false, swim = false) {
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const fx = x + ox, fy = y + oy;
    if (fx < 0 || fy < 0 || fx >= COLS || fy >= ROWS) return true;
    const t = map[Math.floor(fy)][Math.floor(fx)];
    if (ghost) continue;
    if (t === T_WATER && swim) continue;
    if (solidT(t)) return true;
    if (isWolf && t === T_DEN) return true;
  }
  return false;
}
function move(e, dx, dy, r, isWolf, ghost = false, swim = false) {
  if (!blockedFor(e.x + dx, e.y, r, isWolf, ghost, swim)) e.x += dx;
  if (!blockedFor(e.x, e.y + dy, r, isWolf, ghost, swim)) e.y += dy;
}
function nearWater() {
  const tx = Math.floor(P.x), ty = Math.floor(P.y);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++)
    if (tileAt(tx + ox, ty + oy) === T_WATER) return true;
  return false;
}
const inDen = () => tileAt(P.x, P.y) === T_DEN;

// short synthesized sound effect (no audio files needed)
function beep(freq, dur) {
  try {
    if (!window.AC) window.AC = new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = freq; g.gain.value = 0.05;
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* audio unavailable: stay silent */ }
}

// Shift: the animal's special ability (cooldown applies)
function useAbility() {
  if (over || paused) return;
  if (abilityCool > 0) { say('Ability ready in ' + Math.ceil(abilityCool) + 's'); return; }
  if (ANI.ability === 'roar') {
    let n = 0;
    for (const w of wolves) if (Math.hypot(w.x - P.x, w.y - P.y) < 7) { w.rest = 5; w.chase = 0; n++; }
    abilityCool = 10;
    say(n ? 'The bear roars! ' + n + ' wolf(es) back off.' : 'The bear roars at nothing.');
  } else if (ANI.ability === 'heal') {
    P.hp = Math.min(100, P.hp + 20);
    abilityCool = 15;
    say('The badger tends its wounds. (+20 health)');
  } else {
    dashT = 0.8; abilityCool = 6;
    say('Dash!');
  }
}

// wild critters: squirrels, deer and ducks (ducks live on ponds)
const PET_HP = { rabbit: 40, squirrel: 30, deer: 80, duck: 35, hedgehog: 30, raccoon: 30, boar: 60, lynx: 35 };
const PET_SCALE = { rabbit: 0.9, squirrel: 1.2, deer: 1.0, duck: 1.2, hedgehog: 1.0, raccoon: 1.0, boar: 1.0, lynx: 1.0 };
const PET_COLLAR = { rabbit: 0xd33a3a, squirrel: 0x3a7ad3, deer: 0xf0c020, duck: 0x3ad36a, hedgehog: 0xff8800, raccoon: 0x9b59b6, boar: 0x111111, lynx: 0x2ecc71 };
function makeCritterMesh(kind) {
  if (kind === 'squirrel') return makeSquirrel();
  if (kind === 'deer') return makeDeer();
  if (kind === 'duck') return makeDuck();
  if (kind === 'hedgehog') return makeHedgehog();
  if (kind === 'raccoon') return makeRaccoon();
  if (kind === 'boar') return makeBoar();
  if (kind === 'lynx') return makeLynx();
  return makeRabbit();
}
function waterSpot() {
  for (let i = 0; i < 500; i++) {
    const x = rnd(1, COLS - 1), y = rnd(1, ROWS - 1);
    if (tileAt(x, y) === T_WATER) return { x, y };
  }
  return null;
}
function spawnCritters() {
  critters = [];
  const add = (kind, n, onWater) => {
    for (let i = 0; i < n; i++) {
      const s = onWater ? waterSpot() : freeSpot(6);
      if (!s) continue;
      const mesh = makeCritterMesh(kind);
      world.add(mesh);
      critters.push({ kind, x: s.x, y: s.y, t: 0, vx: 0, vy: 0, mesh });
    }
  };
  add('squirrel', 6, false);
  add('deer', 3, false);
  add('duck', 3, true);
  add('hedgehog', 4, false);
  add('raccoon', 3, false);
  add('boar', 2, false);
  add('lynx', 1, false);
}

// T: tame the nearest rabbit, squirrel, deer or duck (50% chance). Up to MAX_PETS pets at once.
function tame() {
  if (over || paused) return;
  if (pets.length >= MAX_PETS) { say('You already have ' + MAX_PETS + ' pets.'); return; }
  let best = null, bd = 1.4;
  for (const r of [...rabbits, ...critters]) {
    const d = Math.hypot(r.x - P.x, r.y - P.y);
    if (d < bd) { bd = d; best = r; }
  }
  if (!best) { say('No animal close enough to tame.'); return; }
  const kind = best.kind || 'rabbit';
  if (Math.random() < 0.5) {
    world.remove(best.mesh);
    if (rabbits.includes(best)) rabbits.splice(rabbits.indexOf(best), 1);
    else critters.splice(critters.indexOf(best), 1);
    const mesh = makeCritterMesh(kind);
    mesh.scale.setScalar(PET_SCALE[kind]);
    const collar = new THREE.Mesh(GEO.cyl, new THREE.MeshLambertMaterial({ color: PET_COLLAR[kind] }));
    collar.position.set(0, 0.5, 0.25);
    collar.scale.set(0.22, 0.08, 0.22);
    mesh.add(collar);
    world.add(mesh);
    pets.push({ kind, x: best.x, y: best.y, hp: PET_HP[kind], alertCool: 0, forageCool: 20, abT: 20, mesh });
    say('You tamed a ' + kind + '! It will follow and help.');
  } else {
    say('The ' + kind + ' ran off.');
  }
}

function interact() {
  if (over || paused) return;
  if (ANI.diet !== 'herb') {
    let best = null, bd = 1.1;
    for (const r of rabbits) {
      const d = Math.hypot(r.x - P.x, r.y - P.y);
      if (d < bd) { bd = d; best = r; }
    }
    if (best) {
      if (Math.random() < 0.45) {
        world.remove(best.mesh);
        rabbits.splice(rabbits.indexOf(best), 1);
        P.hunger = clamp(P.hunger + 45, 0, 100);
        addCoins(1);
      say('You caught a rabbit! (+hunger, +1 coin)');
      } else {
        say('The rabbit escaped!');
      }
      return;
    }
  }
  const tx = Math.floor(P.x), ty = Math.floor(P.y);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const x = tx + ox, y = ty + oy;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
    if (ANI.diet !== 'carn' && map[y][x] === T_BUSH && bush[y][x] <= 0) {
      bush[y][x] = 30;
      const gain = ANI.diet === 'herb' ? 28 : 20;
      P.hunger = clamp(P.hunger + gain, 0, 100);
      say('You ate some berries. (+hunger)');
      return;
    }
  }
  if (!nearWater()) say(ANI.diet === 'herb' ? 'Nothing to graze here. Look for berries or water.' : 'Nothing to eat here. Look for rabbits, berries or water.');
}

function update(dt) {
  if (over || paused) return;
  time += dt;
  if (abilityCool > 0) abilityCool -= dt;
  if (dashT > 0) dashT -= dt;
  // weather: rain every minute or so, lasting 25 seconds
  if (rainT > 0) rainT -= dt;
  else {
    rainCool -= dt;
    if (rainCool <= 0) { rainT = 25; rainCool = rnd(60, 90); say('Rain is falling. Ponds fill faster.'); }
  }
  const d = Math.floor(time / DAY) + 1;
  if (d !== day) { day = d; addCoins(1); say('Day ' + day + ' dawns. You survived ' + (day - 1) + ' day(s) so far.'); }

  const ph = (time % DAY) / DAY;
  // slow dusk (0.5 to 0.7 of the day) and slow dawn (0.85 to 1.0), so light fades gradually
  darkness = ph < 0.5 ? 0 : ph < 0.7 ? (ph - 0.5) / 0.2 : ph < 0.85 ? 1 : (1 - ph) / 0.15;
  const night = darkness > 0.5;

  // player: tank controls (turn with A/D, walk with W/S)
  // Left/Right arrows (or A/D) turn the animal in place; Up/Down (or W/S) walk forward/back
  let fwd = 0, turn = 0, side = 0;
  if (keys.ArrowUp || keys.KeyW) fwd += 1;
  if (keys.ArrowDown || keys.KeyS) fwd -= 1;
  // positive heading turns toward screen-left (camera sits behind), so flip the sign
  if (keys.ArrowLeft || keys.KeyA) turn += 1;
  if (keys.ArrowRight || keys.KeyD) turn -= 1;
  P.h += turn * 2.4 * dt;
  moving = fwd !== 0;
  // flight: hold SPACE to climb; flyers drift down when released (hover if over a tree)
  if (ANI.flies) {
    const onSolid = solidT(tileAt(P.x, P.y)) && !ANI.swims;
    // climb quickly while SPACE is held; glide down slowly when released
    if (keys.Space) P.alt = Math.min(3.5, P.alt + 8 * dt);
    else P.alt = Math.max(onSolid ? 0.5 : 0, P.alt - 1.0 * dt);
  }
  const airborne = ANI.flies && P.alt > 0.3;
  const nightMul = (ANI.nightSpeed && night) ? ANI.nightSpeed : 1;
  const sp = 3.2 * ANI.speed * nightMul * (P.energy < 15 ? 0.6 : 1) * (dashT > 0 ? 2.2 : 1);
  // forward = (sin h, cos h); screen-right = (-cos h, sin h)
  let mdx = Math.sin(P.h) * fwd + -Math.cos(P.h) * side;
  let mdy = Math.cos(P.h) * fwd + Math.sin(P.h) * side;
  const mlen = Math.hypot(mdx, mdy);
  if (mlen > 1) { mdx /= mlen; mdy /= mlen; }
  move(P, mdx * sp * dt, mdy * sp * dt, 0.3, false, airborne, !!ANI.swims);

  const den = inDen();
  P.hunger = Math.max(0, P.hunger - 0.6 * ANI.hunger * dt);
  P.thirst = Math.max(0, P.thirst - 0.9 * ANI.thirst * dt);
  if (den) P.energy = Math.min(100, P.energy + 14 * dt);
  else P.energy = Math.max(0, P.energy - (moving ? 0.9 : 0.25) * dt - (P.alt > 0.3 ? 0.5 : 0) * dt);
  if (keys.KeyE && nearWater()) P.thirst = Math.min(100, P.thirst + 35 * dt * (rainT > 0 ? 1.5 : 1));

  let drain = 0;
  if (P.hunger <= 0) drain += 1.5;
  if (P.thirst <= 0) drain += 1.5;
  if (P.energy <= 0) drain += 1;
  if (drain > 0) P.hp -= drain * dt;
  else if (P.hunger > 25 && P.thirst > 25 && P.energy > 10) P.hp = Math.min(100, P.hp + 3 * dt);

  // wolves
  for (const w of wolves) {
    w.cool -= dt;
    const dist = Math.hypot(P.x - w.x, P.y - w.y);
    const aggro = night ? 9 : 5;
    let tx, ty, s;
    // wolves tire after a 6-second chase and rest for 3 seconds
    if (w.rest > 0) w.rest -= dt;
    if (w.rest <= 0 && dist < aggro && !den) {
      const Ld = dist || 1;
      w.chase = (w.chase || 0) + dt;
      if (w.chase > 6) { w.chase = 0; w.rest = 3; }
      tx = (P.x - w.x) / Ld; ty = (P.y - w.y) / Ld;
      s = night ? 2.9 : 1.6;
    } else {
      w.t -= dt;
      if (w.t <= 0) { w.t = rnd(1, 3); w.a = rnd(0, 6.28); }
      tx = Math.cos(w.a); ty = Math.sin(w.a); s = 0.8;
    }
    move(w, tx * s * dt, ty * s * dt, 0.3, true);
    w.h = Math.atan2(tx, ty);
    if (dist < 0.9 && w.cool <= 0 && !den && P.alt < 0.8) {
      w.cool = 1.8;
      const guard = pets.find(p => Math.hypot(p.x - P.x, p.y - P.y) < 2);
      if (guard) {
        // a nearby pet jumps in front of the bite
        guard.hp -= 12;
        say('Your ' + guard.kind + ' took the bite!');
        if (guard.hp <= 0) {
          world.remove(guard.mesh);
          pets.splice(pets.indexOf(guard), 1);
          say('Your ' + guard.kind + ' ran off hurt and is gone.');
        }
      } else {
        P.hp -= (night ? 12 : 8) * ANI.dmg;
        say('A wolf bit you!');
        flashA = 0.4; shake = 0.5; beep(120, 0.2);
      }
    }
  }

  // rabbits
  for (const r of rabbits) {
    const dr = Math.hypot(P.x - r.x, P.y - r.y);
    if (dr < 3.5) {
      const Ld = dr || 1;
      r.vx = -(P.x - r.x) / Ld * 2.4; r.vy = -(P.y - r.y) / Ld * 2.4;
      r.t = 0;
    } else {
      r.t -= dt;
      if (r.t <= 0) {
        r.t = rnd(1, 3);
        const a = rnd(0, 6.28);
        r.vx = Math.cos(a) * 0.7; r.vy = Math.sin(a) * 0.7;
      }
    }
    move(r, r.vx * dt, r.vy * dt, 0.25, false);
  }
  spawnTimer += dt;
  if (spawnTimer > 6 && rabbits.length < 30) { spawnTimer = 0; addRabbit(); }

  // wild critters flee from the player, like rabbits
  for (const c of critters) {
    const dc = Math.hypot(P.x - c.x, P.y - c.y);
    const sp = { squirrel: 2.6, deer: 2.0, duck: 1.5, hedgehog: 0.8, raccoon: 1.8, boar: 1.6, lynx: 2.8 }[c.kind] || 2;
    if (dc < 3.5) {
      const L = dc || 1;
      c.vx = -(P.x - c.x) / L * sp; c.vy = -(P.y - c.y) / L * sp;
      c.t = 0;
    } else {
      c.t -= dt;
      if (c.t <= 0) {
        c.t = rnd(1, 3);
        const a = rnd(0, 6.28);
        c.vx = Math.cos(a) * 0.5; c.vy = Math.sin(a) * 0.5;
      }
    }
    move(c, c.vx * dt, c.vy * dt, 0.25, false, false, c.kind === 'duck');
  }

  // pet abilities: deer nuzzles (health), duck splashes (thirst)
  for (const pet of pets) {
    pet.abT -= dt;
    if (pet.abT <= 0) {
      if (pet.kind === 'deer') {
        pet.abT = 30;
        if (P.hp < 100) { P.hp = Math.min(100, P.hp + 10); say('Your deer nuzzles you. (+10 health)'); }
      } else if (pet.kind === 'duck') {
        if (nearWater()) {
          pet.abT = 20;
          P.thirst = Math.min(100, P.thirst + 15);
          say('Your duck splashes water for you. (+thirst)');
        } else pet.abT = 2;
      } else {
        if (pet.kind === 'raccoon') {
          pet.abT = 40;
          addCoins(1);
          say('Your raccoon found a coin. (+1 coin)');
        } else if (pet.kind === 'hedgehog') {
          pet.abT = 30;
          let n = 0;
          for (const w of wolves) if (Math.hypot(w.x - pet.x, w.y - pet.y) < 5) { w.rest = Math.max(w.rest || 0, 3); n++; }
          if (n) say('Your hedgehog curls up and scares off the wolves!');
        } else if (pet.kind === 'lynx') {
          const r = rabbits.find(r => Math.hypot(r.x - pet.x, r.y - pet.y) < 10);
          if (r) {
            pet.abT = 20;
            world.remove(r.mesh);
            rabbits.splice(rabbits.indexOf(r), 1);
            P.hunger = clamp(P.hunger + 15, 0, 100);
            say('Your lynx caught a rabbit for you. (+hunger)');
          } else pet.abT = 3;
        } else {
          pet.abT = 999;
        }
      }
    }
  }

  // pet: follows the player, warns of wolves, brings berries
  for (const pet of pets) {
    const pd = Math.hypot(P.x - pet.x, P.y - pet.y);
    if (pd > 2.2) move(pet, (P.x - pet.x) / pd * 3.0 * dt, (P.y - pet.y) / pd * 3.0 * dt, 0.2, false);
    // a boar charges: wolves that come close are knocked back for a moment
    if (pet.kind === 'boar') {
      for (const w of wolves) if (Math.hypot(w.x - pet.x, w.y - pet.y) < 3) w.rest = Math.max(w.rest || 0, 0.5);
    }
    pet.alertCool -= dt;
    pet.forageCool -= dt;
    if (pet.alertCool <= 0 && msgT <= 0 && wolves.some(w => Math.hypot(w.x - pet.x, w.y - pet.y) < 7)) {
      say('Your pet growls. A wolf is close!');
      pet.alertCool = 8;
    }
    if (pet.forageCool <= 0) {
      pet.forageCool = pet.kind === 'squirrel' ? 15 : 25;
      const b = bushes.find(b => bush[b.y][b.x] <= 0 && Math.hypot(b.x + 0.5 - P.x, b.y + 0.5 - P.y) < 10);
      if (b && ANI.diet !== 'carn') {
        bush[b.y][b.x] = 30;
        P.hunger = clamp(P.hunger + 12, 0, 100);
        say('Your pet brought you berries. (+hunger)');
      }
    }
  }

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (bush[y][x] > 0) bush[y][x] = Math.max(0, bush[y][x] - dt);

  msgT -= dt;
  flashA = Math.max(0, flashA - dt * 1.5);
  if (P.hp <= 0) {
    P.hp = 0; over = true;
    const got = day - 1;
    if (got > (bestDays[animalKey] || 0)) bestDays[animalKey] = got;
    saveBest();
  }
}

// ---------- rendering sync ----------
function render(dt) {
  // player animal
  const bob = moving ? Math.abs(Math.sin(time * 14)) * 0.12 : 0;
  playerMesh.position.set(P.x * S, bob + P.alt, P.y * S);
  playerMesh.rotation.y = P.h;
  // gentle body sway while walking, like a gait
  playerMesh.rotation.z = moving ? Math.sin(time * 14) * 0.05 : 0;

  for (const r of rabbits) {
    const sp = Math.hypot(r.vx, r.vy);
    r.mesh.position.set(r.x * S, sp > 0.1 ? Math.abs(Math.sin(time * 9 + r.ph)) * 0.3 : 0, r.y * S);
    if (sp > 0.1) r.mesh.rotation.y = Math.atan2(r.vx, r.vy);
  }
  for (const w of wolves) {
    w.mesh.position.set(w.x * S, 0, w.y * S);
    w.mesh.rotation.y = w.h;
  }
  for (const c of critters) {
    c.mesh.position.set(c.x * S, c.kind === 'duck' ? 0.1 : 0, c.y * S);
    if (Math.hypot(c.vx, c.vy) > 0.1) c.mesh.rotation.y = Math.atan2(c.vx, c.vy);
  }
  // trees sway gently in the wind; the sway is stronger when it is windy
  for (const t of trees) t.g.rotation.z = Math.sin(time * 0.9 + t.ph) * 0.025 + Math.sin(time * 2.3 + t.ph) * 0.008;
  for (const b of bushes) b.berries.visible = bush[b.y][b.x] <= 0;
  for (const pet of pets) {
    pet.mesh.position.set(pet.x * S, 0, pet.y * S);
    pet.mesh.rotation.y = Math.atan2(P.x - pet.x, P.y - pet.y); // face the player
  }

  // day / night lighting
  const dk = darkness;
  scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, dk);
  scene.fog.color.copy(scene.background);
  sun.intensity = 1.5 * (1 - 0.85 * dk);
  sun.color.copy(WHITE).lerp(MOON, dk);
  hemi.intensity = 0.8 - 0.55 * dk;
  eyeMat.color.setHex(dk > 0.5 ? 0xff2222 : 0xffe066);

  sun.position.set(P.x * S + 20, 40, P.y * S + 15);
  sun.target.position.set(P.x * S, 0, P.y * S);

  // third-person camera behind the animal, distance and height scale with its size
  const cd = ANI.cam;
  const want = new THREE.Vector3(P.x * S - Math.sin(P.h) * cd, 3 + ANI.scale * 1.2 + P.alt * 0.6, P.y * S - Math.cos(P.h) * cd);
  camera.position.lerp(want, 1 - Math.exp(-dt * 6));
  camera.lookAt(P.x * S, 1.2 * ANI.scale, P.y * S);
  if (shake > 0) {
    camera.position.x += rnd(-0.3, 0.3) * shake;
    camera.position.y += rnd(-0.2, 0.2) * shake;
    shake = Math.max(0, shake - dt * 2);
  }

  // juice: red flash fades out after a bite; camera shakes briefly
  flashEl.style.background = 'rgba(255,0,0,' + Math.max(0, flashA).toFixed(2) + ')';

  // rain: falling streaks around the fox; fog closes in while it rains
  rainMesh.visible = rainT > 0;
  if (rainT > 0) {
    const arr = rainMesh.geometry.attributes.position.array;
    for (let i = 0; i < RAIN_N; i++) {
      arr[i * 3 + 1] -= 25 * dt;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 15;
    }
    rainMesh.geometry.attributes.position.needsUpdate = true;
    rainMesh.position.set(P.x * S, 0, P.y * S);
  }
  scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, rainT > 0 ? 22 : 90, 0.05);

  // HUD
  $('bHp').style.width = clamp(P.hp, 0, 100) + '%';
  $('bHunger').style.width = clamp(P.hunger, 0, 100) + '%';
  $('bThirst').style.width = clamp(P.thirst, 0, 100) + '%';
  $('bEnergy').style.width = clamp(P.energy, 0, 100) + '%';
  const dd = Math.round(Math.hypot(denX + 0.5 - P.x, denY + 0.5 - P.y));
  $('info').textContent = ANI.name + (P.alt > 0.3 ? ' (flying)' : (ANI.flies ? ' (hold SPACE to fly)' : '')) + ' · Day ' + day + ' · ' + (dk > 0.5 ? 'Night' : 'Day') + ' · ' +
    (inDen() ? 'Resting in den (safe)' : 'Den: ' + dd + ' tiles away');
  if (pets.length) $('info').textContent += ' · Pets ' + pets.length + '/' + MAX_PETS;
  $('info').textContent += ' · Coins ' + coins;
  const m = $('msg');
  m.textContent = msg;
  m.style.display = (msgT > 0 && msg && !over && !paused) ? 'block' : 'none';
  $('over').style.display = over ? 'flex' : 'none';
  $('overTxt').textContent = 'You survived ' + (day - 1) + ' day(s) as a ' + ANI.name.toLowerCase();
}

// ---------- menu ----------
function buildMenu() {
  const c = $('cards');
  $('coins').textContent = 'Coins: ' + coins + '  (earn 1 per dawn and 1 per rabbit caught)';
  Object.keys(ANIMALS).forEach((key, i) => {
    const a = ANIMALS[key];
    const div = document.createElement('div');
    div.className = 'card';
    const kl = MENU_KEYS[i].replace('Digit', '').replace('Key', '');
    div.innerHTML = '<b>[' + kl + '] ' + a.name + '</b>' +
      '<small>' + a.desc + '</small>' +
      '<small>Speed ' + Math.round(a.speed * 100) + '% · Damage taken ' + Math.round(a.dmg * 100) + '%</small>' +
      '<small>Diet: ' + (a.diet === 'omni' ? 'hunts & forages' : a.diet === 'carn' ? 'hunts only' : 'grazes only') + '</small>';
    if (isUnlocked(key)) {
      div.insertAdjacentHTML('beforeend', '<small>Best: ' + (bestDays[key] || 0) + ' days</small>');
      div.onclick = () => startGame(key);
    } else {
      div.style.opacity = '0.7';
      div.insertAdjacentHTML('beforeend', '<small><b>Locked</b> · buy for ' + a.price + ' coins</small>');
      div.onclick = () => buyAnimal(key);
    }
    c.appendChild(div);
  });
}
function showMenu() {
  paused = true;
  $('cards').innerHTML = '';
  buildMenu();
  $('over').style.display = 'none';
  $('menu').style.display = 'flex';
}
function startGame(key) {
  if (!currentUser) return;
  if (!isUnlocked(key)) { buyAnimal(key); return; } // locked: try to buy instead
  $('menu').style.display = 'none';
  init(key);
  paused = false;
}

// ---------- input ----------
const MENU_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'KeyZ', 'KeyX', 'KeyQ', 'KeyF', 'KeyC', 'KeyV', 'KeyG', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO'];
addEventListener('keydown', e => {
  if (!currentUser) return; // nothing works until someone is signed in
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if ($('menu').style.display !== 'none') {
    const i = MENU_KEYS.indexOf(e.code);
    if (i >= 0) startGame(Object.keys(ANIMALS)[i]);
    return;
  }
  if (e.code === 'KeyE' && !e.repeat) interact();
  if (e.code === 'KeyT' && !e.repeat) tame();
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) useAbility();
  if (e.code === 'KeyR' && over) showMenu();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// rain particles (hidden until it rains)
const RAIN_N = 500;
const rainPos = new Float32Array(RAIN_N * 3);
for (let i = 0; i < RAIN_N; i++) {
  rainPos[i * 3] = rnd(-20, 20);
  rainPos[i * 3 + 1] = rnd(0, 15);
  rainPos[i * 3 + 2] = rnd(-20, 20);
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMesh = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.15, transparent: true, opacity: 0.7 }));
rainMesh.visible = false;
scene.add(rainMesh);

// ---------- accounts: saved in this browser; passwords are stored as hashes ----------
// accounts and saves live on the save server (server.py), so every browser sees them
let currentHash = null;
function writeAccount() {
  if (!currentUser) return;
  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: currentUser, hash: currentHash, data: { coins, owned, bestDays } }),
  }).catch(() => {});
}
async function postApi(path, body) {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) { loginMsg(j.error || 'Something went wrong.'); return null; }
    return j;
  } catch (e) {
    loginMsg('Cannot reach the save server. Start it with: python3 server.py');
    return null;
  }
}
// SHA-256 when available; otherwise a simple FNV-1a hash so accounts still work
function hashPw(pw) {
  if (window.crypto && crypto.subtle) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw)).then(d =>
      [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''));
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < pw.length; i++) { h ^= pw.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return Promise.resolve('fnv:' + (h >>> 0).toString(16));
}
function loginMsg(t) { $('loginMsg').textContent = t; }
function loginAs(name, hash, data) {
  currentUser = name;
  currentHash = hash;
  data = data || {};
  coins = data.coins || 0;
  owned = data.owned || [];
  bestDays = data.bestDays || {};
  $('login').style.display = 'none';
  $('userLabel').textContent = 'Signed in as ' + name;
  $('loginUser').value = ''; $('loginPass').value = ''; loginMsg('');
  $('cards').innerHTML = '';
  buildMenu();
  showMenu();
}
async function createAccount() {
  const name = $('loginUser').value.trim().toLowerCase(), pw = $('loginPass').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return loginMsg('Please enter a valid email address.');
  if (pw.length < 4) return loginMsg('Password must be at least 4 characters.');
  const hash = await hashPw(pw);
  const res = await postApi('/api/signup', { name, hash });
  if (!res) return;
  loginAs(name, hash, res.data);
}
async function logIn() {
  const name = $('loginUser').value.trim().toLowerCase(), pw = $('loginPass').value;
  const hash = await hashPw(pw);
  const res = await postApi('/api/login', { name, hash });
  if (!res) return;
  loginAs(name, hash, res.data);
}
function logOut() {
  writeAccount();
  currentUser = null; currentHash = null; coins = 0; owned = []; bestDays = {};
  paused = true; over = false;
  $('menu').style.display = 'none';
  $('login').style.display = 'flex';
  loginMsg('Logged out.');
}
$('btnCreate').onclick = createAccount;
$('btnLogin').onclick = logIn;
$('btnLogout').onclick = logOut;
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') logIn(); });

// ---------- start ----------
flashEl = $('flash');
buildMenu();
init('fox');
paused = true;
showMenu();
update(0);
render(10);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
