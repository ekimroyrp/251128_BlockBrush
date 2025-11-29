import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

const container = document.getElementById('app');
const blueprintColor = new THREE.Color('#6ca6df');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.touchAction = 'none';
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
controls.enablePan = true;
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
window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' && isPanning) {
    isPanning = false;
    controls.enableRotate = true;
  }
});

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
    uLineThickness: { value: 0.075 }
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
const previewMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color('#7ce8ff'),
  roughness: 0.4,
  metalness: 0,
  transparent: true,
  opacity: 0.35,
  depthWrite: false
});
const previewMesh = new THREE.Mesh(blockGeometry, previewMaterial);
previewMesh.visible = false;
scene.add(previewMesh);

let buildRate = 10; // blocks per second
let buildInterval = 1000 / buildRate;
const lastActionTime = { add: -Infinity, remove: -Infinity };

const hitBlocks = [];
const hitPlane = [];
const tempIndex = { x: 0, y: 0, z: 0 };
const tempNormal = new THREE.Vector3(0, 1, 0);

function indexKey(index) {
  return `${index.x}|${index.y}|${index.z}`;
}

function setPositionFromIndex(target, index) {
  target.set(
    (index.x + 0.5) * gridSize,
    (index.y + 0.5) * gridSize,
    (index.z + 0.5) * gridSize
  );
  return target;
}

function addBlockAt(index) {
  const key = indexKey(index);
  if (blocks.has(key)) return;
  const mesh = new THREE.Mesh(blockGeometry, blockMaterial);
  mesh.scale.setScalar(gridSize);
  setPositionFromIndex(mesh.position, index);
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
    setPositionFromIndex(mesh.position, idx);
  });
  if (previewMesh.visible && hoverState.index) {
    previewMesh.scale.setScalar(gridSize);
    setPositionFromIndex(previewMesh.position, hoverState.index);
  }
}

// Interaction
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const pointerState = { down: false, mode: null };
const hoverState = { type: null, index: null, key: null };
let hoverDirty = true;

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
  hoverDirty = true;
}

function setPreview(type, targetIndex, targetKey) {
  if (!targetIndex) {
    previewMesh.visible = false;
    hoverState.type = null;
    hoverState.index = null;
    hoverState.key = null;
    return;
  }
  hoverState.type = type;
  hoverState.index = targetIndex;
  hoverState.key = targetKey || null;
  previewMesh.visible = true;
  previewMesh.scale.setScalar(gridSize);
  setPositionFromIndex(previewMesh.position, targetIndex);
  previewMaterial.color.set(type === 'remove' ? '#ff7f7f' : '#7ce8ff');
}

