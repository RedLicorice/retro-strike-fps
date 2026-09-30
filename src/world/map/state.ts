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

  bounds: { min: -33, max: 33 },

  _topSorted: null,

  reset(){
    this.boxes.length = 0; this.slopes.length = 0; this.cover.length = 0; this.spawns.length = 0;
    this.lamps.length = 0; this.decals.length = 0; this.parts = {}; this._topSorted = null;
  },

  P(mat){ if (!this.parts[mat]) this.parts[mat] = []; return this.parts[mat]; }
};
