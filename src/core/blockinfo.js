'use strict';
// Texts + theme for block screens (phone block screen, browser block page).
const stylegen = require('./stylegen');
const I18N = require('../shared/i18n');

/** Christmas look: 'on', 'off' or 'auto' (all of December and up to 6 January). */
function seasonOn(setting, now = Date.now()) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  const d = new Date(now);
  return d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6);
}

function blockInfo({ lang, theme, config, now = Date.now() }) {
  const t = I18N.make(lang);
  const custom = theme || null;
  const festive = seasonOn(config.settings.season || 'auto', now);
  return {
    lang,
    festive,
    theme: custom ? 'custom' : config.settings.theme,
    vars: custom ? stylegen.cssVars(custom) : null,
    font: custom ? custom.font : null,
    effect: custom ? custom.effect : null,
    quotes: t(festive ? 'quotes.xmas' : 'quotes'),
    texts: {
      title: t('mob.blockTitle'), until: t('mob.until'), untilMidnight: t('mob.untilMidnight'), home: t('mob.home'), open: t('mob.open'),
      site: t('mob.siteBlocked'), strict: t('mode.strict'), patient: t('mode.patient'), flexible: t('mode.flexible'), limit: t('mob.limitReached'),
      running: t('focus.on'), shield: t('stand.shield'), watching: t('mob.watching'), ended: t('mob.ended'),
      back: t('web.back'), earnSpend: t('earn.spendN'), earnNone: t('earn.none'), earnHave: t('earn.have'), unblocked: t('web.unblocked'), continue: t('web.continue'),
    },
  };
}

module.exports = { blockInfo, seasonOn };
