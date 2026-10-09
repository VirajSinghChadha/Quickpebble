cask "quick-pebble" do
  arch arm: "aarch64", intel: "x64"

  version "1.2.1"
  sha256 arm:   "90df3c0af930630b146f398e57c9b5fe76d9aa6ad0da60ded443290c940efde8",
         intel: "418cff4acaf16802d5f028a5707cb7dc169bc0a18fb92c5adce37a16e44667f4"

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
