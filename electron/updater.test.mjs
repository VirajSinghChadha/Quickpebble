import { describe, expect, it } from "vitest";
import { installTarget, isNewer, parseRelease, pickAsset, sha512For, versionFromTag } from "./updater.mjs";

const asset = (name, extra = {}) => ({ name, browser_download_url: `https://github.com/o/r/releases/download/v2.1.0/${name}`, size: 100, ...extra });
const release = (over = {}) => ({ tag_name: "v2.1.0", name: "Quick Pebble v2.1.0", body: "notes", html_url: "https://github.com/o/r/releases/tag/v2.1.0", draft: false, prerelease: false, assets: [asset("Quick.Pebble_2.1.0_arm64.dmg"), asset("Quick.Pebble_2.1.0_x64.dmg"), asset("Quick.Pebble_2.1.0_x64.exe"), asset("Quick.Pebble_2.1.0_x86_64.AppImage"), asset("latest-mac.yml")], ...over });

describe("versions", () => {
  it("reads plain version tags only", () => {
    expect(versionFromTag("v2.0.1")).toBe("2.0.1");
    expect(versionFromTag("2.0")).toBe("2.0");
    for (const t of ["win-v1.2", "v2.0.0-beta.1", "latest", ""]) expect(versionFromTag(t)).toBeNull();
  });
  it("compares numerically, not as text", () => {
    expect(isNewer("2.0.10", "2.0.9")).toBe(true);
    expect(isNewer("2.1", "2.0.9")).toBe(true);
    expect(isNewer("2.0.0", "2.0")).toBe(false);
    expect(isNewer("2.0.0", "2.0.1")).toBe(false);
    expect(isNewer("3", "2.9.9")).toBe(true);
  });
});

describe("release selection", () => {
  it("picks the installer for this platform and CPU", () => {
    const a = release().assets;
    expect(pickAsset(a, "darwin", "arm64").name).toBe("Quick.Pebble_2.1.0_arm64.dmg");
    expect(pickAsset(a, "darwin", "x64").name).toBe("Quick.Pebble_2.1.0_x64.dmg");
    expect(pickAsset(a, "win32", "x64").name).toBe("Quick.Pebble_2.1.0_x64.exe");
    expect(pickAsset(a, "linux", "x64").name).toMatch(/AppImage$/);
    expect(pickAsset([asset("Quick.Pebble_2.1.0_x64.exe")], "darwin", "arm64")).toBeNull();
  });
  it("ignores drafts, pre-releases, other platforms' tags and releases with no installer for this platform", () => {
    const ok = { platform: "darwin", arch: "arm64" };
    expect(parseRelease(release(), ok)).toMatchObject({ version: "2.1.0", assetName: "Quick.Pebble_2.1.0_arm64.dmg", checksumsUrl: expect.stringContaining("latest-mac.yml") });
    expect(parseRelease(release({ draft: true }), ok)).toBeNull();
    expect(parseRelease(release({ prerelease: true }), ok)).toBeNull();
    expect(parseRelease(release({ tag_name: "win-v1.5" }), ok)).toBeNull();
    expect(parseRelease(release({ assets: [asset("Quick.Pebble_2.1.0_x64.exe")] }), ok)).toBeNull();
  });
  it("refuses downloads hosted anywhere but github.com", () => {
    const evil = release({ assets: [asset("Quick.Pebble_2.1.0_arm64.dmg", { browser_download_url: "https://evil.example/Quick.Pebble_2.1.0_arm64.dmg" })] });
    expect(parseRelease(evil, { platform: "darwin", arch: "arm64" })).toBeNull();
    expect(parseRelease(evil, { platform: "darwin", arch: "arm64", allowHost: () => true })).not.toBeNull();
    expect(parseRelease(release({ assets: [asset("Quick.Pebble_2.1.0_arm64.dmg", { browser_download_url: "not a url" })] }), { platform: "darwin", arch: "arm64" })).toBeNull();
  });
});

describe("checksums and install location", () => {
  const yml = `version: 2.1.0\nfiles:\n  - url: Quick.Pebble_2.1.0_arm64.dmg\n    sha512: AAAA==\n    size: 1\n  - url: Quick.Pebble_2.1.0_x64.dmg\n    sha512: BBBB==\n    size: 2\npath: Quick.Pebble_2.1.0_arm64.dmg\nsha512: ZZZZ==\n`;
  it("finds the right file's sha512", () => {
    expect(sha512For(yml, "Quick.Pebble_2.1.0_arm64.dmg")).toBe("AAAA==");
    expect(sha512For(yml, "Quick.Pebble_2.1.0_x64.dmg")).toBe("BBBB==");
    expect(sha512For(yml, "missing.dmg")).toBeNull();
  });
  it("installs into Applications when run from a disk image or a translocated copy", () => {
    expect(installTarget("/Applications/Quick Pebble.app")).toBe("/Applications/Quick Pebble.app");
    expect(installTarget("/Users/a/Apps/Quick Pebble.app")).toBe("/Users/a/Apps/Quick Pebble.app");
    expect(installTarget("/Volumes/Quick Pebble/Quick Pebble.app")).toBe("/Applications/Quick Pebble.app");
    expect(installTarget("/private/var/folders/x/AppTranslocation/ABC/d/Quick Pebble.app")).toBe("/Applications/Quick Pebble.app");
  });
});
