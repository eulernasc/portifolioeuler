import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const ASSET_ROOT = 'assets/3d/character/';
const MANIFEST_URL = `${ASSET_ROOT}model-manifest.json`;

const projects = [
  { name: 'Ignis', href: 'projeto-ignis.html', color: 0xff7a35, position: new THREE.Vector3(-6.6, 0, -8.8) },
  { name: 'MC Bem Estar', href: 'projeto-mc-bem-estar.html', color: 0xd8a84c, position: new THREE.Vector3(-2.2, 0, -10.2) },
  { name: 'Pão de Cleide', href: 'projeto-pao-de-cleide.html', color: 0xd49061, position: new THREE.Vector3(2.2, 0, -10.2) },
  { name: 'Amanda Construction', href: 'projeto-amanda.html', color: 0xe34a5c, position: new THREE.Vector3(6.6, 0, -8.8) }
];

const canvas = document.getElementById('scene3d');
const loading = document.getElementById('experienceLoading');
const loadingBar = document.getElementById('loadingBar');
const loadingStatus = document.getElementById('loadingStatus');
const errorPanel = document.getElementById('experienceError');
const errorText = document.getElementById('experienceErrorText');
const retryButton = document.getElementById('retry3d');
const hud = document.getElementById('experienceHud');
const hudProject = document.getElementById('hudProject');
const hudProjectName = document.getElementById('hudProjectName');
const hudProjectHint = document.getElementById('hudProjectHint');
const mobileControls = document.getElementById('mobileControls');
const mobileEnter = document.getElementById('mobileEnter');
const portalTransition = document.getElementById('portalTransition');

let renderer;
let scene;
let camera;
let clock;
let mixer;
let characterRoot;
let modelObject;
let activeAction;
let idleAction;
let walkAction;
let diveAction;
let nearestProject = null;
let controlsLocked = false;
let initialized = false;
let rafId = 0;
const keys = new Set();
const portalGroups = [];

const movement = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();

function setProgress(value, text) {
  loadingBar.style.width = `${Math.max(2, Math.min(100, value))}%`;
  if (text) loadingStatus.textContent = text;
}

function showError(message) {
  loading.hidden = true;
  errorText.textContent = message;
  errorPanel.hidden = false;
}

function cleanup() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  keys.clear();
  controlsLocked = false;
  nearestProject = null;
  initialized = false;
  if (renderer) {
    renderer.dispose();
    renderer.domElement.replaceWith(renderer.domElement.cloneNode());
  }
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030712);
  scene.fog = new THREE.FogExp2(0x030712, 0.022);
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.05, 120);
  camera.position.set(0, 4.1, 8.5);
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xa9cfff, 0x10111a, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  keyLight.position.set(4, 9, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -16;
  keyLight.shadow.camera.right = 16;
  keyLight.shadow.camera.top = 16;
  keyLight.shadow.camera.bottom = -16;
  scene.add(keyLight);

  const rim = new THREE.PointLight(0x2f8dff, 70, 22, 2);
  rim.position.set(0, 3.5, -5);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(20, 96),
    new THREE.MeshStandardMaterial({ color: 0x07101d, roughness: 0.86, metalness: 0.12 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(34, 34, 0x1f6bff, 0x183050);
  grid.material.opacity = 0.22;
  grid.material.transparent = true;
  grid.position.y = 0.008;
  scene.add(grid);

  createBackdrop();
  projects.forEach(createPortal);
}

function createBackdrop() {
  const ringGeo = new THREE.TorusGeometry(12.8, 0.04, 8, 160);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1f6bff, transparent: true, opacity: 0.16 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2;
    const radius = 14.5;
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 2.2 + (i % 4) * 0.35, 0.05),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2f8dff : 0x72ddff, transparent: true, opacity: 0.14 })
    );
    pillar.position.set(Math.sin(angle) * radius, pillar.geometry.parameters.height / 2, Math.cos(angle) * radius);
    scene.add(pillar);
  }
}

function createLabelTexture(title, color) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(4, 10, 22, .9)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  ctx.fillStyle = '#f4f8ff';
  ctx.font = '700 68px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, c.width / 2, c.height / 2 - 10);
  ctx.fillStyle = '#9db1cb';
  ctx.font = '500 28px Arial';
  ctx.fillText('ENTRAR NO PROJETO', c.width / 2, c.height / 2 + 62);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPortal(project) {
  const group = new THREE.Group();
  group.position.copy(project.position);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b1425,
    metalness: 0.72,
    roughness: 0.28,
    emissive: project.color,
    emissiveIntensity: 0.3
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: project.color,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const labelMaterial = new THREE.MeshBasicMaterial({
    map: createLabelTexture(project.name, project.color),
    transparent: true,
    side: THREE.DoubleSide
  });

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.6, 0.24), frameMaterial);
  const right = left.clone();
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.22, 0.24), frameMaterial);
  left.position.set(-1.55, 1.8, 0);
  right.position.set(1.55, 1.8, 0);
  top.position.set(0, 3.5, 0);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 3.25), glowMaterial);
  glow.position.set(0, 1.76, 0.03);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 0.69), labelMaterial);
  label.position.set(0, 2.35, 0.07);

  [left, right, top].forEach(mesh => {
    mesh.castShadow = true;
    group.add(mesh);
  });
  group.add(glow, label);

  const halo = new THREE.PointLight(project.color, 32, 7, 2);
  halo.position.set(0, 1.8, 1.2);
  group.add(halo);

  group.userData.project = project;
  group.userData.glow = glow;
  portalGroups.push(group);
  scene.add(group);
}

