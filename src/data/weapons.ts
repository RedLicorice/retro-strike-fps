/* ------------------------------ WEAPON DATA ------------------------------
   Every firearm maps to a GLB in public/models/weapons/<id>.glb.
   Real-world basis (calibre, cyclic rate, capacity, length, weight) is in `real`;
   game stats are derived from it:
     dmg    damage per projectile at close range (pellet damage for shotguns)
     hs     headshot multiplier            rpm   cyclic / practical rate of fire
     mag    capacity                       res   reserve ammo
     rld    reload time (s); rldPer = extra seconds per missing round for tube-fed guns
     hip/ads  spread cone radius in degrees (shotguns: pellet cone)
     rec    [vertical, horizontal] recoil in degrees   spd  move-speed multiplier (from weight)
     adsT   aim-down-sights time (s)       range metres before damage stops falling off
     fo/fmin  falloff: damage *= clamp(1 - t/range * fo, fmin, 1)   (defaults .38 / .55)
     pen    wall penetration (0..1)        act   action (auto/semi/bolt/pump/lever) for sound + feel
     sight  iron | scope4 | scope10        snd   synth params for the procedural gunshot */
export interface FirearmDef {
  id: string; name: string; cls: string; slot: 0 | 1;
  dmg: number; hs: number; rpm: number; mag: number; res: number; rld: number; rldPer?: number;
  hip: number; ads: number; rec: [number, number]; spd: number; adsT: number; range: number;
  fo?: number; fmin?: number; pellets?: number; auto: 0 | 1; pen: number;
  act: 'auto' | 'semi' | 'bolt' | 'pump' | 'lever'; sight: 'iron' | 'scope4' | 'scope10';
  snd: { body: number; crack: number; tail: number; thump: number };
  real: { cal: string; rpm: string; cap: number; len: number; kg: number; mv: number };
  melee?: 0 | 1;
}

