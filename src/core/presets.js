'use strict';
// Curated starter block lists. Apps are matched by macOS bundle name
// ("Discord" -> /Discord.app/), by Windows executable name ("Discord.exe") and by
// Android package name ("com.discord").
// Bump PRESET_REV when apps are added, so existing preset lists pick them up once.
const PRESET_REV = 2;
const A = (name, android, mac = [], win = []) => ({ name, mac, win, android });

const PRESETS = [
  {
    id: 'social',
    emoji: '📱',
    name: { en: 'Social media', hu: 'Közösségi média' },
    sites: [
      'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'reddit.com',
      'snapchat.com', 'pinterest.com', 'threads.net', 'threads.com', 'tumblr.com', '9gag.com', 'bsky.app',
    ],
    apps: [
      A('Instagram', ['com.instagram.android']),
      A('Facebook', ['com.facebook.katana', 'com.facebook.lite']),
      A('TikTok', ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill', 'com.zhiliaoapp.musically.go']),
      A('X (Twitter)', ['com.twitter.android']),
      A('Reddit', ['com.reddit.frontpage']),
      A('Snapchat', ['com.snapchat.android']),
      A('Pinterest', ['com.pinterest']),
      A('Threads', ['com.instagram.barcelona']),
      A('Tumblr', ['com.tumblr']),
      A('Bluesky', ['xyz.blueskyweb.app']),
      A('9GAG', ['com.ninegag.android.app']),
    ],
  },
  {
    id: 'video',
    emoji: '🎬',
    name: { en: 'Video & streaming', hu: 'Videó és streaming' },
    sites: [
      'youtube.com', 'netflix.com', 'twitch.tv', 'kick.com', 'primevideo.com', 'disneyplus.com',
      'max.com', 'hbomax.com', 'hulu.com', 'vimeo.com', 'dailymotion.com', 'skyshowtime.com',
    ],
    apps: [
      A('YouTube', ['com.google.android.youtube', 'app.revanced.android.youtube']),
      A('Netflix', ['com.netflix.mediaclient']),
      A('Twitch', ['tv.twitch.android.app']),
      A('Prime Video', ['com.amazon.avod.thirdpartyclient']),
      A('Disney+', ['com.disney.disneyplus']),
      A('Max', ['com.wbd.stream', 'com.hbo.hbonow']),
      A('SkyShowtime', ['com.skyshowtime.skyshowtime.google']),
    ],
  },
  {
    id: 'games',
    emoji: '🎮',
    name: { en: 'Games', hu: 'Játékok' },
    sites: [
      'steampowered.com', 'steamcommunity.com', 'epicgames.com', 'roblox.com', 'chess.com', 'lichess.org',
      'poki.com', 'crazygames.com', 'miniclip.com', 'y8.com', 'coolmathgames.com', 'itch.io',
    ],
    apps: [
      { name: 'Steam', mac: ['Steam'], win: ['steam.exe'], android: ['com.valvesoftware.android.steam.community'] },
      { name: 'Epic Games Launcher', mac: ['Epic Games Launcher'], win: ['EpicGamesLauncher.exe'] },
      { name: 'Roblox', mac: ['Roblox', 'RobloxPlayer'], win: ['RobloxPlayerBeta.exe'], android: ['com.roblox.client'] },
      { name: 'Minecraft', mac: ['Minecraft'], win: ['MinecraftLauncher.exe', 'Minecraft.Windows.exe'], android: ['com.mojang.minecraftpe'] },
      { name: 'Battle.net', mac: ['Battle.net'], win: ['Battle.net.exe'] },
      { name: 'League of Legends', mac: ['League of Legends', 'LeagueClient'], win: ['LeagueClient.exe', 'League of Legends.exe'] },
      { name: 'Riot Client', mac: ['Riot Client'], win: ['RiotClientServices.exe', 'Riot Client.exe'] },
      { name: 'EA app', mac: ['EA app'], win: ['EADesktop.exe'] },
      { name: 'Ubisoft Connect', mac: ['Ubisoft Connect'], win: ['UbisoftConnect.exe', 'upc.exe'] },
      { name: 'GOG Galaxy', mac: ['GOG Galaxy'], win: ['GalaxyClient.exe'] },
      A('Chess.com', ['com.chess']),
      A('Lichess', ['org.lichess.mobileV2']),
      A('Clash of Clans', ['com.supercell.clashofclans']),
      A('Clash Royale', ['com.supercell.clashroyale']),
      A('Brawl Stars', ['com.supercell.brawlstars']),
      A('Candy Crush', ['com.king.candycrushsaga', 'com.king.candycrushsodasaga']),
      A('PUBG Mobile', ['com.tencent.ig']),
      A('Free Fire', ['com.dts.freefireth', 'com.dts.freefiremax']),
      A('Subway Surfers', ['com.kiloo.subwaysurf']),
      A('Genshin Impact', ['com.miHoYo.GenshinImpact']),
      A('Call of Duty Mobile', ['com.activision.callofduty.shooter']),
      A('Pokémon GO', ['com.nianticlabs.pokemongo']),
      A('Among Us', ['com.innersloth.spacemafia']),
    ],
  },
  {
    id: 'chat',
    emoji: '💬',
    name: { en: 'Chat & messaging', hu: 'Chat és üzenetek' },
    sites: ['discord.com', 'messenger.com', 'web.whatsapp.com', 'web.telegram.org'],
    apps: [
      { name: 'Discord', mac: ['Discord'], win: ['Discord.exe'], android: ['com.discord'] },
      { name: 'WhatsApp', mac: ['WhatsApp'], win: ['WhatsApp.exe'], android: ['com.whatsapp', 'com.whatsapp.w4b'] },
      { name: 'Telegram', mac: ['Telegram', 'Telegram Desktop'], win: ['Telegram.exe'], android: ['org.telegram.messenger', 'org.telegram.messenger.web'] },
      { name: 'Messenger', mac: ['Messenger'], win: ['Messenger.exe'], android: ['com.facebook.orca', 'com.facebook.mlite'] },
      { name: 'Signal', mac: ['Signal'], win: ['Signal.exe'], android: ['org.thoughtcrime.securesms'] },
      A('Viber', ['com.viber.voip']),
    ],
  },
  {
    id: 'news',
    emoji: '📰',
    name: { en: 'News', hu: 'Hírek' },
    sites: [
      'index.hu', 'telex.hu', '24.hu', '444.hu', 'hvg.hu', 'origo.hu', 'blikk.hu', 'portfolio.hu',
      'cnn.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'theguardian.com', 'foxnews.com',
      'news.ycombinator.com', 'news.google.com',
    ],
    apps: [
      A('Google News', ['com.google.android.apps.magazines']),
      A('Index', ['hu.index.android']),
      A('Telex', ['hu.telex.app']),
    ],
  },
  {
    id: 'shopping',
    emoji: '🛍️',
    name: { en: 'Shopping', hu: 'Vásárlás' },
    sites: [
      'amazon.com', 'amazon.de', 'ebay.com', 'aliexpress.com', 'temu.com', 'shein.com', 'etsy.com',
      'wish.com', 'emag.hu', 'jofogas.hu', 'vatera.hu', 'arukereso.hu',
    ],
    apps: [
      A('Amazon', ['com.amazon.mShop.android.shopping']),
      A('Temu', ['com.einnovation.temu']),
      A('SHEIN', ['com.zzkko']),
      A('AliExpress', ['com.alibaba.aliexpresshd']),
      A('eBay', ['com.ebay.mobile']),
      A('Vinted', ['fr.vinted']),
      A('Wish', ['com.contextlogic.wish']),
    ],
  },
  {
    id: 'music',
    emoji: '🎧',
    name: { en: 'Music & podcasts', hu: 'Zene és podcast' },
    sites: ['spotify.com', 'soundcloud.com', 'deezer.com', 'tidal.com'],
    apps: [
      { name: 'Spotify', mac: ['Spotify'], win: ['Spotify.exe'], android: ['com.spotify.music'] },
      A('SoundCloud', ['com.soundcloud.android']),
      A('YouTube Music', ['com.google.android.apps.youtube.music']),
      A('Deezer', ['deezer.android.app']),
    ],
  },
  {
    // Keeps the useful parts (search, subscriptions, messages) and blocks the endless feeds.
    id: 'feeds',
    emoji: '🌀',
    name: { en: 'Endless feeds only', hu: 'Csak a végtelen hírfolyamok' },
    sites: [],
    paths: [
      'youtube.com/shorts', 'youtube.com/feed/trending', 'youtube.com/feed/explore', 'm.youtube.com/shorts',
      'instagram.com/reels', 'instagram.com/reel', 'instagram.com/explore', 'facebook.com/reel', 'facebook.com/reels', 'facebook.com/watch',
      'x.com/explore', 'x.com/i/trends', 'twitter.com/explore', 'reddit.com/r/all', 'reddit.com/r/popular', 'tiktok.com/foryou', 'tiktok.com/explore',
      'linkedin.com/feed', 'threads.net/for_you',
    ],
    apps: [],
  },
  {
    // Always on: adult sites, pages with adult words in their address or title,
    // and SafeSearch forced on Google, Bing and YouTube. Turning it off needs the PIN, if one is set.
    id: 'adult',
    emoji: '🛡️',
    name: { en: 'Adult content shield', hu: 'Felnőtt tartalom pajzs' },
    always: true,
    safe: true,
    sites: [
      'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'tube8.com', 'spankbang.com',
      'eporner.com', 'beeg.com', 'tnaflix.com', 'porn.com', 'youjizz.com', 'motherless.com', 'chaturbate.com', 'stripchat.com',
      'bongacams.com', 'livejasmin.com', 'cam4.com', 'camsoda.com', 'myfreecams.com', 'onlyfans.com', 'fansly.com', 'manyvids.com',
      'clips4sale.com', 'brazzers.com', 'realitykings.com', 'bangbros.com', 'naughtyamerica.com', 'mofos.com', 'vixen.com', 'tushy.com',
      'blacked.com', 'nhentai.net', 'rule34.xxx', 'e621.net', 'hanime.tv', 'efukt.com', 'porntrex.com', 'txxx.com', 'hclips.com',
      'upornia.com', 'hotmovs.com', 'thumbzilla.com', '4tube.com', 'porntube.com', 'fuq.com', 'nudevista.com', 'imagefap.com',
      'sex.com', 'literotica.com', 'erome.com', 'xhamsterlive.com', 'pornpics.com', 'hqporner.com', 'daftsex.com', 'xxxbunker.com',
      'sunporno.com', 'drtuber.com', 'xvideos.red', 'xnxx.tv', 'pornhubpremium.com', 'faphouse.com', 'adultfriendfinder.com',
    ],
    keywords: ['porn', 'porno', 'xxx', 'nsfw', 'hentai', 'onlyfans', 'nudes', 'naked', 'camgirl', 'sex cam', 'rule34', 'milf', 'pornó', 'meztelen'],
    apps: [],
  },
  {
    id: 'gambling',
    emoji: '🎰',
    name: { en: 'Gambling & betting', hu: 'Szerencsejáték és fogadás' },
    sites: [
      'bet365.com', 'betfair.com', 'williamhill.com', 'pokerstars.com', '888.com', '888casino.com', '888poker.com', 'unibet.com', 'bwin.com',
      'betway.com', 'betano.com', 'betsson.com', 'stake.com', 'roobet.com', 'rollbit.com', 'draftkings.com', 'fanduel.com', 'betmgm.com',
      'ladbrokes.com', 'paddypower.com', 'skybet.com', 'coral.co.uk', 'pinnacle.com', '1xbet.com', '22bet.com', 'mostbet.com', 'bovada.lv',
      'tippmix.hu', 'szerencsejatek.hu', 'vegas.hu', 'pokerstars.eu', 'ggpoker.com', 'partypoker.com', 'leovegas.com', 'mrgreen.com', 'casumo.com',
    ],
    keywords: ['casino', 'sportsbook', 'slot machine', 'kaszinó', 'sportfogadás'],
    apps: [
      A('bet365', ['com.bet365.android', 'com.bet365Wrapper.Bet365_Application']),
      A('PokerStars', ['com.pyrsoftware.pokerstars.net', 'com.pokerstars.android'], ['PokerStars'], ['PokerStars.exe']),
      A('GGPoker', ['com.nsus.ggpoker'], ['GGPoker'], ['GGnet.exe']),
      A('Tippmix', ['hu.szerencsejatek.tippmix']),
    ],
  },
];

// Extra hostnames that belong to a site but are not simple www./m. variants.
const EXTRA_HOSTS = {
  'youtube.com': ['youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtubei.googleapis.com', 'music.youtube.com'],
  'facebook.com': ['web.facebook.com', 'fb.com', 'www.fb.com', 'fb.watch'],
  'instagram.com': ['i.instagram.com', 'l.instagram.com'],
  'twitter.com': ['mobile.twitter.com', 'api.twitter.com'],
  'x.com': ['mobile.x.com', 'api.x.com'],
  'reddit.com': ['old.reddit.com', 'new.reddit.com', 'np.reddit.com', 'redd.it', 'www.redd.it'],
  'tiktok.com': ['vm.tiktok.com', 'vt.tiktok.com'],
  'twitch.tv': ['m.twitch.tv', 'clips.twitch.tv'],
  'discord.com': ['discordapp.com', 'www.discordapp.com', 'ptb.discord.com', 'canary.discord.com', 'discord.gg'],
  'netflix.com': ['help.netflix.com'],
  'pinterest.com': ['pin.it'],
  'spotify.com': ['open.spotify.com'],
  'steampowered.com': ['store.steampowered.com'],
  'epicgames.com': ['store.epicgames.com'],
  'roblox.com': ['web.roblox.com'],
  'amazon.com': ['smile.amazon.com'],
};

module.exports = { PRESETS, EXTRA_HOSTS, PRESET_REV };
