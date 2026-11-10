import * as THREE from 'three';
import { addDome, radialSprite, makeComposer } from './xb3d.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

/* ======================= SCENA 3D ======================= */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010601);
const camera = new THREE.PerspectiveCamera(40, 1, .1, 200);
camera.position.set(0, 0, 4.3);

// --- tło: wnętrze kuli pokryte nieregularną siatką
const domeTick = addDome(scene);

const bgGlow = radialSprite([[0, 'rgba(60,160,30,.3)'], [.5, 'rgba(20,80,10,.1)'], [1, 'rgba(0,0,0,0)']]);
bgGlow.scale.set(14, 14, 1); bgGlow.position.z = -3; scene.add(bgGlow);
const composer = makeComposer(renderer, scene, camera, .6);

// --- kula z twarzą
const orb = new THREE.Group(); scene.add(orb);
const fresnelVS = `uniform float time; uniform float seed; uniform float wave; varying vec3 vN; varying vec3 vV;
  void main(){ vec3 p = position;
    p += normal * (sin(p.y*5.0 + time*1.3 + seed)*0.05 + sin(p.x*4.0 + time*0.9 + seed*2.0)*0.04) * wave;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const fresnelFS = `uniform vec3 c1; uniform vec3 c2; uniform float alpha; uniform float base; varying vec3 vN; varying vec3 vV;
  void main(){ float fr = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(mix(c1, c2, fr), (base + fr * 0.8) * alpha); }`;
const glassMat = (o = {}) => new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, seed: { value: o.seed ?? 0 }, wave: { value: o.wave ?? 0 }, c1: { value: new THREE.Color(o.c1 ?? 0x0a3a06) },
    c2: { value: new THREE.Color(o.c2 ?? 0x9cff4a) }, alpha: { value: o.alpha ?? 1 }, base: { value: o.base ?? .05 } },
  vertexShader: fresnelVS, fragmentShader: fresnelFS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending,
});
const animMats = [];

const core = radialSprite([[0, 'rgba(235,255,140,.55)'], [.35, 'rgba(120,230,40,.35)'], [.7, 'rgba(40,140,20,.1)'], [1, 'rgba(0,0,0,0)']]);
core.scale.set(2.8, 2.8, 1); core.renderOrder = 2; orb.add(core);
// wnętrze kuli: ciemna zieleń zasłaniająca siatkę tła
const backTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 110, 0, 128, 128, 128); gr.addColorStop(0, '#3d7a16'); gr.addColorStop(.6, '#143f08'); gr.addColorStop(.98, '#061c03'); gr.addColorStop(1, 'rgba(6,28,3,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const back = new THREE.Mesh(new THREE.CircleGeometry(1.0, 64), new THREE.MeshBasicMaterial({ map: backTex, transparent: true }));
back.position.z = -.2; back.renderOrder = 1; orb.add(back);

// twarz: zdjęcie przefarbowane shaderem na zielono, miękko wycięte w kółko, z liniami jak na hologramie
const faceTex = new THREE.TextureLoader().load('face.png'); faceTex.colorSpace = THREE.SRGBColorSpace;
const faceMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: faceTex }, time: { value: 0 }, crop: { value: new THREE.Vector4(.21, .39, .52, .49) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform float time; uniform vec4 crop; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(map, crop.xy + vUv * crop.zw).rgb;
      float l = dot(c, vec3(.3, .59, .11));
      l = pow(clamp((l - .02) * 1.7, 0., 1.), .75);
      vec3 col = mix(vec3(.02, .1, .01), vec3(.62, 1., .3), l);
      col = mix(col, vec3(.9, 1., .5), smoothstep(.78, 1., l)) * .88;
      float scan = .94 + .06 * sin(vUv.y * 420. + time * 6.);
      float flick = .96 + .04 * sin(time * 37.) * sin(time * 3.1);
      float d = length(vUv - .5) * 2.;
      gl_FragColor = vec4(col * scan * flick, smoothstep(1., .62, d) * .95);
    }`,
  transparent: true, depthWrite: false,
});
const face = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.62), faceMat);
face.position.z = -.05; face.renderOrder = 3; orb.add(face);

