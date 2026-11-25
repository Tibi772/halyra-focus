// electron-builder afterPack hook.
// Without a paid Apple Developer ID the app is not signed. Apple Silicon Macs
// refuse to run binaries whose signature was broken by repackaging ("app is
// damaged"), so we re-sign the finished bundle ad-hoc. Users then only see the
// normal "unidentified developer" prompt (see README → "Opening on macOS").
// When you add a real Developer ID, remove "identity": null from package.json
// and this hook stops mattering (electron-builder signs after afterPack).
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Universal builds pack x64 and arm64 into temp folders first; only sign the merged app.
  if (/-temp$/.test(context.appOutDir)) return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  console.log(`  • ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
