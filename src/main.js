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
    uLineThickness: { value: 0.01 }
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
const baseBlockMaterialParams = {
  roughness: 0.35,
  metalness: 0.05
};
function makeBlockMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    ...baseBlockMaterialParams
  });
}
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

let blockGap = 0.0;
const minScaleRatio = 0.05; // prevent degenerate cubes
let buildDistance = 60; // world-units radius from center (horizontal)
let buildRate = 10; // blocks per second
let buildInterval = 1000 / buildRate;
const lastActionTime = { add: -Infinity, remove: -Infinity, paint: -Infinity };
const minScaleValue = 0.0001;
const minAnimDamping = 2;
const currentColor = new THREE.Color('#ffffff');
const tempColorA = new THREE.Color();
const tempColorB = new THREE.Color();

const hitBlocks = [];
const hitPlane = [];
const tempIndex = { x: 0, y: 0, z: 0 };
const tempNormal = new THREE.Vector3(0, 1, 0);
const tempPoints = [];
let distanceCircle;

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

function getBlockScale() {
  const maxGap = gridSize * 0.49;
  const clampedGap = Math.min(blockGap, maxGap);
  const size = gridSize - clampedGap * 2;
  return Math.max(size, gridSize * minScaleRatio);
}

function isWithinBuildDistance(index) {
  const dx = (index.x + 0.5) * gridSize;
  const dz = (index.z + 0.5) * gridSize;
  return Math.hypot(dx, dz) <= buildDistance;
}

function getAnimDamping() {
  return Math.max(minAnimDamping, buildRate);
}

function createDistanceCircle() {
  const segments = 128;
  tempPoints.length = 0;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    tempPoints.push(new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(tempPoints);
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color('#ff9e00'),
    transparent: true,
    opacity: 0.65,
    depthTest: true,
    depthWrite: false
  });
  distanceCircle = new THREE.LineLoop(geometry, material);
  distanceCircle.rotation.x = -Math.PI / 2;
  distanceCircle.position.y = 0.001;
  distanceCircle.renderOrder = 1;
  scene.add(distanceCircle);
}

function updateDistanceCircle() {
  if (!distanceCircle) return;
  const radius = Math.max(0.001, buildDistance);
  const positions = distanceCircle.geometry.attributes.position;
  const count = positions.count;
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * Math.PI * 2;
    positions.setXYZ(i, Math.cos(t) * radius, Math.sin(t) * radius, 0);
  }
  positions.needsUpdate = true;
  distanceCircle.geometry.computeBoundingSphere();
}

function scheduleColorLerp(mesh, targetColor) {
  if (!mesh) return;
  if (!mesh.userData.colorAnim) {
    mesh.userData.colorAnim = {
      from: mesh.material.color.clone(),
      to: targetColor.clone(),
      t: 0
    };
  } else {
    mesh.userData.colorAnim.from.copy(mesh.material.color);
    mesh.userData.colorAnim.to.copy(targetColor);
    mesh.userData.colorAnim.t = 0;
  }
}

function addBlockAt(index) {
  const key = indexKey(index);
  if (blocks.has(key)) return;
  const material = makeBlockMaterial(currentColor.clone());
  const mesh = new THREE.Mesh(blockGeometry, material);
  mesh.scale.setScalar(minScaleValue);
  setPositionFromIndex(mesh.position, index);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.index = { ...index };
  mesh.userData.key = key;
  mesh.userData.anim = { removing: false, desiredScale: getBlockScale() };
  blocks.set(key, mesh);
  blockGroup.add(mesh);
}

function removeBlockAt(key) {
  const mesh = blocks.get(key);
  if (!mesh) return;
  const anim = mesh.userData.anim || {};
  anim.removing = true;
  mesh.userData.anim = anim;
}

function resnapBlocks() {
  blocks.forEach((mesh) => {
    const idx = mesh.userData.index;
    const anim = mesh.userData.anim || {};
    anim.desiredScale = getBlockScale();
    mesh.userData.anim = anim;
    setPositionFromIndex(mesh.position, idx);
  });
  if (previewMesh.visible && hoverState.index) {
    previewMesh.scale.setScalar(getBlockScale());
    setPositionFromIndex(previewMesh.position, hoverState.index);
  }
}

// Interaction
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const pointerState = { down: false, mode: null };
const hoverState = { type: null, index: null, key: null };
let hoverDirty = true;
let isShiftDown = false;

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