export const WEAPONS: FirearmDef[] = [
  /* ---- assault rifles ---- */
  { id: 'ak47', name: 'AK-47', cls: 'ASSAULT RIFLE', slot: 0, dmg: 34, hs: 2.4, rpm: 600, mag: 30, res: 150, rld: 2.6,
    hip: 2.3, ads: .30, rec: [1.30, .36], spd: .95, adsT: .24, range: 210, auto: 1, pen: .55, act: 'auto', sight: 'iron',
    snd: { body: 900, crack: 5200, tail: .34, thump: 120 }, real: { cal: '7.62×39mm', rpm: '600', cap: 30, len: 880, kg: 3.3, mv: 715 } },
  { id: 'm4a1', name: 'M4A1', cls: 'ASSAULT RIFLE', slot: 0, dmg: 29, hs: 2.3, rpm: 850, mag: 30, res: 150, rld: 2.3,
    hip: 2.0, ads: .24, rec: [1.0, .28], spd: .97, adsT: .21, range: 230, auto: 1, pen: .45, act: 'auto', sight: 'iron',
    snd: { body: 1100, crack: 6200, tail: .28, thump: 140 }, real: { cal: '5.56×45mm', rpm: '700–970', cap: 30, len: 838, kg: 2.9, mv: 900 } },
  { id: 'scar', name: 'SCAR-H', cls: 'ASSAULT RIFLE', slot: 0, dmg: 42, hs: 2.3, rpm: 600, mag: 20, res: 120, rld: 2.5,
    hip: 2.4, ads: .26, rec: [1.65, .38], spd: .93, adsT: .26, range: 260, auto: 1, pen: .7, act: 'auto', sight: 'iron',
    snd: { body: 800, crack: 4800, tail: .38, thump: 105 }, real: { cal: '7.62×51mm', rpm: '600', cap: 20, len: 965, kg: 3.6, mv: 770 } },
  /* ---- SMGs ---- */
  { id: 'mp5', name: 'MP5A2', cls: 'SMG', slot: 0, dmg: 22, hs: 2.0, rpm: 800, mag: 30, res: 180, rld: 2.2,
    hip: 1.5, ads: .22, rec: [.72, .20], spd: 1.02, adsT: .17, range: 130, auto: 1, pen: .22, act: 'auto', sight: 'iron',
    snd: { body: 1300, crack: 6600, tail: .22, thump: 150 }, real: { cal: '9×19mm', rpm: '800', cap: 30, len: 680, kg: 2.5, mv: 400 } },
  { id: 'mp7', name: 'MP7A1', cls: 'SMG', slot: 0, dmg: 19, hs: 2.1, rpm: 950, mag: 40, res: 200, rld: 2.0,
    hip: 1.4, ads: .20, rec: [.55, .18], spd: 1.05, adsT: .15, range: 150, auto: 1, pen: .45, act: 'auto', sight: 'iron',
    snd: { body: 1500, crack: 7400, tail: .18, thump: 165 }, real: { cal: '4.6×30mm', rpm: '950', cap: 40, len: 638, kg: 1.9, mv: 680 } },
  { id: 'vector', name: 'KRISS VECTOR', cls: 'SMG', slot: 0, dmg: 24, hs: 1.9, rpm: 1150, mag: 25, res: 150, rld: 2.1,
    hip: 1.6, ads: .24, rec: [.48, .30], spd: 1.03, adsT: .17, range: 90, auto: 1, pen: .2, act: 'auto', sight: 'iron',
    snd: { body: 1150, crack: 6000, tail: .20, thump: 130 }, real: { cal: '.45 ACP', rpm: '1100–1200', cap: 25, len: 620, kg: 2.7, mv: 290 } },
  /* ---- sniper / rifles ---- */
  { id: 'awp', name: 'AWP', cls: 'SNIPER RIFLE', slot: 0, dmg: 110, hs: 2.0, rpm: 42, mag: 10, res: 30, rld: 3.6,
    hip: 4.5, ads: .02, rec: [3.4, .5], spd: .85, adsT: .38, range: 450, auto: 0, pen: .9, act: 'bolt', sight: 'scope10',
    snd: { body: 700, crack: 4200, tail: .62, thump: 95 }, real: { cal: '7.62×51mm', rpm: 'bolt', cap: 10, len: 1180, kg: 6.5, mv: 850 } },
  { id: 'r700', name: 'REMINGTON 700', cls: 'RIFLE', slot: 0, dmg: 88, hs: 2.3, rpm: 55, mag: 5, res: 30, rld: 2.9,
    hip: 3.6, ads: .03, rec: [2.7, .4], spd: .92, adsT: .30, range: 380, auto: 0, pen: .8, act: 'bolt', sight: 'scope4',
    snd: { body: 760, crack: 4400, tail: .55, thump: 100 }, real: { cal: '.308 Win', rpm: 'bolt', cap: 5, len: 1070, kg: 4.1, mv: 860 } },
  { id: 'm336', name: 'MARLIN 336', cls: 'RIFLE', slot: 0, dmg: 64, hs: 2.2, rpm: 90, mag: 6, res: 36, rld: .6, rldPer: .45,
    hip: 2.6, ads: .06, rec: [2.1, .35], spd: .97, adsT: .22, range: 240, auto: 0, pen: .55, act: 'lever', sight: 'iron',
    snd: { body: 820, crack: 4700, tail: .45, thump: 110 }, real: { cal: '.30-30 Win', rpm: 'lever', cap: 6, len: 981, kg: 3.4, mv: 700 } },
  /* ---- shotguns: 9 × 00 buck ---- */
  { id: 'm1014', name: 'BENELLI M4', cls: 'SHOTGUN', slot: 0, dmg: 12, pellets: 9, hs: 1.5, rpm: 240, mag: 7, res: 35, rld: .5, rldPer: .42,
    hip: 3.2, ads: 2.6, rec: [2.2, .5], spd: .94, adsT: .22, range: 30, fo: 1, fmin: .15, auto: 0, pen: .1, act: 'semi', sight: 'iron',
    snd: { body: 600, crack: 3600, tail: .50, thump: 85 }, real: { cal: '12 ga', rpm: 'semi', cap: 7, len: 1010, kg: 3.8, mv: 408 } },
  { id: 'm500', name: 'MOSSBERG 500', cls: 'SHOTGUN', slot: 0, dmg: 14, pellets: 9, hs: 1.5, rpm: 70, mag: 6, res: 30, rld: .5, rldPer: .5,
    hip: 3.0, ads: 2.4, rec: [2.6, .5], spd: .96, adsT: .22, range: 32, fo: 1, fmin: .15, auto: 0, pen: .1, act: 'pump', sight: 'iron',
    snd: { body: 580, crack: 3400, tail: .52, thump: 82 }, real: { cal: '12 ga', rpm: 'pump', cap: 6, len: 1003, kg: 3.1, mv: 404 } },
  { id: 'cruiser', name: 'M500 CRUISER', cls: 'SHOTGUN', slot: 0, dmg: 13, pellets: 9, hs: 1.4, rpm: 75, mag: 6, res: 30, rld: .5, rldPer: .46,
    hip: 4.2, ads: 3.6, rec: [3.2, .8], spd: 1.02, adsT: .16, range: 22, fo: 1, fmin: .12, auto: 0, pen: .1, act: 'pump', sight: 'iron',
    snd: { body: 560, crack: 3300, tail: .48, thump: 80 }, real: { cal: '12 ga', rpm: 'pump', cap: 6, len: 725, kg: 2.6, mv: 400 } },
  /* ---- pistols ---- */
  { id: 'm1911', name: 'M1911A1', cls: 'PISTOL', slot: 1, dmg: 38, hs: 2.2, rpm: 300, mag: 7, res: 56, rld: 1.8,
    hip: 2.0, ads: .16, rec: [1.5, .26], spd: 1.07, adsT: .14, range: 80, auto: 0, pen: .3, act: 'semi', sight: 'iron',
    snd: { body: 1100, crack: 5600, tail: .28, thump: 135 }, real: { cal: '.45 ACP', rpm: 'semi', cap: 7, len: 216, kg: 1.1, mv: 253 } },
  { id: 'usp', name: 'H&K USP', cls: 'PISTOL', slot: 1, dmg: 26, hs: 2.1, rpm: 400, mag: 15, res: 105, rld: 1.6,
    hip: 1.7, ads: .18, rec: [.9, .22], spd: 1.08, adsT: .13, range: 75, auto: 0, pen: .2, act: 'semi', sight: 'iron',
    snd: { body: 1450, crack: 7000, tail: .20, thump: 158 }, real: { cal: '9×19mm', rpm: 'semi', cap: 15, len: 194, kg: .75, mv: 350 } },
  { id: 'ruger', name: 'RUGER MK IV', cls: 'PISTOL', slot: 1, dmg: 17, hs: 2.6, rpm: 480, mag: 10, res: 100, rld: 1.5,
    hip: 1.2, ads: .08, rec: [.35, .10], spd: 1.09, adsT: .14, range: 90, auto: 0, pen: .05, act: 'semi', sight: 'iron',
    snd: { body: 1900, crack: 8200, tail: .14, thump: 190 }, real: { cal: '.22 LR', rpm: 'semi', cap: 10, len: 248, kg: 1.0, mv: 320 } }
];

