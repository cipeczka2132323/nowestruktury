import * as THREE from 'three';

await requireUser();

// ===== Ruch jak w Source (jednostki Source: 1 j. ≈ 1 cal, gracz 72 wysokości) =====
const TICK = 1 / 100;
const GRAVITY = 800, JUMP = 268.3, MAXSPEED = 260;
const ACCEL = 5.5, AIRACCEL = 12, AIRCAP = 30, FRICTION = 5.2, STOPSPEED = 80;
const R = 16, H = 72, EYE = 64, STEP = 18;

// ===== Scena =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090c);
scene.fog = new THREE.Fog(0x07090c, 1800, 5200);
const camera = new THREE.PerspectiveCamera(90, 1, 1, 9000);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30281e, 0.9));

// osobna scena na przedmiot w ręce, żeby nie wchodził w ściany
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.2); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
const holder = new THREE.Group(); vmScene.add(holder);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ===== Tekstury rysowane w canvasie =====
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function noise(g, w, h, base, amt) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
function fitText(g, text, font, maxW, x, y) {
  g.font = font;
  const w = g.measureText(text).width;
  g.save(); g.translate(x, y); if (w > maxW) g.scale(maxW / w, 1);
  g.fillText(text, 0, 0); g.restore();
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: .85, metalness: 0, ...o });

