# 251128_BlockBrush

BlockBrush is a blueprint-styled Three.js sandbox for building, painting, undoing/redoing, and exporting voxel blocks on an infinite fading grid. It ships with a draggable translucent UI, animated add/remove/paint workflows, history controls, instructions popover, and an OBJ export that preserves per-block colors.

## Features
- Infinite blueprint grid with distance fade and crisp white lines
- Draggable, blurred UI panel with sliders for block size, gap, build distance, and build speed
- Hover ghost preview, animated add/remove/paint actions, and history-aware undo/redo with the same scale-up/scale-down transitions
- Reset button that smoothly shrinks all blocks out; Export button that saves an OBJ with vertex colors
- Color picker and palette with popover; instructions popover matching UI styling
- Toggles for wireframe, grid, distance circle, and fog visibility
- Main sun/shadow setup with sharpened shadows for tall stacks
- Orbit (MMB), pan (Shift+MMB), and scroll zoom camera controls

## Getting Started
1. Clone the repository: `git clone https://github.com/ekimroyrp/251128_BlockBrush.git`
2. Navigate into the project: `cd 251128_BlockBrush`
3. Install dependencies: `npm install`
4. Run the dev server: `npm run dev`
5. Build for production: `npm run build`

## Controls
- LMB + drag: add blocks on grid or stack onto hit faces
- RMB + drag: remove blocks under cursor
- Shift + LMB + drag: paint blocks to the current color
- MMB: orbit camera
- Shift + MMB: pan camera
- Scroll: zoom
