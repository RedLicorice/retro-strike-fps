import { DEFAULT_LOADOUT, WBY } from '../data/weapons';
import { CHAR_BY, DEFAULT_CHARACTER } from '../data/characters';
import { clamp } from './math';

/* ------------------------------ A1. SAVE ------------------------------ */
export const Save = {
  KEY: 'retrostrike_v1',
  data: null,
  defaults(){
    return {
      name: 'VIPER',
      settings: { sens: 1, fov: 85, vol: .7, quality: 'med', invY: false, shake: true, touch: null, fps: true, view3p: false, fpArms: false, autoAds: true },
      loadout: { ...DEFAULT_LOADOUT },
      character: DEFAULT_CHARACTER,
      stats: { kills: 0, deaths: 0, hs: 0, dmg: 0, shots: 0, hits: 0, score: 0, best: 0, matches: 0, wins: 0, time: 0, wave: 0 },
      wpn: {},
      seed: '',
      map: 'arena'
    };
  },
  load(){
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e){ d = null; }
    this.data = Object.assign(this.defaults(), d || {});
    this.data.settings = Object.assign(this.defaults().settings, (d && d.settings) || {});
    this.data.stats = Object.assign(this.defaults().stats, (d && d.stats) || {});
    this.data.loadout = Object.assign(this.defaults().loadout, (d && d.loadout) || {});
    if (!this.data.wpn) this.data.wpn = {};
    /* saves from older builds may reference weapons / operators that no longer exist */
    for (const k of [0, 1, 2]){
      const w = WBY[this.data.loadout[k]];
      if (!w || w.slot !== k) this.data.loadout[k] = DEFAULT_LOADOUT[k];
    }
    if (!CHAR_BY[this.data.character]) this.data.character = DEFAULT_CHARACTER;
    return this.data;
  },
  flush(){ try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e){} },
  w(id){
    if (!this.data.wpn[id]) this.data.wpn[id] = { lvl: 1, xp: 0, kills: 0, hs: 0, dmg: 0, shots: 0, hits: 0, used: 0 };
    return this.data.wpn[id];
  },
  need(l){ return Math.floor(90 * Math.pow(l, 1.42)); },
  addXP(id, amt){
    const w = this.w(id); w.xp += amt; let ups = 0;
    while (w.xp >= this.need(w.lvl)){ w.xp -= this.need(w.lvl); w.lvl++; ups++; }
    return ups;
  },
  xpPct(id){ const w = this.w(id); return clamp(w.xp / this.need(w.lvl), 0, 1); },
  /* mastery bonus: +% damage & -% recoil per level (capped) */
  dmgMul(id){ return 1 + Math.min(.30, (this.w(id).lvl - 1) * .012); },
  recMul(id){ return Math.max(.72, 1 - Math.min(.28, (this.w(id).lvl - 1) * .011)); },
  spreadMul(id){ return Math.max(.75, 1 - Math.min(.25, (this.w(id).lvl - 1) * .010)); }
};