const M = {
  floor: std({ map: canvasTex(256, 256, (g, w, h) => {
    noise(g, w, h, '#4a4d52', 26);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128);
  }), roughness: .6 }),
  wall: std({ map: canvasTex(256, 256, (g, w, h) => {
    noise(g, w, h, '#6b6f75', 22);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(0,0,0,.25)'; [40, 216].forEach(x => [40, 216].forEach(y => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }));
  }) }),
  ceil: std({ map: canvasTex(256, 256, (g, w, h) => { noise(g, w, h, '#2a2c30', 16); g.fillStyle = '#16171a'; g.fillRect(0, 0, w, 8); g.fillRect(0, 0, 8, h); }) }),
  metal: std({ map: canvasTex(256, 256, (g, w, h) => { noise(g, w, h, '#3d4550', 14); g.fillStyle = 'rgba(255,255,255,.06)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 6); }), metalness: .5, roughness: .5 }),
  crate: std({ map: canvasTex(256, 256, (g, w, h) => {
    noise(g, w, h, '#8a6232', 30);
    g.strokeStyle = '#4e3418'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
    g.lineWidth = 14; g.beginPath(); g.moveTo(9, 9); g.lineTo(w - 9, h - 9); g.moveTo(w - 9, 9); g.lineTo(9, h - 9); g.stroke();
  }) }),
  hazard: std({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#f2c200'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#111'; g.beginPath(); g.moveTo(0, 0); g.lineTo(32, 0); g.lineTo(0, 32); g.fill(); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.lineTo(0, 64); g.fill(); }) }),
  wood: std({ map: canvasTex(256, 256, (g, w, h) => { noise(g, w, h, '#6e4a2a', 20); g.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2); }) }),
  white: std({ color: 0xe8e8e8 }),
  red: std({ color: 0xc81010 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
  cyan: new THREE.MeshBasicMaterial({ color: 0x30e0ff }),
  pink: new THREE.MeshBasicMaterial({ color: 0xff3fb4 }),
};

// ===== Marki (decyzja właściciela strony: prawdziwe nazwy, logo rysowane tekstem) =====
const BRANDS = {
  coca:     { name: 'Coca-Cola', bg: '#d40000', fg: '#fff', font: 'italic bold 60px Georgia' },
  pepsi:    { name: 'pepsi',     bg: '#0a3a9e', fg: '#fff', font: 'bold 64px Arial' },
  sprite:   { name: 'Sprite',    bg: '#0b8a3a', fg: '#fff', font: 'bold 64px Arial' },
  fanta:    { name: 'Fanta',     bg: '#ff7a00', fg: '#fff', font: 'bold italic 64px Arial' },
  monster:  { name: 'MONSTER',   bg: '#121212', fg: '#7cff2a', font: 'bold 60px Impact' },
  redbull:  { name: 'Red Bull',  bg: '#1c2a5e', fg: '#e8103a', font: 'bold 56px Arial' },
  lays:     { name: "Lay's",     bg: '#ffd200', fg: '#d0102a', font: 'bold italic 66px Arial' },
  doritos:  { name: 'DORITOS',   bg: '#e2231a', fg: '#fff', font: 'bold italic 56px Arial' },
  snickers: { name: 'SNICKERS',  bg: '#5a2d0c', fg: '#fff', font: 'bold 54px Arial' },
  pringles: { name: 'Pringles',  bg: '#c8102e', fg: '#fff', font: 'bold 56px Arial' },
};
const texCache = new Map();
function labelTex(key) {
  if (texCache.has(key)) return texCache.get(key);
  const b = BRANDS[key];
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = b.bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, h * .78, w, 8);
    g.fillStyle = b.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, b.name, b.font, w * .9, w / 2, h / 2);
  }, false);
  texCache.set(key, t); return t;
}
function vendTex(key) {
  const b = BRANDS[key];
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = b.bg; g.fillRect(0, 0, w, h);
    g.fillStyle = b.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, b.name, b.font, w * .85, w / 2, 62);
    g.fillStyle = '#0d1622'; g.fillRect(18, 120, 160, 320);           // szyba
    const can = ['coca', 'pepsi', 'sprite', 'fanta', 'monster', 'redbull'];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
      g.fillStyle = BRANDS[r < 3 ? key : can[(r + c) % can.length]].bg;
      g.fillRect(26 + c * 30, 130 + r * 52, 22, 40);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(28 + c * 30, 132 + r * 52, 4, 36);
    }
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(18, 120, 40, 320);
    g.fillStyle = '#222'; g.fillRect(190, 140, 50, 140);                // panel
    g.fillStyle = '#4cff6a'; g.fillRect(196, 148, 38, 16);
    g.fillStyle = '#999'; for (let i = 0; i < 6; i++) g.fillRect(198 + (i % 2) * 18, 176 + Math.floor(i / 2) * 22, 14, 14);
    g.fillStyle = '#000'; g.fillRect(208, 250, 6, 22);
    g.fillStyle = '#111'; g.fillRect(40, 456, 120, 40);                 // wydawanie
  }, false);
}
function fridgeTex() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#ddd'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d40000'; g.fillRect(0, 0, w, 70);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, 'Coca-Cola', BRANDS.coca.font, w * .8, w / 2, 36);
    g.fillStyle = '#b8e4ff'; g.fillRect(14, 84, w - 28, h - 100);
    const keys = Object.keys(BRANDS).slice(0, 6);
    for (let r = 0; r < 5; r++) {
      g.fillStyle = '#9aa'; g.fillRect(14, 160 + r * 80, w - 28, 4);
      for (let c = 0; c < 8; c++) { g.fillStyle = BRANDS[keys[(r * 3 + c) % 6]].bg; g.fillRect(22 + c * 28, 108 + r * 80, 20, 50); }
    }
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(14, 84, 30, h - 100);
  }, false);
}
function shelfTex() {
  return canvasTex(512, 256, (g, w, h) => {
    noise(g, w, h, '#3b3f46', 10);
    const keys = Object.keys(BRANDS);
    for (let r = 0; r < 3; r++) {
      g.fillStyle = '#888'; g.fillRect(0, 80 + r * 85, w, 6);
      for (let x = 6; x < w - 40; x += 46) {
        const k = keys[Math.floor(Math.random() * keys.length)];
        g.fillStyle = BRANDS[k].bg; g.fillRect(x, 14 + r * 85, 40, 66);
        g.fillStyle = BRANDS[k].fg; g.fillRect(x + 6, 40 + r * 85, 28, 8);
      }
    }
  }, false);
}
function signTex(text, color) {
  return canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, text, 'bold 90px Arial', w * .92, w / 2, h / 2);
  }, false);
}

