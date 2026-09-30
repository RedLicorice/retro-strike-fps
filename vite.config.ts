import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/* Dev-only: the browser POSTs console output, state samples and anomalies to /__telemetry;
   they are appended to .telemetry/log.jsonl so they can be read from a terminal. */
function telemetry(): Plugin {
  return {
    name: 'retrostrike-telemetry',
    apply: 'serve',
    configureServer(server){
      const dir = path.resolve('.telemetry');
      const file = path.join(dir, 'log.jsonl');
      fs.mkdirSync(dir, { recursive: true });
      server.middlewares.use('/__telemetry', (req, res) => {
        if (req.method !== 'POST'){ res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
        req.on('end', () => {
          try {
            const batch = JSON.parse(body);
            const t = new Date().toISOString();
            const lines = (Array.isArray(batch) ? batch : [batch]).map(e => JSON.stringify({ at: t, ...e })).join('\n') + '\n';
            if (fs.existsSync(file) && fs.statSync(file).size > 8e6) fs.renameSync(file, file + '.1');
            fs.appendFileSync(file, lines);
            res.statusCode = 204;
          } catch { res.statusCode = 400; }
          res.end();
        });
      });
    }
  };
}

/* Pure static output: the game is serverless (WebRTC P2P, host-authoritative),
   so `dist/` can be dropped on any static host / CDN. */
export default defineConfig({
  base: './',
  plugins: [telemetry()],
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
    rollupOptions: { output: { manualChunks: { babylon: ['babylonjs', 'babylonjs-loaders'] } } }
  }
});
