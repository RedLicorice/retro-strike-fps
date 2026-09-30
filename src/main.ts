import './styles.css';
import * as BABYLON from 'babylonjs';
import { SFX } from './audio/sfx';
import { ctx } from './core/context';
import { $, now, vis } from './core/dom';
import { V3, makeSeed } from './core/math';
import { Save } from './core/save';
import { FX } from './fx/fx';
import { Game } from './game/index';
import { Input } from './input/input';
import { Touch } from './input/touch';
import { Net } from './net/index';
import { Player } from './player/player';
import { MAT } from './render/materials';
import { Models } from './assets/models';
import { installTelemetry, track } from './dev/telemetry';
import { applyQuality } from './render/quality';
import { UI } from './ui/index';
import { Lobby } from './game/lobby';
import { Combat } from './combat/index';
import { Menu } from './ui/menuScene';
import { Wep } from './weapons/weaponController';
import { MAP } from './world/map/index';
import { Heightmaps } from './world/city/heightmaps';

const Boot = {
  steps: [
    ['ALLOCATING RENDER TARGET...', () => { }],
    ['COMPILING PROCEDURAL TEXTURES...', () => { MAT.init(); }],
    ['FORGING WEAPON GEOMETRY...', () => { FX.init(); }],
    ['READING HEIGHTMAPS...', () => Heightmaps.load()],
    ['LOADING OPERATORS & ARMS...', () => Models.load((d, n) => { $('bootStat').textContent = 'LOADING OPERATORS & ARMS... ' + d + '/' + n; })],
    ['GENERATING ARENA SEED...', () => { Input.init(); UI.init(); UI.boot(); Menu.start(makeSeed()); }],
    ['LINKING P2P TRANSPORT...', () => { applyQuality(Save.data.settings.quality); Net.setStatus(); }],
    ['READY', () => { }]
  ],
  run(){
    let i = 0;
    const next = () => {
      if (i >= this.steps.length){
        vis('boot', false); vis('menu', true);
        Game.state = 'menu';
        UI.previewDraw();
        return;
      }
      const [txt, fn] = this.steps[i];
      $('bootStat').textContent = txt;
      $('bootBar').style.width = ((i + 1) / this.steps.length * 100) + '%';
      let res: any;
      try { res = fn(); } catch (e){ console.error('boot step failed:', txt, e); }
      i++;
      Promise.resolve(res).catch(e => console.error('boot step failed:', txt, e)).then(() => setTimeout(next, i === 1 ? 60 : 190));
    };
    next();
  }
};

let last = 0, fpsAcc = 0, fpsN = 0, fpsTimer = 0, lowStreak = 0, aiAcc = 0;

function loop(){
  const t = now();
  let dt = last ? (t - last) / 1000 : 1 / 60;
  last = t;
  dt = Math.min(dt, .1);
  const sdt = Math.min(dt, 1 / 30);

  /* fps + adaptive quality */
  fpsAcc += dt; fpsN++;
  if (fpsAcc > .5){
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    $('stFps').textContent = Math.round(fps);
    const fc = $('fpsC');
    if (fc) fc.textContent = Math.round(fps) + ' FPS  •  ' + Game.actors.length + (Game.monsters.length ? '+' + Game.monsters.length : '') + ' ACTORS  •  ' + MAP.boxes.length + ' COLLIDERS  •  ' + MAP.seed;
    if (Game.state === 'play'){
      if (fps < 42){ lowStreak++; if (lowStreak === 4 && ctx.QUALITY !== 'low'){ const nq = ctx.QUALITY === 'high' ? 'med' : 'low'; Save.data.settings.quality = nq; $('setQual').value = nq; applyQuality(nq); UI.toast('QUALITY → ' + nq.toUpperCase(), 'r'); lowStreak = 0; } }
      else lowStreak = 0;
    }
  }

  if (Game.state === 'menu' || Game.state === 'lobby'){
    Menu.update(sdt);
  } else if (Game.state === 'play' || Game.state === 'end'){
    if (Game.state === 'play'){
      if (!$('pause').classList.contains('hidden')){ /* frozen */ }
      else {
        if (Player.alive) Player.update(sdt);
        Wep.update(sdt);
        aiAcc += sdt;
        Game.update(sdt);
        Net.tick(sdt);
        UI.hud(sdt);
        if (ctx.IS_TOUCH || Save.data.settings.touch) Touch.update(sdt);
      }
    } else { FX.update(sdt); Menu.t += sdt * .2; ctx.cam.rotation.y += sdt * .06; }
  } else Input.endFrame();
  Input.endFrame();
  ctx.scene.render();
}

function boot(){
  ctx.canvas = $('c');
  Save.load();
  ctx.IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (ctx.IS_TOUCH && Save.data.settings.touch === null) Save.data.settings.touch = true;
  if (ctx.IS_TOUCH && Save.data.settings.quality === 'med') Save.data.settings.quality = 'low';
  ctx.engine = new BABYLON.Engine(ctx.canvas, true, { antialias: false, stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', adaptToDeviceRatio: false }, true);
  ctx.scene = new BABYLON.Scene(ctx.engine);
  ctx.scene.clearColor = new BABYLON.Color4(.055, .062, .05, 1);
  ctx.scene.autoClearDepthAndStencil = true;
  ctx.cam = new BABYLON.FreeCamera('cam', V3(0, 12, 30), ctx.scene);
  ctx.cam.inputs.clear(); ctx.cam.minZ = .055; ctx.cam.maxZ = 460; ctx.cam.fov = 1.05; ctx.cam.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED;
  ctx.cam.rotationQuaternion = null; ctx.cam.speed = 0;
  ctx.scene.activeCamera = ctx.cam;
  ctx.scene.setRenderingAutoClearDepthStencil(1, false, true, false);
  ctx.scene.skipPointerMovePicking = true;
  ctx.scene.blockMaterialDirtyMechanism = true;
  SFX.setVol(Save.data.settings.vol);
  Touch.init();
  $('engVer').textContent = 'BABYLON ' + BABYLON.Engine.Version;
  $('crt').style.display = Save.data.settings.fps === false ? 'block' : 'block';
  if (ctx.IS_TOUCH) $('touch').classList.add('hidden');
  Boot.run();
  ctx.engine.runRenderLoop(loop);
  /* keep pointer lock + pause behaviour sane */
  document.addEventListener('visibilitychange', () => { if (document.hidden && Game.state === 'play') UI.pause(true); });
}

/* dev-only console/test handle; stripped from production builds */
if (import.meta.env.DEV){
  (window as any).__rs = { ctx, Game, Player, MAP, Wep, Combat, Input, Net, Models, BABYLON, Lobby, UI };
  installTelemetry(() => (window as any).__rs);
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
