// Single place for the product's identity. Change the name here (and in
// package.json "productName"/"build.appId") to rebrand the whole app.
'use strict';

const BRAND = {
  name: 'Halyra Focus',
  short: 'HalyraFocus',
  appId: 'com.halyra.focus',
  helperLabel: 'com.halyra.focus.helper',
  website: 'https://tibi772.github.io/halyra-focus/', // change when a custom domain is set (website-src/site.config.json)
  hostsMarkerBegin: '# >>> HalyraFocus BEGIN (managed, do not edit)',
  hostsMarkerEnd: '# <<< HalyraFocus END',
};

if (typeof module !== 'undefined' && module.exports) module.exports = BRAND;
else if (typeof window !== 'undefined') window.BRAND = BRAND;
