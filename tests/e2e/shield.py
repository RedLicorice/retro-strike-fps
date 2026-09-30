import sys, json
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]; ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m); errs = []
with sync_playwright() as p:
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)
    pg.click('#btnDeploy'); pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=30000); pg.wait_for_timeout(1500)
    r = pg.evaluate("({ me: __rs.Game.local.shield, bots: __rs.Game.actors.filter(a => a.isBot).map(a => a.shield) })")
    ok(r['me'] == 150 and all(x == 150 for x in r['bots']), 'everyone spawns with 3 full plates (150): %s' % r)
    # damage: 70 -> plates 150->80 (1 plate broken, second at 30/50), hp untouched; then 100 -> plates 0, hp 80... wait 80-100 = hp -20
    r = pg.evaluate("""() => { const G = __rs.Game, me = G.local, bot = G.actors.find(a => a.isBot);
        me.spawnProt = 0; const C = __rs.Combat;
        C.applyDamage(me, 70, bot, false, 'ak47', 0, 0, 1, null); const a = { shield: me.shield, hp: me.hp };
        C.applyDamage(me, 100, bot, false, 'ak47', 0, 0, 1, null); const b = { shield: me.shield, hp: me.hp };
        return { a, b }; }""")
    ok(r['a'] == {'shield': 80, 'hp': 100} and r['b'] == {'shield': 0, 'hp': 80}, 'plates soak damage before health: %s' % r)
    pg.wait_for_timeout(200)
    plates = pg.evaluate("[...document.querySelectorAll('#plates i b')].map(b => b.style.width)")
    ok(plates == ['0%', '0%', '0%'], 'HUD plates empty: %s' % plates)
    # idle regen: stand still, no combat -> after 4s idle, 1 plate per 1.5s
    pg.evaluate("__rs.Game.local.spawnProt = 1e9; __rs.Player.combatT = 99; for (const a of __rs.Game.actors) if (a.isBot){ a.alive = false; a.respawnT = 1e9; a.pos.set(0, -50, 0); }")
    pg.wait_for_function("__rs.Game.local.idleT > 4", timeout=20000)
    pg.wait_for_function("__rs.Game.local.shield >= 50", timeout=10000)
    t1 = pg.evaluate("__rs.Game.local.shield")
    pg.wait_for_function("__rs.Game.local.shield >= 150", timeout=15000)
    plates = pg.evaluate("[...document.querySelectorAll('#plates i b')].map(b => b.style.width)")
    ok(plates == ['100%', '100%', '100%'], 'idle regen refills all 3 plates, HUD full: %s' % plates)
    # moving blocks regen
    pg.evaluate("__rs.Game.local.shield = 40; __rs.Game.local.idleT = 0")
    pg.evaluate("__rs.Input.keys.KeyW = 1"); pg.wait_for_timeout(5000)
    moving = pg.evaluate("({ s: __rs.Game.local.shield, idle: __rs.Game.local.idleT })"); pg.evaluate("__rs.Input.keys.KeyW = 0")
    ok(moving['s'] == 40, 'no regen while moving: %s' % moving)
    # outlines: FFA -> everyone red
    pg.evaluate("for (const a of __rs.Game.actors) if (a.isBot){ a.alive = true; a.respawnT = 0; }")
    pg.wait_for_timeout(600)
    r = pg.evaluate("""() => __rs.Game.actors.filter(a => a.isBot && a.alive).map(a => a.outlineKind)""")
    ok(len(r) > 0 and all(k == 'enemy' for k in r), 'FFA: all bots are enemies (red): %s' % r)
    b.close()
    # TDM: allies blue
    b = p.firefox.launch(headless=True); pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_function("window.__rs && __rs.Models.ready && !document.getElementById('menu').classList.contains('hidden')", timeout=120000)
    pg.evaluate("__rs.ctx && 0"); pg.click('#modeList .mode[data-m="tdm"]'); pg.click('#btnDeploy'); pg.wait_for_function("__rs.Game.state === 'play' && __rs.Player.alive", timeout=30000); pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => { const me = __rs.Game.local; return __rs.Game.actors.filter(a => a.isBot && a.alive).map(a => [a.team === me.team ? 'ally' : 'enemy', a.outlineKind]); }""")
    ok(len(r) > 0 and all(k == c for k, c in r), 'TDM: teammates ally (blue), others enemy (red): %s' % r)
    # screenshot: put an ally and an enemy in front of the camera
    pg.evaluate("""() => { const G = __rs.Game, P = __rs.Player, me = G.local; me.spawnProt = 1e9;
        const al = G.actors.find(a => a.isBot && a.team === me.team), en = G.actors.find(a => a.isBot && a.team !== me.team);
        P.yaw = 0; P.pitch = .05;
        for (const [a, dx] of [[al, -1.1], [en, 1.1]]){ a.ai.state = 'hold'; a.pos.set(P.pos.x + dx, P.pos.y, P.pos.z + 3.2); a.vel.set(0,0,0); a.yaw = Math.PI; a.spawnProt = 1e9; }
        for (const a of G.actors) if (a.isBot && a !== al && a !== en){ a.alive = false; a.respawnT = 1e9; a.pos.set(0,-50,0); }
        window.__freeze = setInterval(() => { for (const [a, dx] of [[al, -1.1], [en, 1.1]]){ a.pos.set(P.pos.x + dx, P.pos.y, P.pos.z + 3.2); a.yaw = Math.PI; } }, 16); }""")
    pg.wait_for_timeout(1500)
    info = pg.evaluate("({ q: __rs.ctx.QUALITY, scale: __rs.ctx.engine.getHardwareScalingLevel(), rh: __rs.ctx.engine.getRenderHeight(), ch: __rs.ctx.canvas.clientHeight })")
    print('render', info)
    pg.screenshot(path=OUT + '/outlines.png')
    b.close()
print('errors', errs[:5])
