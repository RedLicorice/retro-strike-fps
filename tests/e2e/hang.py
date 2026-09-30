"""Ledge grabs: mantle a chest-high wall, reach-and-hang, running jump catch, shimmy, climb over, drop to standing."""
import sys
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]
ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)
errors, warns = [], []
with sync_playwright() as p:
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: warns.append(m.text) if '[anim]' in m.text else None)
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)
    pg.click('#btnDeploy'); pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=30000)
    pg.wait_for_timeout(3300)
    pg.evaluate("__rs.Input.enabled = true; for (const a of __rs.Game.actors) if (a.isBot){ a.pos.set(0, -50, 0); a.alive = false; a.respawnT = 1e9; } __rs.Game.local.spawnProt = 1e9;")
    # a clear 16 x 10 m spot; three test walls along +Z, each 4 m wide, visible
    pg.evaluate("""() => { const M = __rs.MAP, B = __rs.BABYLON, sc = __rs.ctx.scene;
      /* test yard in the middle of the arena: clear its colliders (the props stay drawn; only this test runs here) */
      const o = window.__o = { x: 0, z: -4 };
      for (let i = M.boxes.length - 1; i >= 0; i--){ const b = M.boxes[i]; if (b.x1 > o.x - 10 && b.x0 < o.x + 10 && b.z1 > o.z - 7 && b.z0 < o.z + 9) M.boxes.splice(i, 1); }
      M.slopes = M.slopes.filter(s => !(s.x1 > o.x - 10 && s.x0 < o.x + 10 && s.z1 > o.z - 7 && s.z0 < o.z + 9));
      window.__walls = {};
      for (const [name, dx, h] of [['low', -6, 1.6], ['reach', 0, 2.2], ['tall', 6, 2.6]]){
        const w = { x0: o.x + dx - 2, x1: o.x + dx + 2, y0: 0, y1: h, z0: o.z + 3, z1: o.z + 5, mat: 'test' };
        M.boxes.push(w); window.__walls[name] = w;
        const m = B.MeshBuilder.CreateBox('tw', { width: 4, height: h, depth: 2 }, sc); m.position.set(o.x + dx, h / 2, o.z + 4);
        const mt = new B.StandardMaterial('twm', sc); mt.diffuseColor = new B.Color3(.5, .5, .55); m.material = mt;
      } return o; }""")
    def park(name, dist=0.9):
        pg.evaluate("""([n, d]) => { const w = __walls[n], P = __rs.Player; P.hang = null; P.stance = 0; P.stanceWant = 0;
            P.pos.set((w.x0 + w.x1) / 2, 0.05, w.z0 - d); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0; }""", [name, dist])
        pg.wait_for_timeout(400)
    H = lambda: pg.evaluate("(() => { const P = __rs.Player, H = P.hang; return { ph: H && H.ph, clip: H && H.clip, y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), x: +P.pos.x.toFixed(2), stance: P.stance, ground: P.onGround, eye: H && P.eyeAt ? +P.eyeAt.y.toFixed(2) : null, wep: __rs.Wep.vm && __rs.Wep.vm.isEnabled() }; })()")

    # ---- mantle: Space at a 1.6 m wall climbs straight over ----
    park('low'); pg.keyboard.press('Space'); pg.wait_for_timeout(150); s0 = H()
    ok(s0['ph'] == 'mantle' and s0['clip'] == 'hang_climb' and not s0['wep'], 'Space at a 1.6 m wall: mantle (Braced Hang To Crouch), weapon away: %s' % s0)
    pg.wait_for_timeout(1500); s1 = H()
    ok(s1['ph'] is None and abs(s1['y'] - 1.62) < .08 and s1['z'] > 3.0 + pg.evaluate("__o.z") and s1['ground'], 'mantle ends on top of the wall: %s' % s1)
    pg.wait_for_timeout(500); ok(H()['stance'] == 0, 'stands up on top after the crouched landing')

    # ---- reach: Space at a 2.2 m wall reaches up and hangs ----
    park('reach', .8); pg.keyboard.press('Space'); pg.wait_for_timeout(150); r0 = H()
    ok(r0['ph'] == 'reach' and r0['clip'] == 'hang_reach', 'Space at a 2.2 m wall: Idle To Braced Hang: %s' % r0)
    pg.wait_for_timeout(1500); r1 = H()
    ok(r1['ph'] == 'hang' and r1['clip'] == 'hang_idle' and r1['eye'] is not None and r1['eye'] < 2.2 + .2, 'then hangs (Braced Hanging Idle), eye just under the ledge: %s' % r1)
    # shimmy right along the face
    x0 = r1['x']; pg.keyboard.down('d'); pg.wait_for_timeout(250); sh = H(); pg.wait_for_timeout(900); x1 = H()['x']; pg.keyboard.up('d'); pg.wait_for_timeout(200)
    ok(sh['clip'] == 'hang_shimmy_r' and x1 - x0 > .35, 'D shimmies right along the ledge (Braced Hang Shimmy Right): moved %.2f m, %s' % (x1 - x0, sh))
    ok(H()['clip'] == 'hang_idle', 'releasing D settles back into the hang idle')
    # climb over with W
    pg.keyboard.down('w'); pg.wait_for_timeout(200); c0 = H(); pg.keyboard.up('w'); pg.wait_for_timeout(1300); c1 = H()
    ok(c0['ph'] == 'climb' and c1['ph'] is None and abs(c1['y'] - 2.22) < .08, 'W from the hang climbs over onto the top: %s -> %s' % (c0, c1))

    # ---- running jump at a 2.6 m wall: catch, hang; S drops back to standing ----
    park('tall', 3.2)
    pg.keyboard.down('w'); pg.keyboard.down('Shift'); pg.wait_for_timeout(380); pg.keyboard.press('Space')
    pg.keyboard.up('Shift')
    pg.wait_for_function("__rs.Player.hang || __rs.Player.onGround && __rs.Player.pos.z > __walls.tall.z0 - .6", timeout=4000)
    pg.keyboard.up('w')
    k0 = H()
    ok(k0['ph'] == 'catch' and k0['clip'] == 'hang_catch', 'running jump into a 2.6 m wall: catches the ledge (Jumping To Hanging): %s' % k0)
    pg.screenshot(path=OUT + '/hang_catch.png')
    pg.wait_for_timeout(1400); k1 = H()
    ok(k1['ph'] == 'hang', 'settles into the hang: %s' % k1)
    pg.keyboard.press('v'); pg.wait_for_timeout(900); pg.screenshot(path=OUT + '/hang_3p.png')
    act = pg.evaluate("[...__rs.Game.local.anim.active].filter(n => __rs.Game.local.anim.w[n] > .5)")
    ok('hang_idle' in act, 'third person body plays the hang idle: %s' % act)
    pg.keyboard.press('s'); pg.wait_for_timeout(150); d0 = H()
    ok(d0['ph'] == 'drop' and d0['clip'] == 'hang_drop_stand', 'S with the ground a body length below: Braced Hang Drop To Standing: %s' % d0)
    pg.wait_for_timeout(1700); d1 = H()
    ok(d1['ph'] is None and d1['y'] < .2 and d1['ground'], 'lands standing at the foot of the wall: %s' % d1)
    pg.keyboard.press('v')

    # ---- a normal jump still works where there's no ledge ----
    park('low', 4); pg.keyboard.press('Space'); pg.wait_for_timeout(120); j = pg.evaluate("({ h: !!__rs.Player.hang, vy: __rs.Player.vel.y })")
    ok(not j['h'] and j['vy'] > 2, 'Space away from walls is still a jump: %s' % j)
    b.close()
print('anim warnings:', warns[:6])
print('errors:', errors[:6])
