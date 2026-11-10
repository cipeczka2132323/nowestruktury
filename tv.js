import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { addDome, radialSprite, makeComposer } from './xb3d.js';

const me = await requireUser();
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const cssR = new CSS3DRenderer();
document.getElementById('css3d').append(cssR.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010601);
const camera = new THREE.PerspectiveCamera(38, 1, .1, 200);
const domeTick = addDome(scene);
const composer = makeComposer(renderer, scene, camera, .5);

scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x1c2a14, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-4, 6, 7); scene.add(sun);
const blue = new THREE.PointLight(0x5aa8ff, 2.5, 14, 0); blue.position.set(3.5, 3.5, 2); scene.add(blue);

// --- zużyty szary plastik
const plastic = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#9a9da3'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 34; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(40,40,45,${Math.random() * .12})`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 6 + Math.random() * 40, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(230,230,235,.18)'; for (let i = 0; i < 40; i++) { g.beginPath(); const x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 60, y + (Math.random() - .5) * 20); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
const mat = new THREE.MeshStandardMaterial({ map: plastic, color: 0xc4c7cd, roughness: .78, metalness: .05 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2e3135, roughness: .6 });

// --- telewizor kineskopowy
const tv = new THREE.Group(); scene.add(tv);
const front = new THREE.Mesh(new RoundedBoxGeometry(4.2, 3.5, 1.1, 4, .14), mat); tv.add(front);
const backGeo = new THREE.BoxGeometry(3.7, 3, 1.9);
const pa = backGeo.attributes.position;
for (let i = 0; i < pa.count; i++) if (pa.getZ(i) < 0) { pa.setX(i, pa.getX(i) * .6); pa.setY(i, pa.getY(i) * .6 + .1); }
backGeo.computeVertexNormals();
const back = new THREE.Mesh(backGeo, mat); back.position.z = -1.45; tv.add(back);
const stand = new THREE.Mesh(new RoundedBoxGeometry(4, .28, 1.7, 3, .08), dark); stand.position.set(0, -1.86, -.15); tv.add(stand);
// wnęka ekranu
const bezel = new THREE.Mesh(new RoundedBoxGeometry(3.42, 2.58, .06, 3, .14), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: .7 }));
bezel.position.set(0, .3, .54); tv.add(bezel);
const glassBack = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.46), new THREE.MeshBasicMaterial({ color: 0x020802 }));
glassBack.position.set(0, .3, .575); tv.add(glassBack);
// panel z przyciskami i głośnikiem
for (const [x, r] of [[-1.7, .07], [-1.45, .05], [-1.25, .05], [-1.05, .05]]) {
  const k = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .06, 20), dark); k.rotation.x = Math.PI / 2; k.position.set(x, -1.35, .56); tv.add(k);
}
const slot = new THREE.Mesh(new RoundedBoxGeometry(.5, .14, .04, 2, .03), dark); slot.position.set(-.45, -1.35, .56); tv.add(slot);
const av = new THREE.Mesh(new RoundedBoxGeometry(.45, .18, .04, 2, .05), dark); av.position.set(.2, -1.35, .56); tv.add(av);
const grillTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#3a3d42'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#111'; for (let y = 6; y < 64; y += 9) for (let x = 6; x < 256; x += 9) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const grill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .28), new THREE.MeshStandardMaterial({ map: grillTex, roughness: .9 }));
grill.position.set(1.35, -1.35, .556); tv.add(grill);

// --- ekran: prawdziwy element HTML w 3D (iframe z YouTube musi być w DOM)
const screenEl = document.createElement('div');
screenEl.className = 'tvscreen';
screenEl.innerHTML = '<div class="ph"><div id="ytp"></div></div><div class="nosig"></div><div class="glare"></div>';
const screen = new CSS3DObject(screenEl);
screen.scale.setScalar(3.24 / 960); screen.position.set(0, .3, .585); tv.add(screen);

// --- błysk obiektywu jak na zdjęciu
const flare = new THREE.Group(); scene.add(flare);
const big = radialSprite([[0, 'rgba(200,230,255,.9)'], [.15, 'rgba(90,160,255,.45)'], [.5, 'rgba(30,80,200,.12)'], [1, 'rgba(0,0,0,0)']]); big.scale.set(9, 9, 1); flare.add(big);
const ray = radialSprite([[0, 'rgba(170,210,255,.45)'], [1, 'rgba(0,0,0,0)']]); ray.scale.set(1.2, 14, 1); ray.material.rotation = .5; flare.add(ray);
const ghosts = [.35, .6, .9, 1.25].map((k, i) => { const s = radialSprite([[0, 'rgba(60,120,255,0)'], [.8, `rgba(80,150,255,${.08 + i * .02})`], [.95, 'rgba(120,180,255,.15)'], [1, 'rgba(0,0,0,0)']]); s.userData.k = k; s.scale.setScalar(1 + i * .8); scene.add(s); return s; });
const flarePos = new THREE.Vector3(4.5, 4.2, -3);
flare.position.copy(flarePos);

