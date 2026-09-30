import * as BABYLON from 'babylonjs';
import { ctx } from '../../core/context';
import { PI, rng, sHash } from '../../core/math';
import { Models } from '../../assets/models';
import { MAT } from '../../render/materials';
import { uvScale } from '../../render/uv';

/* Prop models over the generator's collider boxes.
   The generator decides gameplay (MAP.boxes); this only dresses each placement with a model from
   public/models/world, fitted to the box. Variant choice and yaw come from the map seed, so every peer sees
   the same arena. Models are merged once into a template per id and drawn as instances. */

interface Kind {
  ids: string[];
  tileX?: number;    /* repeat along the long side every ~n metres (native piece length) */
  stackY?: number;   /* stack layers every ~n metres of height (0 = cube: layer height = footprint) */
  spin?: boolean;    /* free quarter-turn yaw when the footprint is square */
}
const KINDS: Record<string, Kind> = {
  container: { ids: ['container_a', 'container_b'] },
  crate:     { ids: ['crate_a', 'crate_b', 'crate_c'], stackY: 0, spin: true },
  barrel:    { ids: ['barrel'], spin: true },
  jersey:    { ids: ['jersey_a', 'jersey_b', 'jersey_c', 'jersey_d'], tileX: 2.48 },
  sandbag:   { ids: ['sandbag'], tileX: .69, stackY: .25 },
  dumpster:  { ids: ['dumpster_a', 'dumpster_b', 'dumpster_c'] },
  trashcan:  { ids: ['trashcan'], spin: true },
  cone:      { ids: ['cone'], spin: true },
  bollard:   { ids: ['bollard'], spin: true },
  plank:     { ids: ['plank_barrier'] },
  busstop:   { ids: ['busstop_b'] },
  bench:     { ids: ['busstop_a'] },
  fenceMetal:{ ids: ['fence_metal'], tileX: 2.7 },
  fenceBrick:{ ids: ['fence_brick'], tileX: 4 }
};
const SKYLINE = ['bld_flat_a', 'bld_flat_b', 'bld_flat_c', 'bld_flat_d', 'bld_flat_e'];

export interface Tpl { mesh: BABYLON.Mesh; min: BABYLON.Vector3; size: BABYLON.Vector3 }
const TPL: Record<string, Tpl | null> = {};

/* one merged, hidden source mesh per model id (lives across arena rebuilds, like the shared materials) */
export function tpl(id: string): Tpl | null {
  if (TPL[id] !== undefined) return TPL[id];
  const cont = Models.world[id];
  if (!cont) return (TPL[id] = null);
  const inst = cont.instantiateModelsToScene(n => 'tpl_' + n, false, { doNotInstantiate: true });
  const parts: BABYLON.Mesh[] = [];
  for (const r of inst.rootNodes) for (const m of r.getChildMeshes(false)){
    if (!(m instanceof BABYLON.Mesh) || !m.getTotalVertices()) continue;
    m.computeWorldMatrix(true); parts.push(m);
  }
  const mesh = parts.length ? BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true) : null;
  inst.rootNodes.forEach(r => r.dispose(false, false));
  if (!mesh) return (TPL[id] = null);
  mesh.name = 'prop_' + id;
  mesh.isPickable = false; mesh.receiveShadows = true;
  mesh.isVisible = false;                      /* the source never draws itself; its instances do */
  const bb = mesh.getBoundingInfo().boundingBox;
  return (TPL[id] = { mesh, min: bb.minimum.clone(), size: bb.maximum.subtract(bb.minimum) });
}