// ===== Geometria mapy =====
const solids = [];
function boxGeo(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < 24; i++) { const [fw, fh] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * fw / 256, uv.getY(i) * fh / 256); }
  return geo;
}
// box po rogach: (x1,y1,z1) – (x2,y2,z2)
function box(x1, y1, z1, x2, y2, z2, mat, solid = true) {
  const m = new THREE.Mesh(boxGeo(x2 - x1, y2 - y1, z2 - z1), mat);
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  scene.add(m);
  if (solid) solids.push({ x1, y1, z1, x2, y2, z2 });
  return m;
}
// przedmiot z frontem w stronę face (+z, -z, +x, -x); tekstura na przodzie bez powtarzania
function prop(cx, cz, w, h, d, face, front, side = M.metal, y = 0) {
  const rot = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[face];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, std({ map: front, roughness: .4 }), side]);
  m.position.set(cx, y + h / 2, cz); m.rotation.y = rot; scene.add(m);
  const [hx, hz] = face.includes('x') ? [d / 2, w / 2] : [w / 2, d / 2];
  solids.push({ x1: cx - hx, y1: y, z1: cz - hz, x2: cx + hx, y2: y + h, z2: cz + hz });
}
function light(x, y, z, color = 0xfff1d6, intensity = 1.6, dist = 1100) {
  const l = new THREE.PointLight(color, intensity, dist, 0); l.position.set(x, y, z); scene.add(l);
}

// podłoga i sufit całej bazy
box(-3700, -32, -1300, 4100, 0, 1300, M.floor);
box(-3700, 480, -1300, 4100, 512, 1300, M.ceil);

// --- HALA GŁÓWNA x[-1200,1200] z[-1200,1200]
box(-1232, 0, 1200, 1232, 480, 1232, M.wall);
box(-1232, 0, -1232, 1232, 480, -1200, M.wall);
for (const s of [1, -1]) {               // ściany wsch./zach. z przejściem 300 szer.
  const [a, b] = s > 0 ? [1200, 1232] : [-1232, -1200];
  box(a, 0, -1200, b, 480, -150, M.wall); box(a, 0, 150, b, 480, 1200, M.wall); box(a, 256, -150, b, 480, 150, M.wall);
}
// żółto-czarne pasy przy podłodze
box(-1199, 0, 1196, 1199, 20, 1200, M.hazard, false); box(-1199, 0, -1200, 1199, 20, -1196, M.hazard, false);
// lampy sufitowe
for (let x = -800; x <= 800; x += 400) for (let z = -800; z <= 800; z += 400) box(x - 60, 474, z - 20, x + 60, 480, z + 20, M.lamp, false);
light(-500, 420, -500); light(500, 420, -500); light(-500, 420, 500); light(500, 420, 500); light(0, 300, -700, 0xff4040, 1.2, 700);

// neon na ścianie
const neon = new THREE.Mesh(new THREE.PlaneGeometry(900, 112), new THREE.MeshBasicMaterial({ map: signTex('NOWE STRUKTURY · POZIOM -2', '#45d2ff') }));
neon.position.set(200, 340, 1199); neon.rotation.y = Math.PI; scene.add(neon);

// bar z przekąskami na środku
box(-240, 0, -60, 240, 44, -20, M.wood);
box(-240, 0, -260, -200, 44, -60, M.wood);
box(200, 0, -260, 240, 44, -60, M.wood);
box(-244, 44, -64, 244, 46, -16, M.white);
const fridge = fridgeTex();
for (const x of [-150, -50, 50, 150]) prop(x, -280, 96, 180, 40, '+z', fridge, M.white);

// automaty pod ścianą południową
const vend = ['coca', 'pepsi', 'sprite', 'fanta', 'monster', 'redbull', 'lays', 'doritos', 'snickers', 'coca'];
vend.forEach((k, i) => prop(-1050 + i * 115, -1168, 92, 168, 64, '+z', vendTex(k)));

// gigantyczna puszka – punkt orientacyjny
const bigCan = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 200, 40), [std({ map: labelTex('coca'), roughness: .3, metalness: .3 }), std({ color: 0xcccccc, metalness: .8, roughness: .3 }), std({ color: 0xcccccc })]);
bigCan.position.set(0, 124, 400); scene.add(bigCan);
box(-80, 0, 320, 80, 24, 480, M.metal);
solids.push({ x1: -60, y1: 24, z1: 340, x2: 60, y2: 224, z2: 460 });

