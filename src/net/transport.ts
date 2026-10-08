import { joinRoom } from 'trystero';
import { SFX } from '../audio/sfx';
import { $ } from '../core/dom';
import { Save } from '../core/save';
import { Game } from '../game/index';
import { Lobby } from '../game/lobby';
import { UI } from '../ui/index';

/* ------------------------------ E2. WEBRTC P2P ------------------------------ */
/* Trystero (public Nostr relays) replaces manual SDP copy-paste for connection setup only —
   it finds peers and gets their RTCPeerConnections talking, nothing else. The actual game
   traffic still never touches a server: once a peer is found we open our own 'g' (unreliable,
   for snaps/shots) and 'r' (reliable, for lobby/chat) data channels directly on that connection,
   pre-negotiated by matching channel ids so no extra signaling round-trip is needed for them. */
export const netTransport = {
  /* optional hook fired by the host when a match starts (seed, mode) */
  onMatchStart: null as null | ((seed: string, mode: string) => void),
  role: 'solo',

  online: false,

  isHost: false,

  peers: [],

  myId: 'p0',

  st: { in: 0, out: 0, t: 0, rate: 0 },

  snapAcc: 0,

  inAcc: 0,

  rtt: 0,

  iceState: 'idle',

  room: null as any,

  roomId: '',

  /* set just before joinRoomById() when a peer followed a per-slot invite link, so the handshake
     below can ask the host for that exact slot instead of "whichever is free" */
  wantSlot: null as number | null,

  reset(){
    for (const p of this.peers) try { p.pc && p.pc.close(); } catch (e){}
    this.peers = [];
    const r = this.room;
    this.room = null; this.roomId = ''; this.online = false; this.isHost = false; this.role = 'solo'; this.wantSlot = null;
    if (r) try { Promise.resolve(r.leave()).catch(() => {}); } catch (e){}
    this.setStatus();
  },

  setStatus(txt?){
    $('netState').innerHTML = 'STATUS: <b>' + (txt || (this.online ? (this.isHost ? 'HOSTING (' + this.peers.length + ' PEERS)' : 'CONNECTED') : 'OFFLINE')) + '</b>';
    $('ndRole').textContent = this.isHost ? 'HOST (AUTHORITATIVE)' : this.online ? 'CLIENT' : 'LOCAL / SOLO';
    $('ndPeers').textContent = this.peers.length;
    $('ndIce').textContent = this.iceState;
  },

  /* a short room code IS the arena seed — one less thing to keep in sync, and it reads naturally
     ("join seed RLL39TQM") even typed out loud instead of pasted */
  roomFor(seed){ return 'rs-' + String(seed || '').toUpperCase(); },

  /* ---- shared: wire a freshly-connected trystero peer with our own g/r data channels ---- */
  wirePeer(peerId){
    const pcs = this.room.getPeers();
    const pc = pcs[peerId]; if (!pc) return;
    pc.oniceconnectionstatechange = () => { this.iceState = pc.iceConnectionState; this.setStatus();
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') UI.toast('PEER LINK DEGRADED', 'r'); };
    this.iceState = pc.iceConnectionState; /* trystero already has the connection going by the time onPeerJoin fires */
    /* high ids so they can't collide with whatever channel id trystero auto-assigns itself on this same connection */
    const g = pc.createDataChannel('g', { negotiated: true, id: 50, ordered: false, maxRetransmits: 0 });
    const r = pc.createDataChannel('r', { negotiated: true, id: 51, ordered: true });
    const peer: any = { pc, g, r, open: false, actorId: null, idx: this.peers.length, peerId };
    this.wireDC(g, peer); this.wireDC(r, peer);
    if (this.isHost) this.peers.push(peer); else this.peers = [peer];
    return peer;
  },

  unwirePeer(peerId){
    const i = this.peers.findIndex((p: any) => p.peerId === peerId);
    if (i < 0) return;
    const [peer] = this.peers.splice(i, 1);
    try { peer.pc && peer.pc.close(); } catch (e){}
    if (this.isHost && peer.actorId){
      const slot = Lobby.slots.findIndex(s => s.id === peer.actorId);
      if (slot >= 0){ Lobby.slots[slot] = { type: 'empty', name: '— OPEN SLOT —', team: 0 }; UI.buildSlots(); this.lobbySync(); }
    }
    this.setStatus();
    if (this.isHost) UI.toast('PEER DISCONNECTED', 'r');
  },

  /* host only: tell a peer to leave, then drop them locally — trystero has no built-in kick,
     so the peer's own client disconnects itself on receiving this */
  kick(peer){
    this.sendRaw(peer, { k: 'kicked' });
    this.unwirePeer(peer.peerId);
  },

  wireDC(dc, peer){
    dc.onopen = () => {
      peer.openN = (peer.openN || 0) + 1;
      if (peer.openN < 2) return; /* wait for both g and r before announcing — matches old single-channel-open semantics */
      peer.open = true; this.setStatus(); UI.toast(this.isHost ? 'PEER CONNECTED' : 'CONNECTED TO HOST', 'g'); SFX.levelup();
      if (this.isHost) this.welcome(peer); else this.sendRaw(peer, { k: 'hello', name: Save.data.name, loadout: Save.data.loadout, slot: this.wantSlot });
    };
    dc.onclose = () => { peer.open = false; };
    dc.onmessage = ev => { this.st.in++; this.onMsg(peer, ev.data); };
  },

  /* ---- HOST: open a room at the current arena seed and wait for peers ---- */
  hostRoom(){
    this.isHost = true; this.role = 'host'; this.online = true;
    this.roomId = this.roomFor(Lobby.seed);
    this.room = joinRoom({ appId: 'retrostrike-fps' }, this.roomId);
    this.room.onPeerJoin = (peerId: string) => this.wirePeer(peerId);
    this.room.onPeerLeave = (peerId: string) => this.unwirePeer(peerId);
    this.setStatus('ROOM OPEN — AWAITING PEERS');
    return this.roomId;
  },

  /* ---- CLIENT: join the host's room by seed/room code ---- */
  joinRoomById(seed){
    this.isHost = false; this.role = 'client'; this.online = true;
    Lobby.seed = String(seed).toUpperCase();
    this.roomId = this.roomFor(Lobby.seed);
    this.room = joinRoom({ appId: 'retrostrike-fps' }, this.roomId);
    this.room.onPeerJoin = (peerId: string) => this.wirePeer(peerId);
    this.room.onPeerLeave = (peerId: string) => this.unwirePeer(peerId);
    this.setStatus('LOOKING FOR HOST...');
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
