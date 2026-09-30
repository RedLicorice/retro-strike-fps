"""City map: lobby choice, deterministic generation, terrain-aware physics/bullets, no embedding, bots navigate."""
import sys, random
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]
ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)
errors = []
with sync_playwright() as p:
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)

    opts = pg.evaluate("[...document.querySelectorAll('#lbMap option')].map(o => o.value)")
    ok('arena' in opts and 'city' in opts and 'city:valley' in opts, 'lobby map picker lists arena, procedural city and heightmap cities: %s' % opts)

    r = pg.evaluate("""() => { const M = __rs.MAP, sig = () => M.boxes.length + ':' + M.boxes.slice(0, 400).map(b => b.x0.toFixed(2) + b.z1.toFixed(2) + b.y1.toFixed(2)).join('');
      M.generate('DETERMIN', 'city'); const a = sig(), t = M.terrainY(37, -81); M.generate('DETERMIN', 'city'); const b2 = sig();
      M.generate('DETERMIN', 'city:valley'); const c = sig(); return { same: a === b2, t: +t.toFixed(3), t2: +M.terrainY(37, -81).toFixed(3), differs: a !== c }; }""")
    ok(r['same'] and r['differs'], 'same seed + map -> same city; heightmap changes it: %s' % r)

    pg.evaluate("document.getElementById('inSeed').value = 'CITYE2E'; __rs.Lobby.map = 'city'; __rs.UI.deploy()")
    pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=60000)
    pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => { const M = __rs.MAP, P = __rs.Player;
      return { map: __rs.Game.mapId, half: M.half, spawns: M.spawns.length, bld: M.props.filter(p => p.kind === 'bld').length,
               y: +P.pos.y.toFixed(2), ground: +M.groundAt(P.pos.x, P.pos.z, P.pos.y + .5, 1).toFixed(2), fogEnd: __rs.ctx.scene.fogEnd }; }""")
    ok(r['map'] == 'city' and r['half'] == 200 and r['spawns'] >= 16 and r['bld'] > 60, 'city deploys: %s' % r)
    ok(abs(r['y'] - r['ground']) < .2, 'player stands on the terrain, not at y=0: %s' % r)

    r = pg.evaluate("""() => { const M = __rs.MAP; let n = 0, good = 0;
      for (let k = 0; k < 40; k++){ const x = (Math.random() - .5) * 360, z = (Math.random() - .5) * 360, t = M.terrainY(x, z);
        const h = M.ray(x, t + 30, z, 0, -1, 0, 60); n++; if (h && h.y >= t - .05) good++; }
      return { n, good }; }""")
    ok(r['good'] == r['n'], 'downward shots stop at the terrain or something on it: %s' % r)

    # random walks: never end up inside a collider
    pg.evaluate("for (const a of __rs.Game.actors) if (a.isBot){ a.pos.set(0, -50, 0); a.alive = false; a.respawnT = 1e9; } __rs.Game.local.spawnProt = 1e9; __rs.Input.enabled = true;")
    pg.evaluate("""() => { window.__emb = []; const P = __rs.Player, M = __rs.MAP;
      window.__chk = setInterval(() => { const x = P.pos.x, z = P.pos.z, y = P.pos.y, r = P.radius - .05;
        for (const b of M.near(x - 1, z - 1, x + 1, z + 1)){ if (b.y1 <= y + .45 || b.y0 >= y + 1.6) continue;
          if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1){ __emb.push([+x.toFixed(1), +y.toFixed(1), +z.toFixed(1), b.mat]); break; } } }, 50); }""")
    for k in range(18):
        pg.evaluate("""() => { const p = __rs.MAP.randomOpen(); __rs.Player.pos.set(p.x, p.y + .05, p.z); __rs.Player.vel.set(0,0,0); __rs.Player.yaw = Math.random() * 6.28; }""")
        ks = random.sample(['w', 'a', 's', 'd'], 2)
        for kk in ks: pg.keyboard.down(kk)
        pg.keyboard.down('Shift')
        for _ in range(3):
            pg.wait_for_timeout(300)
            if random.random() < .3: pg.keyboard.press('Space')
            pg.evaluate("__rs.Player.yaw += (Math.random() - .5) * 1.5")
        for kk in ks: pg.keyboard.up(kk)
        pg.keyboard.up('Shift')
    e = pg.evaluate("__emb.splice(0)")
    ok(len(e) == 0, 'random runs across the city never embed the player: %d samples %s' % (len(e), e[:4]))
    pg.evaluate("clearInterval(__chk)")
    pg.screenshot(path=OUT + '/city.png')
    b.close()

    # bots: fresh match, they should roam the streets
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)
    pg.evaluate("document.getElementById('inSeed').value = 'CITYBOTS'; __rs.Lobby.map = 'city'; __rs.UI.deploy()")
    pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=60000)
    pg.evaluate("__rs.Game.local.spawnProt = 1e9; window.__b0 = __rs.Game.actors.filter(a => a.isBot).map(a => [a.pos.x, a.pos.z])")
    pg.wait_for_timeout(15000)
    r = pg.evaluate("""() => { const bots = __rs.Game.actors.filter(a => a.isBot);
      return bots.map((a, i) => ({ moved: +Math.hypot(a.pos.x - __b0[i][0], a.pos.z - __b0[i][1]).toFixed(1), path: !!(a.ai && a.ai.path && a.ai.path.length), alive: a.alive })); }""")
    moved = [x for x in r if x['moved'] > 8]
    ok(len(moved) >= max(1, len(r) // 2), 'bots navigate the city (%d/%d moved > 8 m): %s' % (len(moved), len(r), r))
    b.close()
print('errors:', errors[:6])