// antresola (kantyna) na północy + schody + skrzynie do wspinania
box(-800, 176, 900, 1200, 192, 1200, M.metal);
for (const x of [-600, -200, 200, 600, 1000]) box(x - 16, 0, 900, x + 16, 176, 932, M.metal);
for (let i = 1; i <= 12; i++) box(-800 - 32 * (13 - i), 0, 1000, -800 - 32 * (12 - i), 16 * i, 1200, M.metal);
box(-800, 192, 900, 1050, 232, 906, M.red);         // barierka (da się przeskoczyć)
box(-806, 192, 900, -800, 232, 1000, M.red);
[[560, 40], [624, 80], [688, 120], [752, 160]].forEach(([z, h]) => box(1088, 0, z - 32, 1152, h, z + 32, M.crate));
const tables = [[-500, 1060], [-150, 1060], [200, 1060], [550, 1060], [850, 1060]];
for (const [x, z] of tables) { box(x - 60, 192, z - 40, x + 60, 222, z + 40, M.wood); }
light(200, 400, 1050, 0xffe2b0, 1.4, 900);

// skrzynie / przeszkody w hali
for (const [x, z, s] of [[700, -600, 64], [764, -600, 64], [-700, 400, 96], [-604, 400, 64], [-900, -500, 40], [-860, -500, 80], [-820, -500, 120]])
  box(x, 0, z, x + s, s, z + s, M.crate);
box(732, 64, -600, 796, 128, -536, M.crate);

// --- KORYTARZ WSCHODNI → MAGAZYN
box(1232, 0, 150, 2832, 480, 182, M.wall); box(1232, 0, -182, 2832, 480, -150, M.wall);
box(1232, 256, -150, 2800, 288, 150, M.ceil);
for (let x = 1400; x < 2800; x += 300) box(x - 40, 250, -16, x + 40, 256, 16, M.lamp, false);
light(1700, 220, 0, 0xfff1d6, 1.2, 700); light(2400, 220, 0, 0xfff1d6, 1.2, 700);

