// Vercel Routing Middleware: gate the whole demo behind one shared access code.
// Set ACCESS_CODE in the Vercel project's Environment Variables, then redeploy.
import { next } from '@vercel/functions';

export const config = { matcher: '/:path*' };

const COOKIE = 'plumbline_access';

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('plumbline:' + value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function page(message = '', isError = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Plumbline for Trifecta</title>
<style>
:root{--bg:#F2F3F0;--card:#fff;--fg:#1A1D1C;--muted:#59605C;--line:#D9DCD6;--navy:#13294B;--accent:#1D5FA8;--warn:#A8430E;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0F1312;--card:#181D1B;--fg:#E7EAE6;--muted:#A2AAA5;--line:#2D3431;--navy:#0B1A31;--accent:#7AAAE6;--warn:#F0935A;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.card{width:min(420px,100%);background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.head{background:var(--navy);color:#fff;padding:20px 24px}.head b{display:block;font-size:20px}.head span{color:#C3CEE0;font-size:14px}
form{padding:24px;display:flex;flex-direction:column;gap:12px}label{font-size:14px;color:var(--muted)}
input{min-height:48px;border:1px solid var(--line);border-radius:10px;padding:0 14px;font:inherit;background:var(--card);color:var(--fg)}
input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button{min-height:48px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.msg{margin:0;font-size:14px;color:${isError ? 'var(--warn)' : 'var(--muted)'}}
</style></head><body><main class="card"><div class="head"><b>Plumbline</b><span>Prepared for Trifecta Builders</span></div>
<form method="post" action="/unlock"><label for="code">Access code</label><input id="code" name="code" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Open the demo</button>${message ? `<p class="msg" role="${isError ? 'alert' : 'status'}">${message}</p>` : ''}</form></main></body></html>`;
}

const html = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export default async function middleware(request) {
  const code = process.env.ACCESS_CODE;
  if (!code) return html(page('This demo is not set up yet. Add ACCESS_CODE in the Vercel project settings, then redeploy.', true), 503);

  const want = await digest(code.trim().toLowerCase());
  const url = new URL(request.url);

  if (url.pathname === '/unlock' && request.method === 'POST') {
    const form = await request.formData();
    const given = String(form.get('code') || '').trim().toLowerCase();
    if (given && (await digest(given)) === want) {
      return new Response(null, {
        status: 303,
        headers: { Location: '/', 'Set-Cookie': `${COOKIE}=${want}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` }
      });
    }
    return html(page('That code did not match. Check it and try again.', true), 401);
  }

  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)plumbline_access=([a-f0-9]{64})/);
  if (match && match[1] === want) return next();
  return html(page(), 401);
}
