import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/* Gallery pilot: rooms stay inside the same WebGL scene. New room builders can be
   registered in ROOM_BUILDERS without changing the character or camera. */
const CHARACTER_ASSETS = 'assets/3d/character/';
const ROLL_ANIMATION = `${CHARACTER_ASSETS}Stand-To-Roll.fbx`;
const ROLL_LEAD_IN = 0; // Preserve the complete anticipation, roll and recovery.
let rollTravel = null;
const ROOM_BUILDERS = { ignis: buildIgnisRoom };
const PROJECTS = [
  { id: 'ignis', name: 'Ignis', color: 0xff813b, x: -7.1, z: -10.1, page: 'projeto-ignis.html' },
  { id: 'mc', name: 'MC Bem Estar', color: 0xd7b16a, x: -2.35, z: -10.1, page: 'projeto-mc-bem-estar.html' },
  { id: 'pao', name: 'Pão de Cleide', color: 0xd99870, x: 2.35, z: -10.1, page: 'projeto-pao-de-cleide.html' },
  { id: 'amanda', name: 'Amanda Construction', color: 0xe66069, x: 7.1, z: -10.1, page: 'projeto-amanda.html' }
];
const IGNIS_MEDIA = [
  { image: 'assets/ignis-dashboard.webp', title: 'Painel de consumo', description: 'Visão geral de eficiência, consumo, metas, reincidências e desempenho por operação e equipamento.' },
  { image: 'assets/ignis-comparativo.webp', title: 'Comparativo de períodos', description: 'Comparação de vários períodos simultaneamente, com evolução de indicadores e desempenho por operação.' },
  { image: 'assets/ignis-abastecimentos.webp', title: 'Gestão de abastecimentos', description: 'Consulta, importação, filtros, edição e rastreabilidade dos registros utilizados nas análises.' },
  { image: 'assets/ignis-maquinas.webp', title: 'Cadastro de equipamentos', description: 'Gestão de máquinas, modelos, operações, metas individuais, consumo e situação de cada ativo.' },
  { image: 'assets/ignis-relatorios.webp', title: 'Análise e relatórios', description: 'Configuração por período e tipo de frota, agrupamento por operação e preparação de relatórios executivos.' },
  { image: 'assets/ignis-km.webp', title: 'Comparativo entre sistemas', description: 'Importação de duas fontes, regras de tolerância e classificação automática de divergências e exceções.' }
];
const $ = id => document.getElementById(id);
const canvas = $('scene3d');
const loading = $('experienceLoading');
const loadingBar = $('loadingBar');
const loadingStatus = $('loadingStatus');
const errorPanel = $('experienceError');
const hud = $('experienceHud');
const hudProject = $('hudProject');
const hudProjectName = $('hudProjectName');
const hudProjectHint = $('hudProjectHint');
const mobileControls = $('mobileControls');
const mobileEnter = $('mobileEnter');
const portalTransition = $('portalTransition');
const currentRoom = $('currentRoom');
const resetCameraButton = $('resetCamera');
const lightbox = $('imageLightbox');
const lightboxImage = $('lightboxImage');
const lightboxTitle = $('lightboxTitle');
const lightboxDescription = $('lightboxDescription');
const imageHint = $('imageHint');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowPower = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 800;
const keys = new Set();
const pointers = new Map();
const raycaster = new THREE.Raycaster();
const normalizedPointer = new THREE.Vector2();
const movement = new THREE.Vector3();
const lookAtPoint = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const direction = new THREE.Vector3();
const viewForward = new THREE.Vector3();
const viewRight = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
// Scratch quaternions are allocated only when the animation clips are prepared.
const planeNormal = new THREE.Vector3();
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1000);
let renderer, scene, camera, clock, mixer, characterRoot, modelObject;
let characterMotion = null;
let idleAction, walkAction, diveAction, rollAction, activeAction;
let rollLoadPromise = null, rollUnavailable = false;
let hallGroup, roomGroup, activeWorld = 'hall', nearestPortal = null;
let roomLoaded = false, roomLoading = null, busy = false, transition = null;
let elapsedTime = 0, previousFocus = null;
let cameraYaw = 0, cameraElevation = 0.46, cameraDistance = 7.6;
let cameraDrag = null, pinchDistance = 0;
const hallPortals = [], roomPortals = [], screens = [];
let currentCanvasTextures = [];
const cameraLimits = {
  hall: { minX: -11.25, maxX: 11.25, minZ: -12.65, maxZ: 9.5 },
  ignis: { minX: -9.0, maxX: 9.0, minZ: -11.8, maxZ: 9.4 }
};