// magazyn x[2832,4000] z[-800,800]
box(2800, 0, -832, 2832, 480, -150, M.wall); box(2800, 0, 150, 2832, 480, 832, M.wall); box(2800, 256, -150, 2832, 480, 150, M.wall);
box(4000, 0, -832, 4032, 480, 832, M.wall);
box(2832, 0, 800, 4000, 480, 832, M.wall); box(2832, 0, -832, 4000, 480, -800, M.wall);
const shelf = std({ map: shelfTex() });
for (const z of [-620, -380, 320, 560]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(700, 200, 60), [M.metal, M.metal, M.metal, M.metal, shelf, shelf]);
  m.position.set(3450, 100, z + 30); scene.add(m);
  solids.push({ x1: 3100, y1: 0, z1: z, x2: 3800, y2: 200, z2: z + 60 });
}
const pallets = [[3250, -160], [3450, -160], [3250, 100], [3450, 100], [3650, -30]];
const cokeCase = std({ map: canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#c40000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'Coca-Cola', BRANDS.coca.font, w * .8, w / 2, h / 2); g.strokeStyle = '#800'; g.lineWidth = 6; g.strokeRect(0, 0, w, h); }) });
for (const [x, z] of pallets) { box(x - 60, 0, z - 60, x + 60, 10, z + 60, M.wood); box(x - 56, 10, z - 56, x + 56, 40, z + 56, cokeCase); }
for (const z of [-500, -250, 250, 500]) prop(3980, z, 96, 180, 40, '-x', fridge, M.white);
for (let x = 3000; x <= 3800; x += 400) for (const z of [-400, 400]) box(x - 60, 474, z - 20, x + 60, 480, z + 20, M.lamp, false);
light(3100, 420, 0); light(3700, 420, -450); light(3700, 420, 450);

// --- TUNEL ZACHODNI (długi prosty do bhopa)
box(-3600, 0, 150, -1232, 480, 182, M.wall); box(-3600, 0, -182, -1232, 480, -150, M.wall);
box(-3632, 0, -182, -3600, 480, 182, M.wall);
box(-3600, 256, -150, -1232, 288, 150, M.ceil);
for (let x = -1400, i = 0; x > -3600; x -= 200, i++) {
  const mat = i % 2 ? M.pink : M.cyan;
  box(x - 60, 252, -150, x + 60, 256, -130, mat, false); box(x - 60, 252, 130, x + 60, 256, 150, mat, false);
}
light(-1900, 200, 0, 0x30e0ff, 1.1, 800); light(-2600, 200, 0, 0xff3fb4, 1.1, 800); light(-3300, 200, 0, 0x30e0ff, 1.1, 800);
const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(280, 36), new THREE.MeshBasicMaterial({ map: signTex('BHOP TUNEL', '#ff3fb4') }));
sign2.position.set(-3599, 180, 0); sign2.rotation.y = Math.PI / 2; scene.add(sign2);

// ===== Przedmioty do podnoszenia =====
const items = [];
const metalTop = std({ color: 0xc8c8c8, metalness: .8, roughness: .3 });
const KIND = {
  can: k => ({ obj: new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 7, 20), [std({ map: labelTex(k), roughness: .3, metalness: .2 }), metalTop, metalTop]), hh: 3.5, r: 2 }),
  bottle: k => {
    const g = new THREE.Group(), lab = std({ map: labelTex(k), roughness: .2 });
    const plastic = new THREE.MeshStandardMaterial({ color: k === 'sprite' ? 0x3fa35a : 0x2a0d05, roughness: .1, transparent: true, opacity: .85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 10, 20), [lab, plastic, plastic]); body.position.y = -2;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.9, 2.6, 4, 20), plastic); neck.position.y = 5;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), std({ color: 0xd40000 })); cap.position.y = 7.5;
    g.add(body, neck, cap); return { obj: g, hh: 8, r: 2.6 };
  },
  chips: k => ({ obj: new THREE.Mesh(new THREE.BoxGeometry(8, 11, 3), [std({ color: BRANDS[k].bg }), std({ color: BRANDS[k].bg }), std({ color: BRANDS[k].bg }), std({ color: BRANDS[k].bg }), std({ map: labelTex(k) }), std({ map: labelTex(k) })]), hh: 5.5, r: 4 }),
  tube: k => ({ obj: new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 11, 20), [std({ map: labelTex(k) }), std({ color: 0x222222 }), metalTop]), hh: 5.5, r: 2.6 }),
  bar: k => ({ obj: new THREE.Mesh(new THREE.BoxGeometry(9, 1.5, 3), [std({ color: BRANDS[k].bg }), std({ color: BRANDS[k].bg }), std({ map: labelTex(k) }), std({ map: labelTex(k) }), std({ color: BRANDS[k].bg }), std({ color: BRANDS[k].bg })]), hh: .75, r: 4.5 }),
  donut: () => {
    const g = new THREE.Group();
    const d = new THREE.Mesh(new THREE.TorusGeometry(2.5, 1.2, 12, 24), std({ color: 0xc98a4b })); d.rotation.x = Math.PI / 2;
    const icing = new THREE.Mesh(new THREE.TorusGeometry(2.5, 1.0, 12, 24, Math.PI * 2), std({ color: 0xff7ac8, roughness: .4 })); icing.rotation.x = Math.PI / 2; icing.position.y = .4;
    g.add(d, icing); return { obj: g, hh: 1.2, r: 3.7 };
  },
};
function spawn(kind, brand, x, y, z) {
  const it = KIND[kind](brand);
  it.vel = new THREE.Vector3(); it.rest = true;
  it.obj.position.set(x, y + it.hh, z);
  it.obj.rotation.y = Math.random() * Math.PI * 2;
  scene.add(it.obj); items.push(it);
  return it;
}
const cans = ['coca', 'pepsi', 'sprite', 'fanta', 'monster', 'redbull'];
for (let i = 0; i < 11; i++) spawn('can', cans[i % 6], -200 + i * 40, 46, -40);
const pick = a => a[Math.floor(Math.random() * a.length)];
const snack = () => pick([['can', pick(cans)], ['bottle', pick(['coca', 'pepsi', 'sprite', 'fanta'])], ['chips', pick(['lays', 'doritos'])], ['tube', 'pringles'], ['bar', 'snickers'], ['donut']]);
for (const [x, z] of tables) for (let k = -1; k <= 1; k++) { const [kind, b] = snack(); spawn(kind, b, x + k * 30, 222, z + (k % 2) * 15); }
for (const [x, z] of pallets) for (let k = 0; k < 4; k++) { const [kind, b] = snack(); spawn(kind, b, x - 30 + (k % 2) * 60, 40, z - 30 + (k >> 1) * 60); }
for (let k = 0; k < 6; k++) spawn('donut', null, -3560 + (k % 3) * 12, 0, -20 + (k >> 1) * 14);
spawn('bottle', 'coca', -40, 0, -1100); spawn('chips', 'lays', 60, 0, -1090); spawn('tube', 'pringles', 300, 0, -1100);

