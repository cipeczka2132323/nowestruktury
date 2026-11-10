// ===== USTAW PO ZAŁOŻENIU PROJEKTU W SUPABASE (Project Settings → API) =====
const SUPABASE_URL = 'https://xxmzynmmilwzwwxkrwxd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WFdJvRHB9-cGKOiEPcr-mQ_gt2vAkuS'; // klucz publiczny (publishable) – dane chroni RLS z supabase.sql
// ===========================================================================

const DEMO = !SUPABASE_URL; // bez konfiguracji strona działa w trybie podglądu (menu, gra, YT)
const sb = DEMO ? null : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EMAIL_DOMAIN = '@users.nowestruktury.pl'; // nick zamieniamy na sztuczny e-mail, bo Supabase loguje e-mailem
const NICK_RE = /^[a-z0-9_.-]{3,20}$/;
const nickToEmail = n => n.trim().toLowerCase() + EMAIL_DOMAIN;

async function currentProfile() {
  if (DEMO) return { id: 'demo', nick: 'podglad', is_admin: true };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  // konto bez wpisu w profiles (np. ktoś zarejestrował się przez API) nie ma dostępu
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  return data;
}

async function requireUser() {
  const p = await currentProfile();
  if (!p) { location.replace('index.html'); throw new Error('Niezalogowany'); }
  if (DEMO) demoBanner();
  return p;
}

function demoBanner() {
  if (document.getElementById('demo')) return;
  const d = document.createElement('div');
  d.id = 'demo';
  d.textContent = 'Tryb podglądu – Supabase nie jest jeszcze ustawiony (common.js)';
  document.body.append(d);
}