window.addEventListener('keydown', (event) => {
  if (event.key === 'Shift' && !isShiftDown) {
    isShiftDown = true;
    setPreview(null, null);
  }
});
window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') {
    isShiftDown = false;
    hoverDirty = true;
  }
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
  previewMesh.scale.setScalar(getBlockScale());
  setPositionFromIndex(previewMesh.position, targetIndex);
  previewMaterial.color.set(type === 'remove' ? '#ff7f7f' : '#7ce8ff');
}

function updateHoverTarget() {
  if (uiActive) {
    setPreview(null, null);
    hoverDirty = false;
    return;
  }

  if (isShiftDown && pointerState.mode !== 'remove' && pointerState.mode !== 'paint') {
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

  if (pointerState.mode === 'paint') {
    if (hitBlocks.length > 0) {
      const hit = hitBlocks[0];
      hoverState.type = 'paint';
      hoverState.index = { ...hit.object.userData.index };
      hoverState.key = hit.object.userData.key;
      previewMesh.visible = false;
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
    if (pointerState.mode === 'paint') {
      setPreview(null, null);
    } else if (isWithinBuildDistance(tempIndex)) {
      setPreview('add', { ...tempIndex }, null);
    } else {
      setPreview(null, null);
    }
    hoverDirty = false;
    return;
  }

  if (hitPlane.length > 0) {
    const point = hitPlane[0].point;
    tempIndex.x = Math.floor(point.x / gridSize);
    tempIndex.y = 0;
    tempIndex.z = Math.floor(point.z / gridSize);
    if (isWithinBuildDistance(tempIndex)) {
      setPreview('add', { ...tempIndex }, null);
    } else {
      setPreview(null, null);
    }
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
    if (isWithinBuildDistance(hoverState.index) && now - lastActionTime.add >= buildInterval) {
      addBlockAt(hoverState.index);
      lastActionTime.add = now;
    }
  } else if (hoverState.type === 'remove' && hoverState.key) {
    if (now - lastActionTime.remove >= buildInterval) {
      removeBlockAt(hoverState.key);
      lastActionTime.remove = now;
    }
  } else if (hoverState.type === 'paint' && hoverState.key) {
    if (now - lastActionTime.paint >= buildInterval) {
      const mesh = blocks.get(hoverState.key);
      if (mesh) {
        scheduleColorLerp(mesh, currentColor);
      }
      lastActionTime.paint = now;
    }
  }
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (uiActive) return;
  if (event.button === 0 || event.button === 2) {
    pointerState.down = true;
    if (event.button === 0 && event.shiftKey) {
      pointerState.mode = 'paint';
    } else {
      pointerState.mode = event.button === 0 ? 'add' : 'remove';
    }
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
const gapSlider = document.getElementById('block-gap');
const gapValue = document.getElementById('block-gap-value');
const distanceSlider = document.getElementById('build-distance');
const distanceValue = document.getElementById('build-distance-value');
const buildSlider = document.getElementById('build-speed');
const buildValue = document.getElementById('build-speed-value');
const colorInput = document.getElementById('block-color');
const colorValue = document.getElementById('block-color-value');
const colorChip = document.getElementById('block-color-chip');
const colorPopover = document.getElementById('color-popover');
const colorPreview = document.getElementById('color-preview');
const colorHexInput = document.getElementById('color-hex-input');
const hueSlider = document.getElementById('hue-slider');
const satSlider = document.getElementById('sat-slider');
const lightSlider = document.getElementById('light-slider');
const hueValue = document.getElementById('hue-value');
const satValue = document.getElementById('sat-value');
const lightValue = document.getElementById('light-value');
const swatches = Array.from(document.querySelectorAll('#color-swatches button'));
const hslState = { h: 20 / 360, s: 1, l: 0.5 };
let colorPopoverOpen = false;
let lastHueInput = 0;
let recentColors = swatches.map(() => '#ffffff');
let lastSavedColor = '#ffffff';
function setGridSize(value) {
  gridSize = value;
  gridMaterial.uniforms.uGridSize.value = gridSize;
  gridValue.textContent = gridSize.toFixed(1);
  setBlockGap(blockGap); // re-clamp to new grid size and resnap
  resnapBlocks();
}
gridSlider.addEventListener('input', (event) => {
  setGridSize(parseFloat(event.target.value));
});
function setBlockGap(value) {
  const maxGap = gridSize * 0.49;
  blockGap = Math.max(0, Math.min(value, maxGap));
  gapValue.textContent = blockGap.toFixed(2);
  if (gapSlider) {
    gapSlider.value = blockGap.toFixed(2);
  }
  resnapBlocks();
}
gapSlider.addEventListener('input', (event) => {
  setBlockGap(parseFloat(event.target.value));
});
function setBuildDistance(value) {
  buildDistance = Math.max(0, value);
  distanceValue.textContent = `${Math.round(buildDistance)}`;
  hoverDirty = true;
  if (!pointerState.down) {
    updateHoverTarget();
  }
  updateDistanceCircle();
}
distanceSlider.addEventListener('input', (event) => {
  setBuildDistance(parseFloat(event.target.value));
});
function setBuildRate(value) {
  buildRate = value;
  buildInterval = 1000 / buildRate;
  buildValue.textContent = `${Math.round(buildRate)}`;
}
const tempHSLColor = new THREE.Color();
function updateSliderGradients() {
  if (hueSlider) {
    hueSlider.style.background =
      'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';
  }
  if (satSlider) {
    tempHSLColor.setHSL(hslState.h, 0, 0.5);
    const start = `#${tempHSLColor.getHexString()}`;
    tempHSLColor.setHSL(hslState.h, 1, 0.5);
    const end = `#${tempHSLColor.getHexString()}`;
    satSlider.style.background = `linear-gradient(90deg, ${start}, ${end})`;
  }
  if (lightSlider) {
    const mid = `#${new THREE.Color()
      .setHSL(hslState.h, Math.max(0.05, hslState.s), 0.5)
      .getHexString()}`;
    lightSlider.style.background = `linear-gradient(90deg, #000000, ${mid}, #ffffff)`;
  }
}
function currentHex() {
  return `#${currentColor.getHexString()}`;
}

function renderRecentColors() {
  swatches.forEach((btn, idx) => {
    const col = recentColors[idx] || '#ffffff';
    btn.style.background = col;
    btn.setAttribute('data-color', col);
  });
}

function addRecentColor(hex) {
  if (!hex) return;
  recentColors = [hex, ...recentColors].slice(0, swatches.length);
  renderRecentColors();
}

function syncColorControls(forcedHsl) {
  const normalized = `#${currentColor.getHexString()}`;
  colorValue.textContent = normalized;
  if (colorInput && colorInput !== document.activeElement) colorInput.value = normalized;
  if (colorHexInput && colorHexInput !== document.activeElement) colorHexInput.value = normalized;
  if (colorChip) {
    colorChip.style.setProperty('--chip-fill', normalized);
    colorChip.style.background = normalized;
  }
  if (colorPreview) {
    colorPreview.style.setProperty('--chip-fill', normalized);
    colorPreview.style.background = normalized;
  }
  if (forcedHsl) {
    hslState.h = forcedHsl.h;
    hslState.s = forcedHsl.s;
    hslState.l = forcedHsl.l;
  } else {
    currentColor.getHSL(hslState);
  }
  if (hueSlider && hueValue) {
    const hueDisplay = Math.max(0, Math.min(360, Math.round(lastHueInput)));
    hueSlider.value = hueDisplay;
    hueValue.textContent = `${hueDisplay}`;
  }
  if (satSlider && satValue) {
    satSlider.value = Math.round(hslState.s * 100);
    satValue.textContent = `${satSlider.value}`;
  }
  if (lightSlider && lightValue) {
    lightSlider.value = Math.round(hslState.l * 100);
    lightValue.textContent = `${lightSlider.value}`;
  }
  updateSliderGradients();
}
function setBlockColor(hex, rawHueDeg) {
  currentColor.set(hex);
  currentColor.getHSL(hslState);
  if (typeof rawHueDeg === 'number') {
    lastHueInput = Math.max(0, Math.min(360, rawHueDeg));
  } else {
    lastHueInput = Math.max(0, Math.min(360, Math.round(hslState.h * 360)));
  }
  syncColorControls();
}
colorInput.addEventListener('input', (event) => {
  setBlockColor(event.target.value);
});
function toggleColorPopover(forceState) {
  const next = typeof forceState === 'boolean' ? forceState : !colorPopoverOpen;
  const wasOpen = colorPopoverOpen;
  colorPopoverOpen = next;
  if (colorPopover) {
    colorPopover.classList.toggle('hidden', !next);
    colorPopover.classList.toggle('open', next);
    if (next) {
      syncColorControls();
    } else if (wasOpen) {
      const hex = currentHex();
      if (hex !== lastSavedColor) {
        addRecentColor(hex);
        lastSavedColor = hex;
      }
    }
  }
}
if (colorChip) {
  colorChip.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleColorPopover();
  });
}
if (hueSlider && satSlider && lightSlider) {
  const onHslChange = () => {
    let rawHue = parseFloat(hueSlider.value);
    if (Number.isNaN(rawHue)) rawHue = lastHueInput || 0;
    rawHue = Math.min(Math.max(rawHue, 0), 360);
    lastHueInput = rawHue;
    let h = rawHue >= 360 ? 1 : rawHue / 360;
    let sRaw = Math.round(parseFloat(satSlider.value));
    if (Number.isNaN(sRaw)) sRaw = Math.round(hslState.s * 100);
    sRaw = Math.min(Math.max(sRaw, 0), 100);
    satSlider.value = sRaw;
    let s = sRaw / 100;

    let l = parseFloat(lightSlider.value) / 100;
    if (Number.isNaN(h)) h = hslState.h;
    if (Number.isNaN(s)) s = hslState.s;
    if (Number.isNaN(l)) l = hslState.l;
    // allow full desaturation (0) and full light range
    s = Math.max(0, s);
    l = Math.min(1, Math.max(0, l));
    const hslColor = tempHSLColor.setHSL(h, s, l);
    currentColor.copy(hslColor);
    syncColorControls({ h, s, l });
  };
  hueSlider.addEventListener('input', onHslChange);
  satSlider.addEventListener('input', onHslChange);
  lightSlider.addEventListener('input', onHslChange);
}
if (colorHexInput) {
  colorHexInput.addEventListener('input', (event) => {
    const val = event.target.value;
    if (/^#?[0-9a-fA-F]{6}$/.test(val)) {
      const normalized = val.startsWith('#') ? val : `#${val}`;
      setBlockColor(normalized);
    }
  });
}
if (swatches.length > 0) {
  swatches.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      const swatchColor = recentColors[idx] || btn.getAttribute('data-color') || '#ffffff';
      setBlockColor(swatchColor);
    });
  });
}
window.addEventListener('click', (event) => {
  if (!colorPopoverOpen) return;
  if (
    colorPopover &&
    !colorPopover.contains(event.target) &&
    colorChip &&
    !colorChip.contains(event.target)
  ) {
    toggleColorPopover(false);
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && colorPopoverOpen) toggleColorPopover(false);
});
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
let lastTime = performance.now();
function updateAnimations(delta) {
  const damping = getAnimDamping(); // higher = snappier, tied to buildRate
  blockGroup.children.forEach((mesh) => {
    const anim = mesh.userData.anim;
    const colorAnim = mesh.userData.colorAnim;
    const targetScale = anim
      ? anim.removing
        ? 0
        : anim.desiredScale ?? getBlockScale()
      : getBlockScale();
    const next = THREE.MathUtils.damp(mesh.scale.x, targetScale, damping, delta);
    mesh.scale.setScalar(Math.max(next, minScaleValue));

    if (anim?.removing && next <= 0.02) {
      blockGroup.remove(mesh);
      blocks.delete(mesh.userData.key);
    } else if (anim && !anim.removing && Math.abs(next - targetScale) < 0.0005) {
      mesh.scale.setScalar(targetScale);
    }

    if (colorAnim) {
      const lerpRate = Math.max(1.2, buildRate * 0.6); // faster paint transition
      colorAnim.t = Math.min(1, colorAnim.t + delta * lerpRate);
      mesh.material.color.lerpColors(colorAnim.from, colorAnim.to, colorAnim.t);
      if (colorAnim.t >= 1 - 1e-4) {
        mesh.material.color.copy(colorAnim.to);
        delete mesh.userData.colorAnim;
      }
    }
  });
}

