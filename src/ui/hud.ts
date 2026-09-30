import { ctx } from '../core/context';
import { SHIELD_IDLE, SHIELD_MAX, SHIELD_PER, SHIELD_PLATES } from '../player/constants';
import { $, fmtT } from '../core/dom';
import { DEG, PI, TAU, clamp, v3len } from '../core/math';
import { Save } from '../core/save';
import { WBY } from '../data/weapons';
import { Game } from '../game/index';
import { Player } from '../player/player';
import { UI } from './index';
import { Wep } from '../weapons/weaponController';
import { MAP } from '../world/map/index';

/* ------------------------------ D8. HUD ------------------------------ */
export const uiHud = {
  feedN: 0,

  radarCv: null,

  radarX: null,

  lastFeed: 0,

  toasts: [],

  init(){
    this.radarCv = $('radarCv'); this.radarX = this.radarCv.getContext('2d');
  },

  toast(txt, cls?){
    const w = $('toastW'); if (!w) return;
    const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = txt;
    w.appendChild(d); setTimeout(() => d.remove(), 1800);
    while (w.children.length > 4) w.firstChild.remove();
  },

  waveBanner(a, b){
    const w = $('waveBan'); w.querySelector('.a').textContent = a; w.querySelector('.b').textContent = b || '';
    w.classList.remove('show'); void w.offsetWidth; w.classList.add('show');
  },

  feedKill(killer, victim, head, wpn){
    const f = $('feed'); if (!f) return;
    const d = document.createElement('div'); d.className = 'fi';
    const w = wpn && WBY[wpn] ? WBY[wpn].name : (wpn === 'fall' ? 'GRAVITY' : wpn === 'fire' ? 'FIRE' : wpn || '');
    const kc = killer ? (killer.isLocal ? 'b' : (killer.team === 0 ? 'r' : 'b')) : '';
    d.innerHTML = (killer ? '<b class="' + kc + '">' + killer.name + '</b> ' : '') +
      '<span class="' + (head ? 'hs' : '') + '">' + (head ? '&#9670; ' : '') + (w ? '[' + w + ']' : 'KILLED') + '</span> ' +
      '<b>' + victim.name + '</b>';
    f.insertBefore(d, f.firstChild);
    while (f.children.length > 6) f.lastChild.remove();
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 420); }, 5200);
  },

  hitmarker(head, kill){
    const h = $('hitmark'); if (!h) return;
    h.classList.remove('show', 'kill'); void h.offsetWidth;
    if (kill) h.classList.add('kill');
    h.classList.add('show');
    const c = $('crosshair'); c.classList.add('hit'); setTimeout(() => c.classList.remove('hit'), 90);
    const bars = h.querySelectorAll('i');
    bars.forEach((b, i) => {
      const a = (i * 90 + 45) * DEG;
      const r0 = head ? 9 : 12, r1 = head ? 15 : 20;
      b.style.transform = 'rotate(' + (a / DEG) + 'deg) translateX(' + r0 + 'px)';
      b.style.width = (r1 - r0) + 'px';
      b.style.transformOrigin = '0 50%';
    });
  },

  damageDir(ang){
    const w = $('hitDir'); if (!w) return;
    const i = document.createElement('i');
    i.style.transform = 'rotate(' + (-ang / DEG + 180) + 'deg)';
    i.style.transformOrigin = '70px 70px';
    w.appendChild(i); setTimeout(() => i.remove(), 1150);
    while (w.children.length > 5) w.firstChild.remove();
  },

  hurtFlash(dmg, from?){
    const v = $('dmgVig'); v.style.opacity = clamp(dmg / 55, .18, .85);
    clearTimeout(this._vt); this._vt = setTimeout(() => v.style.opacity = 0, 180);
  },

  blind(t){ const b = $('blindOv'); b.style.opacity = clamp(t / 2.6, 0, 1); },

  reloadBar(k){
    const r = $('reloadBar'); if (!r) return;
    if (k < 0){ r.style.opacity = 0; return; }
    r.style.opacity = 1; r.firstElementChild && null; r.querySelector('i').style.width = (k * 100) + '%';
  },

  hudDirty: false,
  gunChanged(){ UI.hudDirty = true; },

  radar(){
    const x = this.radarX, cv = this.radarCv; if (!x || !MAP.mmCanvas) return;
    const S = cv.width, range = 26;
    x.clearRect(0, 0, S, S);
    x.save();
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 1, 0, TAU); x.clip();
    x.fillStyle = '#0c1008'; x.fillRect(0, 0, S, S);
    const mmK = MAP.mmCanvas.width / (MAP.half * 2);
    const f = (S / 2 / range) / mmK;
    const px = (Player.pos.x + MAP.half) * mmK, pz = (Player.pos.z + MAP.half) * mmK;
    x.translate(S / 2, S / 2);
    x.rotate(-PI / 2 - Math.atan2(Math.cos(Player.yaw), Math.sin(Player.yaw)));
    x.globalAlpha = .92;
    x.drawImage(MAP.mmCanvas, -px * f, -pz * f, MAP.mmCanvas.width * f, MAP.mmCanvas.height * f);
    x.globalAlpha = 1;
    const blip = (ex, ez, col, size) => {
      const dx = (ex - Player.pos.x) * mmK * f, dz = (ez - Player.pos.z) * mmK * f;
      if (Math.hypot(dx, dz) > S / 2 - 3) return;
      x.fillStyle = col; x.beginPath(); x.arc(dx, dz, size, 0, TAU); x.fill();
    };
    for (const a of Game.actors){
      if (a.isLocal || !a.alive) continue;
      const d = v3len(a.pos.x - Player.pos.x, 0, a.pos.z - Player.pos.z);
      if (d > range) continue;
      const friendly = !Game.ff && a.team === Player.team;
      blip(a.pos.x, a.pos.z, friendly ? '#4b93d8' : '#e0473c', 3.2);
    }
    if (Game.mode === 'horde') for (const m of Game.monsters) if (m.alive && v3len(m.pos.x - Player.pos.x, 0, m.pos.z - Player.pos.z) < range) blip(m.pos.x, m.pos.z, '#c02028', 2.6);
    for (const g of Game.grenades) blip(g.pos.x, g.pos.z, '#ffb648', 2.2);
    x.restore();
    /* player arrow + frame */
    x.save(); x.translate(S / 2, S / 2);
    x.fillStyle = '#9be36b'; x.beginPath(); x.moveTo(0, -6); x.lineTo(4.5, 5); x.lineTo(0, 2.6); x.lineTo(-4.5, 5); x.closePath(); x.fill();
    x.restore();
    x.strokeStyle = 'rgba(155,227,107,.35)'; x.lineWidth = 2;
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(155,227,107,.18)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(S / 2, 4); x.lineTo(S / 2, S - 4); x.moveTo(4, S / 2); x.lineTo(S - 4, S / 2); x.stroke();
  },

  hud(dt){
    if (Game.state !== 'play') return;
    /* vitals */
    const hp = Math.max(0, Math.round(Player.hp));
    const hn = $('hpNum'); hn.textContent = hp; hn.classList.toggle('low', hp <= 30);
    const bar = $('hpBar'); bar.firstElementChild.style.width = (Player.hp / Player.maxHp * 100) + '%';
    bar.children[1].style.width = (Player.hp / Player.maxHp * 100) + '%';
    const regen = Player.alive && Player.hp < Player.maxHp && Player.combatT > (Player.inCover ? 1.7 : 3.0);
    bar.classList.toggle('reg', regen);
    $('hpState').textContent = !Player.alive ? 'K.I.A.' : regen ? 'REGENERATING' : Player.combatT < 3 ? 'IN CONTACT' : Player.inCover ? 'HOLDING' : 'STABLE';
    $('hpState').style.color = !Player.alive ? 'var(--blood)' : regen ? 'var(--green)' : Player.combatT < 3 ? 'var(--rust)' : 'var(--sand2)';
    $('stCover').style.opacity = Player.inCover ? 1 : .25;
    /* armour plates */
    const sh = Game.local ? Game.local.shield || 0 : 0, pl = $('plates');
    for (let i = 0; i < SHIELD_PLATES; i++) (pl.children[i].firstElementChild as HTMLElement).style.width = (clamp((sh - i * SHIELD_PER) / SHIELD_PER, 0, 1) * 100) + '%';
    pl.classList.toggle('regen', !!(Game.local && Game.local.idleT > SHIELD_IDLE && sh < SHIELD_MAX));
    /* stance chips */
    $('stStand').classList.toggle('on', Player.stance === 0 && Player.sliding <= 0);
    $('stCrouch').classList.toggle('on', Player.stance === 1);
    $('stProne').classList.toggle('on', Player.stance === 2 && Player.sliding <= 0);
    $('stSprint').classList.toggle('on', Player.sprint);
    $('stSlide').classList.toggle('on', Player.sliding > 0);
    /* weapon */
    const d = Wep.def;
    if (d){
      $('wName').textContent = d.name; $('wCls').textContent = d.cls;
      const w = Save.w(d.id); $('wLvl').textContent = w.lvl;
      $('wMode').textContent = d.melee ? 'MELEE' : d.slot === 2 ? 'THROW' : d.auto ? 'AUTO' : 'SEMI';
      const an = $('ammoN'), ar = $('ammoR');
      if (d.slot === 2){ an.textContent = Wep.thCount[d.id] || 0; ar.textContent = '/' + d.count; an.classList.remove('empty'); }
      else if (d.melee){ an.textContent = '∞'; ar.textContent = ''; an.classList.remove('empty'); }
      else { const a = Wep.ammo[d.id] || { mag: 0, res: 0 }; an.textContent = a.mag; ar.textContent = '/' + (Game.infiniteAmmo ? '∞' : a.res); an.classList.toggle('empty', a.mag === 0); }
      const nd = Save.need(w.lvl);
      $('xpTxt').textContent = w.xp + ' / ' + nd;
      $('xpBar').style.width = clamp(w.xp / nd, 0, 1) * 100 + '%';
    }
    /* throwables row */
    const tr = $('throwRow');
    if (this._thrKey !== Save.data.loadout[2] || this._thrN !== (Wep.thCount[Save.data.loadout[2]] || 0)){
      this._thrKey = Save.data.loadout[2]; this._thrN = Wep.thCount[Save.data.loadout[2]] || 0;
      const t = WBY[this._thrKey];
      tr.innerHTML = '<span class="th ' + (Wep.slot === 2 ? 'on' : '') + '">[3] ' + (t ? t.name : '') + ' <b>x' + this._thrN + '</b></span>' +
        '<span class="th ' + (Wep.slot === 0 ? 'on' : '') + '">[1] PRIMARY</span><span class="th ' + (Wep.slot === 1 ? 'on' : '') + '">[2] SIDEARM</span>';
    } else {
      const kids = tr.children;
      if (kids[0]) kids[0].className = 'th ' + (Wep.slot === 2 ? 'on' : '');
      if (kids[1]) kids[1].className = 'th ' + (Wep.slot === 0 ? 'on' : '');
      if (kids[2]) kids[2].className = 'th ' + (Wep.slot === 1 ? 'on' : '');
    }
    /* crosshair spread */
    const c = $('crosshair');
    if (c.style.display !== 'none'){
      const sp = clamp(Wep.spreadNow() * 900 * (1 - Wep.aimT * .8), 4, 46) + (Wep.scoped && Wep.aimT > .9 ? 0 : 0);
      const kids = c.children;
      kids[0].style.transform = 'translate(' + (-6 - sp) + 'px,-1px)';
      kids[1].style.transform = 'translate(' + (6 + sp - 9) + 'px,-1px)';
      kids[2].style.transform = 'translate(-1px,' + (-6 - sp) + 'px)';
      kids[3].style.transform = 'translate(-1px,' + (6 + sp - 9) + 'px)';
      c.style.opacity = (Wep.scoped && Wep.aimT > .9 && ctx.view3p < .5) ? 0 : (Wep.aimT > .8 ? .55 : 1);
    }
    /* top bar */
    $('modeName').textContent = Game.mode === 'horde' ? 'CO-OP HORDE  •  WAVE ' + Game.wave : (Game.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'FREE FOR ALL');
    $('timer').textContent = Game.mode === 'horde' ? (Game.waveActive ? (Game.monsters.filter(m => m.alive).length + (Game.waveQueue || 0)) + ' LEFT' : 'NEXT ' + Math.ceil(Game.betweenT)) : fmtT(Game.timeLeft);
    if (Game.mode === 'tdm'){ $('scoreLine').style.display = 'flex'; $('scR').textContent = 'RED ' + Game.score[0]; $('scB').textContent = 'BLUE ' + Game.score[1]; }
    else if (Game.mode === 'ffa'){ $('scoreLine').style.display = 'flex'; $('scR').textContent = 'YOU ' + Player.kills; $('scB').textContent = 'LIMIT ' + Game.killLimit; $('scR').className = 'bs'; }
    else { $('scoreLine').style.display = 'flex'; $('scR').textContent = 'SCORE ' + Game.local.score; $('scB').textContent = 'DEATHS ' + Player.deaths; }
    $('radarMode').textContent = Game.mode.toUpperCase();
    /* low hp */
    $('lowHp').style.opacity = Player.alive && Player.hp < 35 ? clamp((35 - Player.hp) / 35, 0, .9) : 0;
    /* blind */
    if (Player.blindT > 0){ $('blindOv').style.opacity = clamp(Player.blindT / 2.2, 0, 1); } else $('blindOv').style.opacity = 0;
    /* respawn */
    if (!Player.alive && Player.respawnT > 0 && Math.ceil(Player.respawnT) !== this._rc){ this._rc = Math.ceil(Player.respawnT); this.toast('REDEPLOY IN ' + this._rc); }
    /* radar */
    this.radar();
  }
};
