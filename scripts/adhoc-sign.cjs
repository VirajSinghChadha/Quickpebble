// electron-builder afterSign hook. Without a paid certificate (CI builds), a macOS app would ship with a broken signature
// (Electron's own signature no longer matches once the app is repackaged), and Apple silicon refuses to run those.
// Ad-hoc signing makes the bundle internally consistent, which is also what the in-app updater verifies.
const { execFileSync } = require("node:child_process");
exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  let report = "";
  try { report = execFileSync("codesign", ["-dv", app], { stdio: ["ignore", "pipe", "pipe"] }).toString(); } catch (e) { report = String(e.stderr ?? e.message); }
  if (/Authority=/.test(report)) return; // signed with a real identity: leave it alone
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  console.log("  • ad-hoc signed (no signing identity available)");
};