function setProgress(value, message) {
  loadingBar.style.width = `${THREE.MathUtils.clamp(value, 2, 100)}%`;
  if (message) loadingStatus.textContent = message;
}
function fail(message) {
  loading.hidden = true;
  $('experienceErrorText').textContent = message;
  errorPanel.hidden = false;
}
function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.74, roughness: 0.29, ...options });
}
function addBox(parent, size, position, material, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = shadow && !lowPower;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addLine(parent, points, radius, color, emissiveIntensity = 1.9) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const line = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(12, points.length * 5), radius, 6, false), material);
  line.userData.baseIntensity = emissiveIntensity;
  parent.add(line);
  return line;
}
function canvasLabel(title, detail, color = '#72ddff', width = 1024, height = 256) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const context = c.getContext('2d');
  context.fillStyle = 'rgba(6, 14, 27, .96)';
  context.fillRect(0, 0, width, height);
  context.fillStyle = color;
  context.fillRect(0, 0, 9, height);
  context.strokeStyle = 'rgba(194, 226, 255, .25)';
  context.lineWidth = 3;
  context.strokeRect(2, 2, width - 4, height - 4);
  const titleSize = title.length > 24 ? 43 : title.length > 17 ? 54 : 69;
  context.fillStyle = '#f5f9ff';
  context.font = `700 ${titleSize}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(title, width / 2, height * .41, width - 90);
  context.font = '600 31px Arial, sans-serif';
  context.fillStyle = '#a8bfd6';
  context.fillText(detail, width / 2, height * .77, width - 80);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = lowPower ? 2 : 4;
  currentCanvasTextures.push(texture);
  return texture;
}
function addTextPlate(group, title, subtitle, color, position, size) {
  const texture = canvasLabel(title, subtitle, color);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true }));
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}
function createRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.3 : 1.8));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
}
function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030814);
  scene.fog = new THREE.FogExp2(0x030814, 0.014);
  camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.08, 120);
  camera.position.set(0, 4.2, 11.5);
  clock = new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x9bbde7, 0x17121b, 2.1));
  const sunlight = new THREE.DirectionalLight(0xdce8ff, lowPower ? 1.7 : 2.5);
  sunlight.position.set(1, 10, 6);
  sunlight.castShadow = !lowPower;
  sunlight.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
  sunlight.shadow.camera.left = -15; sunlight.shadow.camera.right = 15;
  sunlight.shadow.camera.top = 15; sunlight.shadow.camera.bottom = -15;
  scene.add(sunlight);
  hallGroup = new THREE.Group();
  hallGroup.name = 'Hall';
  scene.add(hallGroup);
  buildHall(hallGroup);
}
function createFloor(group, width, depth, tint, accent) {
  const surface = mat(tint, { roughness: .38, metalness: .54 });
  addBox(group, [width, .23, depth], [0, -.16, -1.2], surface);
  const inlay = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .46, depthWrite: false });
  for (const x of [-width / 2 + .5, width / 2 - .5]) addBox(group, [.055, .013, depth - .9], [x, -.033, -1.2], inlay);
  for (let z = -depth / 2; z <= depth / 2; z += 3.1) addBox(group, [width - 1, .012, .018], [0, -.025, z - 1.2], inlay);
  const centerStrip = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false });
  const circle = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.7, 96), centerStrip);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = -.015;
  circle.position.z = -1.2;
  group.add(circle);
}
function addArchitecture(parent, accent, opts = {}) {
  const width = opts.width || 24;
  const depth = opts.depth || 26;
  const back = opts.back ?? -14;
  const wall = mat(0x081426, { roughness: .58, metalness: .58, side: THREE.DoubleSide });
  const metal = mat(0x192c3c, { roughness: .31 });
  const light = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
  const trim = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .43, depthWrite: false, toneMapped: false });
  addBox(parent, [width, 5.8, .4], [0, 2.9, back], wall);
  addBox(parent, [.4, 5.8, depth], [-width / 2, 2.9, -1.1], wall);
  addBox(parent, [.4, 5.8, depth], [width / 2, 2.9, -1.1], wall);
  addBox(parent, [width, .36, depth], [0, 6.12, -1.1], metal);
  addBox(parent, [width - .6, .06, depth - .6], [0, 5.91, -1.1], trim);
  const count = opts.columns || 7;
  for (let i = 0; i < count; i++) {
    const z = -depth / 2 + i * (depth / (count - 1)) - 1.1;
    for (const side of [-1, 1]) {
      const x = side * (width / 2 - .7);
      addBox(parent, [.74, 5.85, .84], [x, 2.93, z], metal);
      addBox(parent, [.076, 4.3, .15], [x - side * .41, 2.86, z], light);
    }
    addBox(parent, [width - 2, .08, .12], [0, 5.88, z], light);
  }
  for (const z of [-7.8, -1.5, 4.8]) {
    const ceiling = new THREE.Mesh(new THREE.TorusGeometry(3.1, .08, 8, 72), light);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 5.84, z);
    parent.add(ceiling);
  }
}
function createPortal(parent, info, returnPortal = false) {
  const group = new THREE.Group();
  group.position.set(info.x || 0, 0, info.z);
  const color = new THREE.Color(info.color);
  const ready = returnPortal || Boolean(ROOM_BUILDERS[info.id]);
  const archPoints = [[-1.47, .15, 0], [-1.47, 1.0, 0], [-1.47, 2.2, 0]];
  for (let i = 0; i <= 16; i++) {
    const theta = Math.PI - i * Math.PI / 16;
    archPoints.push([Math.cos(theta) * 1.47, 2.25 + Math.sin(theta) * 1.42, 0]);
  }
  archPoints.push([1.47, 1.0, 0], [1.47, .15, 0]);
  addLine(group, archPoints, .16, 0x152b3b);
  addLine(group, archPoints.map(([x,y]) => [x * .95, y, .15]), .039, info.color);
  addLine(group, archPoints.map(([x,y]) => [x * 1.08, y, -.06]), .018, info.color);
  const shape = new THREE.Shape();
  shape.moveTo(-1.33, .18);
  shape.lineTo(-1.33, 2.2);
  shape.absarc(0, 2.2, 1.33, Math.PI, 0, true);
  shape.lineTo(1.33, .18);
  shape.closePath();
  const membrane = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: color }, uIntensity: { value: ready ? 1 : .27 } },
    vertexShader: `varying vec2 vCoord; void main() { vCoord = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uIntensity; varying vec2 vCoord;
      void main(){ vec2 p=vec2(vCoord.x/1.34, (vCoord.y-1.84)/1.9); float r=length(p);
        float waves=sin(21.0*r-3.6*uTime+sin(atan(p.y,p.x)*5.0+uTime)*1.2);
        float filaments=sin(p.x*17.0+p.y*11.0+uTime*2.2);
        float edge=smoothstep(.53,.96,r);
        float alpha=(.20+.10*waves+.09*filaments+.20*edge)*uIntensity;
        gl_FragColor=vec4(uColor*(.36+.60*edge), clamp(alpha,.045,.62)); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  }));
  membrane.position.z = .035;
  group.add(membrane);
  const points = [];
  const count = lowPower ? 34 : 64;
  for (let i=0; i<count; i++) {
    const y = .2 + (i * .61803398875 % 1) * 3.1;
    const x = Math.sin(i * 15.73) * (y > 2.45 ? .9 : 1.22);
    points.push(x, y, .09 + Math.cos(i * 3.71) * .27);
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: info.color, size: .062, transparent: true, opacity: ready ? .8 : .26, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  group.add(particles);
  addBox(group, [3.5, .19, .62], [0, .03, .03], mat(0x1c3140));
  addBox(group, [2.7, .035, .22], [0, .16, .14], new THREE.MeshBasicMaterial({ color: info.color }));
  addTextPlate(group, returnPortal ? 'HALL PRINCIPAL' : info.name, returnPortal ? 'VOLTAR À GALERIA' : (ready ? 'ATRAVESSAR PORTAL' : 'SALA EM PREPARAÇÃO'), `#${color.getHexString()}`, [0, 4.2, .05], [3.5, .89]);
  if (!lowPower) {
    const glow = new THREE.PointLight(info.color, ready ? 16 : 6, 6, 2);
    glow.position.set(0, 1.8, 1.3);
    group.add(glow);
  }
  group.userData = { ...info, isPortal: true, ready, returnPortal, membrane, particles };
  parent.add(group);
  return group;
}
function buildHall(group) {
  createFloor(group, 24.3, 27.7, 0x0a1726, 0x2474c5);
  addArchitecture(group, 0x297fcb, { width: 24.3, depth: 27.7, back: -14.95, columns: 7 });
  const metal = mat(0x203a4d, { roughness: .28 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x52a9ec, transparent: true, opacity: .5 });
  // A raised concentric arrival platform replaces the former floor-wide grid.
  for (const radius of [2.6, 4.1, 5.4]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + .045, 96), blue);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, -.011, 3.6);
    group.add(ring);
  }
  for (const x of [-9.65, -5.1, 0, 5.1, 9.65]) {
    addBox(group, [.085, 4.4, .24], [x, 2.2, -14.6], metal);
    addBox(group, [.04, 3.1, .04], [x, 2.3, -14.42], blue);
  }
  for (const project of PROJECTS) hallPortals.push(createPortal(group, project));
  const monument = new THREE.Group();
  monument.position.set(0, 3.45, 1.2);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.72, 1), mat(0x1376b3, { emissive: 0x1d8cda, emissiveIntensity: .9, metalness: .42, roughness: .27, flatShading: true }));
  monument.add(core);
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.14, .023, 8, 84), new THREE.MeshBasicMaterial({ color: 0x89d7ff }));
  orbit.rotation.y = .7;
  monument.add(orbit);
  group.add(monument);
  group.userData.monument = monument;
  addTextPlate(group, 'EXPERIÊNCIA 3D', 'ESCOLHA UM UNIVERSO', '#72ddff', [0, 4.9, -3.85], [5.7, 1.42]);
}

