// Visor 3D del modelo Revit — Baluarte de San Ignacio, Cartagena de Indias.
// Geometría: exportada sin modificaciones desde Revit (assets/modelo.glb, metros, +Y arriba, norte del proyecto = -Z).
// Información de elementos: assets/elements.json (nombre, categoría, tipo, nivel, fase, comentarios, ID de Revit).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = (id) => document.getElementById(id);
const D2R = Math.PI / 180;
const EYE = 1.65;          // altura de los ojos en recorrido (m)
const STEP_UP = 0.45;      // escalón máximo que se puede subir (m)
const MAX_DROP = 0.9;      // desnivel máximo que se puede bajar sin bloquear (m)
const RADIUS = 0.3;        // radio del peatón (m)

// ---------------------------------------------------------------- calidad según dispositivo
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowEnd = isTouch || (navigator.hardwareConcurrency || 4) <= 4 || Math.min(screen.width, screen.height) < 700;
const quality = { dpr: Math.min(devicePixelRatio || 1, lowEnd ? 1.5 : 2), shadow: lowEnd ? 2048 : 4096 };

// ---------------------------------------------------------------- renderer / escena
const container = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 5 });
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfd8de, 700, 3200);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.25, 9000);
camera.position.set(0, 300, 300);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 3;
controls.maxDistance = 1400;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.listenToKeyEvents(window);
controls.keyPanSpeed = 18;