// apki z bazą danych w trybie podglądu pokazują tylko komunikat
function needsDb(el) {
  if (!DEMO) return false;
  el.innerHTML = '<div class="card empty">Ta apka zadziała po podłączeniu Supabase – patrz README.md.</div>';
  return true;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unesc = s => new DOMParser().parseFromString(s, 'text/html').documentElement.textContent;
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '#';
// tekst użytkownika: escape → klikalne linki → nowe linie
const richText = s => esc(s)
  .replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
  .replace(/\n/g, '<br>');
const fmtDate = d => new Date(d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

async function uploadImage(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('To nie jest obrazek');
  if (file.size > 5 * 1024 * 1024) throw new Error('Obrazek może mieć max 5 MB');
  const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.]/g, '_')}`;
  const { error } = await sb.storage.from('images').upload(path, file);
  if (error) throw error;
  return sb.storage.from('images').getPublicUrl(path).data.publicUrl;
}

// wspólna obsługa formularzy: blokuje przycisk, pokazuje błąd
function onSubmit(form, fn) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit],button:not([type])');
    const err = form.querySelector('.err');
    if (btn) btn.disabled = true;
    if (err) err.textContent = '';
    try { await fn(new FormData(form)); }
    catch (x) { if (err) err.textContent = x.message || String(x); else alert(x.message || x); }
    finally { if (btn) btn.disabled = false; }
  });
}
const check = ({ data, error }) => { if (error) throw error; return data; };

/* ===== Siatka tła w stylu dashboardu ===== */
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
// nieregularna siatka komórek: punkty z jitterem, krawędzie do sąsiadów, część usunięta → różne wielokąty
function lattice(nx, ny, seed = 7) {
  const r = rng(seed), P = [], E = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) P.push([(i + (r() - .5) * .7) / nx, (j + (r() - .5) * .7) / ny]);
  const id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    if (i < nx && r() > .14) E.push([id(i, j), id(i + 1, j)]);
    if (j < ny && r() > .14) E.push([id(i, j), id(i, j + 1)]);
    if (i < nx && j < ny && r() < .22) E.push(r() < .5 ? [id(i, j), id(i + 1, j + 1)] : [id(i + 1, j), id(i, j + 1)]);
  }
  return { P, E };
}
// statyczne tło podstron: siatka wygięta jak wnętrze kuli
function drawGrid(cv) {
  const d = Math.min(devicePixelRatio || 1, 2), W = cv.width = innerWidth * d, H = cv.height = innerHeight * d, g = cv.getContext('2d');
  let gr = g.createRadialGradient(W / 2, H * .45, 0, W / 2, H * .45, Math.max(W, H) * .75);
  gr.addColorStop(0, '#0b3008'); gr.addColorStop(.55, '#041a04'); gr.addColorStop(1, '#010501');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // zielona mgła w kilku miejscach
  const fr = rng(42);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const x = fr() * W, y = fr() * H, r = (.25 + fr() * .35) * Math.max(W, H);
    gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(40,${110 + fr() * 60},20,.09)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  // dwie warstwy siatki: drobna i ciemna z tyłu, rzadsza i jaśniejsza z przodu (głębia); krawędzie lekko wygięte
  const layer = (n, seed, scale, bend, passes) => {
    const { P, E } = lattice(n, n, seed), S = Math.max(W, H) * scale, br = rng(seed + 1);
    const proj = (u, v) => { const x = (u - .5) * 2.4, y = (v - .5) * 2.4, k = 1 + .45 * (x * x + y * y); return [W / 2 + x * k * S * .5, H * .45 + y * k * S * .5]; };
    const bends = E.map(() => (br() - .5) * bend);
    for (const [lw, a] of passes) {
      g.strokeStyle = `rgba(90,230,60,${a})`; g.lineWidth = lw * d; g.beginPath();
      E.forEach(([p, q], i) => {
        const [u0, v0] = P[p], [u1, v1] = P[q], nx = -(v1 - v0) * bends[i], ny = (u1 - u0) * bends[i];
        for (let s = 0; s <= 8; s++) { const t = s / 8, b = 4 * t * (1 - t); const [x, y] = proj(u0 + (u1 - u0) * t + nx * b, v0 + (v1 - v0) * t + ny * b); s ? g.lineTo(x, y) : g.moveTo(x, y); }
      });
      g.stroke();
    }
  };
  layer(44, 3, .62, .2, [[.8, .09]]);
  layer(24, 7, .66, .18, [[4, .03], [1.1, .2]]);
  g.globalCompositeOperation = 'source-over';
}
if (document.querySelector('link[href="style.css"]') && !document.getElementById('scene')) {
  const cv = document.createElement('canvas'); cv.id = 'xbgrid'; document.body.prepend(cv);
  drawGrid(cv); addEventListener('resize', () => drawGrid(cv));
}

/* ===== Dźwięki (własne, syntezowane – bez nagrań z konsoli) ===== */
let AC = null;
const muted = () => { try { return localStorage.getItem('mute') === '1'; } catch { return false; } };
function sfx(kind) {
  if (muted()) return;
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  const t = AC.currentTime, o = AC.createOscillator(), o2 = AC.createOscillator(), gn = AC.createGain(), f = AC.createBiquadFilter();
  const S = { move: [880, 1320, .07, .05], select: [440, 1760, .28, .09], back: [900, 300, .22, .08], boot: [55, 220, 2.2, .12] }[kind] || [600, 900, .1, .05];
  o.type = 'sine'; o2.type = 'triangle'; f.type = 'lowpass'; f.frequency.value = 3200;
  o.frequency.setValueAtTime(S[0], t); o.frequency.exponentialRampToValueAtTime(S[1], t + S[2]);
  o2.frequency.setValueAtTime(S[0] * 1.5, t); o2.frequency.exponentialRampToValueAtTime(S[1] * 1.5, t + S[2]);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(S[3], t + .015); gn.gain.exponentialRampToValueAtTime(.0001, t + S[2] + .08);
  o.connect(f); o2.connect(f); f.connect(gn); gn.connect(AC.destination);
  o.start(t); o2.start(t); o.stop(t + S[2] + .1); o2.stop(t + S[2] + .1);
}

/* ===== Esc / przycisk B na padzie = wstecz ===== */
function goBack() { const b = document.querySelector('.back'); if (!b) return; sfx('back'); location.href = b.href; }
addEventListener('keydown', e => { if (e.key === 'Escape' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) goBack(); });
(function padLoop() {
  const p = navigator.getGamepads?.().find(Boolean);
  if (p?.buttons[1]?.pressed) return goBack();
  requestAnimationFrame(padLoop);
})();
