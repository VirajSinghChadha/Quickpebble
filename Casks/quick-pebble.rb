cask "quick-pebble" do
  arch arm: "aarch64", intel: "x64"

  version "1.1.0"
  sha256 arm:   "8e26c7caaadc3cbd685d364035c533b707b49f34c8a660c5660f4bc1c1057b9b",
         intel: "52971f93e03a73c6b37b11cae62d91144d67dc066510f6f09d3059052127ac11"

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
