import * as BABYLON from 'babylonjs';
import { ctx } from '../../core/context';
import { PI, TAU, V3 } from '../../core/math';
import { MAT } from '../../render/materials';
import { TX } from '../../render/textures';
import { uvScale } from '../../render/uv';

export const mapMesh = {
  /* ---------------- mesh build ---------------- */
  build(){
    this.dispose();
    const root = new BABYLON.TransformNode('mapRoot', ctx.scene); this.root = root;
    const half = this.half, size = half * 2;

    /* sky dome */
    if (!MAT.m.sky){
      const sm = new BABYLON.StandardMaterial('sky', ctx.scene);
      const t = TX.mk('t_sky', 1024, TX.sky(), false);
      sm.diffuseTexture = t; sm.emissiveColor = new BABYLON.Color3(1, 1, 1);
      sm.disableLighting = true; sm.backFaceCulling = false; sm.specularColor = new BABYLON.Color3(0, 0, 0);
      (sm.diffuseTexture as BABYLON.Texture).vScale = -1; sm.freeze();
      MAT.m.sky = sm;
    }
    const sky = BABYLON.MeshBuilder.CreateSphere('sky', { diameter: 480, segments: 16, sideOrientation: BABYLON.Mesh.BACKSIDE }, ctx.scene);
    sky.material = MAT.m.sky; sky.isPickable = false; sky.applyFog = false; sky.parent = root;
    sky.infiniteDistance = true; sky.rotation.x = PI; sky.scaling.y = .72;

    /* sun disc */
    const sunM = BABYLON.MeshBuilder.CreateDisc('sun', { radius: 16, tessellation: 20 }, ctx.scene);
    sunM.position.set(92, 38, 70); sunM.lookAt(V3(0, 8, 0));
    sunM.material = MAT.m.sunDisc; sunM.isPickable = false; sunM.applyFog = false; sunM.parent = root; sunM.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    if (this.terrain) this.buildCityGround(root);
    else this.buildArenaGround(root, size);

    this.buildParts(root);

    /* prop models (containers, crates, barriers, sandbags, street lights, buildings, skyline) */
    for (const m of this.buildProps(root)) this.meshes.push(m);
    this.buildLamps(root);
    this.buildDecals(root);

    this.bakeMinimap();
    return root;
  },

  buildArenaGround(root, size){
    /* distant hills (silhouette ring so the horizon isn't a void) */
    const hills = [];
    for (let i = 0; i < 18; i++){
      const a = i / 18 * TAU + .2, d = 95 + (i % 5) * 8, w = 18 + (i % 4) * 7, hgt = 7 + (i * 3 % 11);
      const m = BABYLON.MeshBuilder.CreateBox('hill', { width: w, height: hgt, depth: 8 }, ctx.scene);
      m.position.set(Math.sin(a) * d, hgt * .35 - 2, Math.cos(a) * d);
      m.rotation.y = a; m.material = MAT.m.hill; m.bakeCurrentTransformIntoVertices(); hills.push(m);
    }
    if (hills.length){
      const hm = BABYLON.Mesh.MergeMeshes(hills, true, true, undefined, false, false);
      if (hm){ hm.material = MAT.m.hill; hm.isPickable = false; hm.parent = root; hm.applyFog = true; this.meshes.push(hm); }
    }

    /* arena floor (playable) + outer sand apron so looking over a wall never shows a hole */
    const gnd = BABYLON.MeshBuilder.CreateGround('gnd', { width: size + 2, height: size + 2, subdivisions: 1, updatable: false }, ctx.scene);
    uvScale(gnd, 2.0); gnd.material = MAT.m.floor; gnd.parent = root; gnd.isPickable = false; gnd.receiveShadows = true;
    const apron = BABYLON.MeshBuilder.CreateGround('apron', { width: size + 90, height: size + 90, subdivisions: 1 }, ctx.scene);
    apron.position.y = -.06; uvScale(apron, 3.4); apron.material = MAT.m.sand; apron.parent = root; apron.isPickable = false; apron.receiveShadows = true;

  },

  /* parts -> merged meshes per material; on big maps also per 64 m tile so culling can skip far chunks */
  buildParts(root){
    const tile = this.terrain ? 64 : 0;
    const groups: Record<string, any[]> = {};
    for (const mat in this.parts) for (const o of this.parts[mat]){
      const key = tile ? mat + '|' + Math.floor(o.p[0] / tile) + ',' + Math.floor(o.p[2] / tile) : mat;
      (groups[key] || (groups[key] = [])).push(o);
    }
    for (const key in groups){
      const mat = key.split('|')[0], list = groups[key];
      const ms = [];
      for (const o of list){
        let m;
        if (o.cyl){
          m = BABYLON.MeshBuilder.CreateCylinder('p', { diameter: o.s[0], height: o.s[1], tessellation: o.cyl }, ctx.scene);
          uvScale(m, 1.6);
        } else {
          m = BABYLON.MeshBuilder.CreateBox('p', { width: o.s[0], height: o.s[1], depth: o.s[2] }, ctx.scene);
          uvScale(m, mat === 'crate' ? 1.5 : 2.4);
        }
        m.position.set(o.p[0], o.p[1], o.p[2]);
        if (o.r) m.rotation.y = o.r;
        if (o.rx) m.rotation.x = o.rx;
        if (o.rz) m.rotation.z = o.rz;
        m.material = MAT.m[mat] || MAT.m.concrete;
        m.bakeCurrentTransformIntoVertices();
        ms.push(m);
      }
      let merged = null;
      const CH = 900;
      for (let i = 0; i < ms.length; i += CH){
        const chunk = ms.slice(i, i + CH);
        const mm = BABYLON.Mesh.MergeMeshes(chunk, true, true, undefined, false, false);
        if (!mm) continue;
        mm.material = MAT.m[mat] || MAT.m.concrete;
        mm.isPickable = false; mm.parent = root; mm.receiveShadows = true; mm.freezeWorldMatrix();
        mm.doNotSyncBoundingInfo = true;
        this.meshes.push(mm);
      }
    }

  },

  buildLamps(root){
    /* lamp fittings + light pools (street lights come from the props; their pools sit under the head) */
    const postParts = [];
    let head = 0;
    for (const L of this.lamps){
      if (L.post){
        const h = this.lampHeads[head++]; L.px = h.x; L.pz = h.z;
      } else {
        const h = BABYLON.MeshBuilder.CreateBox('lh', { width: .6, height: .1, depth: .3 }, ctx.scene);
        h.position.set(L.x, L.y, L.z); h.material = MAT.m.lamp; postParts.push(h);
      }
      const pool = BABYLON.MeshBuilder.CreateGround('pool', { width: 7, height: 7, subdivisions: 1 }, ctx.scene);
      pool.position.set(L.post ? L.px : L.x, (L.post ? this.standable(L.px, L.pz) + .07 : L.y - 2.6), L.post ? L.pz : L.z);
      if (!MAT.m.pool){
        const pm = new BABYLON.StandardMaterial('pool', ctx.scene);
        const t = TX.mk('t_pool', 128, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
          g.addColorStop(0, 'rgba(255,205,130,.42)'); g.addColorStop(.55, 'rgba(255,180,90,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(0, 0, s, s); }, false);
        pm.diffuseTexture = t; pm.opacityTexture = t; pm.emissiveColor = new BABYLON.Color3(.5, .38, .2);
        pm.diffuseColor = new BABYLON.Color3(0, 0, 0); pm.specularColor = new BABYLON.Color3(0, 0, 0);
        pm.disableDepthWrite = true; pm.freeze(); MAT.m.pool = pm;
      }
      pool.material = MAT.m.pool; pool.isPickable = false; pool.parent = root;
    }
    if (postParts.length){
      const mm = BABYLON.Mesh.MergeMeshes(postParts, true, true, undefined, false, false);
      if (mm){ mm.material = MAT.m.metal; mm.isPickable = false; mm.parent = root; this.meshes.push(mm); }
    }

  },

  buildDecals(root){
    /* ground decals */
    const dparts = [];
    for (const d of this.decals){
      const p = BABYLON.MeshBuilder.CreatePlane('d', { width: d.s, height: d.s }, ctx.scene);
      p.rotation.x = PI / 2; p.rotation.z = d.r;
      p.position.set(d.x, this.standable(d.x, d.z) + .02, d.z);
      p.material = MAT.m[d.m]; p.bakeCurrentTransformIntoVertices(); dparts.push(p);
    }
    if (dparts.length){
      const dm = BABYLON.Mesh.MergeMeshes(dparts, true, true, undefined, false, false);
      if (dm){ dm.material = MAT.m.fxDecal; dm.isPickable = false; dm.parent = root; dm.renderingGroupId = 0; }
    }
  },

  /* ---------------- city ground: terrain tiles, roads + sidewalks draped on it, paved squares ---------------- */
  buildCityGround(root){
    const T = this.terrain, n = T.n, CH = 16;
    const mk = (name, pos, idx, uv, mat) => {
      const m = new BABYLON.Mesh(name, ctx.scene), vd = new BABYLON.VertexData(), nrm = [];
      BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
      vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv; vd.applyToMesh(m);
      m.material = mat; m.parent = root; m.isPickable = false; m.receiveShadows = true; m.freezeWorldMatrix();
      this.meshes.push(m); return m;
    };
    /* terrain in 64 m tiles (16 x 16 quads) */
    for (let tj = 0; tj < n - 1; tj += CH) for (let ti = 0; ti < n - 1; ti += CH){
      const pos = [], idx = [], uv = [], ni = Math.min(CH, n - 1 - ti), nj = Math.min(CH, n - 1 - tj);
      for (let j = 0; j <= nj; j++) for (let i = 0; i <= ni; i++){
        const x = -T.o + (ti + i) * T.res, z = -T.o + (tj + j) * T.res;
        pos.push(x, T.h[(tj + j) * n + ti + i], z); uv.push(x / 5, z / 5);
      }
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++){
        const a = j * (ni + 1) + i, b = a + 1, c = a + ni + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      mk('terrain', pos, idx, uv, MAT.m.sand);
    }
    /* a strip following the terrain: centre line (x0,z0)->(x1,z1), lateral offsets o0..o1, raised by lift */
    const strip = (x0, z0, x1, z1, o0, o1, lift, mat, name) => {
      const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, px = -dz, pz = dx;
      const seg = 64, step = 4;
      for (let s0 = 0; s0 < L; s0 += seg){
        const pos = [], idx = [], uv = [];
        const s1 = Math.min(L, s0 + seg), k = Math.ceil((s1 - s0) / step);
        for (let i = 0; i <= k; i++){
          const s = s0 + (s1 - s0) * i / k, cx = x0 + dx * s, cz = z0 + dz * s;
          for (const o of [o0, o1]){
            const x = cx + px * o, z = cz + pz * o;
            pos.push(x, this.terrainY(x, z) + lift, z); uv.push(o / 4, s / 4);
          }
        }
        for (let i = 0; i < k; i++){ const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        mk(name, pos, idx, uv, mat);
      }
    };
    for (const r of this.roads){
      const hw = r.w / 2, walk = 2.2;
      strip(r.x0, r.z0, r.x1, r.z1, -hw + walk, hw - walk, r.x0 === r.x1 ? .06 : .05, MAT.m.road, 'road');
      strip(r.x0, r.z0, r.x1, r.z1, -hw, -hw + walk, .1, MAT.m.walk, 'walk');
      strip(r.x0, r.z0, r.x1, r.z1, hw - walk, hw, .1, MAT.m.walk, 'walk');
    }
    for (const p of this.pavers){
      const g = BABYLON.MeshBuilder.CreateGround('pavers', { width: p.x1 - p.x0, height: p.z1 - p.z0 }, ctx.scene);
      g.position.set((p.x0 + p.x1) / 2, p.y + .05, (p.z0 + p.z1) / 2); uvScale(g, 3);
      g.material = MAT.m.pavers; g.parent = root; g.isPickable = false; g.receiveShadows = true; g.freezeWorldMatrix();
      this.meshes.push(g);
    }
  },

  dispose(){
    for (const m of this.meshes){ try { m.dispose(false, false); } catch (e){} }
    this.meshes.length = 0;
    /* never dispose shared materials/textures — they live across arena rebuilds */
    if (this.root){ try { this.root.dispose(false, false); } catch (e){} this.root = null; }
  }
};
