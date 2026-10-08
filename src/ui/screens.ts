import { SFX } from '../audio/sfx';
import { ctx } from '../core/context';
import { $, fmtN, fmtT, vis } from '../core/dom';
import { clamp } from '../core/math';
import { Save } from '../core/save';
import { THROWABLES, WBY, WEAPONS } from '../data/weapons';
import { Game } from '../game/index';
import { Input } from '../input/input';
import { UI } from './index';
import { Wep } from '../weapons/weaponController';

export const uiScreens = {
  deathScreen(killer){
    this.toast(killer ? 'KILLED BY ' + killer.name : 'YOU DIED', 'r');
  },

  deathHide(){ $('blindOv').style.opacity = 0; },

  pause(on){
    const p = $('pause');
    const touchOn = !!(ctx.IS_TOUCH || (Save.data.settings && Save.data.settings.touch));
    if (on && Game.state === 'play'){ vis('pause', true); vis('touch', false); Input.enabled = false; document.exitPointerLock && document.exitPointerLock(); SFX.ui(); }
    else { vis('pause', false); if (touchOn) vis('touch', true); Input.enabled = true; if (!ctx.IS_TOUCH && Game.state === 'play') ctx.canvas.requestPointerLock && ctx.canvas.requestPointerLock(); }
  },

  togglePause(){
    if (Game.state !== 'play') return;
    UI.pause($('pause').classList.contains('hidden'));
  },

  enterGame(){
    vis('boot', false); vis('menu', false); vis('lobby', false);
    vis('end', false); vis('pause', false); vis('score', false);
    vis('hud', true);
    const touchOn = !!(ctx.IS_TOUCH || (Save.data.settings && Save.data.settings.touch));
    vis('touch', touchOn);
    if ($('fpsC')) $('fpsC').style.display = (Save.data.settings && Save.data.settings.fps) ? 'block' : 'none';
    if ($('feed')) $('feed').innerHTML = '';
    if ($('hitDir')) $('hitDir').innerHTML = '';
    this._thrKey = null; this._rc = -1;
    Input.enabled = true;
    if (!touchOn){
      setTimeout(() => { try { ctx.canvas.requestPointerLock && ctx.canvas.requestPointerLock(); } catch (e){} }, 80);
    } else if (!document.fullscreenElement){
      /* orientation lock only sticks once the page is actually fullscreen on most mobile
         browsers, so these two go together; both are best-effort (support varies, and a user
         can simply decline fullscreen) — a touch player who says no just keeps playing windowed */
      const fs = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : Promise.reject();
      Promise.resolve(fs).then(() => {
        const o: any = (screen as any).orientation;
        if (o && o.lock) o.lock('landscape').catch(() => {});
      }).catch(() => {});
    }
    try { SFX.uiBig(); } catch (e){}
  },

  endMatch(win){
    const s = Save.data.stats;
    vis('end', true);
    const t = $('endTitle');
    t.textContent = Game.mode === 'horde' ? ('SURVIVED ' + Game.wave + ' WAVES') : win ? 'VICTORY' : 'MATCH OVER';
    t.className = win ? 'win' : 'lose';
    $('endSub').textContent = 'ARENA SEED ' + Game.seed + '  •  ' + Game.mode.toUpperCase() + '  •  ' + fmtT(Game.elapsed);
    const me = Game.local;
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    const rows = [
      ['KILLS', me ? me.kills : 0], ['DEATHS', me ? me.deaths : 0], ['K/D', me && me.deaths ? (me.kills / me.deaths).toFixed(2) : (me ? me.kills.toFixed(2) : '0')],
      ['SCORE', me ? me.score : 0], ['ACCURACY', acc + '%'], ['WAVE', Game.wave], ['TIME', fmtT(Game.elapsed)]
    ];
    $('endStats').innerHTML = rows.map(r => '<div class="endStat"><u>' + r[0] + '</u><b>' + r[1] + '</b></div>').join('');
    /* mastery levels gained this match */
    const ids = Wep.ids.concat(Object.keys(Save.data.wpn).slice(0, 0));
    let lv = '';
    for (const id of Wep.ids){
      const w = Save.w(id);
      lv += '<div class="lvlUp"><b>LVL ' + w.lvl + '</b><span>' + (WBY[id] ? WBY[id].name : id) + ' — ' + w.kills + ' kills, ' + w.hs + ' HS, ' + fmtN(Math.round(w.dmg)) + ' dmg</span>' +
        '<span class="mono" style="margin-left:auto;color:var(--mut)">' + w.xp + '/' + Save.need(w.lvl) + ' XP</span></div>';
    }
    $('endLevels').innerHTML = lv || '<div class="mono" style="color:var(--mut)">No mastery progress.</div>';
    $('endBoard').innerHTML = this.boardTable(Game.actors.slice().sort((a, b) => b.score - a.score));
    $('sbTitle').textContent = 'FINAL';
    Save.flush(); UI.refreshStats();
  },

  refreshStats(){
    const s = Save.data.stats;
    $('stKills').textContent = fmtN(s.kills);
    $('stKD').textContent = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
    $('stHS').textContent = s.kills ? Math.round(s.hs / s.kills * 100) + '%' : '0%';
    $('stBest').textContent = fmtN(s.best);
    $('stWave').textContent = s.wave || 0;
    $('cvDmg').textContent = fmtN(Math.round(s.dmg));
    $('cvShots').textContent = fmtN(s.shots);
    $('cvAcc').textContent = (s.shots ? Math.round(s.hits / s.shots * 100) : 0) + '%';
    $('cvMatches').textContent = s.matches;
    $('cvWins').textContent = s.wins;
    $('cvTime').textContent = Math.round(s.time / 60) + 'm';
    /* mastery list */
    const ml = $('mastList'); if (!ml) return;
    const all = [...WEAPONS, ...THROWABLES].map(w => ({ w: w, d: Save.w(w.id) })).sort((a, b) => b.d.lvl - a.d.lvl || b.d.kills - a.d.kills).slice(0, 5);
    ml.innerHTML = all.map(o => {
      const pct = clamp(Save.xpPct(o.w.id), 0, 1) * 100;
      return '<div class="wrow" style="grid-template-columns:1fr auto;cursor:default">' +
        '<div><div class="wn" style="font-size:12.5px">' + o.w.name + '</div><div class="wc">' + o.w.cls + ' • ' + o.d.kills + ' KILLS</div></div>' +
        '<div class="wl">LVL ' + o.d.lvl + '</div>' +
        '<div class="wp"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
  }
};