export const mapProps = {
  buildProps(root: BABYLON.TransformNode){
    const R = rng(sHash(this.seed + '/props'));
    const out: BABYLON.AbstractMesh[] = [];
    const fallback: BABYLON.Mesh[] = [];
    const place = (t: Tpl, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) => {
      const m = t.mesh.createInstance(t.mesh.name + '_i');
      /* model bbox (local) -> centred on x/z, bottom on y, scaled to sx/sy/sz metres */
      const k = new BABYLON.Vector3(sx / t.size.x, sy / t.size.y, sz / t.size.z);
      const c = new BABYLON.Vector3(-(t.min.x + t.size.x / 2) * k.x, -t.min.y * k.y, -(t.min.z + t.size.z / 2) * k.z);
      const o = BABYLON.Vector3.TransformCoordinates(c, BABYLON.Matrix.RotationY(yaw));
      m.position.set(x + o.x, y + o.y, z + o.z);
      m.rotation.y = yaw; m.scaling.copyFrom(k);
      m.parent = root; m.isPickable = false; m.freezeWorldMatrix();
      out.push(m);
    };

    for (const p of this.props){
      /* explicit model (buildings, skyline): model-local lengths lw/h/ld, quarter-turn yaw; colliders were made by the generator */
      if (p.kind === 'bld'){ const t = tpl(p.id); if (t) place(t, p.x, p.y, p.z, p.rot, p.lw, p.h, p.ld); continue; }
      const K = KINDS[p.kind];
      const t = K && tpl(K.ids[Math.floor(R() * K.ids.length)]);
      if (!t){
        /* model missing: plain box in the collider's own material */
        const b = BABYLON.MeshBuilder.CreateBox('pf', { width: p.w, height: p.h, depth: p.d }, ctx.scene);
        b.position.set(p.x, p.y + p.h / 2, p.z); b.rotation.y = p.rot; uvScale(b, 2.4);
        b.material = MAT.m[p.mat] || MAT.m.concrete; b.bakeCurrentTransformIntoVertices(); fallback.push(b);
        continue;
      }
      /* local frame: model X along the box's long side */
      let yaw = p.rot, lw = p.w, ld = p.d;
      const modelLong = t.size.x > t.size.z * 1.3;
      if (modelLong ? ld > lw * 1.05 : false){ yaw += PI / 2; lw = p.d; ld = p.w; }
      if (K.spin && Math.abs(lw - ld) < .15) yaw += Math.floor(R() * 4) * PI / 2;
      else if (R() < .5) yaw += PI;                /* flip end-for-end: same footprint, more variety */
      const nx = K.tileX ? Math.max(1, Math.round(lw / K.tileX)) : 1;
      const layerH = K.stackY === 0 ? Math.min(lw, ld) : K.stackY;
      const ny = K.stackY !== undefined ? Math.max(1, Math.round(p.h / layerH)) : 1;
      const px = lw / nx, py = p.h / ny;
      const ax = Math.cos(yaw), az = -Math.sin(yaw);          /* local +X in world (Babylon LH, RotationY) */
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){
        const u = (i + .5) * px - lw / 2;
        /* stacked layers: nudge and re-roll the variant so a stack doesn't read as one stretched block */
        const tt = j ? tpl(K.ids[Math.floor(R() * K.ids.length)]) || t : t;
        const jit = j && K.spin ? (R() - .5) * .1 : 0;
        place(tt, p.x + ax * u, p.y + j * py, p.z + az * u, yaw + jit, px, py, ld);
      }
    }

    /* street lights: native size, pole on the lamp spot, head swung out over a light pool */
    const light = tpl('street_light');
    this.lampHeads = [];
    for (const L of this.lamps){
      if (!L.post) continue;
      if (!light){ this.lampHeads.push({ x: L.x, z: L.z }); continue; }
      const yaw = Math.floor(R() * 4) * PI / 2;
      const s = light.size, pole = poleX(light);
      /* instance placed so the pole (not the bbox centre) stands on L */
      const d = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(-(pole - (light.min.x + s.x / 2)), 0, 0), BABYLON.Matrix.RotationY(yaw));
      place(light, L.x + d.x, this.terrainY(L.x, L.z) - .05, L.z + d.z, yaw, s.x, s.y, s.z);
      const headX = (pole > light.min.x + s.x / 2 ? light.min.x + .25 : light.min.x + s.x - .25) - pole;
      const h = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(headX, 0, 0), BABYLON.Matrix.RotationY(yaw));
      this.lampHeads.push({ x: L.x + h.x, z: L.z + h.z });
    }

    /* skyline: tower blocks and sheds outside the perimeter, facing in (city maps place their own) */
    const ring = this.half + 16;
    for (let side = 0; side < (this.terrain ? 0 : 4); side++){
      let u = -ring;
      for (;;){
        const id = R() < .15 ? 'bld_hangar' : SKYLINE[Math.floor(R() * SKYLINE.length)];
        const b = tpl(id); if (!b) break;
        const along = b.size.x, deep = b.size.z;
        if (u + along > ring) break;         /* corners stay open so neighbouring rows never interpenetrate */
        const back = ring + deep / 2 + R() * 10;
        const yaw = side * PI / 2;
        const cx = u + along / 2;
        /* side 0: north (+z) row running along x; rotate the row around the arena for the others */
        const v = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(cx, 0, back), BABYLON.Matrix.RotationY(yaw));
        const k = id === 'bld_hangar' ? 1.4 : .9 + R() * .5;
        place(b, v.x, -.2, v.z, yaw + PI, along, b.size.y * k, deep);
        u += along + 3 + R() * 9;
      }
    }

    if (fallback.length){
      const byMat = new Map<BABYLON.Material, BABYLON.Mesh[]>();
      for (const b of fallback){ const l = byMat.get(b.material) || []; l.push(b); byMat.set(b.material, l); }
      for (const [mat, list] of byMat){
        const mm = BABYLON.Mesh.MergeMeshes(list, true, true, undefined, false, false);
        if (mm){ mm.material = mat; mm.parent = root; mm.isPickable = false; mm.receiveShadows = true; out.push(mm); }
      }
    }
    return out;
  }
};

