/* =====================================================================
   B) PROCEDURAL CQB ARENA GENERATOR
   Grid of cells: even index rows/columns are guaranteed clear corridors
   (connectivity is structural, never accidental). Odd/odd cells host
   modular blocks: containers, bunkers, towers, ruins, barricades, ramps.
   ===================================================================== */
export const mapState = {
  W: 11,

  H: 11,

  CELL: 6,

  WALLH: 5.0,

  half: 33,

  seed: '--------',

  /* 'arena' | 'city' | 'city:<heightmap>' */
  mapId: 'arena',

  /* city only: road centre lines { x0, z0, x1, z1, w } and paved squares { x0, z0, x1, z1, y } */
  roads: [] as any[],
  pavers: [] as any[],

  boxes: [],

  slopes: [],

  cover: [],

  spawns: [],

  lamps: [],

  decals: [],

  parts: {} as Record<string, any[]>,

  meshes: [],

  root: null,

  mmCanvas: null,

  nav: null,
  /* model placements fitted to collider boxes: { kind, x, z, y, w, h, d, rot } */
  props: [] as any[],
  /* street-light head positions from the last build (light pools go under them) */
  lampHeads: [] as { x: number; z: number }[],

  bounds: { min: -33, max: 33 },

  _topSorted: null,

  reset(){
    this.boxes.length = 0; this.slopes.length = 0; this.cover.length = 0; this.spawns.length = 0;
    this.lamps.length = 0; this.decals.length = 0; this.props.length = 0; this.parts = {}; this._topSorted = null;
    this.terrain = null; this.roads = []; this.pavers = [];
  },

  P(mat){ if (!this.parts[mat]) this.parts[mat] = []; return this.parts[mat]; }
};