export const THROWABLES = [
  { id: 'frag',  name: 'M9 FRAG',   cls: 'THROWABLE', slot: 2, count: 2, fuse: 2.6, dmg: 132, radius: 7.4, kind: 'frag', spd: 1.04, adsT: .2 },
  { id: 'flash', name: 'FLASHBANG', cls: 'THROWABLE', slot: 2, count: 2, fuse: 1.5, dmg: 0,   radius: 11,  kind: 'flash', spd: 1.04, adsT: .2 },
  { id: 'molo',  name: 'Molotov',   cls: 'THROWABLE', slot: 2, count: 1, fuse: .6,  dmg: 26,  radius: 5.2, kind: 'fire', dur: 8, spd: 1.04, adsT: .2 }
];

export const WBY: Record<string, any> = {};
WEAPONS.forEach(w => WBY[w.id] = w);
THROWABLES.forEach(t => WBY[t.id] = t);

export const PRIMARY_IDS = WEAPONS.filter(w => w.slot === 0).map(w => w.id);
export const SECONDARY_IDS = WEAPONS.filter(w => w.slot === 1).map(w => w.id);
export const THROW_IDS = THROWABLES.map(t => t.id);
export const DEFAULT_LOADOUT = { 0: 'ak47', 1: 'm1911', 2: 'frag' };

/* tube-fed guns load shell by shell: base time + per missing round */
export function reloadTime(d: any, missing: number): number {
  return d.rld + (d.rldPer ? d.rldPer * Math.max(0, missing) : 0);
}
