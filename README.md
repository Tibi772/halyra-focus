# Halyra Focus

**Free app & website blocker for macOS and Windows.** Focus sessions, Pomodoro, schedules, three strictness modes (you can always turn it off — or lock it), local-only stats and five themes, three of them retro.

No account. No tracking. MIT licensed.

| | |
|---|---|
| Platforms | macOS 12+ (Apple Silicon & Intel, universal build) · Windows 10/11 x64 |
| Blocks | Desktop apps (closed on launch) · Websites in every browser (system hosts file) |
| Modes | Flexible (stop anytime) · Patient (stop after a pause) · Locked (stop after timer, emergency exit) |
| Extras | Schedules incl. overnight · Pomodoro · PIN lock · Tray/menu-bar timer · Stats · EN/HU UI |

## How blocking works

**Apps.** While a block is active the app lists running processes every ~2 s (`ps` on macOS, `tasklist` on Windows) and terminates the ones on your lists. macOS apps are matched by bundle name (`/Discord.app/`), Windows apps by executable (`Discord.exe`). System processes and the app itself are never touched.

**Websites.** A tiny helper is installed once with an admin prompt:

- macOS: a `launchd` daemon (`/Library/LaunchDaemons/com.halyra.focus.helper.plist`) runs `helper.sh` as root whenever `/Users/Shared/HalyraFocus/blocklist.txt` changes and every 60 s.
- Windows: a SYSTEM scheduled task runs `C:\ProgramData\HalyraFocus\helper.ps1`, which polls `blocklist.txt` every 2 s.

The app only ever writes a plain list of domains to that user-writable file. The helper validates every line against a strict domain regex and writes `0.0.0.0 <domain>` / `:: <domain>` lines inside its own marked section of the hosts file — so the worst a rogue process can do with the file is block extra sites; it can never redirect a domain. The file carries an `# expires=<unix time>` line: the helper drops the blocks by itself when it passes, so **a website block can never outlive its timer**, even if the app is force-quit or deleted. Uninstalling the helper (Settings → Website blocking → Remove helper) cleans the hosts file.

## Develop

```bash
npm install
npm start            # run the app
npm test             # unit tests + main-process smoke test (no Electron needed)
npm run preview:ui   # UI in a normal browser with a fake API → preview/renderer/index.html
npm run site         # build the website → website/
```

Code map:

```
src/core/       pure logic, unit-tested: schedules, engine, domains, hosts, unlock modes, stats, helper scripts
src/main/       Electron main process: main.js (windows, tray, IPC, blocking loop), platform.js (OS specifics)
src/renderer/   UI (vanilla JS), 5 themes, custom "Halyra Pixel" font, block overlay
src/shared/     brand + EN/HU translations (used by main and UI)
website-src/    static site generator (content.js has all copy) + assets
tools/          font generator, UI preview
build/          icons, ad-hoc signing hook, NSIS uninstall hook
```

## Release

Every push to `main` runs **Build, test & release**: it builds `HalyraFocus-mac.dmg` (universal) and `HalyraFocus-Setup.exe`, runs the end-to-end self-test of the packaged app on real macOS and Windows runners (`--selftest`: UI, themes, app blocking, website blocking through the helper incl. DNS and connection checks, locked mode, helper removal — screenshots and `results.json` are uploaded as artifacts), and publishes the installers as release `v<version>` (bump `version` in `package.json` for a new release). The website links to `releases/latest/download/…`, so it always serves the newest build.

The website is built and pushed to the `gh-pages` branch on every push to `main` (GitHub Pages serves that branch). For a custom domain set `"domain"` in `website-src/site.config.json` and add it under Settings → Pages.

### Code signing

Builds are unsigned (macOS builds are ad-hoc signed so they run on Apple Silicon). Users see a one-time Gatekeeper / SmartScreen prompt. To sign: join the Apple Developer Program, add `CSC_LINK`/`CSC_KEY_PASSWORD` (+ notarization credentials) as repository secrets, and remove `"identity": null` from `package.json`. For Windows, add a code-signing certificate the same way.

## License

MIT © 2026 Halyra. Inter font: SIL Open Font License. "Halyra Pixel" font: original, part of this project.
