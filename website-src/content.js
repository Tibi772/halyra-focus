'use strict';
// All website copy, English + Hungarian. Edit text here, then run `npm run site`.

const en = {
  langName: 'English',
  meta: {
    title: 'Halyra Focus — Free App & Website Blocker for Mac and Windows',
    desc: 'Block distracting apps and websites on Mac and Windows — free. Focus timer, Pomodoro, schedules, a smart focus coach, an AI style studio and retro themes. No account, no tracking.',
    ogAlt: 'Halyra Focus app showing a focus timer blocking social media, video and games',
  },
  nav: { features: 'Features', modes: 'Modes', themes: 'Themes', faq: 'FAQ', download: 'Download', skip: 'Skip to content' },
  hero: {
    eyebrow: 'Free · macOS & Windows · No account',
    h1: 'Block the apps that <em>eat your day.</em>',
    lede: 'Halyra Focus shuts distracting apps and websites for as long as you decide — in every browser, on Mac and Windows. Free, private, and you can always turn it off.',
    mac: 'Download for Mac', macSub: 'Apple Silicon & Intel · macOS 12+',
    win: 'Download for Windows', winSub: 'Windows 10 & 11 · 64-bit',
    note: 'Free download · No sign-up · Open source (MIT)',
    mobile: '📱 On your phone? Halyra Focus is for Mac and Windows — open this page on your computer to download it.',
    toggle: 'Focus mode', off: 'Off', on: 'On',
    overlayT: 'Video is blocked', overlayS: 'Back to what matters. 24:59 left',
    labels: { social: 'Social', video: 'Video', games: 'Games', news: 'News', shop: 'Shopping', chat: 'Chat', work: 'Work', study: 'Study', code: 'Code' },
    stats: [['0 €', 'Free — no trial, no ads'], ['2', 'Platforms: macOS & Windows'], ['∞', 'Themes — 5 built in, plus your own, designed with AI'], ['0', 'Trackers. Your data stays local']],
    canvasLabel: 'Animated city where each building is an app. Turning on focus mode switches off the lights in distracting apps.',
  },
  asks: {
    eyebrow: 'Built from real requests',
    h2: 'Everything people ask a blocker to do. <em>Nothing they hate.</em>',
    p: 'We went through what people actually complain about in productivity communities and app reviews — subscriptions, blockers that only work in one browser, apps you can’t escape. Then we built the opposite.',
    items: [
      ['Block apps too, not just websites.', 'Steam, Discord, games and any app you pick are closed the moment they open — with a gentle banner instead of a rage-inducing popup.'],
      ['It has to work in every browser.', 'Website blocking runs at the system level, so Chrome, Safari, Firefox, Edge, Brave and Arc are all covered. No extension to forget.'],
      ['Please, no subscription.', 'It’s free. No trial, no account, no ads, no “premium” wall around the useful features.'],
      ['I still want to be able to turn it off.', 'Flexible mode stops with one click. Want a speed bump? Patient mode makes you wait 60 seconds first.'],
      ['…but sometimes I need it to be strict.', 'Locked mode can’t be stopped until the timer ends — though a deliberately tedious emergency exit always exists.'],
      ['Schedules, so I don’t rely on willpower.', 'Work hours, evenings, weekends — blocks switch on by themselves, including windows that run past midnight.'],
    ],
  },
  features: {
    eyebrow: 'Features',
    h2: 'Small app. <em>Serious focus.</em>',
    p: 'Everything you need to stop drifting — and nothing that gets in your way.',
    rows: [
      { k: 'Focus sessions', h: 'One click from scattered to focused.', p: 'Pick a length, pick what to block, press start. A live ring shows how far you’ve come, and the menu bar or tray shows the countdown.', ticks: ['25 / 50 / 90 minutes or any custom length', 'Pomodoro mode with automatic breaks — blocks pause during breaks', '+15 minutes when you’re on a roll'], img: 'focus' },
      { k: 'Block lists', h: 'Your distractions, neatly grouped.', p: 'Start with ready-made lists for social media, video, games, chat, news and shopping — or build your own from installed apps and any website.', ticks: ['Pick from your installed apps, with icons', 'Paste dozens of sites at once; www. and m. subdomains included', 'Combine any lists per session or schedule'], img: 'lists' },
      { k: 'Schedules', h: 'Let the calendar have the willpower.', p: 'Set it once: social media off during work hours, games off on school nights, everything off after 23:00. The week view shows exactly when you’re protected.', ticks: ['Any days, any hours — overnight windows work', 'Each schedule has its own strictness', 'Skip today’s block in Flexible mode if plans change'], img: 'schedules' },
      { k: 'Stats', h: 'Watch your focus grow. Privately.', p: 'Daily focus minutes, a streak counter and the apps you reached for most. Stored only on your computer — there’s no server to send it to.', ticks: ['7-day focus chart and streaks', 'Top distractions of the week', 'Export and import your setup as a file'], img: 'stats' },
      { k: 'Focus coach', h: 'Smart enough to plan. Firm enough to hold you to it.', p: 'Tell it what you’re working on and it sets up the block for you — what to block, how long and how strict. Try to quit early and it tells you exactly what you’d be giving up.', ticks: ['One-click smart setup from your goal', 'Firm, specific nudges instead of guilt trips', 'Tips from your own stats — like auto-blocking your weakest hour'], img: 'coach' },
      { k: 'AI style studio', h: 'Describe a vibe. Get your own theme.', p: 'Type “neon Tokyo night” or “calm forest” and the style studio designs a complete theme — colours, font, corners and background effect — with readable contrast guaranteed. Fine-tune anything and save as many as you like.', ticks: ['Works offline with the built-in style engine', 'Even smarter with your own Claude AI key (optional)', 'Pixel, terminal, elegant or modern fonts; neon grid, CRT lines, stars and more'], img: 'studio' },
    ],
    extras: [
      ['PIN lock', 'For accountability partners or kids: blocks can’t be stopped or removed without the PIN.'],
      ['Menu bar & tray', 'The countdown is always visible, and a focus session starts in one click.'],
      ['Starts at login', 'Schedules keep working even if you forget to open the app.'],
      ['Gentle block banner', 'Open a blocked app and a short banner reminds you how long is left.'],
      ['English & Hungarian', 'Starts in your system language — switch anytime.'],
      ['Self-expiring blocks', 'Website blocks lift on their own when the timer ends — even if you quit or delete the app.'],
    ],
  },
  modes: {
    eyebrow: 'You stay in charge',
    h2: 'Three levels of <em>commitment.</em>',
    p: 'Most blockers are either too easy to cheat or a prison. Halyra Focus lets you choose per session — and the default is the friendly one.',
    def: 'Default',
    items: [
      ['Flexible', 'Stop anytime with one click. Perfect for building the habit without feeling trapped.'],
      ['Patient', 'Stopping takes a 60-second pause (you can change it). Usually the urge is gone before the timer is.'],
      ['Locked', 'No stopping until the timer ends. Emergency exit: type a random 120-character text by hand and wait 5 minutes.'],
    ],
  },
  themes: {
    eyebrow: 'Make it yours',
    h2: 'Sleek by default. <em>Retro</em> if you like.',
    p: 'Five built-in themes, three of them retro — a green phosphor CRT terminal, a 1-bit black & white desktop and an 80s vapor sunset. Or describe your own and let the AI style studio build it.',
    names: { midnight: 'Midnight', daylight: 'Daylight', crt: 'Retro CRT', onebit: 'Retro 1-bit', vapor: 'Retro Vapor', custom: 'Your style ✦' },
  },
  how: {
    eyebrow: 'How it works',
    h2: 'Set up in <em>under a minute.</em>',
    steps: [
      ['Download & open', 'Drag the app to Applications on Mac, or run the installer on Windows.'],
      ['Allow website blocking once', 'One admin prompt installs a tiny helper, so sites are blocked in every browser.'],
      ['Pick lists, press start', 'Or set a schedule and forget about it.'],
    ],
  },
  cmp: {
    eyebrow: 'Compare',
    h2: 'How it <em>compares.</em>',
    cols: ['', 'Halyra Focus', 'Typical paid blocker', 'Browser extension'],
    rows: [
      ['Price', 'Free', 'Subscription or paid licence', 'Free / freemium'],
      ['Blocks desktop apps & games', 'Y', 'Often a paid tier', 'N'],
      ['Works in every browser', 'Y', 'Y', 'Only its own browser'],
      ['Turn off anytime — or lock it', 'Your choice, per session', 'Varies', 'Varies'],
      ['Account required', 'No', 'Usually', 'Sometimes'],
      ['Your data', 'Stays on your computer', 'Often synced to a server', 'Varies'],
    ],
    note: '“Typical” describes common patterns, not any specific product.',
  },
  faq: {
    eyebrow: 'FAQ',
    h2: 'Questions, <em>answered.</em>',
    items: [
      ['Is Halyra Focus really free?', 'Yes. There’s no trial, no account and no ads, and every feature in the app today is free.'],
      ['How does it block apps?', 'While a block is active, Halyra Focus checks every couple of seconds for apps on your block lists and closes them, showing a short banner with the time left. It works on Mac and Windows.'],
      ['How can website blocking work in every browser?', 'Instead of a browser extension, Halyra Focus uses your computer’s system-wide hosts file, through a tiny helper you allow once with your admin password. That covers Chrome, Safari, Firefox, Edge, Brave, Arc and others. Tabs that were already open may need a reload.'],
      ['Can I turn it off whenever I want?', 'Yes — in Flexible mode (the default) one click stops everything. Patient and Locked modes are optional, and even Locked mode has an emergency exit.'],
      ['What happens if I quit or delete the app during a block?', 'Quitting a Flexible block simply ends it. For Patient and Locked blocks, websites stay blocked until the timer ends and then unblock themselves automatically — even if the app was deleted.'],
      ['Does it collect any data?', 'No. There’s no account, no analytics and no server. Your lists, schedules and stats are stored only on your computer.'],
      ['macOS says it can’t verify the developer. What should I do?', 'Open System Settings → Privacy & Security, scroll down and click “Open Anyway”. You only do this once. We’re new and don’t have a paid Apple certificate yet — the source code is public, so anyone can check it.'],
      ['Windows shows “Windows protected your PC”.', 'Click “More info”, then “Run anyway”. This appears because the installer isn’t signed with a paid certificate yet.'],
      ['Which systems are supported?', 'macOS 12 Monterey or newer (Apple Silicon and Intel) and Windows 10 or 11 (64-bit).'],
      ['Is there AI in it?', 'Yes. The style studio and the focus coach work offline out of the box. If you add your own Anthropic API key in Settings, they use Claude AI for even smarter results. Only the text you type into those two features is sent — never your lists, stats or browsing.'],
      ['Can it block only YouTube Shorts or the Reddit front page?', 'Not yet — Halyra Focus blocks whole sites and apps. Blocking individual feeds needs a browser extension, which is on the roadmap.'],
    ],
  },
  final: {
    h2: 'Your next focused hour starts <em>with a download.</em>',
    p: 'Free for Mac and Windows. No account. Turn it off whenever you want.',
    macT: 'First launch on Mac',
    mac: ['Open <b>HalyraFocus-mac.dmg</b> and drag the app to <b>Applications</b>.', 'Open the app. If macOS says it can’t verify the developer, click <b>Done</b>.', 'Go to <b>System Settings → Privacy &amp; Security</b>, scroll down, click <b>Open Anyway</b>.', 'Confirm with your password. Only needed once.'],
    winT: 'First launch on Windows',
    win: ['Run <b>HalyraFocus-Setup.exe</b>.', 'If “Windows protected your PC” appears, click <b>More info → Run anyway</b>.', 'Finish the installer — Halyra Focus opens automatically.'],
    why: 'Why the warning? Code-signing certificates cost money and we’re brand new and free. The source code is public.',
    all: 'All releases & changelog',
  },
  footer: {
    tagline: 'Free app & website blocker for Mac and Windows. Made by Halyra.',
    product: 'Product', guides: 'Guides', legal: 'Legal', source: 'Source code', privacy: 'Privacy', language: 'Language',
  },
  privacy: {
    title: 'Privacy — Halyra Focus',
    desc: 'Halyra Focus collects no data: no account, no analytics, no server. Everything stays on your computer.',
    h1: 'Privacy',
    body: `<p class="meta">Last updated: November 2026</p>
<p><b>Short version: the Halyra Focus app collects nothing.</b> There is no account, no analytics, no crash reporting and no server that your data could be sent to.</p>
<h2>The app</h2>
<ul>
<li>Your block lists, schedules, settings and statistics are stored only on your computer, in the app’s own folder.</li>
<li>Website blocking writes the domains you choose into your computer’s hosts file through a local helper. Nothing is sent over the internet.</li>
<li>To block apps, the app looks at the list of running programs on your computer. This list never leaves your computer.</li>
<li>The app does not connect to the internet by itself. The only exception is optional: if you add your own Anthropic API key, the text you type into the AI style studio or the smart setup is sent to Anthropic’s API to generate the result. Nothing else is ever sent.</li>
<li>Opening a link (for example to this website) happens in your browser.</li>
</ul>
<h2>This website</h2>
<ul>
<li>No cookies, no analytics, no tracking scripts, no third-party fonts.</li>
<li>The website and downloads are hosted on GitHub. GitHub may log technical data such as IP addresses when you visit or download; see GitHub’s privacy statement.</li>
</ul>
<h2>Contact</h2>
<p>Questions? Open an issue in the public source code repository.</p>`,
  },
  guides: {
    label: 'Guides',
    mac: {
      title: 'How to Block Apps on Mac for Free (2 Ways That Work)',
      desc: 'Block distracting apps on your Mac for free: Screen Time App Limits vs. a free app blocker with schedules, Pomodoro and a strict mode. Step by step.',
      h1: 'How to block apps on Mac — for free',
      body: `<p class="meta">5 min read · macOS 12 and newer</p>
<p>Games, chat apps and video players are the easiest way to lose an afternoon on a Mac. Here are two free ways to block them — the built-in one, and one that’s actually built for focus.</p>
<h2>Option 1: Screen Time App Limits (built in)</h2>
<ol>
<li>Open <b>System Settings → Screen Time → App Limits</b> and turn App Limits on.</li>
<li>Click <b>Add Limit</b>, tick the apps or categories you want to limit and set a daily time.</li>
<li>Optionally set a Screen Time passcode so the limit can’t simply be ignored.</li>
</ol>
<p><b>Good for:</b> a daily time budget. <b>Not great for:</b> focus sessions. Limits are per day, not “block now for 50 minutes”, and without a passcode ignoring the limit is a click away. There are no Pomodoro breaks or work-hour schedules for specific apps.</p>
<h2>Option 2: Halyra Focus (free app blocker)</h2>
<ol>
<li><a href="{{home}}">Download Halyra Focus</a> and drag it to Applications.</li>
<li>Open it and pick a theme. Ready-made lists for social media, video, games and chat are already there.</li>
<li>Go to <b>Block lists → Add app</b> to add any installed app, such as Steam, Discord or Minecraft.</li>
<li>On the <b>Focus</b> screen choose a duration (or Pomodoro), the lists and how strict it should be, then press <b>Start focus</b>.</li>
<li>Want it automatic? Add a <b>Schedule</b>, for example weekdays 9:00–17:00.</li>
</ol>
<p>While the block runs, blocked apps close as soon as they open and a short banner tells you how long is left. You can also block websites in every browser with a one-time admin permission.</p>
<div class="callout"><p><b>Pick the right strictness.</b> Flexible stops with one click, Patient makes you wait 60 seconds first, Locked can’t be stopped until the timer ends (except via a deliberately tedious emergency exit).</p><a class="btn pill sm" href="{{home}}#download">Download free</a></div>
<h2>Tips that make blocking stick</h2>
<ul>
<li><b>Start small:</b> one 25-minute Pomodoro is better than a 6-hour block you’ll abandon.</li>
<li><b>Use schedules</b> for the times you always drift, like right after lunch or late evenings.</li>
<li><b>Block the launcher, not just the game:</b> add Steam or the Epic Games Launcher to your list.</li>
<li><b>Use Patient mode</b> once you notice you stop blocks on impulse.</li>
</ul>`,
    },
    win: {
      title: 'How to Block Websites on Windows 10 & 11 (Free, Every Browser)',
      desc: 'Block websites on Windows 10 and 11 in every browser for free: the hosts-file method step by step, browser extensions, and an automatic free blocker with schedules.',
      h1: 'How to block websites on Windows — in every browser',
      body: `<p class="meta">6 min read · Windows 10 and 11</p>
<p>Browser extensions only block sites inside one browser. To block a site in <i>every</i> browser on Windows, you need to block it at the system level. Here’s how — by hand, and automatically.</p>
<h2>Option 1: Edit the hosts file by hand</h2>
<ol>
<li>Open the Start menu, type <b>Notepad</b>, right-click it and choose <b>Run as administrator</b>.</li>
<li>In Notepad, choose <b>File → Open</b> and open <code>C:\\Windows\\System32\\drivers\\etc\\hosts</code> (switch the file filter to “All files”).</li>
<li>At the end of the file add one line per address, for example:<br><code>0.0.0.0 youtube.com</code><br><code>0.0.0.0 www.youtube.com</code></li>
<li>Save the file, then open Command Prompt and run <code>ipconfig /flushdns</code>.</li>
<li>Restart your browser.</li>
</ol>
<p><b>Downsides:</b> it’s all-or-nothing, there’s no timer or schedule, you need to add every subdomain yourself, and it’s easy to forget to remove the lines later.</p>
<h2>Option 2: A browser extension</h2>
<p>Quick to set up, but it only works in the browser it’s installed in — open another browser and the site is right there. It also can’t block desktop apps like Steam or Discord.</p>
<h2>Option 3: Halyra Focus (free, automatic)</h2>
<p>Halyra Focus does the hosts-file method for you — with timers, schedules and automatic cleanup — and also blocks desktop apps.</p>
<ol>
<li><a href="{{home}}">Download Halyra Focus</a> for Windows and run the installer.</li>
<li>When asked, allow website blocking once (one admin prompt).</li>
<li>Pick a ready-made list or add your own sites — www. and m. versions are included automatically.</li>
<li>Start a focus session or set a schedule.</li>
</ol>
<div class="callout"><p><b>Blocks clean up after themselves.</b> When the timer ends, the sites are unblocked automatically — even if the app was closed or uninstalled in the meantime.</p><a class="btn pill sm" href="{{home}}#download">Download free</a></div>
<h2>Troubleshooting</h2>
<ul>
<li><b>The site still opens:</b> reload the tab or restart the browser — open tabs can keep an existing connection for a short while.</li>
<li><b>Antivirus warning about the hosts file:</b> some security tools watch hosts-file changes; Halyra Focus only adds lines that point blocked sites to 0.0.0.0.</li>
</ul>`,
    },
  },
  notFound: { title: 'Page not found — Halyra Focus', h1: 'This page took a break.', p: 'The page you’re looking for doesn’t exist.', back: 'Back to home' },
};

