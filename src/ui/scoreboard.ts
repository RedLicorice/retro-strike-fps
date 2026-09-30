import { $, vis } from '../core/dom';
import { Save } from '../core/save';
import { WBY } from '../data/weapons';
import { Game } from '../game/index';

export const uiScoreboard = {
  score(on){
    const s = $('score'); if (!s) return;
    if (on && Game.state === 'play'){ vis('score', true); this.renderBoard(true); }
    else vis('score', false);
  },

  renderBoard(live){
    const A = Game.actors.slice().sort((a, b) => b.score - a.score || b.kills - a.kills);
    const body = $('sbBody'); if (!body) return;
    $('sbSub').textContent = live ? 'HOLD TAB' : 'FINAL';
    $('sbTitle').textContent = Game.mode === 'horde' ? 'HORDE — WAVE ' + Game.wave : (Game.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'FREE FOR ALL');
    let html = '';
    if (Game.mode === 'tdm'){
      for (let t = 0; t < 2; t++){
        html += '<div class="teamBlk t' + t + '"><div class="th"><span>' + (t === 0 ? 'RED SQUAD' : 'BLUE SQUAD') + '</span><span>' + Game.score[t] + ' / ' + Game.killLimit + '</span></div>';
        html += this.boardTable(A.filter(a => a.team === t));
        html += '</div>';
      }
    } else html = this.boardTable(A);
    if (Game.mode === 'horde'){
      html += '<div class="teamBlk"><div class="th" style="color:var(--blood)"><span>HOSTILES REMAINING</span><span>' + Game.monsters.filter(m => m.alive).length + ' (+' + (Game.waveQueue || 0) + ' QUEUED)</span></div></div>';
    }
    body.innerHTML = html;
  },

  boardTable(list){
    let h = '<table class="sbT"><tr><th>#</th><th>CALLSIGN</th><th>K</th><th>D</th><th>K/D</th><th>SCORE</th><th>WEAPON</th><th>PING</th></tr>';
    list.forEach((a, i) => {
      const kd = a.deaths ? (a.kills / a.deaths).toFixed(2) : a.kills.toFixed(2);
      const w = WBY[a.wpn];
      h += '<tr class="' + (a.isLocal ? 'me ' : '') + (Game.mode === 'tdm' ? 't' + a.team : '') + '">' +
        '<td>' + (i + 1) + '</td><td>' + a.name + (a.isBot ? ' <span style="color:var(--mut)">[AI]</span>' : '') + (a.isLocal ? ' <span style="color:var(--amber)">(YOU)</span>' : '') + '</td>' +
        '<td>' + a.kills + '</td><td>' + a.deaths + '</td><td>' + kd + '</td><td style="color:var(--amber)">' + a.score + '</td>' +
        '<td>' + (w ? w.name : '—') + ' <span style="color:var(--mut)">L' + Save.w(a.wpn).lvl + '</span></td>' +
        '<td>' + (a.isLocal ? '—' : (a.ping ? a.ping + 'ms' : 'HOST')) + '</td></tr>';
    });
    return h + '</table>';
  }
};
