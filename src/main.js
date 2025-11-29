import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

const container = document.getElementById('app');
const blueprintColor = new THREE.Color('#b8d7f5');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Scene setup
const scene = new THREE.Scene();
scene.background = blueprintColor;
scene.fog = new THREE.Fog(blueprintColor, 20, 140);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(12, 10, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableRotate = true;
controls.enableZoom = true;
controls.mouseButtons.LEFT = null;
controls.mouseButtons.RIGHT = null;
controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
controls.target.set(0, 0.5, 0);
controls.update();

// Manual pan with Shift + MMB
let isPanning = false;
const panStart = new THREE.Vector2();
renderer.domElement.addEventListener(
  'pointerdown',
  (event) => {
    if (event.button === 1 && event.shiftKey) {
      isPanning = true;
      controls.enableRotate = false;
      panStart.set(event.clientX, event.clientY);
    }
  },
  { passive: true }
);
renderer.domElement.addEventListener(
  'pointermove',
  (event) => {
    if (isPanning) {
      const deltaX = event.clientX - panStart.x;
      const deltaY = event.clientY - panStart.y;
      controls.pan(deltaX, deltaY);
      controls.update();
      panStart.set(event.clientX, event.clientY);
    }
  },
  { passive: true }
);
renderer.domElement.addEventListener(
  'pointerup',
  (event) => {
    if (event.button === 1 && isPanning) {
      isPanning = false;
      controls.enableRotate = true;
    }
  },
  { passive: true }
);

// Lights
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x6a7a8b, 1.0);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
dirLight.position.set(6, 10, 4);
scene.add(dirLight);