function updateHoverTarget() {
  if (uiActive) {
    setPreview(null, null);
    hoverDirty = false;
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  hitBlocks.length = 0;
  hitPlane.length = 0;
  raycaster.intersectObjects(blockGroup.children, false, hitBlocks);
  raycaster.intersectObject(gridMesh, false, hitPlane);

  if (pointerState.mode === 'remove') {
    if (hitBlocks.length > 0) {
      const hit = hitBlocks[0];
      setPreview('remove', { ...hit.object.userData.index }, hit.object.userData.key);
    } else {
      setPreview(null, null);
    }
    hoverDirty = false;
    return;
  }

  if (hitBlocks.length > 0) {
    const hit = hitBlocks[0];
    const baseIndex = hit.object.userData.index;
    if (hit.face && hit.face.normal) {
      tempNormal.copy(hit.face.normal);
    } else {
      tempNormal.set(0, 1, 0);
    }
    tempIndex.x = baseIndex.x + Math.round(tempNormal.x);
    tempIndex.y = baseIndex.y + Math.round(tempNormal.y);
    tempIndex.z = baseIndex.z + Math.round(tempNormal.z);
    setPreview('add', { ...tempIndex }, null);
    hoverDirty = false;
    return;
  }

  if (hitPlane.length > 0) {
    const point = hitPlane[0].point;
    tempIndex.x = Math.floor(point.x / gridSize);
    tempIndex.y = 0;
    tempIndex.z = Math.floor(point.z / gridSize);
    setPreview('add', { ...tempIndex }, null);
    hoverDirty = false;
    return;
  }

  setPreview(null, null);
  hoverDirty = false;
}

function handlePaint() {
  if (!pointerState.down || uiActive) return;
  const now = performance.now();
  if (hoverState.type === 'add' && hoverState.index) {
    if (now - lastActionTime.add >= buildInterval) {
      addBlockAt(hoverState.index);
      lastActionTime.add = now;
    }
  } else if (hoverState.type === 'remove' && hoverState.key) {
    if (now - lastActionTime.remove >= buildInterval) {
      removeBlockAt(hoverState.key);
      lastActionTime.remove = now;
    }
  }
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (uiActive) return;
  if (event.button === 0 || event.button === 2) {
    pointerState.down = true;
    pointerState.mode = event.button === 0 ? 'add' : 'remove';
    lastActionTime[pointerState.mode] = -Infinity; // allow immediate first action
    renderer.domElement.setPointerCapture(event.pointerId);
    updatePointer(event);
    updateHoverTarget();
    handlePaint();
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointer(event);
  if (hoverDirty) updateHoverTarget();
  handlePaint();
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (event.button === 0 || event.button === 2) {
    pointerState.down = false;
    pointerState.mode = null;
    renderer.domElement.releasePointerCapture(event.pointerId);
    updateHoverTarget();
  }
});
renderer.domElement.addEventListener('pointerleave', () => {
  setPreview(null, null);
});

// UI slider
const gridSlider = document.getElementById('grid-size');
const gridValue = document.getElementById('grid-size-value');
const buildSlider = document.getElementById('build-speed');
const buildValue = document.getElementById('build-speed-value');
function setGridSize(value) {
  gridSize = value;
  gridMaterial.uniforms.uGridSize.value = gridSize;
  gridValue.textContent = gridSize.toFixed(1);
  resnapBlocks();
}
gridSlider.addEventListener('input', (event) => {
  setGridSize(parseFloat(event.target.value));
});
function setBuildRate(value) {
  buildRate = value;
  buildInterval = 1000 / buildRate;
  buildValue.textContent = `${Math.round(buildRate)}/s`;
}
buildSlider.addEventListener('input', (event) => {
  setBuildRate(parseFloat(event.target.value));
});

// Panel dragging
const handles = [
  document.getElementById('ui-handle'),
  document.getElementById('ui-handle-bottom')
].filter(Boolean);
let dragActive = false;
const dragOffset = new THREE.Vector2();
function onHandleDown(event) {
  dragActive = true;
  uiActive = true;
  dragOffset.set(event.clientX - uiPanel.offsetLeft, event.clientY - uiPanel.offsetTop);
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.style.cursor = 'grabbing';
}
function onHandleMove(event) {
  if (!dragActive) return;
  const left = event.clientX - dragOffset.x;
  const top = event.clientY - dragOffset.y;
  uiPanel.style.left = `${left}px`;
  uiPanel.style.top = `${top}px`;
}
function onHandleUp(event) {
  dragActive = false;
  uiActive = false;
  event.currentTarget.releasePointerCapture(event.pointerId);
  event.currentTarget.style.cursor = 'grab';
}
handles.forEach((handleEl) => {
  handleEl.addEventListener('pointerdown', onHandleDown);
  handleEl.addEventListener('pointermove', onHandleMove);
  handleEl.addEventListener('pointerup', onHandleUp);
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
  if (hoverDirty && !pointerState.down) {
    updateHoverTarget();
  }
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

// Initialize UI value and a starter block
setGridSize(parseFloat(gridSlider.value));
setBuildRate(parseFloat(buildSlider.value));
addBlockAt({ x: 0, y: 0, z: 0 });