// Model normalization and Mixamo-to-Tripo walking clip alignment are preserved.
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

function alignWalkingClip(sourceClip, target, source) {
  const clip = sourceClip.clone();
  const targetHips = target.getObjectByName('mixamorigHips');
  const sourceHips = source.getObjectByName('mixamorigHips');
  if (!targetHips || !sourceHips) return clip;
  // Convert the Mixamo Y-up root into the Tripo Z-up rest frame.
  // Do this on the clip so idle/walk crossfades share the same coordinates.
  const correction = targetHips.quaternion.clone().multiply(sourceHips.quaternion.clone().invert());
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  for (const track of clip.tracks) {
    if (track.name === 'mixamorigHips.quaternion') {
      for (let i = 0; i < track.values.length; i += 4) {
        rotation.fromArray(track.values, i).premultiply(correction).normalize().toArray(track.values, i);
      }
    } else if (track.name === 'mixamorigHips.position') {
      for (let i = 0; i < track.values.length; i += 3) {
        position.fromArray(track.values, i).sub(sourceHips.position).applyQuaternion(correction).add(targetHips.position).toArray(track.values, i);
      }
    }
  }
  return clip;
}

// The Tripo dive has baked horizontal displacement on the hips. If it is
// combined with the portal path, the character appears to dive too late.
// Keep the pose and vertical motion, but let the portal path own X/Y travel
// (the original Tripo rig uses Z-up before normalizeCharacter()).
function stabilizeDiveClip(source) {
  if (!source) return null;
  const clip = source.clone();
  for (const track of clip.tracks) {
    if (!/mixamorigHips\.position$/i.test(track.name)) continue;
    const values = track.values;
    if (values.length < 3) continue;
    const originalX = values[0];
    const originalY = values[1];
    for (let i = 0; i < values.length; i += 3) {
      values[i] = originalX;
      values[i + 1] = originalY;
    }
  }
  return clip;
}

// The walking animation has the upright shoulder and torso posture selected
// by the user. Construct a relaxed standing clip from opposite walking phases.
// This avoids modifying shoulder world rotations on every frame (the previous
// approach lowered the shoulders and made idle/crossfade less predictable).
function makeUprightIdle(originalIdle, walkClip) {
  if (!originalIdle || !walkClip) return originalIdle;
  const result = originalIdle.clone();
  const walkTracks = new Map(walkClip.tracks.map(track => [track.name, track]));
  const upperBody = /^mixamorig(?:Spine|Spine1|Spine2|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm)\.quaternion$/;
  let replaced = 0;
  for (const track of result.tracks) {
    if (!upperBody.test(track.name)) continue;
    const walk = walkTracks.get(track.name);
    if (!walk || walk.getValueSize() !== 4) continue;
    const interpolant = walk.createInterpolant();
    const qA = new THREE.Quaternion().fromArray(interpolant.evaluate(walkClip.duration * .18));
    const qB = new THREE.Quaternion().fromArray(interpolant.evaluate(walkClip.duration * .68));
    qA.slerp(qB, .5).normalize();
    // Preserve a small part of the original standing movement, but make
    // shoulders and spine match the walk's upright neutral reference.
    for (let i = 0; i < track.values.length; i += 4) {
      const q = new THREE.Quaternion().fromArray(track.values, i);
      q.slerp(qA, .92).normalize().toArray(track.values, i);
    }
    replaced++;
  }
  console.info(`[Portfólio 3D] posture idle: ${replaced} ossos alinhados à caminhada`);
  return result;
}

// The Mixamo In Place roll still contains a backtracking hips curve.
// Remove X/Z translation IN THE SOURCE Y-up rig, preserving vertical Y and
// all bone rotations. The scene moves characterRoot forward monotonically.
function stabilizeRollClip(originalRoll) {
  const clip = originalRoll.clone();
  const hip = clip.tracks.find(track => /mixamorigHips\.position$/i.test(track.name));
  if (!hip) throw new Error('A animação de rolamento não possui a trajetória do quadril esperada.');
  const x = hip.values[0];
  const z = hip.values[2];
  for (let i = 0; i < hip.values.length; i += 3) {
    hip.values[i] = x;
    hip.values[i + 2] = z;
  }
  return clip;
}