async function fetchManifest() {
  const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Manifesto do personagem não encontrado (${response.status}).`);
  return response.json();
}

async function fetchModelParts(parts) {
  const chunks = [];
  let loaded = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const name = parts[index];
    setProgress(8 + (index / parts.length) * 35, `Carregando personagem (${index + 1}/${parts.length})...`);
    const response = await fetch(`${ASSET_ROOT}${name}`);
    if (!response.ok) throw new Error(`Parte do personagem ausente: ${name}`);
    const buffer = await response.arrayBuffer();
    chunks.push(new Uint8Array(buffer));
    loaded += buffer.byteLength;
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  chunks.forEach(chunk => {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return merged.buffer;
}

function normalizeCharacter(object) {
  // The Tripo FBX uses Z as its vertical axis; the scene uses Y.
  object.rotation.x = -Math.PI / 2;
  object.updateMatrixWorld(true);
  object.traverse(child => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          material.needsUpdate = true;
          if ('envMapIntensity' in material) material.envMapIntensity = 0.75;
        });
      }
    }
  });

  let box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('O modelo 3D não possui dimensões válidas.');
  const scale = 1.82 / size.y;
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;
  object.updateMatrixWorld(true);
}

function clipByName(clips, terms) {
  const normalizedTerms = terms.map(term => term.toLowerCase());
  return clips.find(clip => normalizedTerms.some(term => clip.name.toLowerCase().includes(term))) || null;
}

function setupAnimations(mainObject, walkingObject) {
  mixer = new THREE.AnimationMixer(mainObject);
  const mainClips = mainObject.animations || [];
  const walkingClips = walkingObject?.animations || [];

  const idleClip = clipByName(mainClips, ['idle', 'ocioso']) || mainClips[0] || null;
  const diveClip = clipByName(mainClips, ['dive', 'mergul']) || mainClips.find(clip => clip !== idleClip) || null;
  const walkClip = walkingClips[0] || null;

  if (idleClip) idleAction = mixer.clipAction(idleClip, mainObject);
  if (diveClip) {
    diveAction = mixer.clipAction(diveClip, mainObject);
    diveAction.setLoop(THREE.LoopOnce, 1);
    diveAction.clampWhenFinished = true;
  }
  if (walkClip) walkAction = mixer.clipAction(walkClip, mainObject);

  if (idleAction) {
    activeAction = idleAction;
    idleAction.reset().fadeIn(0.15).play();
  }

  console.info('[Portfólio 3D] animações principais:', mainClips.map(c => `${c.name} (${c.duration.toFixed(2)}s)`));
  console.info('[Portfólio 3D] caminhada:', walkingClips.map(c => `${c.name} (${c.duration.toFixed(2)}s)`));
}

function setLocomotion(mode) {
  if (controlsLocked) return;
  const next = mode === 'walk' ? walkAction : idleAction;
  if (!next || next === activeAction) return;
  next.reset().play();
  if (activeAction) activeAction.crossFadeTo(next, 0.2, false);
  activeAction = next;
}

async function loadCharacter() {
  const manifest = await fetchManifest();
  setProgress(7, 'Localizando arquivos do personagem...');
  const mainBuffer = await fetchModelParts(manifest.modelParts || []);
  setProgress(48, 'Montando modelo, materiais e texturas...');

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    const textureProgress = total ? loaded / total : 0;
    setProgress(48 + textureProgress * 28, 'Aplicando texturas e materiais...');
  };
  const loader = new FBXLoader(manager);
  const mainObject = loader.parse(mainBuffer, ASSET_ROOT);
  normalizeCharacter(mainObject);

  characterRoot = new THREE.Group();
  characterRoot.position.set(0, 0, 5.2);
  characterRoot.add(mainObject);
  modelObject = mainObject;
  scene.add(characterRoot);

  setProgress(78, 'Carregando caminhada...');
  const walkingObject = await new Promise((resolve, reject) => {
    loader.load(`${ASSET_ROOT}${manifest.walking || 'Walking.fbx'}`, resolve, undefined, reject);
  });
  setupAnimations(mainObject, walkingObject);
  setProgress(92, 'Finalizando controles e portais...');
}

function isMovementPressed() {
  return keys.has('KeyW') || keys.has('ArrowUp') || keys.has('KeyS') || keys.has('ArrowDown') || keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('KeyD') || keys.has('ArrowRight');
}

function updateMovement(delta) {
  if (!characterRoot || controlsLocked) return;
  movement.set(0, 0, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) movement.z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) movement.z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) movement.x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) movement.x += 1;

  if (movement.lengthSq() > 0) {
    movement.normalize();
    const speed = 3.15;
    characterRoot.position.addScaledVector(movement, speed * delta);
    characterRoot.position.x = THREE.MathUtils.clamp(characterRoot.position.x, -10.8, 10.8);
    characterRoot.position.z = THREE.MathUtils.clamp(characterRoot.position.z, -12.5, 8.5);
    const targetRotation = Math.atan2(movement.x, movement.z);
    let diff = targetRotation - characterRoot.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    characterRoot.rotation.y += diff * Math.min(1, delta * 12);
    setLocomotion('walk');
  } else {
    setLocomotion('idle');
  }
}

function updateCamera(delta) {
  if (!characterRoot) return;
  cameraTarget.copy(characterRoot.position).add(new THREE.Vector3(0, 1.25, 0));
  desiredCamera.copy(characterRoot.position).add(new THREE.Vector3(0, 4.15, 7.4));
  const lerp = 1 - Math.pow(0.0007, delta);
  camera.position.lerp(desiredCamera, lerp);
  camera.lookAt(cameraTarget);
}

function updatePortals(elapsed) {
  if (!characterRoot) return;
  let best = null;
  let bestDistance = Infinity;
  portalGroups.forEach((group, index) => {
    const distance = characterRoot.position.distanceTo(group.position);
    const glow = group.userData.glow;
    if (glow) {
      glow.material.opacity = 0.11 + Math.sin(elapsed * 2.4 + index) * 0.025 + (distance < 3 ? 0.1 : 0);
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = group.userData.project;
    }
  });

  nearestProject = bestDistance < 2.75 ? best : null;
  hudProject.classList.toggle('visible', Boolean(nearestProject));
  mobileEnter.disabled = !nearestProject || controlsLocked;
  if (nearestProject) {
    hudProjectName.textContent = nearestProject.name;
    hudProjectHint.textContent = 'Pressione E para entrar';
  }
}

function enterProject() {
  if (!nearestProject || controlsLocked) return;
  controlsLocked = true;
  keys.clear();
  mobileEnter.disabled = true;
  hudProjectHint.textContent = 'Entrando...';

  if (diveAction) {
    diveAction.reset();
    diveAction.setEffectiveWeight(1);
    diveAction.setEffectiveTimeScale(1);
    diveAction.play();
    if (activeAction && activeAction !== diveAction) activeAction.crossFadeTo(diveAction, 0.16, false);
    activeAction = diveAction;
  }

  const duration = diveAction?.getClip()?.duration || 1.7;
  const transitionDelay = Math.max(600, Math.min(1700, duration * 650));
  window.setTimeout(() => portalTransition.classList.add('active'), Math.max(250, transitionDelay - 350));
  window.setTimeout(() => {
    window.location.href = nearestProject.href;
  }, transitionDelay + 350);
}

function handleKeyDown(event) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'KeyE') enterProject();
}

function handleKeyUp(event) {
  keys.delete(event.code);
}

function bindControls() {
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', onResize);
  mobileEnter.addEventListener('click', enterProject);

  document.querySelectorAll('[data-key]').forEach(button => {
    const key = button.dataset.key;
    const down = event => {
      event.preventDefault();
      keys.add(key);
      button.classList.add('active');
    };
    const up = event => {
      event.preventDefault();
      keys.delete(key);
      button.classList.remove('active');
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', up);
  });
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.35 : 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function animate() {
  rafId = requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  if (mixer) mixer.update(delta);
  updateMovement(delta);
  updateCamera(delta);
  updatePortals(elapsed);
  renderer.render(scene, camera);
}

async function init() {
  if (initialized) return;
  initialized = true;
  errorPanel.hidden = true;
  loading.hidden = false;
  setProgress(2, 'Inicializando ambiente...');
  try {
    createRenderer();
    createScene();
    bindControls();
    await loadCharacter();
    setProgress(100, 'Pronto.');
    await new Promise(resolve => setTimeout(resolve, 250));
    loading.hidden = true;
    hud.hidden = false;
    mobileControls.hidden = false;
    clock.start();
    animate();
  } catch (error) {
    console.error(error);
    showError(error?.message || 'Falha inesperada ao carregar a experiência 3D.');
  }
}

retryButton.addEventListener('click', () => window.location.reload());
init();
