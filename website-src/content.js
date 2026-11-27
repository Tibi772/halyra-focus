'use strict';
// All website copy, English + Hungarian. Edit text here, then run `npm run site`.

const en = {
  langName: 'English',
  nav: { features: 'Features', modes: 'Modes', themes: 'Themes', faq: 'FAQ', download: 'Download', signin: 'Sign in', skip: 'Skip to content' },
  themes: {
    eyebrow: 'Make it yours',
    h2: 'Sleek by default. <em>Retro</em> if you like.',
    p: 'Five built-in themes, three of them retro — a green phosphor CRT terminal, a 1-bit black & white desktop and an 80s vapor sunset. Or describe your own and let the AI style studio build it.',
    names: { midnight: 'Midnight', daylight: 'Daylight', crt: 'Retro CRT', onebit: 'Retro 1-bit', vapor: 'Retro Vapor', custom: 'Your style ✦' },
  },
  footer: {
    tagline: 'Free app & website blocker for Mac, Windows and Android. Made by Halyra.',
    product: 'Product', guides: 'Guides', legal: 'Legal', source: 'Source code', privacy: 'Privacy', language: 'Language',
  },
  privacy: {
    title: 'Privacy — Halyra Focus',
    desc: 'Halyra Focus has no analytics and no tracking. Without an account, everything stays on your computer; with one, only what is needed to sync your devices.',
    h1: 'Privacy',
    body: `<p class="meta">Last updated: November 2026</p>
<p><b>Short version: Halyra Focus has no analytics, no tracking and no ads.</b> You don’t need an account. If you choose to create one, it is used only to keep your devices in sync.</p>
<h2>The app</h2>
<ul>
<li>Your block lists, schedules, settings and statistics are stored only on your computer, in the app’s own folder.</li>
<li>Website blocking writes the domains you choose into your computer’s hosts file through a local helper. Nothing is sent over the internet.</li>
<li>To block apps, the app looks at the list of running programs on your computer. This list never leaves your computer.</li>
<li>The app does not connect to the internet by itself. The only exception is the AI, and only when you use it: the text you type into Halyra AI, the style studio or the smart setup is sent to Google’s Gemini API — through Halyra’s server if you are signed in, or straight from your computer if you added your own key — to produce the answer. Nothing else is ever sent.</li>
<li>Opening a link (for example to this website) happens in your browser.</li>
<li>Daily limits count how long a list’s apps run and, on a Mac, read the address of the front browser tab (only after you allow it). This is used only to count time on your computer and is never sent anywhere.</li>
</ul>
<h2>Optional account &amp; sync</h2>
<ul>
<li>If you sign in, we store your email address and a password hash (handled by our hosting provider, Supabase) and one record with your block lists, schedules, custom styles, a few preferences and the currently running focus session.</li>
<li>Database rules make sure only your signed-in account can read or change your record. It is not shared, sold or analysed.</li>
<li>Never synced: your statistics, PIN, AI key, usage times and the list of apps on your computer.</li>
<li>Delete everything by asking in the source repository’s issues, or simply stop using the account; signing out removes the login from the device.</li>
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
};

const hu = {
  langName: 'Magyar',
  nav: { features: 'Funkciók', modes: 'Módok', themes: 'Témák', faq: 'GYIK', download: 'Letöltés', signin: 'Belépés', skip: 'Ugrás a tartalomra' },
  themes: {
    eyebrow: 'Legyen a tiéd',
    h2: 'Alapból elegáns. <em>Retró</em>, ha szereted.',
    p: 'Öt beépített téma, ebből három retró: zöld foszforos CRT terminál, fekete-fehér 1-bites asztal és 80-as évekbeli vapor naplemente. Vagy írd le a sajátodat, és az AI stílusstúdió megépíti.',
    names: { midnight: 'Éjfél', daylight: 'Nappal', crt: 'Retró CRT', onebit: 'Retró 1-bit', vapor: 'Retró Vapor', custom: 'A te stílusod ✦' },
  },
  footer: {
    tagline: 'Ingyenes app- és weboldal-blokkoló Macre, Windowsra és Androidra. A Halyra fejlesztése.',
    product: 'Termék', guides: 'Útmutatók', legal: 'Jogi', source: 'Forráskód', privacy: 'Adatvédelem', language: 'Nyelv',
  },
  privacy: {
    title: 'Adatvédelem — Halyra Focus',
    desc: 'A Halyra Focusban nincs analitika és követés. Fiók nélkül minden a gépeden marad; fiókkal is csak az, ami a szinkronhoz kell.',
    h1: 'Adatvédelem',
    body: `<p class="meta">Utolsó frissítés: 2026. november</p>
<p><b>Röviden: a Halyra Focusban nincs analitika, követés és reklám.</b> Fiók nem kell. Ha mégis létrehozol egyet, az csak az eszközeid szinkronizálására szolgál.</p>
<h2>Az app</h2>
<ul>
<li>A tiltólistáid, időzítéseid, beállításaid és statisztikáid csak a gépeden, az app saját mappájában tárolódnak.</li>
<li>A weboldal-tiltás a kiválasztott domaineket egy helyi segédprogramon keresztül a géped hosts fájljába írja. Semmi nem megy ki az internetre.</li>
<li>Az appok tiltásához az app a gépeden futó programok listáját nézi. Ez a lista soha nem hagyja el a gépedet.</li>
<li>Az app magától nem csatlakozik az internethez. Az egyetlen kivétel az AI, és az is csak akkor, ha használod: a Halyra AI-ba, a stílusstúdióba vagy az okos beállításba írt szöveg a Google Gemini API-jához kerül — belépve a Halyra szerverén át, saját kulccsal közvetlenül a gépedről —, hogy elkészüljön a válasz. Semmi más nem megy el.</li>
<li>Ha megnyitsz egy linket (például ezt a weboldalt), az a böngésződben történik.</li>
<li>A napi keret méri, mennyi ideig futnak a lista appjai, és Macen (csak az engedélyed után) kiolvassa az elöl lévő böngészőlap címét. Ezt csak az idő számolására használja a gépeden, és sehova nem küldi el.</li>
</ul>
<h2>Opcionális fiók és szinkron</h2>
<ul>
<li>Ha belépsz, tároljuk az e-mail-címedet és a jelszavad hash-ét (ezt a tárhelyszolgáltatónk, a Supabase kezeli), valamint egyetlen rekordot a tiltólistáiddal, időzítéseiddel, saját stílusaiddal, néhány beállítással és az éppen futó fókusszal.</li>
<li>Adatbázis-szabályok biztosítják, hogy a rekordodat csak a bejelentkezett fiókod olvashassa és módosíthassa. Nem osztjuk meg, nem adjuk el és nem elemezzük.</li>
<li>Soha nem szinkronizálódik: a statisztikád, a PIN, az AI-kulcs, a használati idők és a gépeden lévő appok listája.</li>
<li>Mindent törölhetsz, ha a forráskód-tároló hibajegyeiben kéred; a kijelentkezés eltávolítja a belépést az eszközről.</li>
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
};

// Home page, FAQ, comparison and the hidden extras live in content-home.js.
const home = require('./content-home');
Object.assign(en, home.en);
Object.assign(hu, home.hu);

module.exports = { en, hu };