// The source Mixamo clip can start at a different heading than Walking.fbx.
// Align the first hips rotation to the already-correct walking reference,
// then retain the full spin encoded by the roll's quaternion keyframes.
function matchRollHeading(rollClip, walkingClip) {
  const key = 'mixamorigHips.quaternion';
  const roll = rollClip.tracks.find(track => track.name === key);
  const walk = walkingClip?.tracks.find(track => track.name === key);
  if (!roll || !walk) throw new Error('Não foi possível alinhar a orientação do rolamento à caminhada.');
  const anchor = new THREE.Quaternion().fromArray(walk.values);
  const first = new THREE.Quaternion().fromArray(roll.values);
  const adjustment = anchor.multiply(first.invert()).normalize();
  const sample = new THREE.Quaternion();
  for (let i = 0; i < roll.values.length; i += 4) {
    sample.fromArray(roll.values, i).premultiply(adjustment).normalize().toArray(roll.values, i);
  }
  return rollClip;
}

// Lazy-load the 514 KB FBX on the first portal interaction. If it cannot be
// loaded, entering/leaving rooms still works without an artificial roll.
async function ensureRollAnimation() {
  if (rollAction || rollUnavailable) return rollAction;
  if (!rollLoadPromise) {
    rollLoadPromise = new Promise((resolve, reject) =>
      new FBXLoader().load(ROLL_ANIMATION, resolve, undefined, reject)
    ).then(rollObject => {
      const source = rollObject.animations?.[0];
      if (!source) throw new Error('FBX sem animação de rolamento.');
      const hips = source.tracks.find(track => /mixamorigHips\.position$/i.test(track.name));
      if (hips) {
        // Preserve the source clip's timing of ground travel, without its retreat.
        const values = hips.values, times = Array.from(hips.times);
        // The final key can retreat during stand-up; use the farthest pose
        // to identify forward travel instead of the end-minus-start vector.
        let dx = 0, dz = 0;
        for(let i=0;i<values.length;i+=3) {
          const x=values[i]-values[0], z=values[i+2]-values[2];
          if(x*x+z*z>dx*dx+dz*dz){dx=x;dz=z;}
        }
        const length = Math.hypot(dx, dz) || 1;
        let furthest = 0;
        const distances = times.map((_, i) => {
          const projected = ((values[i * 3] - values[0]) * dx + (values[i * 3 + 2] - values[2]) * dz) / length;
          furthest = Math.max(furthest, projected);
          return furthest;
        });
        rollTravel = { times, distances, total: furthest,
          distance: 1.35 };
      }
      const inPlace = stabilizeRollClip(source);
      const clip = matchRollHeading(alignWalkingClip(inPlace, modelObject, rollObject), walkAction?.getClip());
      rollAction = mixer.clipAction(clip, modelObject);
      rollAction.setLoop(THREE.LoopOnce, 1);
      rollAction.clampWhenFinished = true;
      console.info(`[Portfólio 3D] rolamento real: ${clip.duration.toFixed(2)} s`);
      return rollAction;
    }).catch(error => {
      console.warn('[Portfólio 3D] rolamento FBX indisponível, mantendo transição segura:', error);
      rollUnavailable = true;
      return null;
    });
  }
  return rollLoadPromise;
}

function setupAnimations(mainObject, walkingObject) {
  mixer = new THREE.AnimationMixer(mainObject);
  const mainClips = mainObject.animations || [];
  const walkingClips = walkingObject?.animations || [];

  const originalIdle = clipByName(mainClips, ['idle', 'ocioso']) || mainClips[0] || null;
  const diveClip = stabilizeDiveClip(clipByName(mainClips, ['dive', 'mergul']) || mainClips.find(clip => clip !== originalIdle) || null);
  const walkClip = walkingClips[0] ? alignWalkingClip(walkingClips[0], mainObject, walkingObject) : null;
  const idleClip = makeUprightIdle(originalIdle, walkClip);

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
  if (busy) return;
  const next = mode === 'walk' ? walkAction : idleAction;
  if (!next || next === activeAction) return;
  next.reset().play();
  if (activeAction) activeAction.crossFadeTo(next, 0.2, false);
  activeAction = next;
}


