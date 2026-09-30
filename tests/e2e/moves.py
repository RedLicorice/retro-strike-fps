import sys, math
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]; errs = []; warns = []; ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)
with sync_playwright() as p:
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: (warns.append(m.text) if '[anim]' in m.text else errs.append(m.text) if m.type == 'error' else None))
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)
    pg.click('#btnDeploy'); pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=30000); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const M = __rs.MAP; for (let k = 0; k < 600; k++){ const p = M.randomOpen();
        if (!M.boxes.some(b => b.x0 - 3.5 < p.x && b.x1 + 3.5 > p.x && b.z0 - 3.5 < p.z && b.z1 + 3.5 > p.z && b.y1 > .05)){ __rs.Player.pos.set(p.x, 0.05, p.z); window.__home = p; break; } }
        if (!window.__home) window.__home = { x: __rs.Player.pos.x, z: __rs.Player.pos.z };
        __rs.Game.local.spawnProt = 1e9; __rs.Input.enabled = true; __rs.Game.local.lastFire = 0;
        for (const a of __rs.Game.actors) if (a.isBot){ a.alive = false; a.respawnT = 1e9; a.pos.set(0, -50, 0); } }""")
    home = lambda: pg.evaluate("__rs.Player.pos.set(__home.x, 0.05, __home.z); __rs.Player.vel.set(0,0,0)")
    A = lambda: pg.evaluate("""() => { const an = __rs.Game.local.anim; const w = x => ((x + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
        return { on: [...an.active].filter(n => an.w[n] > .25), turn: an.turn && an.turn.clip, trans: an.trans, upper: an.upper && an.upper.clip, frozen: an.frozen,
                 bodyVsView: +(w(an.bodyYaw - __rs.Player.yaw) * 180 / Math.PI).toFixed(0) }; }""")
    pg.keyboard.press('v'); pg.wait_for_timeout(2600)   # let 'aiming' (recent fire) expire
    # 1. idle turn in place
    pg.evaluate("__rs.Player.yaw += 1.45"); pg.wait_for_timeout(250); a1 = A()
    pg.wait_for_timeout(1600); a2 = A()
    ok(a1['turn'] == 'turn_r' and abs(a2['bodyVsView']) < 20, 'idle view turn 83° right -> turn_r clip, body catches up (%s -> %s)' % (a1, a2))
    # 2. fire / hit one-shots
    pg.evaluate("__rs.Input.mouse.b[0] = true"); pg.wait_for_timeout(120); a = A(); pg.evaluate("__rs.Input.mouse.b[0] = false")
    ok(a['upper'] == 'fire', 'firing -> upper-body fire clip %s' % a); pg.wait_for_timeout(700)
    pg.evaluate("__rs.Game.local.spawnProt = 0; __rs.Game.local.shield = 150; __rs.Combat.applyDamage(__rs.Game.local, 5, null, false, 'ak47', 0, 0, 1, null); __rs.Game.local.spawnProt = 1e9")
    pg.wait_for_timeout(120); a = A(); ok(a['upper'] == 'hit', 'taking damage -> hit reaction %s' % a); pg.wait_for_timeout(1500)
    # 3. transitions: crouch -> prone -> stand
    pg.keyboard.press('c'); pg.wait_for_timeout(400); pg.keyboard.press('c'); pg.wait_for_timeout(200); a = A()
    ok(a['trans'] == 't_crouch_prone', 'crouch -> prone transition %s' % a); pg.wait_for_timeout(1400)
    # 4. prone sideways: turn to face movement, then crawl forward
    home(); pg.keyboard.down('d'); pg.wait_for_timeout(500); a1 = A(); pg.wait_for_timeout(3200); a2 = A(); pg.screenshot(path=OUT + '/prone_side.png'); pg.keyboard.up('d')
    ok(a1['turn'] == 'prone_turn_r' and 'prone_f' in a2['on'] and 60 < a2['bodyVsView'] < 120, 'prone right: prone_turn_r, then crawls forward facing right (%s -> %s)' % (a1, a2))
    pg.wait_for_timeout(2500)
    pg.keyboard.press('Space'); pg.wait_for_timeout(200); a = A()
    ok(a['trans'] == 't_prone_stand', 'prone -> stand (Space) transition %s' % a); pg.wait_for_timeout(1500)
    # 5. unarmed (grenade): idle, walk, throw, low crawl back
    pg.keyboard.press('3'); pg.wait_for_timeout(900); a = A(); ok('unarmed_idle' in a['on'], 'grenade in hand: unarmed idle %s' % a)
    pg.keyboard.press('g'); pg.wait_for_timeout(250); a = A(); ok(a['upper'] == 'throw', 'throw -> toss grenade clip %s' % a)
    pg.wait_for_timeout(1800)
    b.close()
print('anim warnings:', sorted(set(w.split('"')[1] for w in warns if '"' in w)))
print('errors', errs[:5])
