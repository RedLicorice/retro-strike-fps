import { clamp, rndi } from '../core/math';
import { Save } from '../core/save';
import { BOT_NAMES } from '../data/bots';

/* ------------------------------ E3. LOBBY STATE + MENU SCENE ------------------------------ */
export const Lobby = {
  slots: [], seed: '', mode: 'ffa', limit: 25, skill: 1,
  init(name, mode, seed, bots, limit, skill){
    this.mode = mode; this.seed = seed; this.limit = limit; this.skill = skill;
    this.slots = [{ type: 'player', name: name, team: 0, id: 'p0', lv: Save.w(Save.data.loadout[0]).lvl, me: true }];
    for (let i = 0; i < clamp(bots, 0, 7); i++) this.slots.push({ type: 'bot', name: BOT_NAMES[i % BOT_NAMES.length], team: mode === 'tdm' ? (i % 2 === 0 ? 1 : 0) : i % 2, lv: 1 + rndi(9) });
    while (this.slots.length < 8) this.slots.push({ type: 'empty', name: '— OPEN SLOT —', team: 0 });
  },
  count(){ return this.slots.filter(s => s.type !== 'empty').length; }
};
