'use strict';
module.exports = {
  domainToASCII(d) { try { return new URL(`http://${d}`).hostname; } catch (_) { return ''; } },
  URL: typeof URL !== 'undefined' ? URL : undefined,
};
