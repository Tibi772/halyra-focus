'use strict';
const ov = document.getElementById('ov');
let hideTimer = null;
const VAR_KEYS = [];
window.api.onOverlay(({ title, sub, theme, vars, font }) => {
  document.body.dataset.theme = theme || 'midnight';
  for (const k of VAR_KEYS.splice(0)) document.body.style.removeProperty(k);
  if (vars) for (const [k, v] of Object.entries(vars)) { document.body.style.setProperty(k, v); VAR_KEYS.push(k); }
  if (font) document.body.dataset.font = font; else delete document.body.dataset.font;
  document.getElementById('ov-t').textContent = title;
  document.getElementById('ov-s').textContent = sub;
  ov.classList.remove('show');
  void ov.offsetWidth;
  ov.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => ov.classList.remove('show'), 3100);
});
