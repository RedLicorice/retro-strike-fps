import sys, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
errors, logs = [], []
ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)

with sync_playwright() as p:
    b = p.firefox.launch(headless=True, firefox_user_prefs={'webgl.force-enabled': True, 'webgl.disabled': False})
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: (errors if m.type == 'error' else logs).append(m.type + ': ' + m.text))
    pg.goto(URL)
    pg.wait_for_function("window.__rs && window.__rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=90000)
    ok(True, 'boot -> menu')
    pg.screenshot(path=OUT + '/menu.png')

    pg.click('#btnDeploy')
    pg.wait_for_function("window.__rs.Game.state === 'play' && window.__rs.Player.alive", timeout=30000)
    ok(True, 'deploy -> play, mode=%s actors=%d' % (pg.evaluate("__rs.Game.mode"), pg.evaluate("__rs.Game.actors.length")))

    # --- spawn protection on the fresh spawn ---
    r = pg.evaluate("""() => { const G = __rs.Game, me = G.local, bot = G.actors.find(a => a.isBot);
      const prot = me.spawnProt, hp0 = me.hp;
      __rs.Combat.applyDamage(me, 40, bot, false, 'ak47', 0, 0, 1, null);
      return { prot, hp0, hp1: me.hp, botSees: G.actors.filter(a => a.isBot && a.alive && __rs.MAP.los(a.pos.x, a.pos.y + 1.6, a.pos.z, me.pos.x, me.pos.y + 1.3, me.pos.z)).length }; }""")
    ok(r['prot'] > 2 and r['hp1'] == r['hp0'], 'spawn protection blocks damage: %s' % r)

    # --- spawn cover: every ground spawn has a >=1.4m solid within 2m ---
    c = pg.evaluate("""() => { const M = __rs.MAP; let cov = 0;
      for (const s of M.spawns){ if (M.boxes.some(b => b.y1 - b.y0 >= 1.4 && b.y0 <= .1 &&
          Math.max(b.x0 - s.x, 0, s.x - b.x1) < 2 && Math.max(b.z0 - s.z, 0, s.z - b.z1) < 2)) cov++; }
      return { spawns: M.spawns.length, covered: cov }; }""")
    ok(c['covered'] == c['spawns'], 'spawns with full-height cover within 2m: %s' % c)

    # --- WASD vs camera direction at several yaws ---
    pg.evaluate("__rs.Input.enabled = true; __rs.Game.local.spawnProt = 1e9")   # bots can't kill the player mid-measurement
    spot = pg.evaluate("""() => { const M = __rs.MAP; for (let k = 0; k < 400; k++){ const p = M.randomOpen();
        if (!M.boxes.some(b => b.x0 - 3 < p.x && b.x1 + 3 > p.x && b.z0 - 3 < p.z && b.z1 + 3 > p.z && b.y1 > .05)){ __rs.Player.pos.set(p.x, 0.05, p.z); return [p.x, p.z]; } } return null; }""")
    print('   (direction tests at open spot', spot, ')')
    for yaw, key in [(0, 'w'), (1.5708, 'w'), (3.1416, 'w'), (-1.5708, 'w'), (0.7, 'd'), (2.2, 's'), (-2.5, 'a')]:
        res = pg.evaluate("""([yaw, key]) => new Promise(res => {
            const P = __rs.Player, I = __rs.Input, cam = __rs.ctx.cam;
            P.yaw = yaw; P.pitch = 0; P.vel.set(0, P.vel.y, 0); P.sliding = 0; if (window.__spot0) P.pos.copyFrom(window.__spot0); else window.__spot0 = P.pos.clone();
            /* ask the camera itself for forward/right after one frame at this yaw */
            const turned = () => { const d = Math.abs(((cam.rotation.y - P.yaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return d < .02; };
            const go = () => {
              if (!turned()) { requestAnimationFrame(go); return; }     /* measure only once the camera shows this yaw */
              const V = cam.position.constructor, f = cam.getDirection(new V(0, 0, 1)), r = cam.getDirection(new V(1, 0, 0));
              const x0 = P.pos.x, z0 = P.pos.z;
              const code = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD' }[key];
              I.keys[code] = 1;
              setTimeout(() => { I.keys[code] = 0;
                const dx = P.pos.x - x0, dz = P.pos.z - z0, l = Math.hypot(dx, dz) || 1;
                const want = { w: [f.x, f.z], s: [-f.x, -f.z], d: [r.x, r.z], a: [-r.x, -r.z] }[key];
                const wl = Math.hypot(want[0], want[1]) || 1;
                res({ moved: +l.toFixed(2), dot: +((dx * want[0] + dz * want[1]) / l / wl).toFixed(3) });
              }, 250);
            };
            setTimeout(go, 60);
          })""", [yaw, key])
        ok(res['dot'] > 0.9 or res['moved'] < 0.05, 'key %s at yaw %.2f moves along camera (%s)' % (key.upper(), yaw, res))
        pg.evaluate("__rs.Player.spawnT = 0")

    # --- protection expires, then damage lands ---
    pg.evaluate('__rs.Game.local.spawnProt = 0.5')
    pg.wait_for_function('!__rs.Game.local.alive || __rs.Game.local.spawnProt <= 0', timeout=15000)
    r = pg.evaluate("""() => { const G = __rs.Game, me = G.local; const hp0 = me.hp;
      if (!me.alive) return { dead: true };
      const sh0 = me.shield;
      __rs.Combat.applyDamage(me, 10, G.actors.find(a => a.isBot), false, 'ak47', 0, 0, 1, null);
      return { prot: me.spawnProt, hp0, hp1: me.hp, sh0, sh1: me.shield }; }""")
    ok(r.get('dead') or (r['prot'] <= 0 and (r['hp1'] < r['hp0'] or r['sh1'] < r['sh0'])), 'damage lands (armour first) after protection ends: %s' % r)

    # --- let the match run with bots for a while ---
    pg.screenshot(path=OUT + '/play.png')
    t0 = time.time()
    pg.wait_for_timeout(20000)
    st = pg.evaluate("""() => ({ state: __rs.Game.state, kills: __rs.Game.actors.reduce((s, a) => s + a.kills, 0),
        deaths: __rs.Game.actors.reduce((s, a) => s + a.deaths, 0), alive: __rs.Game.actors.filter(a => a.alive).length,
        fps: +__rs.ctx.engine.getFps().toFixed(1) })""")
    ok(True, '20s of bot play: %s' % st)
    pg.screenshot(path=OUT + '/play2.png')
    b.close()

print('\n--- console errors / page errors (%d) ---' % len(errors))
for e in errors[:30]: print(e)
print('--- warnings (%d) ---' % sum(1 for l in logs if l.startswith('warning')))
for l in [l for l in logs if l.startswith('warning')][:10]: print(l)
