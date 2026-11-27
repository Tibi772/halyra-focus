'use strict';
// Texts + theme for block screens (phone block screen, browser block page).
const stylegen = require('./stylegen');
const I18N = require('../shared/i18n');

/** Christmas look: 'on', 'off' or 'auto' (all of December and up to 6 January). */
/**
 * How much winter there is, 0 to 1 — not a switch. 'subtle' keeps the lights and
 * the cold grade but almost no snow, for people who want the season without the
 * confetti. Older callers that only look for true/false still work, because 0 is
 * falsy and anything above it is not.
 */
function seasonOn(setting, now = Date.now()) {
  if (setting === 'on' || setting === 'full') return 1;
  if (setting === 'subtle') return 0.35;
  if (setting === 'off') return 0;
  const d = new Date(now);
  const inSeason = d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6);
  return inSeason ? 1 : 0;
}

function blockInfo({ lang, theme, config, now = Date.now() }) {
  const t = I18N.make(lang);
  const custom = theme || null;
  const winter = seasonOn(config.settings.season || 'auto', now);
  const festive = winter > 0;
  return {
    lang,
    festive,
    winter,
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
