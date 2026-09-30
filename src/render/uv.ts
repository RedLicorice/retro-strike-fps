import * as BABYLON from 'babylonjs';

/* UV scale by per-face world dimensions (keeps texel density even after merge) */
export function uvScale(mesh, tile){
  const n = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
  const uv = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
  if (!n || !uv) return;
  const bb = mesh.getBoundingInfo().boundingBox;
  const sx = bb.maximumWorld.x - bb.minimumWorld.x, sy = bb.maximumWorld.y - bb.minimumWorld.y, sz = bb.maximumWorld.z - bb.minimumWorld.z;
  for (let i = 0, v = 0; i < uv.length; i += 2, v += 3){
    const ax = Math.abs(n[v]), ay = Math.abs(n[v + 1]), az = Math.abs(n[v + 2]);
    let du, dv;
    if (ay >= ax && ay >= az){ du = sx; dv = sz; }
    else if (ax >= az){ du = sz; dv = sy; }
    else { du = sx; dv = sy; }
    uv[i] *= Math.max(.15, du / tile); uv[i + 1] *= Math.max(.15, dv / tile);
  }
  mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, uv, false);
}
