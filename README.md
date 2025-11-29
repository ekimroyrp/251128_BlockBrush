# 251128_BlockBrush

BlockBrush is a blueprint-styled Three.js prototype for painting and erasing voxel blocks on an infinite, fading grid. It demonstrates a draggable UI panel, adjustable grid size, and mouse-driven block placement/removal with orbit/pan camera controls.

## Features
- Infinite blueprint grid with distance fade and white lines
- Draggable, translucent UI panel with grid-size slider
- Block painting (LMB drag) and erasing (RMB drag) snapped to grid, stacking on hit faces
- Orbit (MMB), pan (Shift+MMB), and scroll zoom camera controls

## Getting Started
1. Clone the repository: `git clone https://github.com/ekimroyrp/251128_BlockBrush.git`
2. Navigate into the project: `cd 251128_BlockBrush`
3. Install dependencies: `npm install`
4. Run the dev server: `npm run dev`
5. Build for production: `npm run build`

## Controls
- Left click + drag: add blocks on grid or stack onto hit faces
- Right click + drag: delete blocks under cursor
- Middle mouse: orbit; Shift + middle mouse: pan; Scroll: zoom
