# Halyra Focus — Útmutató lépésről lépésre

Ez a mappa mindent tartalmaz: a Mac- és Windows-appot, a weboldalt, és az automatikus „gyárat”, ami a GitHubon magától legyártja a letölthető telepítőket és felrakja a weboldalt. **Programozni nem kell hozzá.** Kb. 30–40 perc az első beállítás.

---

## 1. GitHub fiók és tároló (5 perc)

1. Regisztrálj a [github.com](https://github.com) oldalon (ingyenes).
2. Jobb felső **+ → New repository**.
   - Név: `halyra-focus`
   - **Public** legyen! (Csak így ingyenes a weboldal-tárhely és a letöltés mindenkinek.)
   - A többit hagyd üresen → **Create repository**.

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
- Magyar és angol nyelv.

## 8. Átnevezés (ha nem „Halyra Focus” legyen a neve)

Írd át ezekben: `package.json` (`productName`, `build.productName`), `src/shared/brand.js`, `src/shared/i18n.js` és `website-src/content.js` (szövegek). Utána új Release.

## 9. Kipróbálás a saját gépeden (opcionális)

Telepítsd a [Node.js](https://nodejs.org)-t (LTS), majd a mappában egy terminálban:

```
npm install
npm start
```
