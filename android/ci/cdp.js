'use strict';
// Talks to the app's WebView over the Chrome DevTools protocol (debug build only):
//   node cdp.js eval "<js expression>"   → prints the JSON result
//   node cdp.js shot <file.png>          → screenshot of the page
const [, , cmd, arg] = process.argv;
const PORT = process.env.CDP_PORT || 9222;

(async () => {
  let targets = [];
  for (let i = 0; i < 20 && !targets.length; i += 1) {
    try { targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t) => t.type === 'page' && /index\.html/.test(t.url)); } catch (_) { /* not up yet */ }
    if (!targets.length) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!targets.length) { console.log(JSON.stringify({ error: 'no WebView page found' })); process.exit(2); }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  if (cmd === 'eval') {
    const r = await send('Runtime.evaluate', { expression: `(async () => (${arg}))()`, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) console.log(JSON.stringify({ error: r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description }));
    else console.log(JSON.stringify(r.result && r.result.result ? r.result.result.value : null));
  } else if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(arg, Buffer.from(r.result.data, 'base64'));
    console.log('"saved"');
  }
  ws.close();
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ error: String(e) })); process.exit(2); });
