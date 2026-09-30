import { SFX } from '../audio/sfx';
import { $ } from '../core/dom';
import { Save } from '../core/save';
import { Game } from '../game/index';
import { Lobby } from '../game/lobby';
import { UI } from '../ui/index';

/* ------------------------------ E2. WEBRTC P2P ------------------------------ */
export const netTransport = {
  /* optional hook fired by the host when a match starts (seed, mode) */
  onMatchStart: null as null | ((seed: string, mode: string) => void),
  role: 'solo',

  online: false,

  isHost: false,

  peers: [],

  pending: [],

  myId: 'p0',

  st: { in: 0, out: 0, t: 0, rate: 0 },

  snapAcc: 0,

  inAcc: 0,

  rtt: 0,

  iceState: 'idle',

  enc(o){ try { return btoa(JSON.stringify(o)); } catch (e){ return ''; } },

  dec(s){ try { return JSON.parse(atob(String(s).trim())); } catch (e){ return null; } },

  cfg(){ return { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }] }; },

  reset(){
    for (const p of this.peers) try { p.pc.close(); } catch (e){}
    for (const p of this.pending) try { p.pc.close(); } catch (e){}
    this.peers = []; this.pending = []; this.online = false; this.isHost = false; this.role = 'solo';
    this.setStatus();
  },

  setStatus(txt?){
    $('netState').innerHTML = 'STATUS: <b>' + (txt || (this.online ? (this.isHost ? 'HOSTING (' + this.peers.length + ' PEERS)' : 'CONNECTED') : 'OFFLINE')) + '</b>';
    $('ndRole').textContent = this.isHost ? 'HOST (AUTHORITATIVE)' : this.online ? 'CLIENT' : 'LOCAL / SOLO';
    $('ndPeers').textContent = this.peers.length;
    $('ndIce').textContent = this.iceState;
  },

  mkPC(){
    const pc = new RTCPeerConnection(this.cfg());
    pc.oniceconnectionstatechange = () => { this.iceState = pc.iceConnectionState; this.setStatus(); 
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') UI.toast('PEER LINK DEGRADED', 'r'); };
    return pc;
  },

  waitIce(pc){
    return new Promise<void>(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const to = setTimeout(res, 2200);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete'){ clearTimeout(to); res(); } };
    });
  },

  wireDC(dc, peer){
    dc.onopen = () => { peer.open = true; this.setStatus(); UI.toast('DATACHANNEL OPEN', 'g'); SFX.levelup();
      if (this.isHost) this.welcome(peer); };
    dc.onclose = () => { peer.open = false; };
    dc.onmessage = ev => { this.st.in++; this.onMsg(peer, ev.data); };
  },

  /* ---- HOST ---- */
  async hostOffer(){
    this.isHost = true; this.role = 'host'; this.online = true;
    const pc = this.mkPC();
    const g = pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 });
    const r = pc.createDataChannel('r', { ordered: true });
    const peer = { pc: pc, g: g, r: r, open: false, actorId: null, idx: this.pending.length + this.peers.length };
    this.wireDC(g, peer); this.wireDC(r, peer);
    g.onopen = () => { peer.open = true; this.pending = this.pending.filter(p => p !== peer); this.peers.push(peer); this.setStatus(); UI.toast('PEER CONNECTED', 'g'); this.welcome(peer); };
    const off = await pc.createOffer(); await pc.setLocalDescription(off);
    await this.waitIce(pc);
    this.pending.push(peer);
    const tok = this.enc({ t: 'offer', s: pc.localDescription.sdp });
    $('sigLocal').value = tok; this.setStatus('AWAITING PEER ANSWER');
    return tok;
  },

  async hostAccept(ansTok){
    const m = this.dec(ansTok);
    if (!m || m.t !== 'answer'){ UI.toast('INVALID ANSWER TOKEN', 'r'); SFX.deny(); return; }
    const peer = this.pending.find(p => !p.answered);
    if (!peer){ UI.toast('NO PENDING OFFER — CLICK HOST ROOM FIRST', 'r'); return; }
    peer.answered = true;
    await peer.pc.setRemoteDescription({ type: 'answer', sdp: m.s });
    this.setStatus('LINK ESTABLISHING');
    UI.toast('ANSWER ACCEPTED', 'g');
  },

  welcome(peer){
    const L = Lobby;
    const id = 'p' + (peer.idx + 1);
    peer.actorId = id;
    if (Game.state === 'play'){                       /* join in progress */
      this.send(peer, { k: 'welcome', seed: Game.seed, mode: Game.mode, map: Game.mapId, id: id, team: Game.mode === 'tdm' ? 1 : 0, limit: Game.killLimit, hostName: Save.data.name });
    } else {                                          /* sit in the lobby until the host deploys */
      this.send(peer, { k: 'lobby', slots: L.slots.map(s => ({ n: s.name, t: s.type, tm: s.team, lv: s.lv })), seed: L.seed, mode: L.mode, map: L.map, limit: L.limit, id: id });
    }
  },

  /* ---- CLIENT ---- */
  async join(offerTok){
    const m = this.dec(offerTok);
    if (!m || m.t !== 'offer'){ UI.toast('INVALID OFFER TOKEN', 'r'); SFX.deny(); return null; }
    this.isHost = false; this.role = 'client'; this.online = true;
    const pc = this.mkPC();
    const peer = { pc: pc, g: null, r: null, open: false, idx: 0 };
    pc.ondatachannel = ev => {
      const dc = ev.channel;
      if (dc.label === 'g') peer.g = dc; else peer.r = dc;
      this.wireDC(dc, peer);
      if (dc.label === 'g') dc.onopen = () => { peer.open = true; this.peers = [peer]; this.setStatus('CONNECTED TO HOST'); };
    };
    await pc.setRemoteDescription({ type: 'offer', sdp: m.s });
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    await this.waitIce(pc);
    const tok = this.enc({ t: 'answer', s: pc.localDescription.sdp });
    $('sigLocal').value = tok;
    this.setStatus('SEND THIS ANSWER BACK TO HOST');
    this.sendRaw(peer, { k: 'hello', name: Save.data.name, loadout: Save.data.loadout });
    return tok;
  },

  send(peer, obj){
    if (!peer || !peer.open) return false;
    try { const s = JSON.stringify(obj); if (obj.k === 'snap' || obj.k === 'in' || obj.k === 'fx' || obj.k === 'shot') peer.g.send(s); else (peer.r && peer.r.readyState === 'open' ? peer.r : peer.g).send(s); this.st.out++; return true; }
    catch (e){ return false; }
  },

  sendRaw(peer, obj){ if (peer.r && peer.r.readyState === 'open') peer.r.send(JSON.stringify(obj)); else if (peer.g && peer.g.readyState === 'open') peer.g.send(JSON.stringify(obj)); },

  broadcast(obj, except?){
    for (const p of this.peers) if (p !== except) this.send(p, obj);
  }
};