// ---------------------------------------------------------------- posproceso: oclusión ambiental + corrección de color
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * quality.dpr, innerHeight * quality.dpr, { type: THREE.HalfFloatType, samples: lowEnd ? 0 : 4 }));
composer.setPixelRatio(quality.dpr);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (!lowEnd) {
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 3.0, distanceExponent: 1.2, thickness: 3.0, scale: 1.0, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);
}
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.14 }, con: { value: 1.07 }, vig: { value: 0.22 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, con, vig; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, sat); c.rgb = (c.rgb - 0.5) * con + 0.5;
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vig * dot(d, d) * 2.0; gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a); }`,
});
composer.addPass(grade);
function setDpr(pr) { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }

// ---------------------------------------------------------------- cielo, sol, ambiente
const sky = new Sky();
sky.scale.setScalar(20000);
scene.add(sky);
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(1000);
envScene.add(envSky);
for (const s of [sky, envSky]) {
  const u = s.material.uniforms;
  u.turbidity.value = 4.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
}
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(quality.shadow, quality.shadow);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfe9f3, 0x8a7d68, 0.35);
scene.add(hemi);

const LAT = 10.42 * D2R, LON = -75.55, TZ = -5;            // Cartagena de Indias
const DOY = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355];
function sunDirection(month, hour) {
  const g = (2 * Math.PI / 365) * (DOY[month - 1] - 1 + (hour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const tst = hour * 60 + eqt + 4 * LON - 60 * TZ;
  const ha = (tst / 4 - 180) * D2R;
  const cz = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha);
  const el = Math.PI / 2 - Math.acos(Math.max(-1, Math.min(1, cz)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT)) + Math.PI;
  // este = +X, norte = -Z
  return { dir: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize(), el };
}

const sceneCenter = new THREE.Vector3();
let sceneRadius = 200;
let envTimer = 0;
function updateSun() {
  const hour = parseFloat($('time').value), month = parseInt($('month').value, 10);
  const h = Math.floor(hour), m = Math.round((hour - h) * 60);
  $('time-out').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const { dir, el } = sunDirection(month, hour);
  const up = Math.max(el, 0.02);
  sky.material.uniforms.sunPosition.value.copy(dir);
  envSky.material.uniforms.sunPosition.value.copy(dir);
  sun.position.copy(sceneCenter).addScaledVector(dir, 600);
  sun.target.position.copy(sceneCenter);
  const warm = THREE.MathUtils.clamp(up / (25 * D2R), 0, 1);
  sun.color.setRGB(1, 0.78 + 0.22 * warm, 0.6 + 0.4 * warm);
  sun.intensity = 3.4 * THREE.MathUtils.clamp(Math.sin(up) * 2.2, 0.15, 1);
  hemi.intensity = 0.2 + 0.25 * warm;
  clearTimeout(envTimer);
  envTimer = setTimeout(() => {
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
  }, 60);
}
function fitShadow() {
  const r = Math.min(sceneRadius, 220);
  const c = sun.shadow.camera;
  c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 50; c.far = 1400;
  c.updateProjectionMatrix();
}
scene.environmentIntensity = 0.32;

// ---------------------------------------------------------------- utilidades de cajas
function boxFromView(b) { return new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])); }
let ELEMENTS = [], byIndex = new Map(), byId = new Map();
function unionWhere(pred) {
  const box = new THREE.Box3();
  for (const e of ELEMENTS) if (e.bbox_view && pred(e)) box.union(boxFromView(e.bbox_view));
  return box.isEmpty() ? null : box;
}
const nameStarts = (...p) => (e) => p.some((s) => (e.name || '').toLowerCase().startsWith(s.toLowerCase()));
const nameHas = (...p) => (e) => p.some((s) => (e.name || '').toLowerCase().includes(s.toLowerCase()));

// ---------------------------------------------------------------- carga
const meshes = [];
const walkMeshes = [];
const modelRoot = new THREE.Group();
scene.add(modelRoot);
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;

function setLoader(p, text) {
  if (p != null) $('loader-bar').style.width = `${Math.round(p * 100)}%`;
  if (text) $('loader-text').textContent = text;
}

async function load() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const dataP = fetch('assets/elements.json').then((r) => { if (!r.ok) throw new Error('elements.json ' + r.status); return r.json(); });
  const gltf = await loader.loadAsync('assets/modelo.glb', (ev) => {
    if (ev.total) setLoader(0.05 + 0.75 * (ev.loaded / ev.total), `Cargando modelo… ${(ev.loaded / 1048576).toFixed(1)} / ${(ev.total / 1048576).toFixed(1)} MB`);
    else setLoader(null, `Cargando modelo… ${(ev.loaded / 1048576).toFixed(1)} MB`);
  });
  const data = await dataP;
  ELEMENTS = data.elements;
  for (const e of ELEMENTS) { byIndex.set(e.i, e); byId.set(e.id, e); }

  setLoader(0.82, 'Preparando geometría…');
  await frame();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const ud = o.userData || {};
    o.userData.layer = ud.layer || 'Otros';
    o.userData.status = ud.status || 'Existente';
    // Posiciones cuantizadas -> Float32 en el mismo espacio local (la transformación del nodo se conserva).
    const pa = o.geometry.attributes.position;
    if (!(pa.array instanceof Float32Array) || pa.normalized) {
      const f = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) { f[i * 3] = pa.getX(i); f[i * 3 + 1] = pa.getY(i); f[i * 3 + 2] = pa.getZ(i); }
      o.geometry.setAttribute('position', new THREE.BufferAttribute(f, 3));
    }
    const mat = o.material;
    const mname = (mat.name || '').toLowerCase();
    const water = mname.includes('agua');
    const glass = mat.transparent || mname.includes('vidrio') || mname.includes('glass');
    if (glass) { mat.depthWrite = false; }
    o.castShadow = !water && !glass;
    o.receiveShadow = true;
    o.userData.water = water;
    o.userData.origMat = mat;
    meshes.push(o);
    if (o.userData.layer !== 'Vegetación' && !glass) walkMeshes.push(o);
  });
  modelRoot.add(gltf.scene);
  modelRoot.updateMatrixWorld(true);

  // Centro de interés: conjunto patrimonial + propuesta (cajas de elementos reales)
  const focus = unionWhere((e) => /^(museo naval|fachada museo naval|muralla|pabellon|rampa|contexto - iglesia)/i.test(e.name || ''))
    || new THREE.Box3().setFromObject(modelRoot);
  focus.getCenter(sceneCenter);
  sceneRadius = focus.getSize(new THREE.Vector3()).length() / 2;
  fitShadow();
  updateSun();

  buildTrees();
  buildLayers();
  applyVisibility();
  buildLabels();
  // Las vistas necesitan raycast (acceso peatonal): primero se construye el BVH de la rampa.
  for (const m of meshes) if (m.userData.layer === 'Rampas') m.geometry.computeBoundsTree();
  buildViews();
  setLoader(1, 'Listo');
  goView(0, true);
  $('loader').classList.add('done');
  loadTextures(data.texsets);
  // BVH del resto en segundo plano: selección y recorrido quedan listos en unos segundos.
  for (let i = 0; i < meshes.length; i++) {
    if (!meshes[i].geometry.boundsTree) meshes[i].geometry.computeBoundsTree();
    if (i % 4 === 0) await frame();
  }
  navReady = true;
}
let navReady = false;

// ---------------------------------------------------------------- vegetación
// Los árboles de Revit son familias RPC (planos cruzados al exportar). Se dibujan en 3D en la posición,
// altura y ancho exactos de cada ejemplar del modelo; la especie (palma / copa) sale de la familia RPC.
const treeMeshes = [];
const treeBoxes = new THREE.Group();
function seeded(i) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function palmGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.016, 0.024, 0.86, 7, 6, true);
  trunk.translate(0, 0.43, 0);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + 0.03 * Math.sin(y * 3.2)); }
  parts.push({ g: trunk, c: [0.36, 0.32, 0.27] });
  const n = 14;
  for (let k = 0; k < n; k++) {
    const leaf = new THREE.PlaneGeometry(0.06, 0.42, 1, 8);
    leaf.translate(0, 0.21, 0);
    const lp = leaf.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const y = lp.getY(i), t = y / 0.42;
      lp.setX(i, lp.getX(i) * (1 - t * 0.85));
      lp.setZ(i, -0.28 * t * t);
    }
    leaf.rotateX(-Math.PI / 2 + 0.55 + (k % 3) * 0.18);
    leaf.rotateY((k / n) * Math.PI * 2 + (k % 2) * 0.2);
    leaf.translate(0.03 * Math.sin(0.86 * 3.2), 0.85, 0);
    parts.push({ g: leaf, c: k % 2 ? [0.11, 0.22, 0.06] : [0.15, 0.28, 0.07] });
  }
  return mergeColored(parts);
}
function broadleafGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.03, 0.05, 0.42, 7, 1, true);
  trunk.translate(0, 0.21, 0);
  parts.push({ g: trunk, c: [0.38, 0.32, 0.26] });
  const blobs = [[0, 0.62, 0, 0.36], [0.2, 0.55, 0.08, 0.26], [-0.18, 0.57, -0.1, 0.27], [0.06, 0.78, -0.12, 0.24], [-0.08, 0.72, 0.18, 0.25], [0.16, 0.7, -0.2, 0.2], [-0.22, 0.68, 0.12, 0.2]];
  blobs.forEach(([x, y, z, r], k) => {
    const s = new THREE.IcosahedronGeometry(r, 2);
    const sp = s.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(sp, i);
      const nrm = 1 + 0.16 * Math.sin(v.x * 31 + k) * Math.sin(v.y * 27) * Math.cos(v.z * 29);
      sp.setXYZ(i, v.x * nrm, v.y * nrm * 0.82, v.z * nrm);
    }
    s.translate(x, y, z);
    const g = 0.2 + 0.07 * seeded(k);
    parts.push({ g: s, c: [0.07 + 0.04 * seeded(k + 3), g, 0.05] });
  });
  return mergeColored(parts);
}
function mergeColored(parts) {
  let n = 0; for (const p of parts) n += p.g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const { g, c } of parts) {
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (const i of gi) idx.push(i + o);
    for (let i = 0; i < g.attributes.position.count; i++) {
      pos.set([g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)], (o + i) * 3);
      col.set(c, (o + i) * 3);
    }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}
function buildTrees() {
  const veg = ELEMENTS.filter((e) => e.category === 'Vegetación' && e.bbox_view);
  if (!veg.length) return;
  const isPalm = (e) => /tropical|palm|palma/i.test(`${e.family} ${e.type} ${e.name}`);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  for (const [kind, list] of [['palm', veg.filter(isPalm)], ['broad', veg.filter((e) => !isPalm(e))]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(kind === 'palm' ? palmGeometry() : broadleafGeometry(), mat, list.length);
    im.castShadow = true; im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach((e, i) => {
      const b = e.bbox_view;
      const H = b[4] - b[1], W = Math.max(b[3] - b[0], b[5] - b[2]);
      p.set((b[0] + b[3]) / 2, b[1], (b[2] + b[5]) / 2);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seeded(e.id) * Math.PI * 2);
      const wx = kind === 'palm' ? W / 0.78 : W / 0.8;
      s.set(wx, H, wx);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
      const v = 0.85 + 0.3 * seeded(e.id + 7);
      im.setColorAt(i, col.setRGB(v, v, v));
    });
    im.userData.treeIndex = list.map((e) => e.i);
    im.userData.layer = 'Vegetación';
    im.computeBoundingSphere();
    scene.add(im);
    treeMeshes.push(im);
  }
}
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Carga progresiva de texturas PBR CC0 (el modelo ya se ve con los colores de Revit mientras tanto).
async function loadTextures(sets) {
  if (!sets) return;
  const tl = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cache = new Map();
  const get = (url, srgb) => {
    if (!cache.has(url)) {
      cache.set(url, tl.loadAsync(url).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false; t.anisotropy = aniso;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
      }).catch(() => null));
    }
    return cache.get(url);
  };
  const mats = new Set(meshes.map((m) => m.userData.origMat));
  let done = 0;
  const jobs = [...mats].filter((m) => m.userData && m.userData.texset && sets[m.userData.texset]).map(async (m) => {
    const s = sets[m.userData.texset];
    const [c, n, r] = await Promise.all([get(s.color, true), get(s.normal, false), get(s.rough, false)]);
    if (c) m.map = c;
    if (n) { m.normalMap = n; m.normalScale.set(0.9, 0.9); }
    if (r) { m.roughnessMap = r; m.roughness = 1; }
    m.needsUpdate = true;
    done++;
  });
  await Promise.all(jobs);
  toast(`Texturas cargadas (${done} materiales)`);
}

// ---------------------------------------------------------------- capas
const layerOn = {}, statusOn = { Existente: true, Propuesta: true };
let colorByStatus = false, isolate = false;
const matExist = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.92, side: THREE.DoubleSide });
const matProp = new THREE.MeshStandardMaterial({ color: 0xd9772b, roughness: 0.65, side: THREE.DoubleSide });
function buildLayers() {
  const counts = {};
  for (const e of ELEMENTS) counts[e.category] = (counts[e.category] || 0) + 1;
  const layers = [...new Set(meshes.map((m) => m.userData.layer))].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  const list = $('layer-list');
  list.innerHTML = '';
  for (const l of layers) {
    layerOn[l] = true;
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `<input type="checkbox" checked> <span></span><span class="count"></span>`;
    row.children[1].textContent = l;
    row.children[2].textContent = counts[l] || '';
    row.querySelector('input').addEventListener('change', (ev) => { layerOn[l] = ev.target.checked; applyVisibility(); });
    list.appendChild(row);
  }
}
function applyVisibility() {
  for (const m of meshes) {
    const veg = m.userData.layer === 'Vegetación' && treeMeshes.length;   // reemplazada por los árboles 3D
    m.visible = !veg && !isolate && layerOn[m.userData.layer] !== false && statusOn[m.userData.status] !== false;
  }
  for (const t of treeMeshes) t.visible = !isolate && layerOn['Vegetación'] !== false && statusOn.Existente !== false;
  isoGroup.visible = isolate;
}
function applyColorMode() {
  for (const m of meshes) {
    if (!colorByStatus || m.userData.water) m.material = m.userData.origMat;
    else m.material = m.userData.status === 'Propuesta' ? matProp : matExist;
  }
  $('color-mat').classList.toggle('on', !colorByStatus);
  $('color-status').classList.toggle('on', colorByStatus);
  $('status-legend').hidden = !colorByStatus;
}
$('color-mat').onclick = () => { colorByStatus = false; applyColorMode(); };
$('color-status').onclick = () => { colorByStatus = true; applyColorMode(); };
$('show-exist').onchange = (e) => { statusOn.Existente = e.target.checked; applyVisibility(); };
$('show-prop').onchange = (e) => { statusOn.Propuesta = e.target.checked; applyVisibility(); };
$('show-labels').onchange = (e) => document.body.classList.toggle('no-labels', !e.target.checked);

// ---------------------------------------------------------------- etiquetas (nombres del modelo)
const LABELS = [
  { text: 'Museo Naval', pred: nameStarts('Museo Naval', 'Fachada Museo Naval') },
  { text: 'Baluarte San Ignacio', pred: nameHas('Baluarte San Ignacio') },
  { text: 'Muralla - Garita 1', pred: (e) => e.name === 'Muralla - Garita 1' },
  { text: 'Muralla - Garita 2', pred: (e) => e.name === 'Muralla - Garita 2' },
  { text: 'Muralla - Garita 3', pred: (e) => e.name === 'Muralla - Garita 3' },
  { text: 'Muralla San Juan Evangelista - Torre del Reloj', pred: nameStarts('Muralla San Juan Evangelista') },
  { text: 'Contexto - Iglesia con domo', pred: nameStarts('Contexto - Iglesia') },
  { text: 'Pabellon', pred: nameStarts('Pabellon'), prop: true },
  { text: 'Rampa de marmol', pred: (e) => e.id === 877166, prop: true, lift: 7 },
];
function buildLabels() {
  for (const L of LABELS) {
    const box = unionWhere(L.pred);
    if (!box) continue;
    const div = document.createElement('div');
    div.className = 'label' + (L.prop ? ' prop' : '');
    div.textContent = L.text;
    div.title = 'Ir a ' + L.text;
    div.addEventListener('click', (ev) => { ev.stopPropagation(); frameBox(box); });
    const obj = new CSS2DObject(div);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(c.x, box.max.y + (L.lift || 2), c.z);
    scene.add(obj);
  }
}

// ---------------------------------------------------------------- vistas predeterminadas (apuntan a cajas reales del modelo)
let VIEWS = [];
function buildViews() {
  const B = {
    museo: unionWhere(nameStarts('Museo Naval', 'Fachada Museo Naval')),
    baluarte: unionWhere(nameHas('Baluarte San Ignacio')),
    cortina: unionWhere(nameHas('Cortina hacia cortadura')),
    pabellon: unionWhere(nameStarts('Pabellon')),
    rampa: byId.has(877166) ? boxFromView(byId.get(877166).bbox_view) : null,
  };
  const all = new THREE.Box3();
  for (const k of ['museo', 'baluarte', 'cortina', 'pabellon']) if (B[k]) all.union(B[k]);
  const ctr = (b) => b.getCenter(new THREE.Vector3());
  const size = (b) => b.getSize(new THREE.Vector3());
  const heritage = new THREE.Box3(); if (B.museo) heritage.union(B.museo); if (B.baluarte) heritage.union(B.baluarte);
  const pab = B.pabellon || B.rampa || all;
  const ramp = B.rampa || pab;
  const conn = new THREE.Box3().copy(pab); if (B.cortina) conn.union(B.cortina); if (B.rampa) conn.union(B.rampa);

  VIEWS = [
    () => { const c = ctr(all), s = size(all); const d = Math.max(s.x, s.z); return { pos: c.clone().add(new THREE.Vector3(0, d * 1.05, d * 0.42)), target: c }; },
    () => { const c = ctr(heritage), s = size(heritage); const d = Math.max(s.x, s.z) * 0.78; const t = c.clone().add(new THREE.Vector3(-s.x * 0.08, 0, s.z * 0.12));
            return { pos: t.clone().add(new THREE.Vector3(d * 0.42, d * 0.38, d * 0.82)), target: t }; },
    () => { const c = ctr(pab), s = size(pab); const t = new THREE.Vector3(c.x, pab.min.y + s.y * 0.45, c.z); return { pos: new THREE.Vector3(c.x + s.x * 0.15, t.y + 3, pab.max.z + Math.max(s.x, 18) * 1.5), target: t }; },
    () => { const c = ctr(ramp), s = size(ramp); const alongX = s.x >= s.z; const t = new THREE.Vector3(c.x, c.y, c.z);
            const off = alongX ? new THREE.Vector3(0, 2.5, s.z / 2 + Math.max(s.x, 10) * 1.25) : new THREE.Vector3(s.x / 2 + Math.max(s.z, 10) * 1.25, 2.5, 0);
            return { pos: t.clone().add(off), target: t }; },
    () => pedestrianStart(ramp),
    () => { const c = ctr(conn), s = size(conn); const d = Math.max(s.x, s.z) * 1.35; return { pos: c.clone().add(new THREE.Vector3(0.02, d, 0.05)), target: c }; },
  ];
}

// Acceso peatonal: punto más bajo de la superficie de la rampa (muestreo sobre la geometría real).
function pedestrianStart(rampBox) {
  const rampMeshes = meshes.filter((m) => m.userData.layer === 'Rampas');
  let low = null, high = null;
  const n = 12, o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i <= n; i++) for (let j = 0; j <= 4; j++) {
    o.set(THREE.MathUtils.lerp(rampBox.min.x, rampBox.max.x, i / n), rampBox.max.y + 5, THREE.MathUtils.lerp(rampBox.min.z, rampBox.max.z, j / 4));
    raycaster.set(o, down); raycaster.far = 40;
    const h = raycaster.intersectObjects(rampMeshes, false)[0];
    if (!h) continue;
    if (!low || h.point.y < low.y) low = h.point.clone();
    if (!high || h.point.y > high.y) high = h.point.clone();
  }
  const c = rampBox.getCenter(new THREE.Vector3());
  if (!low) low = new THREE.Vector3(rampBox.min.x, rampBox.min.y, c.z);
  if (!high) high = c;
  const away = new THREE.Vector3(low.x - c.x, 0, low.z - c.z);
  if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
  away.normalize();
  let p = low.clone().addScaledVector(away, 2.5);
  const g = groundAt(p.x, p.z, low.y + 2);
  p.y = (g ? g.y : low.y);
  const look = new THREE.Vector3(high.x, high.y + EYE, high.z);
  return { pos: new THREE.Vector3(p.x, p.y + EYE, p.z), target: look, walk: true };
}

// ---------------------------------------------------------------- animación de cámara
let fly = null;
function goView(i, instant) {
  if (!VIEWS[i]) return;
  const v = VIEWS[i]();
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', +b.dataset.view === i));
  if (v.walk) { setMode('walk', v); return; }
  if (mode === 'walk') setMode('orbit');
  flyTo(v.pos, v.target, instant ? 0 : 1.4);
}
function flyTo(pos, target, dur = 1.2) {
  if (!dur) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return; }
  fly = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone() };
}
function frameBox(box) {
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 4);
  const dist = r / Math.sin((camera.fov * D2R) / 2) * 1.1;
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.25) { dir.y = 0.35; dir.normalize(); }
  if (mode === 'walk') setMode('orbit');
  flyTo(c.clone().addScaledVector(dir, dist), c);
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------- recorrido peatonal
let mode = 'orbit';
const walk = { yaw: 0, pitch: 0, feet: 0, keys: {}, joy: new THREE.Vector2(), locked: false };
function groundAt(x, z, fromY, objs = walkMeshes) {
  raycaster.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  raycaster.far = 80;
  const h = raycaster.intersectObjects(objs, false)[0];
  return h ? { y: h.point.y, water: !!h.object.userData.water } : null;
}
function blocked(from, dirXZ, dist) {
  const d = dirXZ.clone().normalize();
  for (const hgt of [0.55, 1.2]) {
    raycaster.set(new THREE.Vector3(from.x, walk.feet + hgt, from.z), d);
    raycaster.far = dist + RADIUS;
    if (raycaster.intersectObjects(walkMeshes, false).length) return true;
  }
  return false;
}
function tryMove(delta) {
  const pos = camera.position;
  for (const cand of [delta, new THREE.Vector3(delta.x, 0, 0), new THREE.Vector3(0, 0, delta.z)]) {
    const len = Math.hypot(cand.x, cand.z);
    if (len < 1e-5) continue;
    if (blocked(pos, cand, len)) continue;
    const g = groundAt(pos.x + cand.x, pos.z + cand.z, walk.feet + STEP_UP + 0.15);
    if (!g || g.water) continue;
    if (g.y > walk.feet + STEP_UP || g.y < walk.feet - MAX_DROP) continue;
    pos.x += cand.x; pos.z += cand.z;
    walk.feet = g.y;
    return;
  }
}
function setMode(m, start) {
  if (m === 'walk' && !navReady) { toast('Preparando el recorrido… un momento'); return; }
  mode = m;
  $('mode-orbit').classList.toggle('on', m === 'orbit');
  $('mode-walk').classList.toggle('on', m === 'walk');
  controls.enabled = m === 'orbit';
  $('walk-hint').hidden = m !== 'walk' || isTouch;
  $('joystick').hidden = !(m === 'walk' && isTouch);
  fly = null;
  if (m === 'walk') {
    let p, look;
    if (start) { p = start.pos.clone(); look = start.target; }
    else {
      const t = controls.target.clone();
      const g = groundAt(t.x, t.z, t.y + 60);
      if (!g || g.water) { goView(4); return; }
      p = new THREE.Vector3(t.x, g.y + EYE, t.z);
      const d = t.clone().sub(camera.position); d.y = 0;
      look = p.clone().add(d.lengthSq() > 1e-4 ? d.normalize() : new THREE.Vector3(0, 0, -1));
    }
    const g = groundAt(p.x, p.z, p.y);
    walk.feet = g ? g.y : p.y - EYE;
    camera.position.set(p.x, walk.feet + EYE, p.z);
    const d = look.clone().sub(camera.position);
    walk.yaw = Math.atan2(-d.x, -d.z);
    walk.pitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -1.2, 1.2);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(walk.pitch, walk.yaw, 0);
  } else {
    if (document.pointerLockElement) document.exitPointerLock();
    const f = new THREE.Vector3(); camera.getWorldDirection(f);
    controls.target.copy(camera.position).addScaledVector(f, 25);
    controls.update();
  }
}
function updateWalk(dt) {
  const k = walk.keys;
  const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + walk.joy.y;
  const str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + walk.joy.x;
  const speed = (k.ShiftLeft || k.ShiftRight ? 4.2 : 1.5);
  if (fwd || str) {
    const f = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const mv = f.multiplyScalar(fwd).add(r.multiplyScalar(str));
    if (mv.lengthSq() > 1) mv.normalize();
    const total = mv.multiplyScalar(speed * dt);
    const steps = Math.ceil(total.length() / 0.25);
    const part = total.clone().divideScalar(Math.max(steps, 1));
    for (let i = 0; i < steps; i++) tryMove(part);
  }
  const targetY = walk.feet + EYE;
  camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 10);
  camera.rotation.set(walk.pitch, walk.yaw, 0);
}
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select')) return;
  walk.keys[e.code] = true;
  if (mode === 'walk' && e.code.startsWith('Arrow')) e.preventDefault();
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '6') goView(+k - 1);
  else if (k === 'o') setMode('orbit');
  else if (k === 'r') setMode('walk');
  else if (e.code === 'Home') goView(0);
  else if (k === 'f') toggleFull();
  else if (k === 'h') toggleUI();
  else if (k === 'p') capture('1');
});
addEventListener('keyup', (e) => { walk.keys[e.code] = false; });
addEventListener('blur', () => { walk.keys = {}; });
document.addEventListener('pointerlockchange', () => { walk.locked = document.pointerLockElement === renderer.domElement; });
document.addEventListener('mousemove', (e) => {
  if (mode !== 'walk' || !walk.locked) return;
  walk.yaw -= e.movementX * 0.0022;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - e.movementY * 0.0022, -1.3, 1.3);
});
// mirar arrastrando (táctil o ratón sin bloqueo)
let lookDrag = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode === 'walk' && !walk.locked) lookDrag = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
addEventListener('pointermove', (e) => {
  if (!lookDrag || e.pointerId !== lookDrag.id) return;
  walk.yaw -= (e.clientX - lookDrag.x) * 0.005;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - lookDrag.y) * 0.005, -1.3, 1.3);
  lookDrag.x = e.clientX; lookDrag.y = e.clientY;
});
addEventListener('pointerup', () => { lookDrag = null; });
// joystick táctil
(() => {
  const pad = $('joystick'), stick = $('stick');
  let id = null;
  const move = (e) => {
    const r = pad.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    walk.joy.set(x, -y);
    stick.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
  };
  pad.addEventListener('pointerdown', (e) => { id = e.pointerId; pad.setPointerCapture(id); move(e); e.stopPropagation(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; walk.joy.set(0, 0); stick.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
})();
$('mode-orbit').onclick = () => setMode('orbit');
$('mode-walk').onclick = () => setMode('walk');

// ---------------------------------------------------------------- selección
const hlGroup = new THREE.Group(), isoGroup = new THREE.Group();
isoGroup.visible = false;
scene.add(hlGroup, isoGroup);
const hlMat = new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
let selected = null;
function clearSelection() {
  for (const g of [hlGroup, isoGroup]) { for (const c of [...g.children]) { c.geometry.dispose(); g.remove(c); } }
  selected = null;
  $('info').hidden = true;
  if (isolate) { isolate = false; $('info-isolate').classList.remove('on'); applyVisibility(); }
}
function select(ei) {
  clearSelection();
  const e = byIndex.get(ei);
  if (!e) return;
  selected = e;
  if (e.category === 'Vegetación' && treeMeshes.length && e.bbox_view) {
    const bh = new THREE.Box3Helper(boxFromView(e.bbox_view), 0xffb36b);
    bh.geometry = bh.geometry.clone();
    hlGroup.add(bh);
    showInfo(e);
    return;
  }
  for (const m of meshes) {
    const eid = m.geometry.attributes._elemid;
    if (!eid) continue;
    const idx = m.geometry.index.array, pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv, nrm = m.geometry.attributes.normal;
    const P = [], U = [], N = [];
    for (let t = 0; t < idx.length; t += 3) {
      if (eid.array[idx[t]] !== ei) continue;
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k];
        P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        if (uv) U.push(uv.getX(v), uv.getY(v));
        if (nrm) N.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
      }
    }
    if (!P.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (U.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (N.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else g.computeVertexNormals();
    const h = new THREE.Mesh(g, hlMat); h.matrixAutoUpdate = false; h.matrix.copy(m.matrixWorld); h.renderOrder = 2;
    hlGroup.add(h);
    const iso = new THREE.Mesh(g, m.material); iso.matrixAutoUpdate = false; iso.matrix.copy(m.matrixWorld); iso.castShadow = iso.receiveShadow = true;
    isoGroup.add(iso);
  }
  showInfo(e);
}
function fmt(n) { return n.toLocaleString('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
function showInfo(e) {
  $('info-name').textContent = e.name || '(sin nombre)';
  const chip = $('info-status');
  chip.textContent = e.status;
  chip.className = 'chip' + (e.status === 'Propuesta' ? ' prop' : '');
  const rows = [
    ['Categoría', e.category], ['Familia', e.family], ['Tipo', e.type], ['Nivel', e.level],
    ['Fase (Revit)', e.phase], ['Comentarios', e.comments], ['ID Revit', String(e.id)],
  ];
  if (e.bbox_revit_m) {
    const b = e.bbox_revit_m;
    rows.push(['Caja envolvente', `${fmt(b[3] - b[0])} × ${fmt(b[4] - b[1])} × ${fmt(b[5] - b[2])} m`]);
    rows.push(['Cota inferior / superior', `${fmt(b[2])} / ${fmt(b[5])} m`]);
  }
  const dl = $('info-list');
  dl.innerHTML = '';
  for (const [k, v] of rows) {
    if (v == null || v === '') continue;
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  $('info').hidden = false;
}
$('info-close').onclick = clearSelection;
$('info-frame').onclick = () => { if (selected && selected.bbox_view) frameBox(boxFromView(selected.bbox_view)); };
$('info-isolate').onclick = () => {
  if (!selected) return;
  isolate = !isolate;
  $('info-isolate').classList.toggle('on', isolate);
  hlGroup.visible = !isolate;
  applyVisibility();
  if (isolate && selected.bbox_view) frameBox(boxFromView(selected.bbox_view));
};
const ndc = new THREE.Vector2();
function pickAt(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = 6000;
  const vis = isolate ? [] : [...meshes.filter((m) => m.visible), ...treeMeshes.filter((t) => t.visible)];
  const hits = raycaster.intersectObjects(vis, false);
  return hits[0] || null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 6 || dt > 450) return;
  if (mode === 'walk' && !isTouch) { if (!walk.locked) renderer.domElement.requestPointerLock(); return; }
  if (!navReady) { toast('Preparando la selección… un momento'); return; }
  const hit = pickAt(e.clientX, e.clientY);
  if (!hit) { clearSelection(); return; }
  if (hit.object.userData.treeIndex && hit.instanceId != null) { select(hit.object.userData.treeIndex[hit.instanceId]); return; }
  const eid = hit.object.geometry.attributes._elemid;
  const v = hit.face ? hit.face.a : null;
  if (eid && v != null) select(eid.array[v]);
});
renderer.domElement.addEventListener('dblclick', (e) => {
  if (mode !== 'orbit') return;
  const hit = pickAt(e.clientX, e.clientY);
  if (!hit) return;
  const off = camera.position.clone().sub(controls.target);
  flyTo(hit.point.clone().add(off.multiplyScalar(0.6)), hit.point, 0.8);
});

// ---------------------------------------------------------------- interfaz general
document.querySelectorAll('#rail button').forEach((b) => {
  b.addEventListener('click', () => {
    const id = b.dataset.panel;
    document.querySelectorAll('.panel').forEach((p) => { if (p.id !== id && p.id !== 'shot-menu') p.hidden = true; });
    const p = $(id); p.hidden = !p.hidden;
    document.querySelectorAll('#rail button').forEach((x) => x.classList.toggle('on', x === b && !p.hidden));
  });
});
document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => goView(+b.dataset.view)));
$('btn-reset').onclick = () => goView(0);
function toggleFull() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => toast('Pantalla completa no disponible'));
  else document.exitFullscreen?.();
}
$('btn-full').onclick = toggleFull;
function toggleUI() {
  const hidden = document.body.classList.toggle('ui-hidden');
  $('btn-show').hidden = !hidden;
}
$('btn-hide').onclick = toggleUI;
$('btn-show').onclick = toggleUI;
$('time').oninput = updateSun;
$('month').onchange = updateSun;
$('exposure').oninput = (e) => { renderer.toneMappingExposure = parseFloat(e.target.value); };
$('shadows').onchange = (e) => { sun.castShadow = e.target.checked; };
$('month').value = String(new Date().getMonth() + 1);
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

// ---------------------------------------------------------------- captura
$('btn-shot').onclick = () => { $('shot-menu').hidden = !$('shot-menu').hidden; };
document.querySelectorAll('#shot-menu button').forEach((b) => b.addEventListener('click', () => { $('shot-menu').hidden = true; capture(b.dataset.scale); }));
function capture(mode) {
  const gl = renderer.getContext();
  const maxDim = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0]);
  const w = innerWidth, h = innerHeight;
  let pr = renderer.getPixelRatio();
  if (mode === '2') pr = 2;
  else if (mode === '4K') pr = 3840 / w;
  else if (mode === '8K') pr = 7680 / w;
  let note = '';
  if (w * pr > maxDim || h * pr > maxDim) { pr = Math.floor(Math.min(maxDim / w, maxDim / h) * 100) / 100; note = ` (limitada a ${Math.round(w * pr)} px por la GPU)`; }
  const old = renderer.getPixelRatio();
  try {
    setDpr(pr);
    composer.render();
    renderer.domElement.toBlob((blob) => {
      if (!blob) { toast('No se pudo generar la captura'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `san-ignacio-${Math.round(w * pr)}x${Math.round(h * pr)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`Captura ${Math.round(w * pr)}×${Math.round(h * pr)} px${note}`);
    }, 'image/png');
  } catch (err) {
    toast('La captura falló en este navegador');
  } finally {
    setDpr(old);
  }
}

