# Halyra Focus — Útmutató lépésről lépésre

Ez a mappa mindent tartalmaz: a Mac- és Windows-appot, a weboldalt, és az automatikus „gyárat”, ami a GitHubon magától legyártja a letölthető telepítőket és felrakja a weboldalt. **Programozni nem kell hozzá.** Kb. 30–40 perc az első beállítás.

---

## 1. GitHub fiók és tároló (5 perc)

1. Regisztrálj a [github.com](https://github.com) oldalon (ingyenes) — neked már van: **Tibi772**.
2. Nyisd meg: **https://github.com/new?name=halyra-focus&visibility=public**
   - Név: `halyra-focus`
   - **Public** legyen! (Csak így ingyenes a weboldal-tárhely és a letöltés mindenkinek.)
   - A többit hagyd üresen → **Create repository**.
3. **Ha azt szeretnéd, hogy Claude töltse fel és felügyelje a gyártást:** nyisd meg a https://github.com/settings/installations oldalt → **Claude** → **Configure** → a „Repository access” résznél add hozzá a `halyra-focus` tárolót → **Save**. Utána szólj Claude-nak, és ő feltölt mindent (a 2. lépést kihagyhatod).

## 2. A fájlok feltöltése (10 perc)

A legegyszerűbb a **GitHub Desktop** programmal ([desktop.github.com](https://desktop.github.com)):

1. Telepítsd, jelentkezz be.
2. **File → Clone repository** → válaszd a `halyra-focus` tárolót → Clone.
3. Csomagold ki a zip-et, és **a teljes tartalmát** másold be a klónozott mappába.
   - Fontos: a `.github` mappa is menjen át (Macen rejtett — a Finderben `Cmd + Shift + .` mutatja).
4. A GitHub Desktopban írj be valamit a Summary mezőbe (pl. „Első verzió”) → **Commit to main** → **Push origin**.

## 3. Minden más automatikus

Minden feltöltés (push) után a GitHub magától:

- legyártja a Mac (`HalyraFocus-mac.dmg`) és a Windows (`HalyraFocus-Setup.exe`) telepítőt (15–20 perc),
- **valódi Macen és Windowson lefuttatja az app öntesztjét**: elindítja az appot, megnyit egy tiltott appot és ellenőrzi, hogy bezárul-e, letilt egy weboldalt és ellenőrzi, hogy tényleg nem tölt be, majd képernyőképeket készít,
- közzéteszi a telepítőket kiadásként (`v` + a `package.json` verziószáma),
- felrakja a weboldalt: `https://FELHASZNÁLÓNEVED.github.io/halyra-focus/`.

A weboldal letöltés gombjai **mindig a legfrissebb kiadásra** mutatnak.

> Ha a weboldal pár perc után sem jelenik meg: **Settings → Pages → Branch: `gh-pages`** → Save.
> Ha piros X van az **Actions** fülön: kattints rá, és küldd el nekem a hibát.

**Új verzió:** írd át a `package.json`-ban a `"version"` számot (pl. `1.0.1`), és töltsd fel.

## 3/b. Fiók és szinkron bekapcsolása (10 perc, ingyenes)

Az app és a weboldal fiók nélkül is teljesen működik. Ha azt szeretnéd, hogy a felhasználók **be tudjanak jelentkezni** (minden gépükön ugyanaz legyen a tiltás, és a telefonjukról is indíthassák), ehhez egy ingyenes Supabase-projekt kell:

1. Regisztrálj: [supabase.com](https://supabase.com) → **New project** (név: `halyra-focus`, régió: Central EU (Frankfurt), adj meg egy erős adatbázis-jelszót).
2. Bal oldalt **SQL Editor** → **New query** → másold be a `docs/supabase.sql` fájl teljes tartalmát → **Run**. (Ez létrehozza a szinkron-táblát, és beállítja, hogy mindenki csak a saját adatát lássa.)
3. **Authentication → Sign In / Providers → Email**: maradjon bekapcsolva. (A „Confirm email” mehet bekapcsolva — ekkor a regisztráció után egy megerősítő e-mailt kapnak.)
4. **Authentication → URL Configuration → Site URL**: írd be a weboldalad címét + `/app/` (pl. `https://tibi772.github.io/halyra-focus/app/`). Ide viszi vissza a felhasználót a megerősítő és a jelszó-visszaállító link.
5. **Project Settings → API**: másold ki a **Project URL**-t és az **anon public** kulcsot, és írd be a `src/shared/cloud.json` fájlba:
   ```json
   { "url": "https://xxxx.supabase.co", "anonKey": "eyJhbGciOi..." }
   ```
   (Az anon kulcs nyilvános kulcs, nyugodtan lehet a kódban — a táblát a 2. lépés szabályai védik.)
6. Töltsd fel (push). Az új verzióban megjelenik a **Beállítások → Fiók és szinkron** kártya, a weboldalon pedig a **Belépés** gomb működni kezd.

**Webapp (telefonra is):** `https://…/halyra-focus/app/` — belépés után innen indítható a fókusz az összes gépen, szerkeszthetők a listák és a napi keretek. iPhone-on: Megosztás → **Főképernyőhöz adás**, Androidon: menü → **Alkalmazás telepítése**, és appként ott lesz a kezdőképernyőn.

## 3/c. Halyra AI mindenkinek (opcionális, fizetős API)

A Halyra AI (✦ gomb az appban, Ctrl/⌘ K) bármire válaszol, keres a weben, és **ki is tudja adni a parancsokat** („tiltsd le a Redditet 18 óráig szigorúan”, „csinálj hétköznapi tanulási időbeosztást”). Három módban fut:

1. **Saját kulccsal** — a felhasználó a Beállítások → Halyra AI kártyán beírja a saját Anthropic API-kulcsát. Ez már most működik.
2. **A te szervereden át (belépett felhasználóknak)** — nem kell nekik kulcs, te fizeted az API-t, és havonta 10 üzenetet kapnak ingyen (Pro-ban napi 50-et). Bekapcsolás:
   1. Előbb legyen kész a 3/b (Supabase).
   2. Supabase → **SQL Editor** → futtasd le a `docs/supabase-ai.sql` tartalmát.
   3. [console.anthropic.com](https://console.anthropic.com) → API keys → új kulcs. (Billing alatt állíts be havi költséglimitet!)
   4. GitHubon: **Settings → Secrets and variables → Actions → New repository secret**, három darab: `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens), `SUPABASE_PROJECT_REF` (a `https://XXXX.supabase.co` címben az XXXX), `ANTHROPIC_API_KEY`.
   5. **Actions → Halyra AI server → Run workflow.** Ez feltölti a `supabase/functions/halyra-ai` szervert. Keret: alapból havi 10 üzenet ingyen, napi 50 Pro-ban (`FREE_MONTHLY`, `PRO_DAILY` titkokkal állítható). Az árazási javaslat a Claude-ban készült dokumentumban van.
   6. Pro felhasználó kézzel: SQL Editorban `insert into halyra_plans (user_id, until) values ('<user id>', now() + interval '1 month');` (fizetéshez lásd az árazási javaslatot).
3. **Offline** — se kulcs, se szerver: az alap parancsokat így is érti (fókusz indítása, oldalak tiltása, statisztika), csak kérdésekre nem válaszol.

## 4. Saját domain (opcionális, kb. 3–15 €/év)

Ingyen is működik a `github.io` címen, de saját domainnel profibb és jobban kereshető.

1. Vásárold meg (pl. Cloudflare, Namecheap, Porkbun; `.hu` esetén egy magyar regisztrátornál). Javaslatok — **előbb nézd meg, szabad-e**: `halyrafocus.com`, `halyrafocus.app`, `halyra.app`, `halyrafocus.hu`.
2. A domain DNS-beállításainál vedd fel:
   - 4 db **A** rekord a `@`-ra: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - 1 db **CNAME** rekord: `www` → `FELHASZNÁLÓNEVED.github.io`
3. GitHubon: **Settings → Pages → Custom domain** → írd be a domaint → Save → pipáld be az **Enforce HTTPS**-t (ha még szürke, várj pár órát).
4. A `website-src/site.config.json` fájlban írd át: `"domain": "a-te-domained.com"` → töltsd fel (Push). Így a Google-nek szóló címek is jók lesznek.
5. Az appban a „Weboldal” gomb a `src/shared/brand.js` fájlban lévő címre mutat (`website: ...`) — ezt is írd át a saját domainedre.

## 5. Hogy rá lehessen keresni (Google)

Az oldal már keresőoptimalizált: magyar + angol változat, leírások, megosztási képek, sitemap, strukturált adatok, két-két útmutató cikk („Appok tiltása Macen”, „Weboldalak tiltása Windowson”). Ezek kellenek még:

1. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console)) → tulajdon hozzáadása → ellenőrzés → **Sitemaps** → beküldés: `sitemap.xml`.
2. **Bing Webmaster Tools** → „Import from Google Search Console” (1 kattintás).
3. Linkek szerzése (ez hozza a forgalmat):
   - Reddit: r/productivity, r/macapps, r/software, r/getdisciplined — olvasd el a szabályaikat a saját termék posztolásáról.
   - [AlternativeTo](https://alternativeto.net): add hozzá alternatívaként a Cold Turkey / SelfControl / Freedom mellé.
   - Product Hunt indulás.
   - TikTok: a weboldal 3D-s városa és a retró témák (CRT, 1-bit, Vapor) nagyon jól mutatnak videón.

## 6. A felhasználók első indítása (fontos tudni)

Az app jelenleg nincs fizetős tanúsítvánnyal aláírva, ezért első indításkor figyelmeztetés jön. Ez normális, a weboldalon le van írva a megoldás:

- **Mac:** Rendszerbeállítások → Adatvédelem és biztonság → „Megnyitás mégis” (Open Anyway).
- **Windows:** „További információ” → „Futtatás mindenképp” (More info → Run anyway).

Ha később eltüntetnéd: Apple Developer Program (kb. 99 USD/év) + Windows kódaláíró tanúsítvány. A `README.md` „Code signing” része leírja, hova kell beírni.

## 7. Mit tud az app

- Appok tiltása (Steam, Discord, játékok, bármi) — megnyitáskor azonnal bezárja, egy rövid értesítő sávval.
- Weboldalak tiltása **minden böngészőben** (egyszeri jelszómegadás után).
- Kész listák: közösségi média, videó, játékok, chat, hírek (magyar oldalakkal is), vásárlás, zene.
- Fókusz munkamenet (25/50/90 perc, egyéni), Pomodoro szünetekkel, +15 perc.
- Időzítések (napok + idősáv, éjfélen át is), mindegyik saját szigorúsággal.
- **Bármikor kikapcsolható:** Laza (1 kattintás), Türelmes (60 mp várakozás), Zárolt (vészkijárat: 120 karakter begépelése + 5 perc várakozás).
- Magától lejáró weboldal-tiltás: akkor is feloldódik az idő végén, ha az appot közben törölték.
- PIN-zár, statisztika (helyben tárolva), indítás bejelentkezéskor, menüsor/tálca visszaszámláló.
- 5 téma: Éjfél, Nappal, **Retró CRT**, **Retró 1-bit**, **Retró Vapor** — saját, ékezetes pixel betűtípussal.
- **AI stílusstúdió:** írd le, milyen legyen (pl. „neon tokiói éjszaka”), és megtervezi a saját témádat — színek, betű, sarkok, háttéreffekt, mindig jól olvasható kontraszttal. Finomhangolható, korlátlanul menthető.
- **Okos, határozott fókusz-coach:** megmondod, min dolgozol, ő beállítja a tiltást (mit, mennyi ideig, milyen szigorúan). Ha idő előtt kiszállnál, konkrétan megmondja, mit adsz fel. A statisztikádból tippeket ad (pl. a leggyengébb órád automatikus tiltása).
- Az AI alapból offline működik. Ha a Beállítások → AI résznél megadsz egy saját Anthropic API-kulcsot (console.anthropic.com), Claude AI-t használ.
- **Napi keret** listánként (pl. YouTube napi 30 perc): méri az appok futási idejét és azt, amíg a lista egyik weboldala az elöl lévő böngészőlap; ha elfogy, éjfélig tiltva.
- **Fókuszhangok:** eső, hullámok, barna zaj, kávézó, kandalló, fehér zaj — az app generálja, a tiltással együtt indul.
- **Fiók és szinkron (opcionális):** e-mailes belépés, a listák, időzítések, stílusok és a futó fókusz minden gépen ugyanaz. Zárolt tiltást másik eszközről sem lehet leállítani.
- **Webapp telefonra:** a weboldal `/app/` oldalán, ugyanazzal a fiókkal — innen is indítható a fókusz az összes gépen.
- Nyugodt tiltóképernyő rövid, motiváló mondatokkal.
- **Mindig aktív pajzs (1.5-től):** bármelyik listát „Mindig” típusúra állíthatod — fókusz nélkül, éjjel-nappal tilt. Kész lista: *Felnőtt tartalom pajzs* (60+ oldal, pornós kulcsszavak, kötelező SafeSearch) és *Szerencsejáték*.
- **Kulcsszavas tiltás:** ha egy fül címében vagy a címsorban szerepel egy tiltott szó (pl. „kaszinó”), bezárja (Macen és Windowson).
- **Kötelező SafeSearch:** Google, Bing és YouTube biztonságos módban, minden böngészőben (hosts + Windowson böngésző-szabály, Androidon a DNS-szűrő).
- **Türelmi idő:** 1/24/72 óra várakozás, mielőtt egy mindig aktív listán lazítani lehetne (Beállítások → Kikapcsolás). Minden eszközön együtt működik, a webappról sem lehet kikerülni.
- **Ki kell érdemelni:** a „ki kell érdemelni” listák (pl. játékok) zárva vannak; a fókusz perceket ad, amiket 5/10/15 percre el lehet költeni rájuk — az appban vagy a tiltóoldalon.
- **Halyra AI (⌘K / Ctrl K):** bármire válaszol (webes kereséssel), és beállítja a tiltásokat, listákat, időzítéseket, pajzsot, kereteket.
- Magyar és angol nyelv.

**Frissítés után:** a weboldal-tiltó segédprogram új verziót kapott (SafeSearch miatt). Az app szól, ha frissíteni kell — ilyenkor Beállítások → Weboldal-tiltás → *Frissítés* (egyszer kér jelszót).

**A weboldal titkai:** a főoldalon 9 rejtett meglepetés van (pl. ↑ ↑ ↓ ↓ ← → ← → B A, vagy írd be bárhol, hogy „fokusz”). Tipp a böngésző konzoljában: `halyra.secret()`.

## 7/b. Telefon: Android és iPhone

**Android:** a teljes app (`android/` mappa). Minden feltöltés után a GitHub legyártja a `HalyraFocus-Android.apk` fájlt, egy Android 14 emulátoron végigteszteli (valódi app- és weboldal-tiltás, zárolt mód, napi keret, háttérben futás), és csak akkor teszi ki letöltésre, ha minden zöld. A weboldal **Letöltés Androidra** gombja ezt tölti le.
- Első indításkor 2 engedély kell az app-tiltáshoz (használati hozzáférés, megjelenítés más appok felett), 1 a weboldalakhoz (helyi VPN-szűrő — a forgalom nem megy sehova).
- A tiltás akkor is működik, ha az app be van zárva, és újraindítás után is.
- Az APK aláíró kulcsa az `android/signing/halyra-focus.jks`. Mielőtt sokan használják, érdemes saját, titkos kulcsra cserélni (GitHub Secrets: `HF_KEYSTORE…`), mert a nyilvános tárolóban lévő kulcsot bárki láthatja. Ha szólsz, Claude átállítja.
- Google Play-re feltöltéshez Google fejlesztői fiók kell (egyszeri 25 $), és a Play külön ellenőrzi a VPN- és használati engedélyeket.

**iPhone:** az Apple más appok tiltását csak a *Family Controls* engedéllyel rendelkező appoknak engedi. Ehhez kell: Apple Developer Program tagság (99 $/év, a te nevedre), az engedély igénylése az Apple-től, és App Store-ellenőrzés. Ha ezek megvannak, az iPhone-app elkészíthető. Addig iPhone-on a webapp (`/app/`) működik: onnan indítható a tiltás az összes gépen és androidos telefonon.

## 8. Átnevezés (ha nem „Halyra Focus” legyen a neve)

Írd át ezekben: `package.json` (`productName`, `build.productName`), `src/shared/brand.js`, `src/shared/i18n.js` és `website-src/content.js` (szövegek). Utána új Release.

## 9. Kipróbálás a saját gépeden (opcionális)

Telepítsd a [Node.js](https://nodejs.org)-t (LTS), majd a mappában egy terminálban:

```
npm install
npm start
```
