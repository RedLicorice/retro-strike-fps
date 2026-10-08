import * as BABYLON from 'babylonjs';

export type Quality = 'low' | 'med' | 'high';

/* Runtime handles that are created at boot and swapped at runtime.
   ES module bindings are read-only for importers, so mutable shared state lives here. */
export const ctx = {
  /* AbstractEngine, not Engine: the renderer is WebGPUEngine when the browser supports it
     (see render/engine.ts) and plain Engine (WebGL2) otherwise. */
  engine: null as BABYLON.AbstractEngine | null,
  scene: null as BABYLON.Scene | null,
  canvas: null as HTMLCanvasElement | null,
  cam: null as BABYLON.FreeCamera | null,
  gunCam: null as BABYLON.FreeCamera | null,
  QUALITY: 'med' as Quality,
  IS_TOUCH: false,
  DT: 1 / 60,
  /* 0 = first person, 1 = third person (smoothed while the camera boom swings) */
  view3p: 0
};