const hu = {
  langName: 'Magyar',
  meta: {
    title: 'Halyra Focus — Ingyenes app- és weboldal-blokkoló Macre és Windowsra',
    desc: 'Tiltsd le a figyelemelterelő appokat és weboldalakat Macen és Windowson — ingyen. Fókusz időzítő, Pomodoro, időzítések, okos fókusz-coach, AI stílusstúdió és retró témák. Fiók és követés nélkül.',
    ogAlt: 'A Halyra Focus app fókusz időzítővel, ami tiltja a közösségi médiát, a videókat és a játékokat',
  },
  nav: { features: 'Funkciók', modes: 'Módok', themes: 'Témák', faq: 'GYIK', download: 'Letöltés', skip: 'Ugrás a tartalomra' },
  hero: {
    eyebrow: 'Ingyenes · macOS és Windows · Regisztráció nélkül',
    h1: 'Tiltsd le az appokat, amik <em>megeszik a napodat.</em>',
    lede: 'A Halyra Focus addig zárja ki a figyelemelterelő appokat és weboldalakat, ameddig te szeretnéd — minden böngészőben, Macen és Windowson. Ingyenes, privát, és bármikor kikapcsolhatod.',
    mac: 'Letöltés Macre', macSub: 'Apple Silicon és Intel · macOS 12+',
    win: 'Letöltés Windowsra', winSub: 'Windows 10 és 11 · 64 bit',
    note: 'Ingyenes letöltés · Nincs regisztráció · Nyílt forráskód (MIT)',
    mobile: '📱 Telefonon vagy? A Halyra Focus Macre és Windowsra készült — a letöltéshez nyisd meg ezt az oldalt a gépeden.',
    toggle: 'Fókusz mód', off: 'Ki', on: 'Be',
    overlayT: 'A videó tiltva', overlayS: 'Vissza ahhoz, ami számít. Még 24:59',
    labels: { social: 'Közösségi', video: 'Videó', games: 'Játékok', news: 'Hírek', shop: 'Vásárlás', chat: 'Chat', work: 'Munka', study: 'Tanulás', code: 'Kód' },
    stats: [['0 Ft', 'Ingyenes — nincs próbaidő, nincs reklám'], ['2', 'Platform: macOS és Windows'], ['∞', 'Téma — 5 beépített, és a saját, AI-jal tervezett stílusaid'], ['0', 'Követőkód. Az adataid nálad maradnak']],
    canvasLabel: 'Animált város, ahol minden épület egy app. A fókusz mód bekapcsolásakor a figyelemelterelő appok épületeiben kialszanak a fények.',
  },
  asks: {
    eyebrow: 'Valódi igényekből építve',
    h2: 'Minden, amit egy blokkolótól kérnek. <em>Semmi, amit utálnak.</em>',
    p: 'Végignéztük, mire panaszkodnak az emberek a produktivitási közösségekben és az app-értékelésekben — előfizetések, csak egy böngészőben működő blokkolók, appok, amikből nincs kiút. Aztán megépítettük az ellenkezőjét.',
    items: [
      ['Az appokat is tiltsa, ne csak a weboldalakat.', 'A Steam, a Discord, a játékok és bármelyik app, amit kiválasztasz, azonnal bezárul, amint megnyitod — egy barátságos értesítővel, nem idegesítő felugró ablakkal.'],
      ['Minden böngészőben működjön.', 'A weboldal-tiltás rendszerszinten működik, így a Chrome, a Safari, a Firefox, az Edge, a Brave és az Arc is le van fedve. Nincs bővítmény, amit elfelejthetsz.'],
      ['Csak ne legyen előfizetés.', 'Ingyenes. Nincs próbaidő, nincs fiók, nincs reklám, és nincs „prémium” fal a hasznos funkciók körül.'],
      ['Azért ki akarom tudni kapcsolni.', 'Laza módban egy kattintással leállítod. Kell egy kis fék? Türelmes módban előtte 60 másodpercet várnod kell.'],
      ['…de néha kell, hogy szigorú legyen.', 'Zárolt módban az idő lejártáig nem állítható le — egy szándékosan macerás vészkijárat azért mindig van.'],
      ['Időzítés, hogy ne az akaraterőn múljon.', 'Munkaidő, esték, hétvégék — a tiltások maguktól kapcsolnak be, éjfélen átnyúló idősávokkal is.'],
    ],
  },
  features: {
    eyebrow: 'Funkciók',
    h2: 'Kis app. <em>Komoly fókusz.</em>',
    p: 'Minden, ami ahhoz kell, hogy ne kalandozz el — és semmi, ami útban lenne.',
    rows: [
      { k: 'Fókusz munkamenet', h: 'Egy kattintás a szétszórtságtól a fókuszig.', p: 'Válassz időtartamot, válaszd ki, mit tiltson, és indítsd. Egy élő gyűrű mutatja, hol tartasz, a menüsorban vagy a tálcán pedig ott a visszaszámlálás.', ticks: ['25 / 50 / 90 perc vagy bármilyen egyéni hossz', 'Pomodoro mód automatikus szünetekkel — szünetben a tiltás szünetel', '+15 perc, ha épp belelendültél'], img: 'focus' },
      { k: 'Tiltólisták', h: 'A figyelemelterelők, szépen csoportosítva.', p: 'Kezdd kész listákkal (közösségi média, videó, játékok, chat, hírek, vásárlás), vagy rakd össze a sajátodat a telepített appokból és bármilyen weboldalból.', ticks: ['Appok kiválasztása a telepítettek közül, ikonokkal', 'Egyszerre több tucat oldal beillesztése; a www. és m. aldomainek is', 'Munkamenetenként és időzítésenként bármilyen lista-kombináció'], img: 'lists' },
      { k: 'Időzítések', h: 'Az akaraterőt bízd a naptárra.', p: 'Egyszer beállítod: munkaidőben nincs közösségi média, hétköznap este nincs játék, 23:00 után semmi. A heti nézet pontosan mutatja, mikor vagy védve.', ticks: ['Bármelyik nap, bármelyik óra — éjfélen átnyúló sáv is', 'Minden időzítésnek saját szigorúsága van', 'Laza módban a mai tiltást kihagyhatod, ha változik a terv'], img: 'schedules' },
      { k: 'Statisztika', h: 'Nézd, ahogy nő a fókuszod. Privát módon.', p: 'Napi fókuszpercek, sorozatszámláló, és hogy mely appokhoz nyúltál a legtöbbször. Csak a gépeden tárolódik — nincs szerver, ahová elküldhetnénk.', ticks: ['7 napos fókuszgrafikon és sorozatok', 'A hét legnagyobb figyelemelterelői', 'A beállításaid exportálása és importálása fájlként'], img: 'stats' },
      { k: 'Fókusz-coach', h: 'Elég okos, hogy megtervezze. Elég határozott, hogy be is tartasd.', p: 'Mondd meg, min dolgozol, és beállítja helyetted a tiltást — mit, mennyi ideig és mennyire szigorúan. Ha idő előtt kiszállnál, pontosan megmondja, mit adnál fel.', ticks: ['Okos beállítás egy kattintással a célodból', 'Határozott, konkrét mondatok bűntudatkeltés helyett', 'Tippek a saját statisztikádból — pl. a leggyengébb órád automatikus tiltása'], img: 'coach' },
      { k: 'AI stílusstúdió', h: 'Írd le a hangulatot. Megkapod a saját témádat.', p: 'Írd be: „neon tokiói éjszaka” vagy „erdei nyugalom”, és a stílusstúdió megtervez egy teljes témát — színek, betűtípus, sarkok és háttéreffekt —, garantáltan jól olvasható kontraszttal. Bármit finomhangolhatsz, és annyit menthetsz, amennyit akarsz.', ticks: ['Offline is működik a beépített stílusmotorral', 'Saját Claude AI-kulccsal még okosabb (opcionális)', 'Pixel, terminál, elegáns vagy modern betű; neon rács, CRT csíkok, csillagok és még sok más'], img: 'studio' },
    ],
    extras: [
      ['PIN-zár', 'Elszámoltató barátnak vagy gyerekeknek: PIN nélkül a tiltás nem állítható le és nem törölhető.'],
      ['Menüsor és tálca', 'A visszaszámlálás mindig látszik, a fókusz egy kattintással indul.'],
      ['Indul bejelentkezéskor', 'Az időzítések akkor is működnek, ha elfelejted megnyitni az appot.'],
      ['Barátságos tiltás-értesítő', 'Ha megnyitnál egy tiltott appot, egy rövid sáv emlékeztet, mennyi van még hátra.'],
      ['Magyarul és angolul', 'A géped nyelvén indul — bármikor átállíthatod.'],
      ['Magától lejáró tiltás', 'A weboldal-tiltás az idő végén magától feloldódik — akkor is, ha közben bezártad vagy törölted az appot.'],
    ],
  },
  modes: {
    eyebrow: 'A döntés a tiéd',
    h2: 'Az elköteleződés <em>három szintje.</em>',
    p: 'A legtöbb blokkolót vagy túl könnyű kijátszani, vagy börtön. A Halyra Focusban munkamenetenként választhatsz — és alapból a barátságos mód aktív.',
    def: 'Alapértelmezett',
    items: [
      ['Laza', 'Bármikor leállíthatod egy kattintással. Tökéletes a szokás kialakításához, bezártságérzés nélkül.'],
      ['Türelmes', 'Leállítás előtt 60 másodperc várakozás (átállítható). A késztetés általában hamarabb elmúlik, mint az idő.'],
      ['Zárolt', 'Nincs leállítás az idő lejártáig. Vészkijárat: kézzel begépelni egy 120 karakteres véletlen szöveget, és kivárni 5 percet.'],
    ],
  },
  themes: {
    eyebrow: 'Legyen a tiéd',
    h2: 'Alapból elegáns. <em>Retró</em>, ha szereted.',
    p: 'Öt beépített téma, ebből három retró: zöld foszforos CRT terminál, fekete-fehér 1-bites asztal és 80-as évekbeli vapor naplemente. Vagy írd le a sajátodat, és az AI stílusstúdió megépíti.',
    names: { midnight: 'Éjfél', daylight: 'Nappal', crt: 'Retró CRT', onebit: 'Retró 1-bit', vapor: 'Retró Vapor', custom: 'A te stílusod ✦' },
  },
  how: {
    eyebrow: 'Hogyan működik',
    h2: 'Beállítás <em>egy perc alatt.</em>',
    steps: [
      ['Letöltés és megnyitás', 'Macen húzd az appot az Alkalmazások mappába, Windowson futtasd a telepítőt.'],
      ['Egyszeri engedély a weboldal-tiltáshoz', 'Egyetlen rendszergazdai kérés telepít egy pici segédprogramot, így minden böngészőben működik.'],
      ['Válassz listát, és indítsd', 'Vagy állíts be időzítést, és felejtsd el.'],
    ],
  },
  cmp: {
    eyebrow: 'Összehasonlítás',
    h2: 'Így <em>viszonyul.</em>',
    cols: ['', 'Halyra Focus', 'Tipikus fizetős blokkoló', 'Böngészőbővítmény'],
    rows: [
      ['Ár', 'Ingyenes', 'Előfizetés vagy fizetős licenc', 'Ingyenes / freemium'],
      ['Asztali appok és játékok tiltása', 'Y', 'Gyakran csak fizetős csomagban', 'N'],
      ['Minden böngészőben működik', 'Y', 'Y', 'Csak a saját böngészőjében'],
      ['Kikapcsolható — vagy zárolható', 'Te döntöd el, munkamenetenként', 'Változó', 'Változó'],
      ['Kell hozzá fiók', 'Nem', 'Általában igen', 'Néha'],
      ['Az adataid', 'A gépeden maradnak', 'Gyakran szerverre szinkronizálva', 'Változó'],
    ],
    note: 'A „tipikus” gyakori mintákat jelent, nem egy konkrét terméket.',
  },
  faq: {
    eyebrow: 'GYIK',
    h2: 'Kérdések és <em>válaszok.</em>',
    items: [
      ['Tényleg ingyenes a Halyra Focus?', 'Igen. Nincs próbaidő, nincs fiók, nincs reklám, és az appban jelenleg minden funkció ingyenes.'],
      ['Hogyan tiltja az appokat?', 'Amíg egy tiltás aktív, a Halyra Focus pár másodpercenként megnézi, fut-e valami a tiltólistáidról, és bezárja, egy rövid sávval jelezve, mennyi idő van még hátra. Macen és Windowson is működik.'],
      ['Hogyan működhet a weboldal-tiltás minden böngészőben?', 'Böngészőbővítmény helyett a Halyra Focus a géped rendszerszintű hosts fájlját használja, egy pici segédprogramon keresztül, amit egyszer engedélyezel a jelszavaddal. Így a Chrome, a Safari, a Firefox, az Edge, a Brave, az Arc és a többi is le van fedve. A már megnyitott lapokat lehet, hogy újra kell tölteni.'],
      ['Bármikor kikapcsolhatom?', 'Igen — Laza módban (ez az alapértelmezett) egy kattintással minden leáll. A Türelmes és a Zárolt mód opcionális, és még a Zárolt módban is van vészkijárat.'],
      ['Mi történik, ha tiltás közben kilépek vagy törlöm az appot?', 'Laza tiltásnál a kilépés egyszerűen befejezi a tiltást. Türelmes és Zárolt tiltásnál a weboldalak az idő lejártáig tiltva maradnak, utána maguktól feloldódnak — akkor is, ha közben törölted az appot.'],
      ['Gyűjt bármilyen adatot?', 'Nem. Nincs fiók, nincs analitika és nincs szerver. A listáid, időzítéseid és statisztikáid csak a gépeden tárolódnak.'],
      ['A macOS azt írja, nem tudja ellenőrizni a fejlesztőt. Mit tegyek?', 'Nyisd meg a Rendszerbeállítások → Adatvédelem és biztonság (Privacy & Security) oldalt, görgess le, és kattints a „Megnyitás mégis” (Open Anyway) gombra. Ezt csak egyszer kell. Újak vagyunk, és még nincs fizetős Apple-tanúsítványunk — a forráskód nyilvános, bárki ellenőrizheti.'],
      ['A Windows azt írja: „A Windows megvédte a számítógépet”.', 'Kattints a „További információ” (More info), majd a „Futtatás mindenképp” (Run anyway) gombra. Ez azért jelenik meg, mert a telepítő még nincs fizetős tanúsítvánnyal aláírva.'],
      ['Milyen rendszereken fut?', 'macOS 12 Monterey vagy újabb (Apple Silicon és Intel), valamint Windows 10 vagy 11 (64 bit).'],
      ['Van benne AI?', 'Igen. A stílusstúdió és a fókusz-coach alapból offline működik. Ha a Beállításokban megadod a saját Anthropic API-kulcsodat, Claude AI-t használnak a még okosabb eredményért. Csak az a szöveg megy el, amit ebbe a két funkcióba írsz — a listáid, statisztikáid és a böngészésed soha.'],
      ['Le tudja tiltani csak a YouTube Shortsot vagy a Reddit főoldalát?', 'Egyelőre nem — a Halyra Focus egész oldalakat és appokat tilt. Az egyes hírfolyamok tiltásához böngészőbővítmény kell, ez a tervek között van.'],
    ],
  },
  final: {
    h2: 'A következő fókuszált órád <em>egy letöltéssel kezdődik.</em>',
    p: 'Ingyenes Macre és Windowsra. Nincs fiók. Bármikor kikapcsolhatod.',
    macT: 'Első indítás Macen',
    mac: ['Nyisd meg a <b>HalyraFocus-mac.dmg</b> fájlt, és húzd az appot az <b>Alkalmazások</b> mappába.', 'Nyisd meg az appot. Ha a macOS azt írja, nem tudja ellenőrizni a fejlesztőt, kattints a <b>Kész</b> gombra.', 'Menj a <b>Rendszerbeállítások → Adatvédelem és biztonság</b> (Privacy &amp; Security) oldalra, görgess le, és kattints a <b>Megnyitás mégis</b> (Open Anyway) gombra.', 'Erősítsd meg a jelszavaddal. Csak egyszer kell.'],
    winT: 'Első indítás Windowson',
    win: ['Futtasd a <b>HalyraFocus-Setup.exe</b> fájlt.', 'Ha megjelenik a „A Windows megvédte a számítógépet” ablak, kattints a <b>További információ → Futtatás mindenképp</b> (More info → Run anyway) gombra.', 'Fejezd be a telepítést — a Halyra Focus magától elindul.'],
    why: 'Miért a figyelmeztetés? A kódaláíró tanúsítvány pénzbe kerül, mi pedig vadonatújak és ingyenesek vagyunk. A forráskód nyilvános.',
    all: 'Összes kiadás és változásnapló',
  },
  footer: {
    tagline: 'Ingyenes app- és weboldal-blokkoló Macre és Windowsra. A Halyra fejlesztése.',
    product: 'Termék', guides: 'Útmutatók', legal: 'Jogi', source: 'Forráskód', privacy: 'Adatvédelem', language: 'Nyelv',
  },
  privacy: {
    title: 'Adatvédelem — Halyra Focus',
    desc: 'A Halyra Focus semmilyen adatot nem gyűjt: nincs fiók, nincs analitika, nincs szerver. Minden a gépeden marad.',
    h1: 'Adatvédelem',
    body: `<p class="meta">Utolsó frissítés: 2026. november</p>
<p><b>Röviden: a Halyra Focus app semmit nem gyűjt.</b> Nincs fiók, nincs analitika, nincs hibajelentés-küldés, és nincs szerver, ahová az adataid kerülhetnének.</p>
<h2>Az app</h2>
<ul>
<li>A tiltólistáid, időzítéseid, beállításaid és statisztikáid csak a gépeden, az app saját mappájában tárolódnak.</li>
<li>A weboldal-tiltás a kiválasztott domaineket egy helyi segédprogramon keresztül a géped hosts fájljába írja. Semmi nem megy ki az internetre.</li>
<li>Az appok tiltásához az app a gépeden futó programok listáját nézi. Ez a lista soha nem hagyja el a gépedet.</li>
<li>Az app magától nem csatlakozik az internethez. Az egyetlen kivétel opcionális: ha megadod a saját Anthropic API-kulcsodat, az AI stílusstúdióba vagy az okos beállításba írt szöveg az Anthropic API-jához kerül, hogy elkészüljön az eredmény. Semmi más nem megy el.</li>
<li>Ha megnyitsz egy linket (például ezt a weboldalt), az a böngésződben történik.</li>
</ul>
<h2>Ez a weboldal</h2>
<ul>
<li>Nincsenek sütik, analitika, követőkódok vagy külső betűtípusok.</li>
<li>A weboldalt és a letöltéseket a GitHub tárolja. A GitHub látogatáskor vagy letöltéskor naplózhat technikai adatokat, például IP-címet; erről a GitHub adatvédelmi nyilatkozata szól.</li>
</ul>
<h2>Kapcsolat</h2>
<p>Kérdésed van? Nyiss egy issue-t a nyilvános forráskód-tárolóban.</p>`,
  },
  guides: {
    label: 'Útmutatók',
    mac: {
      title: 'Appok tiltása Macen ingyen — 2 működő módszer',
      desc: 'Így tilthatod le ingyen a figyelemelterelő appokat Macen: a Képernyőidő app-korlátai vagy egy ingyenes app-blokkoló időzítéssel, Pomodoróval és szigorú móddal. Lépésről lépésre.',
      h1: 'Appok tiltása Macen — ingyen',
      body: `<p class="meta">5 perc olvasás · macOS 12 vagy újabb</p>
<p>A játékok, a chat-appok és a videólejátszók a legegyszerűbb módjai annak, hogy elmenjen egy délután a Macen. Itt van két ingyenes módszer a tiltásukra — a beépített, és egy, ami kifejezetten a fókuszra készült.</p>
<h2>1. módszer: a Képernyőidő app-korlátai (beépített)</h2>
<ol>
<li>Nyisd meg a <b>Rendszerbeállítások → Képernyőidő → Appkorlátok</b> (Screen Time → App Limits) oldalt, és kapcsold be az appkorlátokat.</li>
<li>Kattints a <b>Korlát hozzáadása</b> gombra, jelöld be a korlátozni kívánt appokat vagy kategóriákat, és állíts be napi időt.</li>
<li>Érdemes Képernyőidő-jelkódot is beállítani, hogy a korlátot ne lehessen egyszerűen figyelmen kívül hagyni.</li>
</ol>
<p><b>Mire jó:</b> napi időkeretre. <b>Mire kevésbé:</b> fókuszra. A korlát napi szintű, nem „tiltsd most 50 percre”, és jelkód nélkül egy kattintás a kikerülése. Nincs Pomodoro-szünet és nincs munkaidős időzítés konkrét appokra.</p>
<h2>2. módszer: Halyra Focus (ingyenes app-blokkoló)</h2>
<ol>
<li><a href="{{home}}">Töltsd le a Halyra Focust</a>, és húzd az Alkalmazások mappába.</li>
<li>Nyisd meg, és válassz témát. A közösségi média, videó, játékok és chat listák már készen várnak.</li>
<li>A <b>Tiltólisták → App hozzáadása</b> résznél bármelyik telepített appot hozzáadhatod, például a Steamet, a Discordot vagy a Minecraftot.</li>
<li>A <b>Fókusz</b> képernyőn válassz időtartamot (vagy Pomodorót), listákat és szigorúságot, majd nyomd meg a <b>Fókusz indítása</b> gombot.</li>
<li>Automatikusan szeretnéd? Adj hozzá egy <b>Időzítést</b>, például hétköznap 9:00–17:00.</li>
</ol>
<p>Amíg a tiltás fut, a tiltott appok azonnal bezárulnak, amint megnyitod őket, és egy rövid sáv jelzi, mennyi van még hátra. Egyszeri rendszergazdai engedéllyel a weboldalakat is tilthatod minden böngészőben.</p>
<div class="callout"><p><b>Válaszd ki a megfelelő szigorúságot.</b> A Laza egy kattintással leáll, a Türelmesnél előtte 60 másodpercet kell várni, a Zárolt pedig az idő lejártáig nem állítható le (csak egy szándékosan macerás vészkijáraton át).</p><a class="btn pill sm" href="{{home}}#download">Ingyenes letöltés</a></div>
<h2>Tippek, hogy tényleg működjön</h2>
<ul>
<li><b>Kezdd kicsiben:</b> egy 25 perces Pomodoro többet ér, mint egy 6 órás tiltás, amit félbehagysz.</li>
<li><b>Használj időzítést</b> azokra az időszakokra, amikor mindig elkalandozol, például ebéd után vagy késő este.</li>
<li><b>Ne csak a játékot, az indítót is tiltsd:</b> add hozzá a Steamet vagy az Epic Games Launchert a listádhoz.</li>
<li><b>Válts Türelmes módra</b>, ha észreveszed, hogy hirtelen felindulásból állítod le a tiltásokat.</li>
</ul>`,
    },
    win: {
      title: 'Weboldalak tiltása Windows 10 és 11 alatt — ingyen, minden böngészőben',
      desc: 'Így tilthatsz le weboldalakat Windows 10 és 11 alatt minden böngészőben, ingyen: a hosts fájlos módszer lépésről lépésre, böngészőbővítmények, és egy automatikus, ingyenes blokkoló időzítéssel.',
      h1: 'Weboldalak tiltása Windowson — minden böngészőben',
      body: `<p class="meta">6 perc olvasás · Windows 10 és 11</p>
<p>A böngészőbővítmények csak egy böngészőn belül tiltják az oldalakat. Ha egy oldalt <i>minden</i> böngészőben tiltani akarsz Windowson, rendszerszinten kell tiltanod. Így csinálhatod — kézzel és automatikusan.</p>
<h2>1. módszer: a hosts fájl kézi szerkesztése</h2>
<ol>
<li>Nyisd meg a Start menüt, írd be: <b>Jegyzettömb</b>, kattints rá jobb gombbal, és válaszd a <b>Futtatás rendszergazdaként</b> lehetőséget.</li>
<li>A Jegyzettömbben válaszd a <b>Fájl → Megnyitás</b> menüt, és nyisd meg a <code>C:\\Windows\\System32\\drivers\\etc\\hosts</code> fájlt (a fájlszűrőt állítsd „Minden fájl”-ra).</li>
<li>A fájl végére írj címenként egy sort, például:<br><code>0.0.0.0 youtube.com</code><br><code>0.0.0.0 www.youtube.com</code></li>
<li>Mentsd el a fájlt, majd a Parancssorban futtasd: <code>ipconfig /flushdns</code>.</li>
<li>Indítsd újra a böngészőt.</li>
</ol>
<p><b>Hátrányok:</b> mindent vagy semmit, nincs időzítő vagy ütemezés, minden aldomaint neked kell felvenned, és könnyű elfelejteni később kitörölni a sorokat.</p>
<h2>2. módszer: böngészőbővítmény</h2>
<p>Gyorsan beállítható, de csak abban a böngészőben működik, amelyikbe telepítetted — nyiss meg egy másik böngészőt, és ott az oldal. Asztali appokat, például a Steamet vagy a Discordot sem tudja tiltani.</p>
<h2>3. módszer: Halyra Focus (ingyenes, automatikus)</h2>
<p>A Halyra Focus elvégzi helyetted a hosts fájlos módszert — időzítővel, ütemezéssel és automatikus takarítással —, és az asztali appokat is tiltja.</p>
<ol>
<li><a href="{{home}}">Töltsd le a Halyra Focust</a> Windowsra, és futtasd a telepítőt.</li>
<li>Amikor kéri, engedélyezd egyszer a weboldal-tiltást (egy rendszergazdai kérés).</li>
<li>Válassz kész listát, vagy add hozzá a saját oldalaidat — a www. és m. változatokat automatikusan hozzáadja.</li>
<li>Indíts fókusz munkamenetet, vagy állíts be időzítést.</li>
</ol>
<div class="callout"><p><b>A tiltások maguk után takarítanak.</b> Amikor lejár az idő, az oldalak automatikusan feloldódnak — akkor is, ha közben bezártad vagy eltávolítottad az appot.</p><a class="btn pill sm" href="{{home}}#download">Ingyenes letöltés</a></div>
<h2>Hibaelhárítás</h2>
<ul>
<li><b>Az oldal még mindig megnyílik:</b> töltsd újra a lapot vagy indítsd újra a böngészőt — a nyitott lapok egy ideig megtarthatják a meglévő kapcsolatot.</li>
<li><b>A vírusirtó figyelmeztet a hosts fájl miatt:</b> egyes biztonsági programok figyelik a hosts fájl változásait; a Halyra Focus csak olyan sorokat ad hozzá, amelyek a tiltott oldalakat a 0.0.0.0 címre irányítják.</li>
</ul>`,
    },
  },
  notFound: { title: 'Az oldal nem található — Halyra Focus', h1: 'Ez az oldal szünetet tart.', p: 'A keresett oldal nem létezik.', back: 'Vissza a főoldalra' },
};

module.exports = { en, hu };