function solidAt(x1, y1, z1, x2, y2, z2) {
  for (const b of solids) if (x2 > b.x1 && x1 < b.x2 && y2 > b.y1 && y1 < b.y2 && z2 > b.z1 && z1 < b.z2) return b;
  return null;
}
function updateItem(it, dt) {
  if (it.rest) return;
  const p = it.obj.position, v = it.vel;
  v.y -= GRAVITY * dt;
  for (const a of ['x', 'y', 'z']) {
    p[a] += v[a] * dt;
    const b = solidAt(p.x - it.r, p.y - it.hh, p.z - it.r, p.x + it.r, p.y + it.hh, p.z + it.r);
    if (!b) continue;
    if (a === 'y' && v.y < 0) {
      p.y = b.y2 + it.hh;
      v.x *= .6; v.z *= .6;
      v.y = v.y < -120 ? -v.y * .25 : 0;
    } else { p[a] -= v[a] * dt; v[a] *= -.35; }
  }
  if (v.y === 0 && Math.hypot(v.x, v.z) < 10) { it.rest = true; it.obj.rotation.x = it.obj.rotation.z = 0; }
  else { it.obj.rotation.x += dt * 8; it.obj.rotation.z += dt * 5; }
  if (p.y < -500) { p.set(0, 100, 0); v.set(0, 0, 0); }
}

// ===== Gracz =====
const pos = new THREE.Vector3(0, 0, 700), vel = new THREE.Vector3();
let yaw = 0, pitch = 0, onGround = false, held = null, playing = false;
const keys = {};
const hit = (x, y, z) => solidAt(x - R, y, z - R, x + R, y + H, z + R);

function accelerate(wx, wz, wishspeed, accel, dt) {
  const add = wishspeed - (vel.x * wx + vel.z * wz);
  if (add <= 0) return;
  const a = Math.min(accel * wishspeed * dt, add);
  vel.x += a * wx; vel.z += a * wz;
}
function airAccelerate(wx, wz, wishspeed, dt) {
  // limit 30 j. na prędkość "w stronę" wishdir to klucz do air strafe / bhopa
  const add = Math.min(wishspeed, AIRCAP) - (vel.x * wx + vel.z * wz);
  if (add <= 0) return;
  const a = Math.min(AIRACCEL * wishspeed * dt, add);
  vel.x += a * wx; vel.z += a * wz;
}
function friction(dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < .1) { vel.x = vel.z = 0; return; }
  const drop = Math.max(speed, STOPSPEED) * FRICTION * dt;
  const k = Math.max(speed - drop, 0) / speed;
  vel.x *= k; vel.z *= k;
}
function moveH(axis, d) {
  if (!d) return;
  pos[axis] += d;
  const b = hit(pos.x, pos.y, pos.z);
  if (!b) return;
  if (onGround && b.y2 - pos.y <= STEP && !hit(pos.x, b.y2, pos.z)) { pos.y = b.y2; return; } // schodek
  pos[axis] = d > 0 ? b[axis + '1'] - R - .01 : b[axis + '2'] + R + .01;
  if (hit(pos.x, pos.y, pos.z)) pos[axis] -= d;
  vel[axis] = 0;
}
function moveV(d) {
  if (!d) return;
  pos.y += d;
  const b = hit(pos.x, pos.y, pos.z);
  if (!b) return;
  pos.y = d < 0 ? b.y2 : b.y1 - H - .01;
  if (hit(pos.x, pos.y, pos.z)) pos.y -= d;
  vel.y = 0;
}
function step(dt) {
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let wx = -Math.sin(yaw) * f + Math.cos(yaw) * s, wz = -Math.cos(yaw) * f - Math.sin(yaw) * s;
  const len = Math.hypot(wx, wz), wishspeed = len ? MAXSPEED : 0;
  if (len) { wx /= len; wz /= len; }

  if (onGround && keys.Space) { vel.y = JUMP; onGround = false; } // auto-bhop: skok w tym samym ticku = brak tarcia
  if (onGround) { friction(dt); accelerate(wx, wz, wishspeed, ACCEL, dt); }
  else { airAccelerate(wx, wz, wishspeed, dt); vel.y -= GRAVITY * dt; }

  moveH('x', vel.x * dt); moveH('z', vel.z * dt); moveV(vel.y * dt);
  onGround = vel.y <= 0 && !!hit(pos.x, pos.y - .5, pos.z);
  if (onGround) vel.y = 0;
  if (pos.y < -500) { pos.set(0, 0, 700); vel.set(0, 0, 0); }
  for (const it of items) updateItem(it, dt);
}