const shells = new THREE.Group(); orb.add(shells);
const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), glassMat({ c1: 0x062a04, c2: 0xb6ff5a, base: .04 }));
glass.renderOrder = 4; shells.add(glass); animMats.push(glass.material);
// galaretowate płaty dookoła kuli (fragmenty sfer, falujące)
const petals = [];
for (let i = 0; i < 7; i++) {
  const r = 1.08 + i * .045;
  const geo = new THREE.SphereGeometry(r, 48, 24, i * .9, 1.3 + (i % 3) * .35, .35 + (i % 2) * .4, 1.1 + (i % 3) * .25);
  const m = new THREE.Mesh(geo, glassMat({ seed: i * 1.7, wave: 1, c1: 0x0b4a06, c2: i % 3 ? 0x8cff3a : 0xd8ff6a, alpha: .55, base: .05 }));
  m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  m.userData.spin = new THREE.Vector3((Math.random() - .5) * .25, (Math.random() - .5) * .35, (Math.random() - .5) * .2);
  m.renderOrder = 4; shells.add(m); petals.push(m); animMats.push(m.material);
}
// cienkie świecące łuki (macki)
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1.25 + i * .1, .006 + i * .002, 6, 120, 1.1 + i * .4),
    new THREE.MeshBasicMaterial({ color: 0x7dff3a, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.set(i * .9, i * 1.7, i * .4); m.userData.spin = new THREE.Vector3(.05 * (i + 1), -.07 * (i % 2 ? 1 : -1), .03);
  shells.add(m); petals.push(m);
}
// ciemne „zaćmienie” za kulą z jasną krawędzią (jak na oryginale)
const eclipseTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  gr.addColorStop(0, 'rgba(0,8,0,.92)'); gr.addColorStop(.86, 'rgba(0,14,0,.85)'); gr.addColorStop(.93, 'rgba(60,170,30,.5)'); gr.addColorStop(.955, 'rgba(160,255,90,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const eclipse = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: eclipseTex, transparent: true, depthWrite: false }));
eclipse.position.z = -1.2; orb.add(eclipse);
// szerokie, półprzezroczyste smugi energii krążące wokół kuli
const ribbons = [];
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1.9 + i * .38, .32 + (i % 2) * .18, 12, 160, 1.4 + (i % 3) * .7),
    glassMat({ seed: i * 2.3, wave: 2.5, c1: 0x0b3a06, c2: i % 2 ? 0x6ad82a : 0x9ee83a, alpha: .13, base: .01 }));
  m.scale.z = .12; m.rotation.set(1.1 + i * .35, i * 1.2, i * .8);
  m.userData.spin = new THREE.Vector3(.02 + i * .01, -.03 * (i % 2 ? 1 : -1), .015);
  m.position.z = -.6; orb.add(m); ribbons.push(m); animMats.push(m.material);
}
const halo = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.78, 128), new THREE.MeshBasicMaterial({ color: 0x3fbf20, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
orb.add(halo);
const halo2 = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.27, 128, 1, 0, 4.2), halo.material.clone()); halo2.material.opacity = .18; orb.add(halo2);

/* ======================= UKŁAD ======================= */
let W = 0, H = 0, portrait = false;
const orbScreen = { x: 0, y: 0, r: 0 };
function resize() {
  W = innerWidth; H = innerHeight; portrait = W / H < .9;
  renderer.setSize(W, H, false); composer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
  const half = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  if (portrait) { orb.position.set(0, half * .48, 0); orb.userData.s = .62; }
  else { orb.position.set(-(.5 - .3) * 2 * half * camera.aspect, -.05, 0); orb.userData.s = 1; }
  // pozycja i promień kuli na ekranie – do tego dopasowujemy łuk menu
  camera.updateMatrixWorld();
  const p = orb.position.clone().project(camera);
  orbScreen.x = (p.x + 1) / 2 * W; orbScreen.y = (1 - p.y) / 2 * H; orbScreen.r = orb.userData.s * H / 2 / half;
  layoutMenu(true);
}

/* ======================= MENU ======================= */
const APPS = [
  { href: 'game.html', name: 'Lobby' }, { href: 'wiki.html', name: 'Wikipedia Bro' }, { href: 'youtube.html', name: 'YouTube' },
  { href: 'forum.html', name: 'Forum Bro' }, { href: 'library.html', name: 'Biblioteka Bro' }, { href: 'shop.html', name: 'Sklep' },
];
let items = [], sel = 0, cur = 0, menuOn = false, opening = false;
const menu = $('menu'), wires = $('wires');

