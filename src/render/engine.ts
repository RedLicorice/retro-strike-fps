import * as BABYLON from 'babylonjs';

/* ------------------------------ RENDER DEVICE SELECTION ------------------------------
   One place that decides WebGPU vs WebGL2 and owns the engine creation options.

   `EngineFactory.CreateAsync` is Babylon's own "best engine" helper: it awaits
   `WebGPUEngine.IsSupportedAsync` (navigator.gpu + a non-null requestAdapter) and builds a
   WebGPUEngine when that resolves true, otherwise `new Engine(canvas, undefined, options)`
   (WebGL2, falling back to WebGL1 internally). We use it rather than hand-rolling the probe,
   but we do NOT trust it to always settle — see WEBGPU_INIT_TIMEOUT_MS below. */

/* The old call site was `new BABYLON.Engine(canvas, true, { antialias: false, ..., adaptToDeviceRatio: false }, true)`,
   i.e. both flags were set twice with conflicting values. Checked against Babylon 8.56's
   AbstractEngine constructor — the POSITIONAL arguments win, not the options object:
     `this.adaptToDeviceRatio = null != n && n;  options.antialias = null != e ? e : options.antialias;`
   so the engine that actually shipped ran with antialias ON and adaptToDeviceRatio ON, the
   opposite of what the options object read. Confirmed with the user which was intended: the
   options object was right — antialias off for crisp retro/PS2-era edges (and no MSAA cost,
   4x on the WebGPU main pass), adaptToDeviceRatio off since quality.ts already computes its
   own DPR-based hardware scaling and the two would otherwise double-count on a DPR change. */
const ANTIALIAS = false;
const ADAPT_TO_DEVICE_RATIO = false;

/* `preserveDrawingBuffer` is a WebGL context attribute only (not part of WebGPUEngineOptions);
   `false` is already the WebGL default, so it is kept purely so the WebGL path stays identical
   to the old call. Everything else here lives on AbstractEngineOptions and is honoured by both
   backends; `powerPreference: 'high-performance'` is valid for WebGL (WebGLPowerPreference) and
   for WebGPU (GPUPowerPreference, passed straight to navigator.gpu.requestAdapter). */
function engineOptions(): BABYLON.EngineOptions {
  return {
    antialias: ANTIALIAS,
    stencil: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    adaptToDeviceRatio: ADAPT_TO_DEVICE_RATIO
  };
}

/* WebGPUEngine.CreateAsync wraps initAsync in a promise with NO reject handler
   (`new Promise(res => engine.initAsync(...).then(() => res(engine)))`), so an initAsync
   failure — most plausibly requestDevice() failing on a machine whose requestAdapter()
   succeeded — leaves the promise pending forever instead of throwing. A try/catch alone can
   therefore not save the boot; we race a timeout as well so a broken WebGPU stack can never
   hang a browser that would have been fine on WebGL. */
const WEBGPU_INIT_TIMEOUT_MS = 10000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('engine creation timed out after ' + ms + 'ms')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/* A canvas can only ever hand out one kind of context: if WebGPU init got as far as
   `canvas.getContext('webgpu')` and then failed, `getContext('webgl2')` on that same element
   returns null and the fallback would die too. Swapping in a pristine clone (same id/classes,
   no context) costs nothing because it only runs on the failure path, and the canvas has no
   listeners yet — Input.init() reads ctx.canvas later, during Boot.run(). */
function freshCanvas(old: HTMLCanvasElement): HTMLCanvasElement {
  const next = old.cloneNode(false) as HTMLCanvasElement;
  old.replaceWith(next);
  return next;
}

export type EngineBoot = { engine: BABYLON.AbstractEngine; canvas: HTMLCanvasElement };

/* Resolves with the best available engine. Throws only if WebGL is unavailable too. */
export async function createEngine(canvas: HTMLCanvasElement): Promise<EngineBoot> {
  let engine: BABYLON.AbstractEngine | null = null;
  let used = canvas;
  try {
    engine = await withTimeout(BABYLON.EngineFactory.CreateAsync(canvas, engineOptions()), WEBGPU_INIT_TIMEOUT_MS);
  } catch (e){
    /* The orphaned WebGPU attempt may still be in flight; it holds no render loop, and its
       canvas is about to be detached, so it is inert. */
    console.error('[engine] best-engine selection failed, falling back to WebGL:', e);
  }
  if (!engine){
    used = freshCanvas(canvas);
    engine = new BABYLON.Engine(used, undefined, engineOptions());
  }

  /* Neither backend copies options.adaptToDeviceRatio onto the engine property that resize()
     reads (WebGPUEngine calls `super(antialias, options)` with no positional arg, and
     EngineFactory calls `new Engine(canvas, undefined, options)` likewise), so the flag has to
     be set here too, to keep the two backends identical. options.adaptToDeviceRatio is still
     read for the initial hardware scaling level, which is why it stays in engineOptions(). */
  engine.adaptToDeviceRatio = ADAPT_TO_DEVICE_RATIO;

  console.log('[engine] ' + (engine.isWebGPU ? 'WebGPU' : 'WebGL' + ((engine as any).webGLVersion || 1)) + ' • Babylon ' + BABYLON.AbstractEngine.Version);
  return { engine, canvas: used };
}

/* Short label for the RENDERER chip in the menu. */
export function rendererName(engine: BABYLON.AbstractEngine): string {
  if (engine.isWebGPU) return 'WEBGPU';
  const v = (engine as BABYLON.AbstractEngine & { webGLVersion?: number }).webGLVersion;
  return (v || 1) >= 2 ? 'WEBGL2' : 'WEBGL';
}
