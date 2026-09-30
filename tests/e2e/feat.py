import sys, json
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]
ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)
errors = []
with sync_playwright() as p:
    b = p.firefox.launch(headless=True)
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=90000)

    # ---- operator select ----
    pg.click('.tab[data-slot="3"]')
    pg.wait_for_timeout(600)
    n = pg.evaluate("document.querySelectorAll('#wlist .opcard').length")
    ok(n == 9, 'operator tab lists %d characters' % n)
    pg.click('#wlist .opcard[data-id="zlorp"]')
    pg.wait_for_timeout(300)
    r = pg.evaluate("({ saved: JSON.parse(localStorage.getItem('retrostrike_v1')).character, eq: document.getElementById('eqLine').textContent })")
    ok(r['saved'] == 'zlorp' and 'ZLORP' in r['eq'], 'selection saved + shown: %s' % r)
    pg.locator('.opgrid').scroll_into_view_if_needed()
    pg.screenshot(path=OUT + '/menu_ops.png')

    # ---- deploy ----
    pg.click('#btnDeploy')
    pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=30000)
    r = pg.evaluate("({ me: __rs.Game.local.charId, bots: __rs.Game.actors.filter(a => a.isBot).map(a => a.charId) })")
    ok(r['me'] == 'zlorp' and 'zlorp' not in r['bots'] and len(set(r['bots'])) == len(r['bots']), 'player is zlorp, bots distinct: %s' % r)

    # ---- shotgun: 9 pellets at a bot 5 m ahead ----
    r = pg.evaluate("""() => { const G = __rs.Game, P = __rs.Player, W = __rs.Wep;
      const bot = G.actors.find(a => a.isBot); bot.spawnProt = 0; bot.hp = 100; bot.shield = 0; bot.alive = true;
      P.spawnT = 0; P.yaw = 0; P.pitch = 0;
      bot.pos.set(P.pos.x, P.pos.y, P.pos.z + 5); bot.vel.set(0, 0, 0);
      /* make sure nothing blocks the 5 m line */
      const clear = !__rs.MAP.ray(P.pos.x, P.pos.y + 1.4, P.pos.z, 0, 0, 1, 5);
      W.ids[0] = 'm1014'; W.ammo['m1014'] = { mag: 7, res: 35 }; W.slot = 1; W.switchTo(0); W.swapT = 0; W.fireT = 0; W.aimT = 0;
      __rs.ctx.cam.position.set(P.pos.x, P.pos.y + 1.4, P.pos.z); __rs.ctx.cam.rotation.set(0, 0, 0); __rs.ctx.cam.computeWorldMatrix(true);
      const orig = __rs.Combat.trace; let n = 0; __rs.Combat.trace = function(){ n++; return orig.apply(this, arguments); };
      W.fire(); __rs.Combat.trace = orig;
      return { clear, traces: n, hp: bot.hp, mag: W.ammo['m1014'].mag }; }""")
    ok(r['traces'] == 9 and r['mag'] == 6, 'shotgun fires 9 pellets, uses 1 shell: %s' % r)
    ok(not r['clear'] or r['hp'] <= 40, 'point-blank buckshot does heavy damage (clear line): %s' % r)

    # ---- per-shell reload ----
    r = pg.evaluate("""() => { const W = __rs.Wep; W.reloadT = 0; W.ammo['m1014'].mag = 1; W.reload(); const a = W.reloadDur;
      W.reloadT = 0; W.ammo['m1014'].mag = 6; W.reload(); return { six: +a.toFixed(2), one: +W.reloadDur.toFixed(2) }; }""")
    ok(r['six'] > r['one'] * 2, 'tube reload scales with missing shells: %s' % r)

    # ---- third person ----
    pg.evaluate("__rs.Wep.reloadT = 0; __rs.Wep.switchTo(1)")
    pg.evaluate("""() => { const M = __rs.MAP; for (let k = 0; k < 400; k++){ const p = M.randomOpen();
        if (!M.boxes.some(b => b.x0 - 3.5 < p.x && b.x1 + 3.5 > p.x && b.z0 - 3.5 < p.z && b.z1 + 3.5 > p.z && b.y1 > .05)){ __rs.Player.pos.set(p.x, 0.05, p.z); return; } } }""")
    pg.keyboard.press('v')
    pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => { const P = __rs.Player, me = __rs.Game.local, c = __rs.ctx.cam.position;
      return { view3p: +__rs.ctx.view3p.toFixed(2), rig: me.rig.isEnabled(), vm: __rs.Wep.vm.isEnabled(),
               boom: +Math.hypot(c.x - P.pos.x, c.z - P.pos.z).toFixed(2), adv: +P.tpAdvance.toFixed(2), muzzle: !!me.muzzleWorld() }; }""")
    ok(r['view3p'] > .9 and r['rig'] and not r['vm'] and r['boom'] > .3 and r['muzzle'], 'V toggles third person (model shown, viewmodel hidden): %s' % r)
    pg.screenshot(path=OUT + '/tp.png')
    # aiming in third person: stays third person, camera pulls in over the shoulder, no sights/scope
    pg.evaluate("__rs.Wep.ids[0] = 'awp'; __rs.Wep.ammo['awp'] = { mag: 10, res: 30 }; __rs.Wep.switchTo(1); __rs.Wep.switchTo(0); __rs.Wep.swapT = 0")
    pg.wait_for_timeout(400)
    boom0 = pg.evaluate("Math.hypot(__rs.ctx.cam.position.x - __rs.Player.pos.x, __rs.ctx.cam.position.z - __rs.Player.pos.z)")
    pg.evaluate("__rs.Input.mouse.b[2] = true")
    pg.wait_for_timeout(1200)
    r = pg.evaluate("({ view3p: +__rs.ctx.view3p.toFixed(2), aim: +__rs.Wep.aimT.toFixed(2), boom: +Math.hypot(__rs.ctx.cam.position.x - __rs.Player.pos.x, __rs.ctx.cam.position.z - __rs.Player.pos.z).toFixed(2), fovDeg: +(__rs.ctx.cam.fov * 57.3).toFixed(1), scopeOverlay: document.getElementById('scopeOv').classList.contains('on'), vm: __rs.Wep.vm.isEnabled(), wpn: __rs.Wep.def.id })")
    ok(r['view3p'] > .9 and r['aim'] > .9 and r['boom'] < boom0 - .5 and not r['scopeOverlay'] and not r['vm'] and r['fovDeg'] > 30,
       'aiming in 3P: stays 3P, boom %.2f -> %.2f, mild zoom, no scope overlay: %s' % (boom0, r['boom'], r))
    pg.screenshot(path=OUT + '/tp_aim.png')
    pg.evaluate("__rs.Input.mouse.b[2] = false")
    pg.wait_for_timeout(8000)
    pg.screenshot(path=OUT + '/tp2.png')
    r = pg.evaluate("""() => __rs.Game.actors.filter(a => a.isBot && a.alive && a.anim).map(a => [a.charId, [...a.anim.active].join('+')])""")
    ok(len(r) > 0 and all(x[1] for x in r), 'bots animating: %s' % r)
    b.close()
print('errors:', errors[:10])