function buildMenu(p) {
  const apps = p.is_admin ? [...APPS, { href: 'admin.html', name: 'Admin' }] : APPS;
  menu.innerHTML = ''; wires.innerHTML = '';
  items = apps.map((a, k) => {
    const el = document.createElement('a');
    el.className = 'item'; el.href = a.href; el.style.animationDelay = 80 + k * 70 + 'ms';
    el.innerHTML = `<span class="knob"></span><span class="barx">${esc(a.name)}</span>`;
    // bez wybierania najechaniem: klik w niezaznaczoną = przewiń do niej, klik w zaznaczoną = otwórz
    el.addEventListener('click', e => { e.preventDefault(); if (swiped) return; k === sel ? open() : setSel(k); });
    menu.append(el);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); wires.append(path);
    return { a, el, knob: el.firstChild, bar: el.lastChild, path };
  });
  sel = Math.min(+(sessionStorage.getItem('sel') || 0), items.length - 1); cur = sel;
  menu.classList.add('enter'); setTimeout(() => menu.classList.remove('enter'), 1200);
  layoutMenu(true);
}
function setSel(k) {
  k = Math.max(0, Math.min(items.length - 1, k));
  if (k === sel || opening) return;
  sel = k; sfx('move');
}
// pozycje na łuku wokół kuli; cur płynnie goni sel
function layoutMenu(force) {
  if (!items.length) return;
  if (!force) cur += (sel - cur) * .14;
  const k = Math.max(26, Math.min(H * .085, W * .07)), bh = portrait ? Math.min(38, W * .095) : Math.max(26, Math.min(H * .062, 46));
  items.forEach((it, i) => {
    const d = i - cur;
    let x, y, bx, by, op;
    if (portrait) {
      x = W * .1 + Math.abs(d) * 6; y = H * .62 + d * (k + 18);
      bx = x + k * .8; by = y; op = Math.max(0, 1 - Math.max(0, Math.abs(d) - 2.2));
    } else {
      const R = orbScreen.r * 1.5, th = d * .27;
      x = orbScreen.x + Math.cos(th) * R; y = orbScreen.y + Math.sin(th) * R;
      bx = x + k * .85 + 20; by = y - Math.sin(th) * k * .3; op = Math.max(0, 1 - Math.max(0, Math.abs(d) - 2.4) * 1.2);
    }
    const bw = Math.max(160, W * (portrait ? .94 : .9) - bx);
    it.el.style.transform = `translate(${x}px, ${y}px)`;
    it.el.style.opacity = op; it.el.style.pointerEvents = op > .3 ? 'auto' : 'none';
    it.el.style.setProperty('--k', k + 'px'); it.el.style.setProperty('--bh', bh + 'px');
    it.bar.style.left = bx - x + 'px'; it.bar.style.top = by - y - bh / 2 + 'px'; it.bar.style.width = bw + 'px';
    it.el.classList.toggle('sel', i === sel);
    // kabel od kulki do belki (najpierw w górę, potem w prawo – jak na oryginale)
    const sx = x + k * .5, ex = bx + 4, ey = by;
    it.path.setAttribute('d', `M${sx} ${y} C${sx + 14} ${y - k * .35}, ${ex - 26} ${ey - k * .1}, ${ex} ${ey}`);
    it.path.style.opacity = op * .9;
  });
}

function open() {
  if (opening || !items[sel]) return;
  opening = true; sessionStorage.setItem('sel', sel); sfx('select');
  const it = items[sel], r = it.knob.getBoundingClientRect(), stage = $('stage');
  it.el.classList.add('go');
  stage.style.setProperty('--ox', r.left + r.width / 2 + 'px'); stage.style.setProperty('--oy', r.top + r.height / 2 + 'px');
  if (REDUCED) return location.href = it.a.href;
  setTimeout(() => { stage.classList.add('warp'); $('warp').classList.add('on'); }, 220);
  setTimeout(() => location.href = it.a.href, 1150);
}
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  opening = false; $('stage').classList.remove('warp'); $('warp').classList.remove('on');
  items.forEach(i => i.el.classList.remove('go'));
});

