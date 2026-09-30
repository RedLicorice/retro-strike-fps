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

    /* parts -> merged meshes per material */
    for (const mat in this.parts){
      const list = this.parts[mat]; if (!list.length) continue;
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

    /* lamp posts + light pools */
    const postParts = [], poolParts = [];
    for (const L of this.lamps){
      if (L.post){
        this.B && null;
        const p = BABYLON.MeshBuilder.CreateBox('lp', { width: .16, height: L.y, depth: .16 }, ctx.scene);
        p.position.set(L.x, L.y / 2, L.z); p.material = MAT.m.metal; postParts.push(p);
        const h = BABYLON.MeshBuilder.CreateBox('lh', { width: .5, height: .12, depth: .5 }, ctx.scene);
        h.position.set(L.x, L.y - .06, L.z); h.material = MAT.m.lamp; postParts.push(h);
      } else {
        const h = BABYLON.MeshBuilder.CreateBox('lh', { width: .6, height: .1, depth: .3 }, ctx.scene);
        h.position.set(L.x, L.y, L.z); h.material = MAT.m.lamp; postParts.push(h);
      }
      const pool = BABYLON.MeshBuilder.CreateGround('pool', { width: 7, height: 7, subdivisions: 1 }, ctx.scene);
      pool.position.set(L.x, (L.post ? 0.02 : L.y - 2.6), L.z);
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

    this.bakeMinimap();
    return root;
  },

  dispose(){
    for (const m of this.meshes){ try { m.dispose(false, false); } catch (e){} }
    this.meshes.length = 0;
    /* never dispose shared materials/textures — they live across arena rebuilds */
    if (this.root){ try { this.root.dispose(false, false); } catch (e){} this.root = null; }
  }
};
