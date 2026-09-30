import { CHARACTERS, CHAR_BY } from '../data/characters';
import { SFX } from '../audio/sfx';
import { $, $$, vis } from '../core/dom';
import { clamp, makeSeed, pick, rndi } from '../core/math';
import { Save } from '../core/save';
import { BOT_NAMES } from '../data/bots';
import { PRIMARY_IDS, SECONDARY_IDS, THROW_IDS, WBY } from '../data/weapons';
import { Game } from '../game/index';
import { Lobby } from '../game/lobby';
import { Net } from '../net/index';
import { applyQuality } from '../render/quality';
import { UI } from './index';
import { Menu } from './menuScene';
import { MAP } from '../world/map/index';

/* ------------------------------ E4. UI WIRING ------------------------------ */
export const uiMenus = {
  modeSel: 'ffa',

  slotSel: 0,

  boot(){
    /* mode cards */
    const modes = [
      { id: 'ffa', i: '01', t: 'FREE FOR ALL', d: 'Every operator for themselves. First to the kill limit takes the arena.', k: 'SOLO / 8P' },
      { id: 'tdm', i: '02', t: 'TEAM DEATHMATCH', d: 'Red squad vs Blue squad. Friendly fire off, coordinated pushes on.', k: '2 TEAMS' },
      { id: 'horde', i: '03', t: 'CO-OP HORDE', d: 'Hold the arena against escalating waves of low-poly abominations.', k: 'CO-OP' }
    ];
    $('modeList').innerHTML = modes.map((m, i) =>
      '<div class="mode' + (i === 0 ? ' sel' : '') + '" data-m="' + m.id + '"><div class="mi">' + m.i + '</div>' +
      '<div><div class="mt">' + m.t + '</div><div class="md">' + m.d + '</div></div><div class="mk">' + m.k + '</div></div>').join('');
    $$('#modeList .mode').forEach(el => el.addEventListener('click', () => {
      $$('#modeList .mode').forEach(o => o.classList.remove('sel')); el.classList.add('sel');
      this.modeSel = el.dataset.m; SFX.uiBig();
      const lb = $('lbMode'); if (lb) lb.value = this.modeSel;
    }));
    /* loadout tabs */
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(o => o.classList.remove('on')); t.classList.add('on');
      this.slotSel = +t.dataset.slot; this.buildWeapons(); SFX.ui();
    }));
    this.buildWeapons(); this.refreshStats(); this.bindSettings(); this.bindButtons();
    /* scroll reveals */
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: .08 });
    $$('[data-rev]').forEach(el => io.observe(el));
    setTimeout(() => $$('[data-rev]').forEach(el => el.classList.add('in')), 900);
    /* marquee */
    $('marqTxt').textContent = $('marqTxt').textContent.repeat(2);
  },

  buildWeapons(){
    if (this.slotSel === 3){ this.buildOperators(); return; }
    const ids = this.slotSel === 0 ? PRIMARY_IDS : this.slotSel === 1 ? SECONDARY_IDS : THROW_IDS;
    const cur = Save.data.loadout[this.slotSel];
    const list = $('wlist');
    list.innerHTML = ids.map(id => {
      const w = WBY[id], s = Save.w(id);
      const bars = this.slotSel === 2
        ? [['COUNT', w.count / 2], ['POWER', w.kind === 'frag' ? 1 : w.kind === 'flash' ? .3 : .6], ['RADIUS', w.radius / 12]]
        : w.melee ? [['DAMAGE', w.dmg / 100], ['SPEED', w.rpm / 160], ['REACH', w.range / 3]]
          : [['DMG', w.dmg * (w.pellets || 1) / 112], ['RPM', w.rpm / 1150], ['CTRL', 1 - clamp(w.rec[0] / 3.4, 0, 1)], ['MOB', (w.spd - .84) / .26]];
      return '<div class="wrow' + (cur === id ? ' on' : '') + '" data-id="' + id + '">' +
        '<div class="mono" style="color:var(--mut);font-size:11px">' + (this.slotSel === 2 ? 'G' : this.slotSel + 1) + '</div>' +
        '<div><div class="wn">' + w.name + '</div><div class="wc">' + w.cls + (w.real ? ' · ' + w.real.cal + (w.pellets ? ' ×' + w.pellets : '') : '') + '</div></div>' +
        '<div class="wl">LVL ' + s.lvl + '</div>' +
        '<div class="wp"><i style="width:' + (clamp(Save.xpPct(id), 0, 1) * 100) + '%"></i></div>' +
        '<div class="bars">' + bars.map(b => '<span>' + b[0] + '<em><i style="width:' + (clamp(b[1], .05, 1) * 100) + '%"></i></em></span>').join('') + '</div>' +
        '</div>';
    }).join('');
    $$('#wlist .wrow').forEach(el => el.addEventListener('click', () => {
      Save.data.loadout[this.slotSel] = el.dataset.id;
      $$('#wlist .wrow').forEach(o => o.classList.remove('on')); el.classList.add('on');
      SFX.ui(); this.eqLine(); Save.flush(); this.refreshStats();
    }));
    this.eqLine();
  },

  eqLine(){
    const L = Save.data.loadout, op = CHAR_BY[Save.data.character];
    $('eqLine').textContent = [WBY[L[0]], WBY[L[1]], WBY[L[2]]].map(w => w ? w.name : '—').join(' • ') + (op ? '  |  ' + op.name : '');
  },

  /* character select: portrait cards; the choice is saved and sent to peers */
  buildOperators(){
    const list = $('wlist'), cur = Save.data.character;
    list.innerHTML = '<div class="opgrid">' + CHARACTERS.map(c =>
      '<div class="opcard' + (c.id === cur ? ' on' : '') + '" data-id="' + c.id + '">' +
      '<img src="' + import.meta.env.BASE_URL + 'models/characters/thumbs/' + c.id + '.png" alt="" loading="lazy">' +
      '<div class="opn">' + c.name + '</div><div class="opt">' + c.tag + '</div></div>').join('') + '</div>';
    $$('#wlist .opcard').forEach(el => el.addEventListener('click', () => {
      Save.data.character = el.dataset.id; Save.flush();
      $$('#wlist .opcard').forEach(o => o.classList.remove('on')); el.classList.add('on');
      SFX.uiBig(); this.eqLine();
      Menu.showOperator && Menu.showOperator(el.dataset.id);
    }));
    this.eqLine();
  },

  bindSettings(){
    const S = Save.data.settings;
    const bind = (id, key, fmt, apply?) => {
      const el = $(id); if (!el) return;
      const sync = v => { S[key] = v; if (apply) apply(v); Save.flush(); };
      el.addEventListener('input', () => {
        const v = el.type === 'range' ? +el.value : el.value;
        sync(fmt ? fmt(v) : v);
        const out = $(id.replace('set', 'v')); if (out) out.textContent = el.type === 'range' ? (key === 'sens' ? (v / 100).toFixed(2) : v) : v;
        const mirror = $(id + '2'); if (mirror) mirror.value = v;
      });
    };
    bind('setSens', 'sens', v => v / 100);
    bind('setFov', 'fov', v => +v);
    bind('setVol', 'vol', v => { SFX.setVol(v / 100); return v / 100; });
    $('setQual').addEventListener('change', e => { S.quality = e.target.value; applyQuality(S.quality); Save.flush(); });
    const cb = (id, key, fn?) => { const el = $(id); if (!el) return; el.checked = !!S[key];
      el.addEventListener('change', () => { S[key] = el.checked; if (fn) fn(el.checked); Save.flush(); }); };
    cb('setInvY', 'invY'); cb('setShake', 'shake'); cb('setView3p', 'view3p'); cb('setFpArms', 'fpArms');
    cb('setTouch', 'touch', v => { $('touch').classList.toggle('hidden', !(v && Game.state === 'play')); });
    cb('setShowFps', 'fps', v => { $('fpsC').style.display = v ? 'block' : 'none'; });
    /* mirror values */
    $('vSens').textContent = S.sens.toFixed(2); $('setSens').value = S.sens * 100;
    $('vFov').textContent = S.fov; $('setFov').value = S.fov;
    $('vVol').textContent = Math.round(S.vol * 100); $('setVol').value = S.vol * 100;
    $('setQual').value = S.quality;
    $('inName').value = S.name || Save.data.name;
    /* pause menu mirrors */
    const s2 = $('setSens2'), f2 = $('setFov2'), v2 = $('setVol2');
    if (s2){ s2.value = S.sens * 100; $('vSens2').textContent = S.sens.toFixed(2);
      s2.addEventListener('input', () => { S.sens = s2.value / 100; $('vSens2').textContent = S.sens.toFixed(2); $('setSens').value = s2.value; $('vSens').textContent = S.sens.toFixed(2); Save.flush(); }); }
    if (f2){ f2.value = S.fov; $('vFov2').textContent = S.fov;
      f2.addEventListener('input', () => { S.fov = +f2.value; $('vFov2').textContent = S.fov; $('setFov').value = f2.value; $('vFov').textContent = S.fov; Save.flush(); }); }
    if (v2){ v2.value = S.vol * 100; $('vVol2').textContent = Math.round(S.vol * 100);
      v2.addEventListener('input', () => { S.vol = v2.value / 100; SFX.setVol(S.vol); $('vVol2').textContent = v2.value; $('setVol').value = v2.value; $('vVol').textContent = v2.value; Save.flush(); }); }
  },

  bindButtons(){
    const blip = el => el && el.addEventListener('click', () => { SFX.init(); SFX.resume(); SFX.ui(); });
    $$('.btn').forEach(blip);
    $('btnReseed').addEventListener('click', () => {
      const s = makeSeed(); $('inSeed').value = s; Lobby.seed = s; $('lbSeed').value = s;
      this.newArena(s); SFX.uiBig();
    });
    $('btnRandomLoad').addEventListener('click', () => {
      Save.data.loadout = { 0: pick(PRIMARY_IDS), 1: pick(SECONDARY_IDS), 2: pick(THROW_IDS) };
      this.buildWeapons(); Save.flush(); SFX.uiBig();
    });
    $('inName').addEventListener('input', e => { Save.data.name = (e.target.value || 'VIPER').toUpperCase().slice(0, 14); Save.flush(); });
    $('inSeed').addEventListener('input', e => { Lobby.seed = e.target.value.toUpperCase(); });
    $('btnDeploy').addEventListener('click', () => this.deploy());
    $('btnLobby').addEventListener('click', () => {
      Save.data.name = ($('inName').value || 'VIPER').toUpperCase();
      Lobby.init(Save.data.name, this.modeSel, ($('inSeed').value || makeSeed()).toUpperCase(), +$('inBots').value || 0, +$('inLimit').value || 25, +$('inSkill').value);
      $('lbSeed').value = Lobby.seed; $('lbMode').value = Lobby.mode;
      vis('menu', false); vis('lobby', true);
      this.buildSlots(); this.previewDraw(); this.newArena(Lobby.seed); Net.setStatus();
    });
    $('btnBackMenu').addEventListener('click', () => { vis('lobby', false); vis('menu', true); });
    $('btnStartMatch').addEventListener('click', () => this.startFromLobby());
    $('btnAddBot').addEventListener('click', () => this.lobbyBot(1));
    $('btnRemBot').addEventListener('click', () => this.lobbyBot(-1));
    $('btnFill').addEventListener('click', () => { while (Lobby.count() < 8) this.lobbyBot(1, true); this.buildSlots(); Net.lobbySync(); });
    $('btnMyTeam').addEventListener('click', () => {
      const me = Lobby.slots.find(s => s.me); if (!me) return;
      me.team = me.team ? 0 : 1; Lobby.slots.forEach((s, i) => { if (s.type === 'bot') s.team = Lobby.mode === 'tdm' ? (i % 2 === 0 ? 0 : 1) : s.team; });
      this.buildSlots(); Net.lobbySync(); SFX.ui();
    });
    $('lbMode').addEventListener('change', e => { Lobby.mode = e.target.value; this.modeSel = e.target.value;
      $$('#modeList .mode').forEach(o => o.classList.toggle('sel', o.dataset.m === e.target.value)); this.buildSlots(); });
    $('btnNewSeed').addEventListener('click', () => { Lobby.seed = ($('lbSeed').value || makeSeed()).toUpperCase(); this.newArena(Lobby.seed); Net.lobbySync(); });
    $('lbSeed').addEventListener('input', e => { Lobby.seed = e.target.value.toUpperCase(); });
    /* signalling */
    $('btnHost').addEventListener('click', async () => {
      if (!Net.isHost) Net.reset();
      $('sigHelp').innerHTML = 'Token generated. Send it to your peer, then paste their ANSWER below and click <b style="color:var(--amber)">ACCEPT</b>. One token per guest.';
      await Net.hostOffer(); SFX.levelup();
    });
    $('btnJoin').addEventListener('click', async () => {
      Net.reset();
      const t = $('sigRemote').value.trim();
      if (!t){ UI.toast('PASTE A HOST TOKEN FIRST', 'r'); SFX.deny(); return; }
      await Net.join(t);
      $('sigHelp').innerHTML = 'Answer token generated — copy it back to the host.';
      SFX.levelup();
    });
    $('btnAccept').addEventListener('click', async () => { await Net.hostAccept($('sigRemote').value.trim()); });
    $('btnCopyLocal').addEventListener('click', () => {
      const ta = $('sigLocal'); ta.select(); ta.setSelectionRange(0, 99999);
      try { navigator.clipboard.writeText(ta.value); } catch (e){ document.execCommand && document.execCommand('copy'); }
      UI.toast('TOKEN COPIED', 'g');
    });
    /* pause + end */
    $('btnResume').addEventListener('click', () => UI.pause(false));
    $('btnQuit').addEventListener('click', () => { Game.toMenu(); UI.pause(false); });
    $('btnPauseSens').addEventListener('click', () => $('pauseSettings').classList.toggle('hidden'));
    $('btnPauseNet').addEventListener('click', () => UI.toast(Net.role.toUpperCase() + ' • ' + Net.peers.length + ' PEERS • ' + (Net.rtt || '--') + 'MS'));
    $('btnRematch').addEventListener('click', () => this.deploy(true));
    $('btnAgainSeed').addEventListener('click', () => this.deploy(false, Game.seed));
    $('btnEndMenu').addEventListener('click', () => Game.toMenu());
    /* click anywhere resumes audio */
    addEventListener('pointerdown', () => { SFX.init(); SFX.resume(); }, { once: false });
  },

  lobbyBot(dir, quiet){
    if (dir > 0){
      const i = Lobby.slots.findIndex(s => s.type === 'empty');
      if (i < 0){ if (!quiet){ UI.toast('LOBBY FULL', 'r'); SFX.deny(); } return; }
      const used = Lobby.slots.filter(s => s.type === 'bot').length;
      Lobby.slots[i] = { type: 'bot', name: BOT_NAMES[used % BOT_NAMES.length], team: Lobby.mode === 'tdm' ? (i % 2 === 0 ? 0 : 1) : used % 2, lv: 1 + rndi(12) };
    } else {
      for (let i = Lobby.slots.length - 1; i >= 0; i--) if (Lobby.slots[i].type === 'bot'){ Lobby.slots[i] = { type: 'empty', name: '— OPEN SLOT —', team: 0 }; break; }
    }
    this.buildSlots(); if (!quiet) SFX.ui();
  },

  buildSlots(){
    const el = $('slotList'); if (!el) return;
    el.innerHTML = Lobby.slots.map((s, i) =>
      '<div class="slot ' + (s.type === 'empty' ? 'empty' : 't' + (s.team | 0)) + '">' +
      '<div class="mono" style="color:var(--mut)">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<div><div class="n">' + s.name + (s.me ? ' <span style="color:var(--amber)">(YOU' + (Net.isHost ? ' • HOST' : '') + ')</span>' : '') + '</div>' +
      '<div class="mono" style="font-size:10px;color:var(--mut)">' + (s.type === 'bot' ? 'AI • SKILL ' + ['RECRUIT', 'VETERAN', 'ELITE'][Lobby.skill] : s.type === 'player' ? 'HUMAN' : 'AWAITING PEER') + '</div></div>' +
      '<div class="lv">' + (s.type === 'empty' ? '' : 'LVL ' + (s.lv || 1)) + '</div>' +
      '<div class="tg" data-i="' + i + '">' + (s.type === 'empty' ? '' : (Lobby.mode === 'tdm' ? (s.team === 0 ? 'RED' : 'BLUE') : 'SOLO')) + '</div></div>').join('');
    $('slotCount').textContent = Lobby.count() + ' / 8';
    $$('#slotList .tg').forEach(t => t.addEventListener('click', () => {
      const s = Lobby.slots[+t.dataset.i]; if (!s || s.type === 'empty' || Lobby.mode !== 'tdm') return;
      if (!s.me && !Net.isHost) return;
      s.team = s.team ? 0 : 1; this.buildSlots(); Net.lobbySync(); SFX.ui();
    }));
  },

  previewDraw(){
    const cv = $('pvCv'); if (!cv || !MAP.mmCanvas) return;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    const k = Math.min(cv.width, cv.height) / MAP.mmCanvas.width;
    const w = MAP.mmCanvas.width * k, h = MAP.mmCanvas.height * k;
    x.fillStyle = '#0a0d07'; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(MAP.mmCanvas, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    x.strokeStyle = 'rgba(155,227,107,.35)'; x.lineWidth = 2;
    x.strokeRect((cv.width - w) / 2, (cv.height - h) / 2, w, h);
    x.fillStyle = 'rgba(255,182,72,.9)'; x.font = '11px "Share Tech Mono", monospace';
    x.fillText('SEED ' + MAP.seed, 10, 18);
    x.fillText(MAP.cover.length + ' COVER NODES', 10, 34);
    x.fillText(MAP.spawns.length + ' SPAWNS', 10, 50);
    x.fillText((MAP.half * 2) + 'm x ' + (MAP.half * 2) + 'm', 10, cv.height - 12);
    $('pvSeed').textContent = 'SEED ' + MAP.seed;
    $('menuSeedTag').textContent = 'SEED ' + MAP.seed;
  },

  newArena(seed){
    if (Game.state === 'play') return;
    Game.state = 'menu';
    Menu.clear(); Game.clear(); MAP.dispose();
    Menu.start(seed);
    this.previewDraw();
  },

  deploy(newSeed, forceSeed){
    SFX.init(); SFX.resume();
    Save.data.name = ($('inName').value || 'VIPER').toUpperCase().slice(0, 14);
    Save.flush();
    const mode = this.modeSel || $('lbMode') && $('lbMode').value || 'ffa';
    const seed = forceSeed || (newSeed === false ? (Lobby.seed || $('inSeed').value || MAP.seed) : (($('inSeed').value || Lobby.seed || makeSeed()).toUpperCase()));
    Menu.clear();
    const bots = Lobby.slots && Lobby.slots.length ? Lobby.slots.filter(s => s.type === 'bot').length : (+$('inBots').value || 0);
    const team = Lobby.slots ? (Lobby.slots.find(s => s.me) || { team: 0 }).team : 0;
    Game.setup({
      mode: mode, seed: seed, bots: bots, skill: Lobby.skill === undefined ? +$('inSkill').value : Lobby.skill,
      limit: +($('inLimit').value || Lobby.limit || 25), loadout: Save.data.loadout, name: Save.data.name, team: team
    });
    Lobby.seed = Game.seed;
    if (Net.online && Net.isHost) Net.broadcast({ k: 'start', seed: Game.seed, mode: mode, limit: Game.killLimit, team: 1 });
  },

  startFromLobby(){
    Lobby.mode = $('lbMode').value;
    this.modeSel = Lobby.mode;
    this.deploy(false, Lobby.seed);
  },

  menuScene(){
    Game.state = 'menu';
    vis('boot', false); vis('lobby', false); vis('hud', false); vis('end', false); vis('pause', false); vis('touch', false);
    vis('menu', true);
    this.refreshStats(); this.buildWeapons(); this.previewDraw();
    Menu.start(Save.data.seed || MAP.seed);
  }
};
