from playwright.sync_api import sync_playwright
ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)
warns = []
with sync_playwright() as p:
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.on('console', lambda m: warns.append(m.text) if m.type in ('warning', 'error') and '[anim]' in m.text else None)
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)
    pg.click('#btnDeploy'); pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=30000)
    pg.wait_for_timeout(3300)
    # park the player in open ground so movement isn't blocked
    pg.evaluate("""() => { const M = __rs.MAP; for (let k = 0; k < 400; k++){ const p = M.randomOpen();
        if (!M.boxes.some(b => b.x0 - 4 < p.x && b.x1 + 4 > p.x && b.z0 - 4 < p.z && b.z1 + 4 > p.z && b.y1 > .05 && b.y1 - b.y0 < 8)){ __rs.Player.pos.set(p.x, 0.05, p.z); window.__home = p; return; } } }""")
    pg.evaluate("__rs.Input.enabled = true; for (const a of __rs.Game.actors) if (a.isBot) { a.pos.set(0, -50, 0); a.alive = false; a.respawnT = 999; }")
    st = lambda: pg.evaluate("({ stance: __rs.Player.stance, want: __rs.Player.stanceWant, vy: +__rs.Player.vel.y.toFixed(2), speed: +__rs.Player.speed.toFixed(2), sprint: __rs.Player.sprint,  slide: +__rs.Player.sliding.toFixed(2), onGround: __rs.Player.onGround })")
    home = lambda: pg.evaluate("__rs.Player.pos.set(__home.x, 0.05, __home.z); __rs.Player.vel.set(0,0,0); __rs.Player.yaw = Math.random() * 6")
    tap = lambda k: (pg.keyboard.press(k), pg.wait_for_timeout(250))

    s = st(); ok(s['stance'] == 0, 'default stance is standing %s' % s)
    tap('c'); s = st(); ok(s['stance'] == 1, 'C -> crouch %s' % s)
    tap('c'); s = st(); ok(s['stance'] == 2, 'C when crouched -> prone %s' % s)
    tap('c'); s = st(); ok(s['stance'] == 1, 'C when prone -> crouch %s' % s)
    tap('Space'); s = st(); ok(s['stance'] == 0 and s['vy'] < 1, 'Space when crouched -> stands up, no jump %s' % s)
    tap('c'); tap('c'); tap('Space'); s = st(); ok(s['stance'] == 0 and s['vy'] < 1, 'Space when prone -> stands up, no jump %s' % s)
    pg.wait_for_function("__rs.Player.onGround && Math.abs(__rs.Player.vel.y) < .01", timeout=5000); pg.wait_for_timeout(200)
    pg.keyboard.press('Space'); pg.wait_for_function("!__rs.Player.onGround || __rs.Player.vel.y > 1", timeout=2000); s = st(); ok(s['vy'] > 3 or not s['onGround'], 'Space when standing -> jump %s' % s)
    pg.wait_for_timeout(900)
    # shift while crouched: stand + run, release -> crouch again
    home(); tap('c')
    pg.keyboard.down('Shift'); pg.keyboard.down('w'); pg.wait_for_timeout(700); s = st()
    pg.keyboard.up('Shift'); pg.wait_for_timeout(300); s2 = st(); pg.keyboard.up('w'); pg.wait_for_timeout(200)
    ok(s['stance'] == 0 and s['sprint'] and s2['stance'] == 1, 'Shift while crouched -> stand + run, release -> crouch (held %s, released %s)' % ((s['stance'], s['sprint'], s['speed']), (s2['stance'], s2['sprint'])))
    tap('Space'); pg.wait_for_timeout(200)
    # sprint + slide
    home(); pg.wait_for_function("__rs.Player.onGround && __rs.Player.stance === 0", timeout=5000)
    pg.keyboard.down('Shift'); pg.keyboard.down('w'); pg.wait_for_function("__rs.Player.speed > 6 && __rs.Player.onGround", timeout=5000); s0 = st()
    pg.keyboard.press('c'); pg.wait_for_timeout(80); s = st()
    pg.keyboard.up('w'); pg.keyboard.up('Shift')
    ok(s0['sprint'] and s['slide'] > 0, 'Shift = run, C while running -> slide (before %s, after %s)' % (s0, s))
    pg.wait_for_function('__rs.Player.sliding <= 0', timeout=8000); pg.wait_for_timeout(300); s = st(); ok(s['stance'] == 0 and s['slide'] <= 0, 'after slide back to standing %s' % s)
    # headroom: can't stand under a low ceiling
    r = pg.evaluate("""() => { const P = __rs.Player, M = __rs.MAP;
        P.pos.set(__home.x, 0.05, __home.z);
        const b = { x0: P.pos.x - 1, x1: P.pos.x + 1, y0: 1.0, y1: 1.3, z0: P.pos.z - 1, z1: P.pos.z + 1, mat: 'test' };
        M.boxes.push(b); window.__tb = b; P.stance = 2; P.stanceWant = 2; return true; }""")
    tap('Space'); s = st()
    pg.evaluate("__rs.MAP.boxes.splice(__rs.MAP.boxes.indexOf(__tb), 1)")
    pg.wait_for_timeout(300); s2 = st()
    ok(s['stance'] == 2 and s2['stance'] == 0, 'Space under a 1 m ceiling stays prone, stands once clear (blocked %s, clear %s)' % (s['stance'], s2['stance']))
    # third person: prone clips (facing kept fixed so the body doesn't need to turn), turns for sideways, slide
    anim = lambda: pg.evaluate("({ frozen: __rs.Game.local.anim.frozen, turn: __rs.Game.local.anim.turn && __rs.Game.local.anim.turn.clip, active: [...__rs.Game.local.anim.active].filter(n => __rs.Game.local.anim.w[n] > .5) })")
    def still():
        pg.evaluate("__rs.Player.pos.set(__home.x, 0.05, __home.z); __rs.Player.vel.set(0,0,0); __rs.Player.yaw = 0")
        pg.wait_for_function("""() => { const an = __rs.Game.local.anim; const d = ((an.bodyYaw - __rs.Player.yaw + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
            return !an.turn && !an.trans && Math.abs(d) < .6 && Math.hypot(__rs.Game.local.animV.x, __rs.Game.local.animV.z) < .1; }""", timeout=12000)
        pg.wait_for_timeout(300)
    pg.keyboard.press('v'); pg.wait_for_timeout(1200); still(); tap('c'); tap('c'); pg.wait_for_timeout(1500)
    a = anim(); ok(a['frozen'] is None and 'prone_idle' in a['active'], 'prone idle clip %s' % a)
    still(); pg.keyboard.down('w'); pg.wait_for_timeout(900); a = anim(); sp = st()['speed']; pg.keyboard.up('w')
    ok('prone_f' in a['active'] and abs(sp - .7) < .15, 'prone forward = rifle crawl, speed %.2f %s' % (sp, a))
    still(); pg.keyboard.down('s'); pg.wait_for_timeout(900); a = anim(); pg.keyboard.up('s')
    ok('prone_b' in a['active'], 'prone backward = Moving Backward In Prone %s' % a)
    still(); pg.keyboard.press('3'); pg.wait_for_timeout(1600); pg.keyboard.down('w'); pg.wait_for_timeout(900); a = anim(); pg.keyboard.up('w')
    ok('lowcrawl_f' in a['active'], 'no gun (grenade) + prone forward = low crawl %s' % a)
    pg.keyboard.press('1'); pg.wait_for_timeout(500); still()
    pg.keyboard.down('d'); pg.wait_for_timeout(400); a = anim(); pg.keyboard.up('d'); pg.wait_for_timeout(300)
    ok(a['turn'] == 'prone_turn_r' or 'prone_turn_r' in a['active'], 'prone sideways: body turns with Prone Right Turn %s' % a)
    pg.wait_for_timeout(2500); tap('Space'); pg.wait_for_timeout(1500); still()
    pg.keyboard.down('Shift'); pg.keyboard.down('w'); pg.wait_for_function("__rs.Player.speed > 6 && __rs.Player.onGround", timeout=6000)
    pg.keyboard.press('c'); pg.wait_for_timeout(250); a = anim()
    pg.keyboard.up('w'); pg.keyboard.up('Shift')
    ok('slide' in a['active'], 'slide clip plays %s' % a)
    b.close()
print('anim warnings:', warns)
