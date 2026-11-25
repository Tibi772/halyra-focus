'use strict';
const ov = document.getElementById('ov');
let hideTimer = null;
window.api.onOverlay(({ title, sub, theme }) => {
  document.body.dataset.theme = theme || 'midnight';
  document.getElementById('ov-t').textContent = title;
  document.getElementById('ov-s').textContent = sub;
  ov.classList.remove('show');
  void ov.offsetWidth;
  ov.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => ov.classList.remove('show'), 3100);
});