function tick() {
  const now = performance.now();
  const delta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  updateAnimations(delta);
  if (hoverDirty && !pointerState.down) {
    updateHoverTarget();
  }
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

// Initialize UI value and a starter block
setGridSize(parseFloat(gridSlider.value));
setBlockGap(parseFloat(gapSlider.value));
setBuildDistance(parseFloat(distanceSlider.value));
setBuildRate(parseFloat(buildSlider.value));
// Initialize color from HSL defaults or input value
const initialHex =
  colorInput && colorInput.value ? colorInput.value : '#ffffff';
const initialHue = hueSlider ? parseFloat(hueSlider.value) : 20;
const initialSat = satSlider ? parseFloat(satSlider.value) : 100;
const initialLight = lightSlider ? parseFloat(lightSlider.value) : 50;
if (!Number.isNaN(initialHue) && !Number.isNaN(initialSat) && !Number.isNaN(initialLight)) {
  const col = new THREE.Color().setHSL(
    Math.min(Math.max(initialHue, 0), 360) / 360,
    Math.min(Math.max(initialSat, 0), 100) / 100,
    Math.min(Math.max(initialLight, 0), 100) / 100
  );
  setBlockColor(`#${col.getHexString()}`, initialHue);
} else {
  setBlockColor(initialHex);
}
lastSavedColor = currentHex();
renderRecentColors();
addBlockAt({ x: 0, y: 0, z: 0 });
createDistanceCircle();
updateDistanceCircle();
