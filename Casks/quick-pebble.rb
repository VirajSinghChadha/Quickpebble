cask "quick-pebble" do
  arch arm: "arm64", intel: "x64"

  version "2.3.0"
  sha256 arm:   "7323329d6c47b82477bdc629983c7549e94400d1fcd4867dac6ba4621e0196f9",
         intel: "73605ac684c4af757da3dc4f9133cdea1e1c2aa3d541917f7febb7f3c290a0f6"

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
