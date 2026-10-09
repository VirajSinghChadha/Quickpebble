cask "quick-pebble" do
  arch arm: "aarch64", intel: "x64"

  version "1.2.3"
  sha256 arm:   "3a5f4d4ed10c50517d81b30b0d96033febc6ed8e7f855db057378feec1d26b19",
         intel: "25f306a65c6719d4ccc83ef9c2afed05fa9efb5a5ec4d5a458baf5c66961e0ac"

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
