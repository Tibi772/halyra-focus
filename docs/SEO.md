# Hogy megtalálja a Google

A weboldal technikailag már kész a kereséshez: minden oldalnak van címe, leírása,
canonical linkje, magyar/angol `hreflang` párja, Open Graph képe, strukturált
adata (SoftwareApplication + GYIK), `robots.txt` és `sitemap.xml`.

Ami ezen felül kell, azt **nem lehet kódból megcsinálni** – be kell jelentkezni
a kereső saját felületére. Ez egyszeri, kb. 10 perc.

## 1. Google Search Console (ez a legfontosabb)

1. Menj a <https://search.google.com/search-console> oldalra, lépj be Google-fiókkal.
2. "Add property" → a jobb oldali **URL prefix** dobozba írd be:
   `https://tibi772.github.io/halyra-focus/`
3. A felugró ablakban válaszd a **HTML tag** módszert. Kapsz egy sort, ilyet:
   `<meta name="google-site-verification" content="AbC123..." />`
4. A `content="..."` részt (csak a kódot, az idézőjelek közti szöveget) másold be ide:
   `website-src/site.config.json` → `verify.google`
5. Commit + push. A weboldal magától újraépül (kb. 1 perc).
6. Menj vissza a Search Console-ba és nyomd meg a **Verify** gombot.
7. Bal oldalt **Sitemaps** → add meg: `sitemap.xml` → **Submit**.
8. Fent a keresőmezőbe illeszd be a főoldal címét → **Request indexing**.
   Ezt megteheted a két útmutató oldallal is (angol + magyar).

Ezután 2–14 nap, mire megjelenik a találatok között. A Search Console
"Performance" fülén látod majd, milyen keresésekre jön be a forgalom.

## 2. Bing Webmaster Tools (a DuckDuckGo is ezt használja)

1. <https://www.bing.com/webmasters> → belépés.
2. Add hozzá ugyanazt a címet, válaszd a **meta tag** hitelesítést.
3. A kódot ide írd: `website-src/site.config.json` → `verify.bing`, majd push + Verify.
4. Sitemap beküldése: `https://tibi772.github.io/halyra-focus/sitemap.xml`

Az **IndexNow** már automatikus: minden weboldal-frissítés után a GitHub Action
szól a Bingnek/Yandexnek, hogy változtak az oldalak. A kulcs a
`site.config.json` → `indexnow` mezőben van, a kulcsfájl pedig magától kikerül
az oldal gyökerébe. (A Google az IndexNow-t nem használja.)

## 3. Amitől tényleg előrébb kerül

- **Tartalom.** Minden útmutató oldal egy külön kapu a keresőből. Most kettő van
  (Mac appok tiltása, Windows weboldalak tiltása). Minden új, valódi kérdésre
  válaszoló oldal új keresésekre hoz be embereket. Ötletek: Shorts/Reels
  kikapcsolása, TikTok tiltása Androidon, képernyőidő gyerekeknek, ingyenes
  Opal-alternatíva.
- **Hivatkozások.** Egy-egy említés Redditen, Product Hunton, fórumokon vagy a
  GitHub README-ben sokat számít egy új oldalnál.
- **Saját domain.** A `tibi772.github.io/halyra-focus/` aldomain-aloldal; egy
  saját domain (pl. `halyrafocus.com`) jobban teljesít és komolyabbnak is hat.
  Ha megveszed, csak a `site.config.json` → `domain` mezőt kell kitölteni.

## Ellenőrzés

- Indexelve van-e már: keress rá a Google-ben erre: `site:tibi772.github.io/halyra-focus`
- Hogy néz ki megosztva: <https://www.opengraph.xyz/>
- Sebesség és technikai hibák: <https://pagespeed.web.dev/>