/* ======================= STEROWANIE: klawiatura, kółko, pad ======================= */
addEventListener('keydown', e => {
  if (!menuOn || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (['ArrowUp', 'KeyW'].includes(e.code)) { setSel(sel - 1); e.preventDefault(); }
  if (['ArrowDown', 'KeyS'].includes(e.code)) { setSel(sel + 1); e.preventDefault(); }
  if (['Enter', 'Space'].includes(e.code)) { open(); e.preventDefault(); }
});
let wheelLock = 0;
addEventListener('wheel', e => { if (!menuOn || performance.now() < wheelLock) return; wheelLock = performance.now() + 140; setSel(sel + Math.sign(e.deltaY)); }, { passive: true });
// telefon: przesuwanie palcem w górę/dół przewija listę
let touchY = null, swiped = false;
addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { touchY = e.clientY; swiped = false; } });
addEventListener('pointermove', e => {
  if (touchY === null || !menuOn) return;
  const dy = e.clientY - touchY;
  if (Math.abs(dy) > 42) { setSel(sel + (dy < 0 ? 1 : -1)); touchY = e.clientY; swiped = true; }
});
addEventListener('pointerup', () => { touchY = null; setTimeout(() => swiped = false, 50); });
document.addEventListener('touchmove', e => { if (menuOn && !e.target.closest('form')) e.preventDefault(); }, { passive: false });
let padNext = 0;
function pollPad(t) {
  const p = navigator.getGamepads?.().find(Boolean);
  if (!p || !menuOn) return;
  const ax = p.axes[1] || 0, up = p.buttons[12]?.pressed || ax < -.5, down = p.buttons[13]?.pressed || ax > .5;
  if ((up || down) && t > padNext) { setSel(sel + (down ? 1 : -1)); padNext = t + 220; }
  if (!up && !down) padNext = 0;
  if (p.buttons[0]?.pressed) open();
}
$('hintA').onclick = open;

/* ======================= PĘTLA ======================= */
const mouse = { x: 0, y: 0 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; });
let orbScale = 0, rx = 0, ry = 0;
function frame(t) {
  const T = t * .001;
  for (const m of animMats) m.uniforms.time.value = T;
  faceMat.uniforms.time.value = T;
  orbScale += ((menuOn || !$('login').hidden ? orb.userData.s : 0) - orbScale) * .06;
  orb.scale.setScalar(orbScale * (1 + Math.sin(T * 1.6) * .012));
  ry += (mouse.x * .7 - ry) * .05; rx += (mouse.y * .5 - rx) * .05;       // kula odwraca się w stronę myszki
  shells.rotation.set(rx, ry, 0);
  face.position.x = -ry * .08; face.position.y = rx * .08;                  // twarz lekko „pływa” w środku (paralaksa)
  for (const p of petals) { p.rotation.x += p.userData.spin.x * .016; p.rotation.y += p.userData.spin.y * .016; p.rotation.z += p.userData.spin.z * .016; }
  halo.rotation.z = T * .05; halo2.rotation.z = -T * .08;
  for (const r of ribbons) { r.rotation.x += r.userData.spin.x * .016; r.rotation.y += r.userData.spin.y * .016; r.rotation.z += r.userData.spin.z * .016; }
  core.material.opacity = .45 + Math.sin(T * 2.3) * .1;
  domeTick(T);
  layoutMenu(false);
  pollPad(t);
  composer.render();
  requestAnimationFrame(frame);
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

/* ======================= LOGOWANIE / START ======================= */
function showMenu(p) {
  $('login').hidden = true; $('user').hidden = false; $('hintA').hidden = false;
  $('nickLabel').textContent = p.nick;
  buildMenu(p); menuOn = true;
}
function muteLabel() { $('muteBtn').textContent = muted() ? 'Dźwięk: wył' : 'Dźwięk: wł'; }
$('muteBtn').onclick = () => { try { localStorage.setItem('mute', muted() ? '0' : '1'); } catch {} muteLabel(); sfx('move'); };
muteLabel();
$('logout').onclick = async () => { if (sb) await sb.auth.signOut(); location.reload(); };
function tick() { $('clock').textContent = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); }

onSubmit($('loginForm'), async f => {
  const nick = f.get('nick').trim().toLowerCase();
  const { error } = await sb.auth.signInWithPassword({ email: nickToEmail(nick), password: f.get('password') });
  if (error) throw new Error('Zły nick lub hasło');
  const p = await currentProfile();
  if (!p) { await sb.auth.signOut(); throw new Error('To konto nie ma dostępu'); }
  sfx('select'); showMenu(p);
});

// intro raz na wizytę (sessionStorage); kliknięcie pomija
function intro() {
  let seen = false; try { seen = sessionStorage.getItem('intro') === '1'; sessionStorage.setItem('intro', '1'); } catch {}
  if (seen || REDUCED) return Promise.resolve();
  const el = $('intro'); el.hidden = false;
  return new Promise(done => {
    const end = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.hidden = true, 650); done(); };
    el.addEventListener('pointerdown', () => { sfx('select'); end(); });
    addEventListener('keydown', end, { once: true });
    setTimeout(end, 5200);
  });
}

const prof = currentProfile();
await intro();
const p = await prof;
if (p) { showMenu(p); if (DEMO) demoBanner(); }
else { $('login').hidden = false; tick(); setInterval(tick, 10000); }
