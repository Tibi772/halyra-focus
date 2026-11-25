'use strict';
// Curated starter block lists. Apps are matched by macOS bundle name
// ("Discord" -> /Discord.app/) and by Windows executable name ("Discord.exe").

const PRESETS = [
  {
    id: 'social',
    emoji: '📱',
    name: { en: 'Social media', hu: 'Közösségi média' },
    sites: [
      'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'reddit.com',
      'snapchat.com', 'pinterest.com', 'threads.net', 'threads.com', 'tumblr.com', '9gag.com', 'bsky.app',
    ],
    apps: [],
  },
  {
    id: 'video',
    emoji: '🎬',
    name: { en: 'Video & streaming', hu: 'Videó és streaming' },
    sites: [
      'youtube.com', 'netflix.com', 'twitch.tv', 'kick.com', 'primevideo.com', 'disneyplus.com',
      'max.com', 'hbomax.com', 'hulu.com', 'vimeo.com', 'dailymotion.com', 'skyshowtime.com',
    ],
    apps: [],
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
      { name: 'Steam', mac: ['Steam'], win: ['steam.exe'] },
      { name: 'Epic Games Launcher', mac: ['Epic Games Launcher'], win: ['EpicGamesLauncher.exe'] },
      { name: 'Roblox', mac: ['Roblox', 'RobloxPlayer'], win: ['RobloxPlayerBeta.exe'] },
      { name: 'Minecraft', mac: ['Minecraft'], win: ['MinecraftLauncher.exe', 'Minecraft.Windows.exe'] },
      { name: 'Battle.net', mac: ['Battle.net'], win: ['Battle.net.exe'] },
      { name: 'League of Legends', mac: ['League of Legends', 'LeagueClient'], win: ['LeagueClient.exe', 'League of Legends.exe'] },
      { name: 'Riot Client', mac: ['Riot Client'], win: ['RiotClientServices.exe', 'Riot Client.exe'] },
      { name: 'EA app', mac: ['EA app'], win: ['EADesktop.exe'] },
      { name: 'Ubisoft Connect', mac: ['Ubisoft Connect'], win: ['UbisoftConnect.exe', 'upc.exe'] },
      { name: 'GOG Galaxy', mac: ['GOG Galaxy'], win: ['GalaxyClient.exe'] },
    ],
  },
  {
    id: 'chat',
    emoji: '💬',
    name: { en: 'Chat & messaging', hu: 'Chat és üzenetek' },
    sites: ['discord.com', 'messenger.com', 'web.whatsapp.com', 'web.telegram.org'],
    apps: [
      { name: 'Discord', mac: ['Discord'], win: ['Discord.exe'] },
      { name: 'WhatsApp', mac: ['WhatsApp'], win: ['WhatsApp.exe'] },
      { name: 'Telegram', mac: ['Telegram', 'Telegram Desktop'], win: ['Telegram.exe'] },
      { name: 'Messenger', mac: ['Messenger'], win: ['Messenger.exe'] },
      { name: 'Signal', mac: ['Signal'], win: ['Signal.exe'] },
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
    apps: [],
  },
  {
    id: 'shopping',
    emoji: '🛍️',
    name: { en: 'Shopping', hu: 'Vásárlás' },
    sites: [
      'amazon.com', 'amazon.de', 'ebay.com', 'aliexpress.com', 'temu.com', 'shein.com', 'etsy.com',
      'wish.com', 'emag.hu', 'jofogas.hu', 'vatera.hu', 'arukereso.hu',
    ],
    apps: [],
  },
  {
    id: 'music',
    emoji: '🎧',
    name: { en: 'Music & podcasts', hu: 'Zene és podcast' },
    sites: ['spotify.com', 'soundcloud.com', 'deezer.com', 'tidal.com'],
    apps: [{ name: 'Spotify', mac: ['Spotify'], win: ['Spotify.exe'] }],
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

module.exports = { PRESETS, EXTRA_HOSTS };
