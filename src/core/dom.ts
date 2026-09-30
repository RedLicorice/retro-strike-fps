/* DOM lookups are loosely typed on purpose: the HUD/menu markup is static and owned by index.html. */
export const $ = (id: string): any => document.getElementById(id);

export const $$ = (s: string, r?: ParentNode): any[] => Array.from((r || document).querySelectorAll(s));

export function vis(id, on){
  const el = typeof id === 'string' ? $(id) : id; if (!el) return;
  if (on){ el.classList.remove('hidden'); el.style.display = ''; el.style.pointerEvents = ''; }
  else { el.classList.add('hidden'); el.style.display = 'none'; el.style.pointerEvents = 'none'; }
}

export const now   = () => performance.now();

export const fmtT  = (s) => { s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };

export const fmtN  = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : ('' + n);
