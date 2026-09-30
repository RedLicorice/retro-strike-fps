import sys
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]; errs = []; ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m)
with sync_playwright() as p:
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)
    pg.click('#btnDeploy'); pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=30000); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const M = __rs.MAP; for (let k = 0; k < 400; k++){ const p = M.randomOpen();
        if (!M.boxes.some(b => b.x0 - 4 < p.x && b.x1 + 4 > p.x && b.z0 - 4 < p.z && b.z1 + 4 > p.z && b.y1 > .05)){ __rs.Player.pos.set(p.x, 0.05, p.z); window.__home = p; break; } }
        __rs.Game.local.spawnProt = 1e9; __rs.Input.enabled = true;
        for (const a of __rs.Game.actors) if (a.isBot){ a.alive = false; a.respawnT = 1e9; a.pos.set(0, -50, 0); } }""")
    pg.keyboard.press('v'); pg.wait_for_timeout(1200)
    st = lambda: pg.evaluate("({ clip: __rs.Game.local.anim.reloadClip, maskOff: __rs.Game.local.anim.lowerOnly.disabled, legs: [...__rs.Game.local.anim.active].filter(n => __rs.Game.local.anim.w[n] > .3), wepReload: +__rs.Wep.reloadT.toFixed(2) })")
    pg.evaluate("__rs.Wep.ammo[__rs.Wep.def.id].mag = 3"); pg.keyboard.press('r'); pg.wait_for_timeout(900)
    r = st(); pg.screenshot(path=OUT + '/rl_stand.png')
    ok(r['clip'] == 'reload' and r['maskOff'] is False, 'standing reload plays upper-body reload clip: %s' % r)
    pg.wait_for_function("__rs.Wep.reloadT <= 0", timeout=8000); pg.wait_for_timeout(400)
    r = st(); ok(r['clip'] is None and r['maskOff'] is True, 'reload clip ends with the reload: %s' % r)
    pg.evaluate("__rs.Wep.ammo[__rs.Wep.def.id].mag = 3"); pg.keyboard.press('r'); pg.keyboard.down('w'); pg.wait_for_timeout(900)
    r = st(); pg.screenshot(path=OUT + '/rl_walk.png'); pg.keyboard.up('w')
    ok(r['clip'] == 'reload' and any(n.startswith(('run_', 'walk_')) for n in r['legs']), 'reload while moving: legs keep locomotion %s' % r)
    pg.wait_for_function("__rs.Wep.reloadT <= 0", timeout=8000); pg.wait_for_timeout(300)
    pg.keyboard.press('c'); pg.wait_for_timeout(300); pg.keyboard.press('c'); pg.wait_for_timeout(700)
    pg.evaluate("__rs.Wep.ammo[__rs.Wep.def.id].mag = 3"); pg.keyboard.press('r'); pg.wait_for_timeout(900)
    r = st(); pg.screenshot(path=OUT + '/rl_prone.png')
    ok(r['clip'] == 'prone_reload', 'prone reload uses Prone Reloading: %s' % r)
    b.close()
print('errors', errs[:5])
