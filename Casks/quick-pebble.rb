cask "quick-pebble" do
  arch arm: "aarch64", intel: "x64"

  version "1.2.2"
  sha256 arm:   "f62ff3c625ae95b05fcf1ec9f009d43c7eb0ccd7d16f95eefc9a5c266fe82387",
         intel: "666ada8511356ce625f94a9b5870cb83c5b0d3d9dd773173669d65b1bd5fa956"

  url "https://github.com/VirajSinghChadha/Quickpebble/releases/download/v#{version}/Quick.Pebble_#{version}_#{arch}.dmg"
  name "Quick Pebble"
  desc "Privacy-first browser with local AI and a calm design"
  homepage "https://github.com/VirajSinghChadha/Quickpebble"

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
