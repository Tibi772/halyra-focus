'use strict';
// Local page that blocked browser tabs are sent to (computers only). Listens on
// 127.0.0.1 only and serves the block page plus a tiny state endpoint.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const FILES = new Set(['block.html', 'block.css', 'block.js', 'styles.css']);

function start({ root, data, ports = [47321, 47322, 47323, 47324, 47325] }) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const u = new URL(req.url, 'http://127.0.0.1');
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(body); };
    if (u.pathname === '/state.json') {
      let d = {};
      try { d = data(Object.fromEntries(u.searchParams)) || {}; } catch (_) { d = {}; }
      send(200, 'application/json', JSON.stringify(d));
      return;
    }
    let rel = u.pathname === '/blocked' || u.pathname === '/' ? 'block.html' : u.pathname.replace(/^\/+/, '');
    if (!FILES.has(rel) && !/^fonts\/[\w.-]+\.(woff2?|ttf)$/.test(rel)) { send(404, 'text/plain', 'not found'); return; }
    fs.readFile(path.join(root, rel), (err, buf) => {
      if (err) send(404, 'text/plain', 'not found');
      else send(200, TYPES[path.extname(rel)] || 'application/octet-stream', buf);
    });
  });
  server.unref(); // never keeps the process alive on its own
  const state = { url: null, port: null, close: () => server.close() };
  const tryPort = (i) => {
    if (i >= ports.length) return;
    server.once('error', () => tryPort(i + 1));
    server.listen(ports[i], '127.0.0.1', () => { state.port = ports[i]; state.url = `http://127.0.0.1:${ports[i]}/blocked`; });
  };
  tryPort(0);
  return state;
}

module.exports = { start };
