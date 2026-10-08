cask "quick-pebble" do
  arch arm: "aarch64", intel: "x64"

  version "1.2.0"
  sha256 arm:   "8b68e3fda17fee566d8aab0abe7d7b7e17fadc4db51f3482a010b2922e86ac4b",
         intel: "da4e342d5b8cdfebb7fcdbb10055ca77bc0363010db10d4ff09a63bcc98fe0c7"

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
