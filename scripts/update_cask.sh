#!/usr/bin/env bash
# Regenerates Casks/quick-pebble.rb from the DMGs attached to a GitHub release.
# Usage: scripts/update_cask.sh v1.2.3      (needs the GitHub CLI, authenticated)
set -euo pipefail

TAG="${1:?usage: update_cask.sh vX.Y.Z}"
REPO="${GITHUB_REPOSITORY:-VirajSinghChadha/Quickpebble}"
VERSION="${TAG#v}"
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gh release download "$TAG" -R "$REPO" --pattern '*.dmg' --dir "$tmp"

arm="$(ls "$tmp" | grep -E 'aarch64\.dmg$' | head -1 || true)"
intel="$(ls "$tmp" | grep -E '(x64|x86_64)\.dmg$' | head -1 || true)"
[ -n "$arm" ] && [ -n "$intel" ] || { echo "Release $TAG needs both an Apple-silicon and an Intel DMG" >&2; exit 1; }

sha() { shasum -a 256 "$tmp/$1" | cut -d' ' -f1; }
prefix="${arm%%_${VERSION}_*}"          # e.g. "Quick.Pebble"
intel_arch="${intel##*_${VERSION}_}"; intel_arch="${intel_arch%.dmg}"   # "x64"

mkdir -p Casks
cat > Casks/quick-pebble.rb <<RUBY
cask "quick-pebble" do
  arch arm: "aarch64", intel: "${intel_arch}"

  version "${VERSION}"
  sha256 arm:   "$(sha "$arm")",
         intel: "$(sha "$intel")"

  url "https://github.com/${REPO}/releases/download/v#{version}/${prefix}_#{version}_#{arch}.dmg"
  name "Quick Pebble"
  desc "Privacy-first browser with local AI and a calm design"
  homepage "https://github.com/${REPO}"

  livecheck do
    url :url
    strategy :github_latest
  end

  # The app updates itself (Settings → Updates), so Homebrew should not fight it.
  auto_updates true
  depends_on macos: ">= :big_sur"

  app "Quick Pebble.app"

  # Builds are not notarised yet; clear the quarantine flag so Gatekeeper doesn't block first launch.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Quick Pebble.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/app.quickpebble.browser",
    "~/Library/Caches/app.quickpebble.browser",
    "~/Library/Preferences/app.quickpebble.browser.plist",
    "~/Library/WebKit/app.quickpebble.browser",
  ]
end
RUBY
echo "Wrote Casks/quick-pebble.rb for ${TAG}"
