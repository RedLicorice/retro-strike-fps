import { Player } from '../player/player';
import { Save } from '../core/save';
import { SFX } from '../audio/sfx';
import { $, now } from '../core/dom';
import { Input } from './input';
import { UI } from '../ui/index';

/* =====================================================================
   E) TOUCH / WEBRTC P2P / MENUS / BOOT / MAIN LOOP
   ===================================================================== */

/* ------------------------------ E1. TOUCH ------------------------------ */
export const Touch = {
  stickId: -1, lookId: -1, sx: 0, sy: 0, cx: 0, cy: 0, crouchHold: 0, sprint: false,
  init(){
    const st = $('stickL'), knob = st.querySelector('.knob');
    const T = Input.touch;
    const setKnob = (dx, dy) => { knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; };
    st.addEventListener('pointerdown', e => {
      e.preventDefault(); st.setPointerCapture(e.pointerId); this.stickId = e.pointerId;
      const r = st.getBoundingClientRect(); this.cx = r.left + r.width / 2; this.cy = r.top + r.height / 2;
    });
    st.addEventListener('pointermove', e => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.cx, dy = e.clientY - this.cy;
      const l = Math.hypot(dx, dy), max = 46;
      if (l > max){ dx = dx / l * max; dy = dy / l * max; }
      setKnob(dx, dy); T.mx = dx / max; T.my = dy / max;
    });
    const end = e => { if (e.pointerId !== this.stickId) return; this.stickId = -1; setKnob(0, 0); T.mx = 0; T.my = 0; };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);

    const lp = $('lookPad');
    lp.addEventListener('pointerdown', e => { lp.setPointerCapture(e.pointerId); this.lookId = e.pointerId; this.lx0 = e.clientX; this.ly0 = e.clientY; });
    lp.addEventListener('pointermove', e => {
      if (e.pointerId !== this.lookId) return;
      T.lx += (e.clientX - this.lx0) * 2.6; T.ly += (e.clientY - this.ly0) * 2.6;
      this.lx0 = e.clientX; this.ly0 = e.clientY;
    });
    const lend = e => { if (e.pointerId === this.lookId) this.lookId = -1; };
    lp.addEventListener('pointerup', lend); lp.addEventListener('pointercancel', lend);

    const hold = (id, on, off?) => {
      const el = $(id);
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); on(); });
      const up = e => { el.classList.remove('on'); if (off) off(); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    };
    hold('bFire', () => { T.fire = true; T.fireEdge = true; }, () => { T.fire = false; });
    hold('bAim', () => { T.aim = true; }, () => { T.aim = false; });
    hold('bJump', () => { T.jump = true; }, () => { T.jump = false; });
    hold('bSprint', () => { this.sprint = !this.sprint; T.sprint = this.sprint; $('bSprint').classList.toggle('on', this.sprint); SFX.ui(); });
    hold('bReload', () => { T.reload = true; SFX.ui(); });
    hold('bThrow', () => { T.thr = true; SFX.ui(); });
    hold('bSwap', () => { T.swap = true; SFX.ui(); });
    hold('bPause', () => { UI.togglePause(); });
    hold('bCam', () => { Save.data.settings.view3p = !Save.data.settings.view3p; Save.flush(); SFX.ui(); });
    /* crouch button = C: stand → crouch → prone → crouch (slides while sprinting); JUMP stands back up */
    hold('bCrouch', () => { T.crouchTap = true; });
  },
  update(dt){
    $('bCrouch').classList.toggle('on', Player.stance > 0);
  }
};