// ===== Podnoszenie / rzucanie =====
// bez celownika: bierzemy przedmiot najbliżej środka ekranu w stożku ~12° i zasięgu 110
function pickUp() {
  const dir = new THREE.Vector3(), d = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let it = null, best = Math.cos(.21);
  for (const c of items) {
    d.subVectors(c.obj.position, camera.position);
    const dist = d.length();
    if (dist > 110) continue;
    const dot = d.dot(dir) / dist;
    if (dot > best) { best = dot; it = c; }
  }
  if (!it) return;
  if (held) throwHeld(60);
  items.splice(items.indexOf(it), 1);
  held = it;
  it.obj.position.set(0, 0, 0); it.obj.rotation.set(.12, -Math.PI / 2 - .35, .08);
  it.obj.scale.setScalar(Math.min(2 / Math.max(it.hh, it.r), .65)); // wszystko w ręce ma podobny rozmiar
  holder.add(it.obj);
}
function throwHeld(power = 420) {
  if (!held) return;
  const it = held; held = null;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  it.obj.scale.setScalar(1); it.obj.rotation.set(0, 0, 0);
  const p = camera.position.clone().addScaledVector(dir, 22);
  if (solidAt(p.x - it.r, p.y - it.hh, p.z - it.r, p.x + it.r, p.y + it.hh, p.z + it.r)) p.copy(camera.position);
  it.obj.position.copy(p);
  it.vel.copy(dir).multiplyScalar(power).add(vel); it.rest = false;
  scene.add(it.obj); items.push(it);
}

// ===== Wejście =====
const start = document.getElementById('start'), velEl = document.getElementById('vel');
start.onclick = () => renderer.domElement.requestPointerLock()?.catch?.(() => {}); // w niektórych ramkach/podglądach blokada kursora jest zabroniona
document.addEventListener('pointerlockchange', () => {
  playing = document.pointerLockElement === renderer.domElement;
  start.style.display = playing ? 'none' : 'grid';
  if (!playing) for (const k in keys) keys[k] = false;
});
addEventListener('mousemove', e => {
  if (!playing) return;
  yaw -= e.movementX * .0022; pitch -= e.movementY * .0022;
  pitch = Math.max(-1.55, Math.min(1.55, pitch));
});
addEventListener('mousedown', e => { if (playing && e.button === 0) throwHeld(); });
addEventListener('keydown', e => {
  if (!playing) return;
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyE' && !e.repeat) pickUp();
  if (e.code === 'KeyQ' && !e.repeat) throwHeld();
});
addEventListener('keyup', e => { keys[e.code] = false; });

// ===== Pętla =====
let last = performance.now(), acc = 0, bob = 0;
function frame(now) {
  acc += Math.min((now - last) / 1000, .1); last = now;
  while (acc >= TICK) { step(TICK); acc -= TICK; }
  camera.position.set(pos.x, pos.y + EYE, pos.z);
  camera.rotation.set(pitch, yaw, 0);
  const speed = Math.hypot(vel.x, vel.z);
  velEl.textContent = Math.round(speed);
  bob += onGround ? speed * .0004 : 0;
  holder.position.set(6 + Math.cos(bob) * .25, -4.6 + Math.abs(Math.sin(bob)) * .4 + (onGround ? 0 : .6), -16);
  renderer.clear(); renderer.render(scene, camera);
  renderer.clearDepth(); renderer.render(vmScene, vmCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
