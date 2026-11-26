'use strict';
// Texts + theme for block screens (phone block screen, browser block page).
const stylegen = require('./stylegen');
const I18N = require('../shared/i18n');

function blockInfo({ lang, theme, config }) {
  const t = I18N.make(lang);
  const custom = theme || null;
  return {
    lang,
    theme: custom ? 'custom' : config.settings.theme,
    vars: custom ? stylegen.cssVars(custom) : null,
    font: custom ? custom.font : null,
    effect: custom ? custom.effect : null,
    quotes: t('quotes'),
    texts: {
      title: t('mob.blockTitle'), until: t('mob.until'), untilMidnight: t('mob.untilMidnight'), home: t('mob.home'), open: t('mob.open'),
      site: t('mob.siteBlocked'), strict: t('mode.strict'), patient: t('mode.patient'), flexible: t('mode.flexible'), limit: t('mob.limitReached'),
      running: t('focus.on'), shield: t('stand.shield'), watching: t('mob.watching'), ended: t('mob.ended'),
      back: t('web.back'), earnSpend: t('earn.spendN'), earnNone: t('earn.none'), earnHave: t('earn.have'), unblocked: t('web.unblocked'), continue: t('web.continue'),
    },
  };
}

module.exports = { blockInfo };