// ---------------------------------------------------------------- bucle
const clock = new THREE.Clock();
const needle = $('needle');
const tmpDir = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0, fpsT = 0;
function loop() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (fly) {
    fly.t += dt / fly.dur;
    const k = ease(Math.min(fly.t, 1));
    camera.position.lerpVectors(fly.p0, fly.p1, k);
    controls.target.lerpVectors(fly.t0, fly.t1, k);
    if (fly.t >= 1) fly = null;
  }
  if (mode === 'walk') updateWalk(dt); else controls.update();
  camera.getWorldDirection(tmpDir);
  needle.style.transform = `rotate(${-Math.atan2(tmpDir.x, -tmpDir.z) / D2R}deg)`;
  composer.render();
  labelRenderer.render(scene, camera);
  // adaptación de calidad: primero quita la oclusión ambiental, luego baja la resolución interna
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 3) {
    const fps = fpsN / fpsAcc;
    if (fps < 28) {
      if (gtao && gtao.enabled) gtao.enabled = false;
      else if (renderer.getPixelRatio() > 0.8) setDpr(Math.max(0.8, renderer.getPixelRatio() - 0.25));
    }
    fpsAcc = fpsN = fpsT = 0;
  }
  requestAnimationFrame(loop);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
});

updateSun();
loop();
load().catch((err) => {
  console.error(err);
  setLoader(null, 'No se pudo cargar el modelo: ' + err.message);
});
window.__visor = { scene, camera, controls, meshes, ELEMENTS: () => ELEMENTS, goView, setMode, select, byId, walk, groundAt };
