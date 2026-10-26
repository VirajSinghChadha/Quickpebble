cask "quick-pebble" do
  arch arm: "arm64", intel: "x64"

  version "2.4.2"
  sha256 arm:   "117f8d64691c7cc2be49775f38b3678a3b2d381869c8c2708d2c155b7b043159",
         intel: "d366c7d5f6f8a11eb37c35c658ca946b949217c6328276ee14c69652edbd4266"

  url "https://github.com/VirajSinghChadha/Quickpebble/releases/download/v#{version}/Quick.Pebble_#{version}_#{arch}.dmg"
  name "Quick Pebble"
  desc "Privacy-first browser with local AI and a calm design"
  homepage "https://github.com/VirajSinghChadha/Quickpebble"

  livecheck do
    url :url
    strategy :github_latest
  end

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
  ]
end
