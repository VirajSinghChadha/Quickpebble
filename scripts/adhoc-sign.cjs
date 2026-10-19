// electron-builder afterSign hook. Without a paid certificate (CI builds), a macOS app would ship with a broken signature
// (Electron's own signature no longer matches once the app is repackaged), and Apple silicon refuses to run those.
// Ad-hoc signing makes the bundle internally consistent, which is also what the in-app updater verifies.
//
// One more thing matters to people: macOS ties permissions (Screen Recording, Accessibility) to the app's "designated
// requirement". A plain ad-hoc signature makes that requirement the exact build's hash, so every update looks like a different
// app and the permission has to be granted again. Here the app gets a fixed requirement instead (its bundle identifier), the
// same for every build, so a permission granted once survives updates.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const sign = (target, extra = []) => execFileSync("codesign", ["--force", "--sign", "-", ...extra, target], { stdio: "inherit" });

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  const id = context.packager.appInfo.id;
  let report = "";
  try { report = execFileSync("codesign", ["-dv", app], { stdio: ["ignore", "pipe", "pipe"] }).toString(); } catch (e) { report = String(e.stderr ?? e.message); }
  if (/Authority=/.test(report)) return; // signed with a real identity: leave it alone
  try { execFileSync("xattr", ["-cr", app]); } catch { /* codesign refuses Finder metadata (it appears in folders synced by iCloud); clearing it is harmless */ }
  // Helpers and frameworks first, each with its own identity (a fixed requirement must only be put on the main app).
  const frameworks = path.join(app, "Contents", "Frameworks");
  if (fs.existsSync(frameworks)) {
    for (const name of fs.readdirSync(frameworks)) sign(path.join(frameworks, name), ["--deep"]);
  }
  sign(app, ["--identifier", id, "--requirements", `=designated => identifier "${id}"`]);
  console.log(`  • ad-hoc signed with a fixed identity (${id}), so permissions survive updates`);
};