async function fetchModelParts(parts) {
  if (!Array.isArray(parts) || !parts.length) throw new Error('Manifesto sem partes do personagem.');
  const buffers = [];
  let bytes = 0;
  for (let i = 0; i < parts.length; i++) {
    setProgress(8 + (i / parts.length) * 36, `Carregando personagem (${i + 1}/${parts.length})...`);
    const response = await fetch(`${CHARACTER_ASSETS}${parts[i]}`);
    if (!response.ok) throw new Error(`Parte do personagem indisponível: ${parts[i]}`);
    const chunk = new Uint8Array(await response.arrayBuffer());
    buffers.push(chunk);
    bytes += chunk.byteLength;
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const b of buffers) { data.set(b, offset); offset += b.byteLength; }
  return data.buffer;
}
async function loadCharacter() {
  const response = await fetch(`${CHARACTER_ASSETS}model-manifest.json`);
  if (!response.ok) throw new Error('Manifesto do personagem não encontrado.');
  const manifest = await response.json();
  const buffer = await fetchModelParts(manifest.modelParts);
  setProgress(50, 'Aplicando geometria e texturas do personagem...');
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, done, total) => {
    setProgress(50 + (total ? done / total : 0) * 27, 'Carregando materiais do personagem...');
  };
  const loader = new FBXLoader(manager);
  const object = loader.parse(buffer, CHARACTER_ASSETS);
  normalizeCharacter(object);
  characterRoot = new THREE.Group();
  characterRoot.name = 'Euler';
  characterRoot.position.set(0, 0, 5.2);
  // Separate the arrival-roll pivot from the Tripo model orientation.
  // Pivot about the torso rather than the feet to avoid sinking into the floor.
  characterMotion = new THREE.Group();
  characterMotion.position.y = .92;
  const modelAnchor = new THREE.Group();
  modelAnchor.position.y = -.92;
  modelAnchor.add(object);
  characterMotion.add(modelAnchor);
  characterRoot.add(characterMotion);
  modelObject = object;
  scene.add(characterRoot);
  setProgress(80, 'Sincronizando caminhada e animação de mergulho...');
  const walking = await new Promise((resolve, reject) => loader.load(`${CHARACTER_ASSETS}${manifest.walking || 'Walking.fbx'}`, resolve, undefined, reject));
  setupAnimations(object, walking);
  setProgress(96, 'Preparando a galeria...');
}
function makeNarrativeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1400; canvas.height = 490;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b1829'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ff813b'; ctx.fillRect(0, 0, 12, canvas.height);
  ctx.fillStyle = '#ffb18a'; ctx.font = '700 37px Arial'; ctx.fillText('IGNIS / INTELIGÊNCIA OPERACIONAL', 52, 78);
  ctx.fillStyle = '#fff6f0'; ctx.font = '700 61px Arial'; ctx.fillText('Dados transformados em decisões.', 52, 162);
  ctx.fillStyle = '#c3cedc'; ctx.font = '34px Arial';
  const lines = [
    'Uma plataforma para importar, tratar e transformar dados de',
    'abastecimento e operação em indicadores, alertas, comparativos',
    'e relatórios prontos para tomada de decisão.',
    'Telas reais do produto, apresentadas com dados protegidos.'
  ];
  lines.forEach((line, i) => ctx.fillText(line, 52, 247 + i * 53));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  currentCanvasTextures.push(texture);
  return texture;
}
async function buildIgnisRoom() {
  const group = new THREE.Group();
  group.name = 'Sala Ignis';
  group.visible = false;
  createFloor(group, 19.4, 25.5, 0x141a24, 0xd96b35);
  addArchitecture(group, 0xa74e2f, { width: 19.4, depth: 25.5, back: -13.25, columns: 6 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xff813b, toneMapped: false });
  const copper = mat(0x3f2a25, { metalness: .84, roughness: .25 });
  const glass = mat(0x102a39, { roughness: .14, metalness: .75, transparent: true, opacity: .78 });
  for (const side of [-1, 1]) {
    for (const z of [-8.1, -2.2, 3.7]) {
      addBox(group, [.24, 4.1, 4.75], [side * 9.0, 2.35, z], copper);
      addBox(group, [.13, 3.8, 4.3], [side * 8.78, 2.35, z], glass);
      addBox(group, [.07, .07, 4.0], [side * 8.67, 4.45, z], amber);
    }
  }
  const story = new THREE.Mesh(new THREE.PlaneGeometry(7.9, 2.75), new THREE.MeshBasicMaterial({ map: makeNarrativeTexture(), side: THREE.DoubleSide }));
  story.position.set(0, 3.45, -12.8);
  group.add(story);
  const returnInfo = { id: 'hall', name: 'Hall', x: 0, z: 8.8, color: 0x5ac9ff };
  roomPortals.push(createPortal(group, returnInfo, true));
  // Visual wayfinding: the central aisle is intentionally clear for movement.
  for (const x of [-5.4, 5.4]) {
    const rail = addBox(group, [.065, .09, 18.9], [x, .06, -1.5], new THREE.MeshBasicMaterial({ color: 0x9c5135, transparent: true, opacity: .52 }));
    rail.userData.decoration = true;
  }
  const loader = new THREE.TextureLoader();
  const outcomes = await Promise.allSettled(IGNIS_MEDIA.map(item => loader.loadAsync(item.image)));
  const missing = [];
  for (let i = 0; i < IGNIS_MEDIA.length; i++) {
    const item = IGNIS_MEDIA[i];
    const side = i < 3 ? -1 : 1;
    const z = [-8.1, -2.2, 3.7][i % 3];
    const panel = new THREE.Group();
    panel.position.set(side * 8.22, 2.3, z);
    panel.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
    const frame = mat(0x142639, { metalness: .87, roughness: .17 });
    addBox(panel, [4.4, 3.35, .19], [0, .05, 0], frame);
    addBox(panel, [4.24, 2.42, .03], [0, .30, .115], new THREE.MeshBasicMaterial({ color: 0x040912 }));
    const result = outcomes[i];
    let imageMaterial;
    if (result.status === 'fulfilled') {
      const texture = result.value;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = lowPower ? 2 : 4;
      imageMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    } else {
      missing.push(item.image);
      imageMaterial = new THREE.MeshBasicMaterial({ color: 0x152235, side: THREE.DoubleSide });
    }
    const img = new THREE.Mesh(new THREE.PlaneGeometry(4.05, 2.12), imageMaterial);
    img.position.set(0, .32, .139);
    img.userData.screen = item;
    img.userData.canEnlarge = result.status === 'fulfilled';
    screens.push(img);
    panel.add(img);
    addBox(panel, [4.15, .04, .04], [0, -1.0, .125], amber);
    addTextPlate(panel, item.title, result.status === 'fulfilled' ? 'TOQUE PARA AMPLIAR' : 'IMAGEM INDISPONÍVEL', '#ffb18a', [0, -1.22, .14], [4.1, .81]);
    group.add(panel);
  }
  if (missing.length) console.warn('[Portfólio 3D] imagens não carregadas:', missing);
  if (!lowPower) {
    const ambient = new THREE.PointLight(0xff813b, 30, 17, 2);
    ambient.position.set(0, 4.8, -4);
    group.add(ambient);
  }
  group.userData.missingImages = missing;
  return group;
}
function showRoomStatus(text) {
  const status = $('roomStatus');
  status.textContent = text;
  status.hidden = !text;
}
async function ensureRoom(id) {
  if (id !== 'ignis' && !ROOM_BUILDERS[id]) throw new Error('Sala ainda não construída.');
  if (roomLoaded) return roomGroup;
  if (roomLoading) return roomLoading;
  roomLoading = (async () => {
    const group = await ROOM_BUILDERS[id]();
    scene.add(group);
    roomGroup = group;
    roomLoaded = true;
    return group;
  })();
  try { return await roomLoading; }
  finally { roomLoading = null; }
}
function resetCamera() {
  cameraYaw = 0;
  cameraElevation = .46;
  cameraDistance = lowPower ? 7.2 : 7.7;
}
function applyCharacterClipping(enable, portal) {
  if (!modelObject) return;
  if (enable && portal) {
    const sign = portal.userData.returnPortal ? -1 : 1;
    planeNormal.set(0, 0, sign);
    clipPlane.setFromNormalAndCoplanarPoint(planeNormal, portal.position);
  }
  modelObject.traverse(child => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => {
      if (!material) return;
      material.clippingPlanes = enable ? [clipPlane] : null;
      material.clipShadows = enable;
      material.needsUpdate = true;
    });
  });
}
// A short, visible run-up gives the dive room to start before the portal plane.
function startStagingWalk() {
  const next = walkAction || idleAction;
  if (!next) return;
  next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  if (activeAction && activeAction !== next) activeAction.crossFadeTo(next, .16, false);
  activeAction = next;
}
function startDive() {
  if (!diveAction) return;
  diveAction.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  if (activeAction && activeAction !== diveAction) activeAction.crossFadeTo(diveAction, .23, false);
  activeAction = diveAction;
}
function endDive() {
  if (diveAction) diveAction.stop();
  if (walkAction) walkAction.stop();
  if (idleAction) idleAction.reset().setEffectiveWeight(1).play();
  activeAction = idleAction || null;
}
function beginRealRoll() {
  if (!rollAction) { endDive(); return false; }
  rollAction.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  rollAction.time = Math.min(ROLL_LEAD_IN, rollAction.getClip().duration * .20);
  if (activeAction && activeAction !== rollAction) activeAction.crossFadeTo(rollAction, .14, false);
  activeAction = rollAction;
  return true;
}
function rollDistanceAt(time) {
  if (!rollTravel || rollTravel.total < .001) return 0;
  const { times, distances, total, distance } = rollTravel;
  let i = 1;
  while (i < times.length - 1 && times[i] < time) i++;
  const p = THREE.MathUtils.clamp((time - times[i - 1]) / Math.max(.0001, times[i] - times[i - 1]), 0, 1);
  return THREE.MathUtils.lerp(distances[i - 1], distances[i], p) / total * distance;
}
function turnTowards(heading, delta) {
  const difference = Math.atan2(Math.sin(heading - characterRoot.rotation.y), Math.cos(heading - characterRoot.rotation.y));
  characterRoot.rotation.y += difference * (1 - Math.exp(-12 * delta));
}
function finishRealRoll() {
  if (!rollAction) { endDive(); return; }
  if (idleAction) {
    idleAction.reset().setEffectiveWeight(1).play();
    rollAction.crossFadeTo(idleAction, .18, false);
    activeAction = idleAction;
  }
}
async function enterPortal() {
  if (!nearestPortal || !nearestPortal.userData.ready || busy || !characterRoot || !lightbox.hidden) return;
  const portal = nearestPortal;
  busy = true;
  keys.clear();
  mobileEnter.disabled = true;
  try {
    if (!portal.userData.returnPortal) {
      showRoomStatus('Preparando a sala Ignis e suas imagens...');
      await ensureRoom(portal.userData.id);
    }
    if (!rollAction && !rollUnavailable) {
      showRoomStatus('Carregando a animação de rolamento...');
      await ensureRollAnimation();
    }
    showRoomStatus('');
    const duration = diveAction?.getClip()?.duration || 2.71;
    const sign = portal.userData.returnPortal ? 1 : -1;
    const source = characterRoot.position.clone();
    const depth = (portal.position.z - source.z) * sign;
    // Only walk towards the portal when already far away. Never walk backward
    // or teleport outward if the player pressed E close to the membrane.
    const approachNeeded = depth > 2.65 || (depth > .12 && Math.abs(source.x - portal.position.x) > .55);
    const staging = approachNeeded
      ? new THREE.Vector3(portal.position.x, 0, portal.position.z - sign * Math.min(depth, 2.35))
      : source.clone();
    const distance = source.distanceTo(staging);
    const approachDuration = distance > .12 ? THREE.MathUtils.clamp(distance / 3.1, .18, 1.25) : 0;
    transition = {
      portal, sign, source, staging, duration,
      outsideDistance: Math.max(.28, (portal.position.z - staging.z) * sign),
      elapsed: 0, phase: 'align', cameraStartYaw: cameraYaw,
      approachDuration, switched: false, landingDuration: rollAction ? rollAction.getClip().duration - Math.min(ROLL_LEAD_IN, rollAction.getClip().duration * .20) : .22
    };
    // Camera and heading settle continuously in the alignment phase.
    characterMotion.rotation.x = 0;
    characterMotion.position.y = .92;
    if(idleAction && activeAction !== idleAction) {
      idleAction.reset().setEffectiveWeight(1).play();
      activeAction?.crossFadeTo(idleAction,.16,false);
      activeAction=idleAction;
    }
    hudProject.classList.remove('visible');
  } catch (error) {
    busy = false;
    transition = null;
    showRoomStatus('');
    console.error('[Portfólio 3D] Falha ao preparar a sala:', error);
    showRoomStatus('Não foi possível carregar a sala. Tente entrar novamente.');
  }
}
function activateWorld(nextWorld) {
  const goHome = nextWorld === 'hall';
  activeWorld = nextWorld;
  hallGroup.visible = goHome;
  if (roomGroup) roomGroup.visible = !goHome;
  scene.background.set(goHome ? 0x030814 : 0x100c0e);
  scene.fog.color.set(goHome ? 0x030814 : 0x100c0e);
  scene.fog.density = goHome ? .014 : .012;
  characterRoot.position.set(0, 0, goHome ? 5.1 : 0);
  characterRoot.rotation.y = Math.PI;
  resetCamera();
  // Reposition the camera behind the new spawn before releasing movement keys.
  // Otherwise the old camera view can make W/A/S/D seem rotated after a portal.
  updateCamera(0, true);
  currentRoom.textContent = goHome ? 'HALL PRINCIPAL' : 'SALA IGNIS';
  $('roomDescription').textContent = goHome ? 'Explore os portais da galeria' : 'Explore as seis telas reais do Ignis';
  imageHint.hidden = goHome;
  showRoomStatus('');
}
function updateTransition(delta) {
  if (!transition) return;
  const t = transition;
  t.elapsed += delta;
  if (t.phase === 'align') {
    const heading = t.approachDuration ? Math.atan2(t.staging.x - t.source.x, t.staging.z - t.source.z) : (t.sign === -1 ? Math.PI : 0);
    turnTowards(heading, delta);
    const desiredYaw = t.sign === -1 ? 0 : Math.PI;
    cameraYaw += Math.atan2(Math.sin(desiredYaw-cameraYaw),Math.cos(desiredYaw-cameraYaw)) * (1-Math.exp(-6*delta));
    cameraElevation = THREE.MathUtils.lerp(cameraElevation,.40,1-Math.exp(-6*delta));
    if (t.elapsed >= .38) {
      t.phase = reducedMotion ? 'cover' : (t.approachDuration ? 'approach' : 'dive');
      t.elapsed = 0;
      if(reducedMotion) portalTransition.classList.add('active');
      else if(t.approachDuration) startStagingWalk();
      else {applyCharacterClipping(true,t.portal);startDive();}
    }
    return;
  }
  if (t.phase === 'approach') {
    const p = THREE.MathUtils.clamp(t.elapsed / t.approachDuration, 0, 1);
    characterRoot.position.lerpVectors(t.source, t.staging, p);
    turnTowards(t.sign === -1 ? Math.PI : 0, delta);
    if (p >= 1) {
      characterRoot.position.copy(t.staging);
      turnTowards(t.sign === -1 ? Math.PI : 0, delta);
      t.phase = 'dive';
      t.elapsed = 0;
      applyCharacterClipping(true, t.portal);
      startDive();
    }
    return;
  }
  if (t.phase === 'dive') {
    const p = THREE.MathUtils.clamp((diveAction ? diveAction.time : t.elapsed) / t.duration, 0, 1);
    // The provided dive FBX leans head-first around 1.2-1.4 seconds (~45-50%).
    // Put the *portal plane* at that key pose, not at the end of the animation.
    // The hips' baked horizontal travel is removed in stabilizeDiveClip().
    const approach = THREE.MathUtils.smoothstep(p, .045, .46);
    const departure = THREE.MathUtils.smoothstep(p, .46, .78);
    const z = t.portal.position.z - t.sign * t.outsideDistance * (1 - approach) + t.sign * 2.45 * departure;
    characterRoot.position.set(
      THREE.MathUtils.lerp(t.staging.x, t.portal.position.x, approach),
      0,
      z
    );
    if (p >= .77) portalTransition.classList.add('active');
    if (p >= .95) { t.phase = 'cover'; t.elapsed = 0; }
    return;
  }
  if (t.phase === 'cover') {
    if(t.elapsed < .30) return;
    applyCharacterClipping(false);
    activateWorld(t.portal.userData.returnPortal ? 'hall' : t.portal.userData.id);
    // Change scene and camera only while the screen is completely covered.
    diveAction?.stop(); walkAction?.stop(); idleAction?.stop();
    if(reducedMotion) endDive(); else beginRealRoll();
    t.phase='landing'; t.elapsed=0;
    t.landingOrigin=characterRoot.position.clone();
    return;
  }
  if (t.phase === 'landing') {
    const p = THREE.MathUtils.clamp(t.elapsed / t.landingDuration, 0, 1);
    if(t.elapsed >= .10) portalTransition.classList.remove('active');
    characterRoot.position.copy(t.landingOrigin);
    // Advance smoothly through the roll; do not reverse on the stand-up frames.
    if (rollAction && !reducedMotion) characterRoot.position.z -= rollDistanceAt(rollAction.time);
    if (reducedMotion ? t.elapsed >= .35 : p >= 1) {
      finishRealRoll();
      t.phase = 'recover'; t.elapsed = 0;
    }
    return;
  }
  if(t.phase === 'recover' && t.elapsed >= .22) {
      rollAction?.stop();
      characterMotion.rotation.x = 0;
      characterMotion.position.y = .92;
      busy = false;
      nearestPortal = null;
      transition = null;
  }
}
function isMovementPressed() {
  return ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].some(key => keys.has(key));
}
function updateMovement(delta) {
  if (!characterRoot || busy || !lightbox.hidden) return;
  // Use the actual camera view so forward/left/right remain correct after
  // entering a room, orbiting the camera, or having it constrained by a wall.
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  camera.getWorldDirection(viewForward);
  viewForward.y = 0;
  if (viewForward.lengthSq() < 1e-4) viewForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  viewForward.normalize();
  viewRight.crossVectors(viewForward, worldUp).normalize();
  movement.copy(viewForward).multiplyScalar(forward).addScaledVector(viewRight, strafe);
  if (movement.lengthSq()) {
    movement.normalize();
    characterRoot.position.addScaledVector(movement, delta * 3.15);
    const bounds = cameraLimits[activeWorld];
    characterRoot.position.x = THREE.MathUtils.clamp(characterRoot.position.x, bounds.minX, bounds.maxX);
    characterRoot.position.z = THREE.MathUtils.clamp(characterRoot.position.z, bounds.minZ, bounds.maxZ);
    const heading = Math.atan2(movement.x, movement.z);
    const diff = Math.atan2(Math.sin(heading - characterRoot.rotation.y), Math.cos(heading - characterRoot.rotation.y));
    characterRoot.rotation.y += diff * Math.min(1, delta * 12);
    setLocomotion('walk');
  } else setLocomotion('idle');
}
function updateCamera(delta, snap = false) {
  if (!characterRoot || !camera) return;
  lookAtPoint.copy(characterRoot.position).add(new THREE.Vector3(0, 1.28, 0));
  const planar = Math.cos(cameraElevation) * cameraDistance;
  cameraDesired.set(
    lookAtPoint.x + Math.sin(cameraYaw) * planar,
    lookAtPoint.y + Math.sin(cameraElevation) * cameraDistance,
    lookAtPoint.z + Math.cos(cameraYaw) * planar
  );
  const bounds = cameraLimits[activeWorld];
  cameraDesired.x = THREE.MathUtils.clamp(cameraDesired.x, bounds.minX - .2, bounds.maxX + .2);
  cameraDesired.z = THREE.MathUtils.clamp(cameraDesired.z, bounds.minZ - .2, bounds.maxZ + .2);
  cameraDesired.y = THREE.MathUtils.clamp(cameraDesired.y, 1.05, 5.65);
  const follow = 1 - Math.exp(-7 * delta);
  if (snap) camera.position.copy(cameraDesired);
  else camera.position.lerp(cameraDesired, follow);
  camera.lookAt(lookAtPoint);
}
function updatePortalProximity(time) {
  if (!characterRoot || busy) return;
  let best = null;
  let bestDistance = 3.8;
  const portals = activeWorld === 'hall' ? hallPortals : roomPortals;
  portals.forEach((portal, index) => {
    const data = portal.userData;
    data.membrane.material.uniforms.uTime.value = time;
    data.particles.position.y = (reducedMotion ? 0 : Math.sin(time * .72 + index) * .055);
    const front = characterRoot.position.z - portal.position.z;
    const sideValid = data.returnPortal ? front < .35 : front > -.35;
    const d = characterRoot.position.distanceTo(portal.position);
    if (sideValid && d < bestDistance) { bestDistance = d; best = portal; }
  });
  nearestPortal = best;
  hudProject.classList.toggle('visible', Boolean(best));
  mobileEnter.disabled = !best?.userData.ready;
  if (best) {
    hudProjectName.textContent = best.userData.name;
    hudProjectHint.textContent = best.userData.ready
      ? (best.userData.returnPortal ? 'Pressione E para voltar ao hall' : 'Pressione E para atravessar')
      : 'Sala 3D em preparação';
    mobileEnter.textContent = best.userData.returnPortal ? 'Voltar' : 'Entrar';
  }
}
function updateScreens() {
  if (activeWorld !== 'ignis' || busy || !characterRoot || !lightbox.hidden) { imageHint.classList.remove('visible'); return; }
  let nearest = null;
  let bestDistance = 3.55;
  for (const screen of screens) {
    screen.getWorldPosition(direction);
    const dist = direction.distanceTo(characterRoot.position);
    if (dist < bestDistance && screen.userData.canEnlarge) { bestDistance = dist; nearest = screen; }
  }
  imageHint.classList.toggle('visible', Boolean(nearest));
  if (nearest) {
    $('imageHintTitle').textContent = nearest.userData.screen.title;
    $('imageHintDescription').textContent = nearest.userData.screen.description;
    $('imageHintButton').onclick = () => openImage(nearest.userData.screen);
  }
}
function openImage(item) {
  if (!item || busy) return;
  previousFocus = document.activeElement;
  lightboxImage.src = item.image;
  lightboxImage.alt = `Captura real do Ignis: ${item.title}`;
  lightboxTitle.textContent = item.title;
  lightboxDescription.textContent = item.description;
  lightbox.hidden = false;
  keys.clear();
  $('lightboxClose').focus();
}
function closeImage() {
  lightbox.hidden = true;
  lightboxImage.removeAttribute('src');
  if (previousFocus?.focus) previousFocus.focus();
}
function clickScreen(clientX, clientY) {
  if (activeWorld !== 'ignis' || busy || !lightbox.hidden) return;
  const bounds = canvas.getBoundingClientRect();
  normalizedPointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(normalizedPointer, camera);
  const hit = raycaster.intersectObjects(screens, false).find(intersection => intersection.object.userData.canEnlarge);
  if (hit) openImage(hit.object.userData.screen);
}
function moveCamera(dx, dy) {
  cameraYaw -= dx * .006;
  cameraElevation = THREE.MathUtils.clamp(cameraElevation + dy * .0045, .13, 1.07);
}
function getPinchGap() {
  const pair = [...pointers.values()];
  if (pair.length < 2) return 0;
  return Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
}
function onPointerDown(event) {
  if (busy || !lightbox.hidden) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  canvas.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) cameraDrag = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, pinched: false };
  if (pointers.size === 2) { pinchDistance = getPinchGap(); if (cameraDrag) cameraDrag.pinched = true; }
}
function onPointerMove(event) {
  const prev = pointers.get(event.pointerId);
  if (!prev) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) {
    const gap = getPinchGap();
    if (pinchDistance > 0 && gap > 0) cameraDistance = THREE.MathUtils.clamp(cameraDistance * pinchDistance / gap, 2.25, 11.7);
    pinchDistance = gap;
    if (cameraDrag) cameraDrag.pinched = true;
  } else if (cameraDrag) {
    const dx = event.clientX - cameraDrag.lastX;
    const dy = event.clientY - cameraDrag.lastY;
    if (Math.hypot(event.clientX - cameraDrag.x, event.clientY - cameraDrag.y) > 6) cameraDrag.moved = true;
    if (cameraDrag.moved) moveCamera(dx, dy);
    cameraDrag.lastX = event.clientX;
    cameraDrag.lastY = event.clientY;
  }
}
function onPointerUp(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    if (event.type === 'pointerup' && cameraDrag && !cameraDrag.moved && !cameraDrag.pinched) clickScreen(event.clientX, event.clientY);
    cameraDrag = null;
    pinchDistance = 0;
  } else {
    if (cameraDrag) {
      cameraDrag.pinched = true;
      const remaining = [...pointers.values()][0];
      cameraDrag.lastX = remaining.x;
      cameraDrag.lastY = remaining.y;
    }
    pinchDistance = getPinchGap();
  }
}
function bindControls() {
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !lightbox.hidden) { closeImage(); return; }
    if (!lightbox.hidden || busy || event.repeat && event.code === 'KeyE') return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyE') enterPortal();
    else if (event.code === 'KeyC') resetCamera();
    else keys.add(event.code);
  }, { passive: false });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 800 ? 1.3 : 1.8));
    renderer.setSize(innerWidth, innerHeight, false);
  });
  mobileEnter.addEventListener('click', enterPortal);
  resetCameraButton.addEventListener('click', resetCamera);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (busy || !lightbox.hidden) return;
    cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * .0011), 2.25, 11.7);
  }, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onPointerUp);
  document.querySelectorAll('[data-key]').forEach(button => {
    const code = button.dataset.key;
    const down = event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); keys.add(code); button.classList.add('active'); };
    const up = event => { event.preventDefault(); keys.delete(code); button.classList.remove('active'); };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  });
  $('lightboxClose').addEventListener('click', closeImage);
  lightbox.addEventListener('click', event => { if (event.target === lightbox) closeImage(); });
}
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  elapsedTime += delta;
  if (mixer) mixer.update(delta);
  if (transition) updateTransition(delta);
  else updateMovement(delta);
  updateCamera(delta);
  if (hallGroup.visible && hallGroup.userData.monument && !reducedMotion) {
    const model = hallGroup.userData.monument;
    model.rotation.y += delta * .12;
    model.position.y = 3.45 + Math.sin(elapsedTime * .65) * .13;
  }
  if (!busy) updatePortalProximity(elapsedTime);
  else {
    const portal = transition?.portal;
    if (portal) portal.userData.membrane.material.uniforms.uTime.value = elapsedTime;
  }
  updateScreens();
  renderer.render(scene, camera);
}
async function init() {
  try {
    createRenderer();
    createScene();
    bindControls();
    await loadCharacter();
    resetCamera();
    setProgress(100, 'Galeria pronta.');
    loading.hidden = true;
    hud.hidden = false;
    mobileControls.hidden = false;
    currentRoom.textContent = 'HALL PRINCIPAL';
    clock.start();
    animate();
  } catch (err) {
    console.error('[Portfólio 3D] inicialização:', err);
    fail(err?.message || 'Falha ao preparar a galeria 3D.');
  }
}
$('retry3d').addEventListener('click', () => location.reload());
init();