// --- układ i animacja
let playing = false, tvX = 0;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); cssR.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, -.2, Math.max(9.5, 7.2 / Math.min(camera.aspect, 1.2) + 3.4));
  camera.updateProjectionMatrix();
  tvX = innerWidth > 900 ? -1.9 : 0; // miejsce na kolejkę po prawej
}
addEventListener('resize', resize); resize();
const mouse = { x: 0, y: 0 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; });
const rot = new THREE.Euler(.12, -.42, .06);
function frame(t) {
  const T = t * .001;
  // bez filmu TV wisi przekrzywiony jak na zdjęciu; z filmem obraca się przodem do widza
  const tx = (playing ? .02 : .14) + mouse.y * .12, ty = (playing ? 0 : -.42) + mouse.x * .2, tz = playing ? 0 : .07;
  const k = REDUCED ? 1 : .04;
  rot.x += (tx - rot.x) * k; rot.y += (ty - rot.y) * k; rot.z += (tz - rot.z) * k;
  tv.rotation.copy(rot);
  tv.position.y += ((playing ? .4 : .25) + (REDUCED ? 0 : Math.sin(T * .9) * .08) - tv.position.y) * .06;
  tv.position.z += ((playing ? .15 : 0) - tv.position.z) * .05;
  tv.position.x += (tvX - tv.position.x) * .08;
  domeTick(T);
  big.material.opacity = .85 + Math.sin(T * 1.7) * .15;
  // duchy flary na linii od źródła światła przez środek ekranu
  for (const g of ghosts) g.position.copy(flarePos).multiplyScalar(1 - g.userData.k * 1.6).setZ(-1 + g.userData.k);
  composer.render(); cssR.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ======================= WSPÓLNY TELEWIZOR =======================
// stan: co leci (state) i kolejka (queue) – w Supabase wspólne dla wszystkich, w trybie podglądu tylko lokalnie
let state = { video_id: null }, queue = [], skew = 0, powered = false;
const $ = id => document.getElementById(id);
const now = () => Date.now() + skew;                 // zegar serwera
const offset = () => Math.max(0, (now() - Date.parse(state.started_at)) / 1000);

const store = DEMO ? (() => {
  let n = 1;
  const start = x => ({ video_id: x.video_id, title: x.title, started_at: new Date().toISOString(), setter: { nick: me.nick } });
  return {
    async load() {},
    sub() {},
    async play(v, t) { state = start({ video_id: v, title: t }); changed(); },
    async enqueue(v, t) { queue.push({ id: n++, video_id: v, title: t, added_by: me.id, adder: { nick: me.nick } }); changed(); },
    async next(exp) { if (state.video_id != exp) return; const x = queue.shift(); state = x ? start(x) : { video_id: null }; changed(); },
    async remove(id) { queue = queue.filter(q => q.id !== id); changed(); },
  };
})() : {
  async load() {
    const t0 = Date.now(), srv = check(await sb.rpc('server_now'));
    skew = Date.parse(srv) - (t0 + Date.now()) / 2;
    state = check(await sb.from('tv_state').select('*, setter:profiles(nick)').eq('id', 1).single());
    queue = check(await sb.from('tv_queue').select('*, adder:profiles(nick)').order('id'));
  },
  sub() {
    sb.channel('tv')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tv_state' }, async () => {
        state = check(await sb.from('tv_state').select('*, setter:profiles(nick)').eq('id', 1).single()); changed(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tv_queue' }, async () => {
        queue = check(await sb.from('tv_queue').select('*, adder:profiles(nick)').order('id')); changed(); })
      .subscribe();
  },
  async play(v, t) { check(await sb.rpc('tv_play', { vid: v, ttl: t })); },
  async enqueue(v, t) { check(await sb.from('tv_queue').insert({ video_id: v, title: t, added_by: me.id })); },
  async next(exp) { check(await sb.rpc('tv_next', { expected: exp })); },
  async remove(id) { check(await sb.from('tv_queue').delete().eq('id', id)); },
};