// Grid shader
let gridSize = 1.0;
const gridMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uGridSize: { value: gridSize },
    uColor: { value: new THREE.Color('#ffffff') },
    uFadeStart: { value: 30.0 },
    uFadeEnd: { value: 120.0 },
    uLineThickness: { value: 0.6 }
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    uniform float uGridSize;
    uniform vec3 uColor;
    uniform float uFadeStart;
    uniform float uFadeEnd;
    uniform float uLineThickness;
    varying vec3 vWorldPosition;
    void main() {
      vec2 coord = vWorldPosition.xz / uGridSize;
      vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
      float line = min(grid.x, grid.y);
      float lineAlpha = 1.0 - smoothstep(uLineThickness, uLineThickness + 1.0, line);
      float dist = length(cameraPosition.xz - vWorldPosition.xz);
      float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
      float alpha = lineAlpha * fade;
      if (alpha <= 0.0) discard;
      gl_FragColor = vec4(uColor, alpha);
    }
  `,
  side: THREE.DoubleSide
});

const gridMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000, 1, 1),
  gridMaterial
);
gridMesh.rotation.x = -Math.PI / 2;
gridMesh.position.y = 0;
scene.add(gridMesh);

// Blocks
const blocks = new Map();
const blockGroup = new THREE.Group();
scene.add(blockGroup);
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blockMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.35,
  metalness: 0.05
});

function indexKey(index) {
  return `${index.x}|${index.y}|${index.z}`;
}

function worldPositionFromIndex(index) {
  return new THREE.Vector3(
    index.x * gridSize,
    index.y * gridSize + gridSize * 0.5,
    index.z * gridSize
  );
}

function addBlockAt(index) {
  const key = indexKey(index);
  if (blocks.has(key)) return;
  const mesh = new THREE.Mesh(blockGeometry, blockMaterial);
  mesh.scale.setScalar(gridSize);
  mesh.position.copy(worldPositionFromIndex(index));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.index = { ...index };
  mesh.userData.key = key;
  blocks.set(key, mesh);
  blockGroup.add(mesh);
}

function removeBlockAt(key) {
  const mesh = blocks.get(key);
  if (!mesh) return;
  blockGroup.remove(mesh);
  blocks.delete(key);
}

function resnapBlocks() {
  blocks.forEach((mesh) => {
    const idx = mesh.userData.index;
    mesh.scale.setScalar(gridSize);
    mesh.position.copy(worldPositionFromIndex(idx));
  });
}

// Interaction
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const pointerState = { down: false, mode: null };

let uiActive = false;
const uiPanel = document.getElementById('ui-panel');
uiPanel.addEventListener('pointerdown', () => {
  uiActive = true;
});
uiPanel.addEventListener('pointerup', () => {
  uiActive = false;
});
uiPanel.addEventListener('pointerleave', () => {
  uiActive = false;
});

function updatePointer(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function getAddTarget() {
  // Try stacking on existing blocks
  const blockHits = raycaster.intersectObjects(blockGroup.children, false);
  if (blockHits.length > 0) {
    const hit = blockHits[0];
    const baseIndex = hit.object.userData.index;
    const normal = hit.face?.normal || new THREE.Vector3(0, 1, 0);
    const target = {
      x: baseIndex.x + Math.round(normal.x),
      y: baseIndex.y + Math.round(normal.y),
      z: baseIndex.z + Math.round(normal.z)
    };
    return target;
  }

  // Otherwise place on the ground plane
  const planeHits = raycaster.intersectObject(gridMesh, false);
  if (planeHits.length > 0) {
    const point = planeHits[0].point;
    return {
      x: Math.round(point.x / gridSize),
      y: 0,
      z: Math.round(point.z / gridSize)
    };
  }
  return null;
}

function handlePaint() {
  if (!pointerState.down || uiActive) return;
  raycaster.setFromCamera(pointer, camera);
  if (pointerState.mode === 'add') {
    const target = getAddTarget();
    if (target) addBlockAt(target);
  } else if (pointerState.mode === 'remove') {
    const hits = raycaster.intersectObjects(blockGroup.children, false);
    if (hits.length > 0) {
      const key = hits[0].object.userData.key;
      removeBlockAt(key);
    }
  }
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (uiActive) return;
  if (event.button === 0 || event.button === 2) {
    pointerState.down = true;
    pointerState.mode = event.button === 0 ? 'add' : 'remove';
    renderer.domElement.setPointerCapture(event.pointerId);
    updatePointer(event);
    handlePaint();
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointer(event);
  handlePaint();
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (event.button === 0 || event.button === 2) {
    pointerState.down = false;
    pointerState.mode = null;
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
});

// UI slider
const gridSlider = document.getElementById('grid-size');
const gridValue = document.getElementById('grid-size-value');
function setGridSize(value) {
  gridSize = value;
  gridMaterial.uniforms.uGridSize.value = gridSize;
  gridValue.textContent = gridSize.toFixed(1);
  resnapBlocks();
}
gridSlider.addEventListener('input', (event) => {
  setGridSize(parseFloat(event.target.value));
});

// Panel dragging
const handle = document.getElementById('ui-handle');
let dragActive = false;
const dragOffset = new THREE.Vector2();
handle.addEventListener('pointerdown', (event) => {
  dragActive = true;
  uiActive = true;
  dragOffset.set(event.clientX - uiPanel.offsetLeft, event.clientY - uiPanel.offsetTop);
  handle.setPointerCapture(event.pointerId);
  handle.style.cursor = 'grabbing';
});
handle.addEventListener('pointermove', (event) => {
  if (!dragActive) return;
  const left = event.clientX - dragOffset.x;
  const top = event.clientY - dragOffset.y;
  uiPanel.style.left = `${left}px`;
  uiPanel.style.top = `${top}px`;
});
handle.addEventListener('pointerup', (event) => {
  dragActive = false;
  uiActive = false;
  handle.releasePointerCapture(event.pointerId);
  handle.style.cursor = 'grab';
});

// Resize handling
window.addEventListener('resize', () => {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Animation loop
function tick() {
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

// Initialize UI value and a starter block
setGridSize(parseFloat(gridSlider.value));
addBlockAt({ x: 0, y: 0, z: 0 });
