# 251128_BlockBrush

BlockBrush is a blueprint-styled Three.js sandbox for building, painting, undoing/redoing, and exporting voxel blocks on an infinite fading grid. It ships with a draggable translucent UI, animated add/remove/paint workflows, history controls, instructions popover, OBJ export with vertex colors, sharpened shadows, and hover-animated controls.

## Features
- Infinite blueprint grid with distance fade and crisp white lines
- Draggable, blurred UI panel with sliders for block size, gap, build distance, and build speed
- Hover ghost preview plus animated add/remove/paint actions; undo/redo diffs snapshots and replays the same scale-up/scale-down transitions
- Reset button that smoothly shrinks all blocks out; Export button that saves an OBJ with per-vertex colors
- Color picker and palette popover with hover lift; instructions popover for quick control reference
- Toggles for wireframe, grid, distance circle, and fog visibility
- Sharpened shadow filtering with taller-range sun setup for high stacks
- Orbit (MMB), pan (Shift+MMB), scroll zoom; UI buttons animated on hover

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

## Deployment
- **Local production preview:** `npm install`, then `npm run build -- --base=./` followed by `npm run preview` to inspect the compiled bundle with relative paths.
- **Publish to GitHub Pages:** From a clean `main`, run `npm run build -- --base=./`. Checkout (or create) the `gh-pages` branch in a separate worktree, copy everything inside `dist/` plus a `.nojekyll` marker to its root, commit with a descriptive message, `git push origin gh-pages`, then switch back to `main`.
- **Live demo:** https://ekimroyrp.github.io/251128_BlockBrush/