/* x of the street light's pole: centroid of the vertices near the ground */
const POLE: Record<string, number> = {};
function poleX(t: Tpl){
  if (POLE[t.mesh.name] !== undefined) return POLE[t.mesh.name];
  const pos = t.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  let sx = 0, n = 0;
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] < t.min.y + .4){ sx += pos[i]; n++; }
  return (POLE[t.mesh.name] = n ? sx / n : t.min.x + t.size.x / 2);
}

/* Roof-down footprint of a closed building model as boxes, in fractions of its bbox:
   { u0, u1, v0, v1, hf } with u along model X, v along model Z, hf = top height / bbox height.
   Up-facing triangles are rasterised onto a 32x32 grid (max height per cell), then merged greedily. */
export interface Foot { u0: number; u1: number; v0: number; v1: number; hf: number }
const FOOT: Record<string, Foot[]> = {};
export function footprint(id: string): Foot[] {
  if (FOOT[id]) return FOOT[id];
  const t = tpl(id);
  if (!t) return (FOOT[id] = [{ u0: 0, u1: 1, v0: 0, v1: 1, hf: 1 }]);
  const G = 32, cell = new Float32Array(G * G).fill(-1);
  const pos = t.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind), idx = t.mesh.getIndices();
  const u = (x: number) => (x - t.min.x) / t.size.x * G, v = (z: number) => (z - t.min.z) / t.size.z * G, hn = (y: number) => (y - t.min.y) / t.size.y;
  for (let f = 0; f < idx.length; f += 3){
    const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
    const ax = u(pos[a]), az = v(pos[a + 2]), bx = u(pos[b]), bz = v(pos[b + 2]), cx = u(pos[c]), cz = v(pos[c + 2]);
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-6) continue;                   /* vertical faces cover no ground */
    const top = Math.max(hn(pos[a + 1]), hn(pos[b + 1]), hn(pos[c + 1]));
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(G - 1, Math.ceil(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), j1 = Math.min(G - 1, Math.ceil(Math.max(az, bz, cz)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){
      const px = i + .5, pz = j + .5;
      const w0 = (bx - px) * (cz - pz) - (cx - px) * (bz - pz), w1 = (cx - px) * (az - pz) - (ax - px) * (cz - pz), w2 = (ax - px) * (bz - pz) - (bx - px) * (az - pz);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) if (top > cell[j * G + i]) cell[j * G + i] = top;
    }
  }
  /* greedy merge: rows of equal (quantised) height, then extend downwards */
  const q = (h: number) => h < 0 ? -1 : Math.ceil(h * 8) / 8, used = new Uint8Array(G * G), out: Foot[] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++){
    const k = j * G + i, h = q(cell[k]);
    if (h < .05 || used[k]) continue;
    let i1 = i; while (i1 + 1 < G && !used[j * G + i1 + 1] && q(cell[j * G + i1 + 1]) === h) i1++;
    let j1 = j;
    for (;;){ if (j1 + 1 >= G) break; let ok = true; for (let x = i; x <= i1; x++) if (used[(j1 + 1) * G + x] || q(cell[(j1 + 1) * G + x]) !== h){ ok = false; break; } if (!ok) break; j1++; }
    for (let y = j; y <= j1; y++) for (let x = i; x <= i1; x++) used[y * G + x] = 1;
    out.push({ u0: i / G, u1: (i1 + 1) / G, v0: j / G, v1: (j1 + 1) / G, hf: h });
  }
  return (FOOT[id] = out.length ? out : [{ u0: 0, u1: 1, v0: 0, v1: 1, hf: 1 }]);
}
