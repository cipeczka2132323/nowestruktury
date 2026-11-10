// wspólne elementy 3D dashboardu: kopuły z siatką, mgła, drobinki, smugi energii, bloom
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// siatka z wygiętymi krawędziami (jak komórki na oryginale), rysowana w canvasie
export function gridTexture({ nx = 150, ny = 75, seed = 11, alpha = .42, lw = 1.3, w = 4096 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = w / 2;
  const g = c.getContext('2d'), r = rng(seed * 7 + 3);
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const { P, E } = lattice(nx, ny, seed); // lattice()/rng() z common.js
  const bends = E.map(() => (r() - .5) * .45);
  for (const [lwk, a] of [[4, alpha * .1], [1, alpha]]) {
    g.strokeStyle = `rgba(95,235,65,${a})`; g.lineWidth = lw * lwk; g.beginPath();
    E.forEach(([p, q], i) => {
      const x0 = P[p][0] * c.width, y0 = P[p][1] * c.height, x1 = P[q][0] * c.width, y1 = P[q][1] * c.height;
      const mx = (x0 + x1) / 2 - (y1 - y0) * bends[i], my = (y0 + y1) / 2 + (x1 - x0) * bends[i];
      g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1);
    });
    g.stroke();
  }
  // węzły świecą mocniej
  g.fillStyle = `rgba(170,255,110,${alpha * .9})`;
  for (const [x, y] of P) if (r() < .12) { g.beginPath(); g.arc(x * c.width, y * c.height, lw * 1.1, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const softDot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(200,255,150,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();

export function radialSprite(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
}

// całe tło: dwie kopuły z siatką (głębia + paralaksa), zielona mgła, unoszące się drobinki
export function addDome(scene) {
  const outer = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32),
    new THREE.MeshBasicMaterial({ map: gridTexture({ nx: 130, ny: 65, seed: 11, alpha: .2 }), side: THREE.BackSide, transparent: true, depthWrite: false }));
  const inner = new THREE.Mesh(new THREE.SphereGeometry(16, 64, 32),
    new THREE.MeshBasicMaterial({ map: gridTexture({ nx: 40, ny: 20, seed: 5, alpha: .1, lw: 2, w: 2048 }), side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  outer.rotation.y = inner.rotation.y = Math.PI / 2; // szew tekstury z tyłu kamery
  scene.add(outer, inner);

  // mgła: duże, wolno dryfujące poświaty
  const fog = [];
  const fr = rng(99);
  for (let i = 0; i < 9; i++) {
    const s = radialSprite([[0, `rgba(${60 + fr() * 50},${150 + fr() * 70},30,.28)`], [.45, 'rgba(20,90,10,.1)'], [1, 'rgba(0,0,0,0)']]);
    const k = 6 + fr() * 10; s.scale.set(k, k, 1);
    s.position.set((fr() - .5) * 16, (fr() - .5) * 9, -6 - fr() * 8);
    s.userData = { p: s.position.clone(), ph: fr() * 6, sp: .05 + fr() * .08 };
    scene.add(s); fog.push(s);
  }

  // drobinki
  const N = 420, pos = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (fr() - .5) * 22; pos[i * 3 + 1] = (fr() - .5) * 14; pos[i * 3 + 2] = -1 - fr() * 14; seeds[i] = fr(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({ map: softDot, size: .09, color: 0x9dff5a, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  scene.add(dust);

  return t => {
    outer.rotation.y = Math.PI / 2 + Math.sin(t * .045) * .32; outer.rotation.x = Math.sin(t * .033) * .1;
    inner.rotation.y = Math.PI / 2 - Math.sin(t * .06) * .4 + t * .01; inner.rotation.z = Math.sin(t * .041) * .08;
    for (const s of fog) { const u = s.userData; s.position.set(u.p.x + Math.sin(t * u.sp + u.ph) * 1.6, u.p.y + Math.cos(t * u.sp * .8 + u.ph) * .9, u.p.z); s.material.opacity = .7 + Math.sin(t * u.sp * 3 + u.ph) * .3; }
    const a = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      a[i * 3 + 1] += .004 + seeds[i] * .006; a[i * 3] += Math.sin(t * .5 + seeds[i] * 20) * .002;
      if (a[i * 3 + 1] > 7) a[i * 3 + 1] = -7;
    }
    geo.attributes.position.needsUpdate = true;
    dust.material.opacity = .55 + Math.sin(t * 1.3) * .2;
  };
}

// blask jak na konsoli: wszystko jasne lekko się rozlewa
export function makeComposer(renderer, scene, camera, strength = .9) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), strength, .5, .42);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return composer;
}