// --- odtwarzacz (YouTube IFrame API – pozwala przewinąć do wspólnego momentu i wykryć koniec filmu)
const ytApi = new Promise(res => {
  window.onYouTubeIframeAPIReady = res;
  const iv = setInterval(() => { if (window.YT?.loaded) { clearInterval(iv); res(); } }, 200); // zapas, gdyby callback nie przyszedł
  const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.append(sc);
});
let player = null, loadedId = null;
const nosig = screenEl.querySelector('.nosig'), ph = screenEl.querySelector('.ph');
function noSignal(big, small, button) {
  nosig.hidden = false; ph.style.visibility = 'hidden';
  nosig.innerHTML = `<div>${big}<small>${small}</small>${button ? '<button type="button" class="power">⏻ Włącz TV</button>' : ''}</div>`;
  nosig.querySelector('.power')?.addEventListener('click', powerOn);
}
function powerOn() {
  powered = true; sfx('select');
  screenEl.classList.remove('crt'); void screenEl.offsetWidth; screenEl.classList.add('crt');
  apply();
}
async function apply() {
  playing = powered && !!state.video_id;
  if (!powered) return noSignal('TV WYŁĄCZONY', 'WSPÓLNY TELEWIZOR DLA WSZYSTKICH', true);
  if (!state.video_id) { player?.stopVideo?.(); loadedId = null; return noSignal('BRAK SYGNAŁU', 'DODAJ FILM PONIŻEJ'); }
  nosig.hidden = true; ph.style.visibility = 'visible';
  await ytApi;
  if (!player) {
    loadedId = state.video_id;
    player = new YT.Player(ph.firstElementChild, {
      host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', videoId: state.video_id,
      playerVars: { autoplay: 1, start: Math.floor(offset()), playsinline: 1, rel: 0 },
      events: {
        onReady: e => { e.target.seekTo(offset(), true); e.target.playVideo(); },
        onStateChange: e => { if (e.data === YT.PlayerState.ENDED) store.next(loadedId).catch(() => {}); },
      },
    });
  } else if (loadedId !== state.video_id) {
    loadedId = state.video_id;
    player.loadVideoById({ videoId: state.video_id, startSeconds: offset() });
  }
}
// co 4 s: wyrównaj do wspólnego czasu; jeśli film skończył się, gdy nikt nie patrzył – przejdź dalej
setInterval(() => {
  if (!player?.getCurrentTime || !state.video_id || loadedId !== state.video_id) return;
  const want = offset(), dur = player.getDuration?.() || 0;
  if (dur > 0 && want > dur + 3) return store.next(state.video_id).catch(() => {});
  if (player.getPlayerState?.() === YT.PlayerState.PLAYING && Math.abs(player.getCurrentTime() - want) > 2.5) player.seekTo(want, true);
}, 4000);

// --- panel kolejki
function renderQueue() {
  $('nowTitle').textContent = state.video_id ? (state.title || state.video_id) : 'Nic nie leci';
  $('nowBy').textContent = state.video_id ? 'puścił(a): ' + (state.setter?.nick ?? '—') : '';
  $('skip').hidden = !state.video_id;
  $('qlist').innerHTML = queue.map((q, i) => `<li>
      <img src="https://i.ytimg.com/vi/${q.video_id}/mqdefault.jpg" alt="" loading="lazy">
      <div><b>${esc(q.title || q.video_id)}</b><span class="meta">${i + 1}. ${esc(q.adder?.nick ?? '—')}</span></div>
      ${q.added_by === me.id || me.is_admin ? `<button type="button" class="x" data-id="${q.id}" aria-label="Usuń z kolejki">✕</button>` : ''}
    </li>`).join('') || '<li class="meta">Kolejka jest pusta</li>';
  $('qlist').querySelectorAll('.x').forEach(b => b.onclick = () => run(() => store.remove(+b.dataset.id)));
}
function changed() { apply(); renderQueue(); }

// --- dodawanie filmów
const ytId = u => (u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1];
console.assert(ytId('https://youtu.be/dQw4w9WgXcQ?t=3') === 'dQw4w9WgXcQ' && ytId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=1') === 'dQw4w9WgXcQ' && !ytId('https://example.com'));
async function titleOf(id) {
  try { const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`); return r.ok ? (await r.json()).title.slice(0, 200) : ''; }
  catch { return ''; }
}
async function run(fn) {
  const err = $('f').querySelector('.err'); err.textContent = '';
  $('f').querySelectorAll('button').forEach(b => b.disabled = true);
  try { await fn(); } catch (x) { err.textContent = x.message || String(x); }
  finally { $('f').querySelectorAll('button').forEach(b => b.disabled = false); }
}
async function addVideo(mode) {
  const id = ytId($('url').value);
  if (!id) throw new Error('To nie wygląda na link do YouTube');
  const t = await titleOf(id);
  if (mode === 'now') await store.play(id, t);
  else { await store.enqueue(id, t); if (!state.video_id) await store.next(null); } // nic nie leci → startuj od razu
  $('url').value = ''; sfx('select');
  if (!powered) powerOn();
}
$('playNow').onclick = () => run(() => addVideo('now'));
$('f').onsubmit = e => { e.preventDefault(); run(() => addVideo('queue')); };
$('skip').onclick = () => run(async () => { sfx('back'); await store.next(state.video_id); });

await store.load();
store.sub();
changed();
