/* Kookiya Flavors · Capsule Maracudja
   scene.js — Three.js icosaedre déformée Simplex + particules + split scroll trigger.
   Module ES, chargé via <script type="module">.
   Three.js r158+ via unpkg ESM. */

import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.min.js';

(() => {
  'use strict';

  // ─── Guards ──────────────────────────────────────────────
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    document.querySelectorAll('.hero__canvas[data-scene="maracudja"]').forEach(c => {
      c.style.display = 'none';
    });
    return;
  }

  const canvas = document.querySelector('.hero__canvas[data-scene="maracudja"]');
  if (!canvas) return;
  const hero = canvas.closest('.hero');
  if (!hero) return;

  // ─── Simplex 2D / pseudo-3D noise (Stefan Gustavson, public domain) ──
  const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let _seed = 5381;
  const _r = () => { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; };
  for (let i = 255; i > 0; i--) { const j = Math.floor(_r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const dot2 = (g, x, y) => g[0] * x + g[1] * y;
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const simplex2 = (xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - i + t;
    const y0 = yin - j + t;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = perm[ii + perm[jj]] % 12;
    const gi1 = perm[ii + i1 + perm[jj + j1]] % 12;
    const gi2 = perm[ii + 1 + perm[jj + 1]] % 12;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0*x0 - y0*y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * dot2(grad3[gi0], x0, y0); }
    let t1 = 0.5 - x1*x1 - y1*y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * dot2(grad3[gi1], x1, y1); }
    let t2 = 0.5 - x2*x2 - y2*y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * dot2(grad3[gi2], x2, y2); }
    return 70 * (n0 + n1 + n2);
  };
  const simplex3 = (x, y, z) => simplex2(x + z * 0.7, y + z * 0.5);

  // ─── Three.js setup ──────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(45, hero.clientWidth / hero.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 4);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(hero.clientWidth, hero.clientHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ─── Lights · ambient soft + warm directional + rim gold ─
  scene.add(new THREE.AmbientLight(0xFBF3E3, 0.4));

  const dirWarm = new THREE.DirectionalLight(0xF5A68A, 1.2);
  dirWarm.position.set(-3, 4, 2);
  scene.add(dirWarm);

  const rimGold = new THREE.DirectionalLight(0xC9933A, 0.5);
  rimGold.position.set(2, -1, -3);
  scene.add(rimGold);

  // ─── Sphère Maracudja · icosahedron + Simplex displacement
  const baseRadius = 1.2;
  const isSmallScreen = window.matchMedia('(max-width: 600px)').matches;
  const detailLevel = isSmallScreen ? 3 : 4;
  const fruitGeo = new THREE.IcosahedronGeometry(baseRadius, detailLevel);

  const positionAttr = fruitGeo.attributes.position;
  const iconPositions = new Float32Array(positionAttr.array);

  const fruitMat = new THREE.MeshPhysicalMaterial({
    color: 0x7A4A2E,
    roughness: 0.6,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    metalness: 0.1
  });
  const fruit = new THREE.Mesh(fruitGeo, fruitMat);
  scene.add(fruit);

  // ─── Inner core (révélé au split) ─────────────────────────
  const coreGeo = new THREE.SphereGeometry(0.55, 32, 24);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xD4A017,
    transparent: true,
    opacity: 0
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  // ─── Particules · 600 points dispersion sphérique r=4 ────
  const particleCount = 600;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleVelocities = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = Math.cbrt(Math.random()) * 4;
    particlePositions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    particlePositions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    particlePositions[i*3+2] = r * Math.cos(phi);
    particleVelocities[i*3]   = (Math.random() - 0.5) * 0.0008;
    particleVelocities[i*3+1] = (Math.random() - 0.5) * 0.0008;
    particleVelocities[i*3+2] = (Math.random() - 0.5) * 0.0008;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xD4A017,
    size: 0.015,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ─── Drag interaction (rotation + inertie 0.94) ──────────
  let dragging = false;
  let dragVelY = 0, dragVelX = 0;
  let lastX = 0, lastY = 0;

  const onPointerDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    dragVelY = (e.clientX - lastX) * 0.005;
    dragVelX = (e.clientY - lastY) * 0.003;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
  };

  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onPointerUp);

  // ─── Scroll trigger : split à 60% du scroll dans hero ────
  let splitAmount = 0;
  const updateSplit = () => {
    const rect = hero.getBoundingClientRect();
    const heroH = hero.offsetHeight;
    const progress = Math.max(0, Math.min(1, -rect.top / heroH));
    const trigger = 0.6;
    splitAmount = progress > trigger ? (progress - trigger) / (1 - trigger) : 0;
  };

  // ─── IntersectionObserver · pause hors viewport ──────────
  let isVisible = true;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { isVisible = e.isIntersecting; });
  }, { rootMargin: '120px' });
  obs.observe(hero);

  // ─── Animation loop (intégré gsap.ticker si dispo) ───────
  let time = 0;
  let lastFrameTime = performance.now();

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    time += dt;

    if (!isVisible) return;

    updateSplit();

    // Rotation (drag inertie + autonome)
    fruit.rotation.y += dragVelY;
    fruit.rotation.x += dragVelX;
    dragVelY *= 0.94;
    dragVelX *= 0.94;
    if (Math.abs(dragVelY) < 0.0001 && !dragging) {
      fruit.rotation.y += 0.0015;
    }

    // Flottement vertical (sin amplitude 0.05, période 4s)
    const floatY = Math.sin((time / 4) * Math.PI * 2) * 0.05;
    fruit.position.y = floatY;
    core.position.y = floatY;

    // Vertex displacement Simplex + split (Y axis)
    const positions = fruit.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const ox = iconPositions[i * 3];
      const oy = iconPositions[i * 3 + 1];
      const oz = iconPositions[i * 3 + 2];
      const noise = simplex3(ox * 1.3 + time * 0.05, oy * 1.3, oz * 1.3);
      const rNoise = baseRadius + noise * 0.06;
      const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
      let nx = ox / len * rNoise;
      let ny = oy / len * rNoise;
      let nz = oz / len * rNoise;
      ny += Math.sign(oy) * splitAmount * 0.3;
      positions.setXYZ(i, nx, ny, nz);
    }
    positions.needsUpdate = true;
    fruit.geometry.computeVertexNormals();

    // Reveal core (pulpe dorée)
    coreMat.opacity = splitAmount * 0.7;
    core.scale.setScalar(Math.max(0.3, 1 - splitAmount * 0.4));

    // Particules · drift + wrap
    const ppos = particleGeo.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      ppos[i*3]   += particleVelocities[i*3];
      ppos[i*3+1] += particleVelocities[i*3+1];
      ppos[i*3+2] += particleVelocities[i*3+2];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(ppos[i*3+a]) > 4.5) {
          ppos[i*3+a] = -Math.sign(ppos[i*3+a]) * 4;
        }
      }
    }
    particleGeo.attributes.position.needsUpdate = true;
    particles.rotation.y += 0.0003;

    renderer.render(scene, camera);
  };

  // rAF partagé GSAP si dispo, sinon natif
  if (window.gsap) {
    gsap.ticker.add(tick);
  } else {
    const loop = () => { tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ─── Resize ──────────────────────────────────────────────
  const onResize = () => {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);

})();
