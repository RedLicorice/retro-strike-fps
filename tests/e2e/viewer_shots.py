import sys, json
from playwright.sync_api import sync_playwright
out = sys.argv[1]; urls = sys.argv[2:]
with sync_playwright() as p:
    b = p.firefox.launch(headless=True)
    for u in urls:
        name, q = u.split('=', 1)
        pg = b.new_page(viewport={'width': 640, 'height': 640})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto('http://127.0.0.1:5173/viewer.html?' + q)
        try: pg.wait_for_function('window.__ready === true', timeout=60000)
        except Exception as e: print(name, 'TIMEOUT', errs[:3]); pg.close(); continue
        pg.wait_for_timeout(300)
        probe = pg.evaluate('window.__probe ? window.__probe() : null')
        data = pg.evaluate('''() => { const e = window.__rs_engine; if (e) e.stopRenderLoop(); const sc = e && e.scenes[0]; if (sc) sc.render(); return document.getElementById('c').toDataURL('image/png'); }''')
        import base64; open(f'{out}/{name}.png', 'wb').write(base64.b64decode(data.split(',', 1)[1]))
        print(name, json.dumps(probe), errs[:3])
        pg.close()
    b.close()
