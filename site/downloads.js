// Keeps every download link pointing at the newest GitHub release. No edits are needed per version.
// Usage: <a data-dl="mac-arm">, data-dl="mac-intel" | "win" | "win-msi", and <span data-version>.
(() => {
  const API = "https://api.github.com/repos/VirajSinghChadha/Quickpebble/releases/latest";
  const FALLBACK = "https://github.com/VirajSinghChadha/Quickpebble/releases/latest";
  const PATTERNS = {
    "mac-arm": /_aarch64\.dmg$/,
    "mac-intel": /_x64\.dmg$/,
    win: /_x64-setup\.exe$/,
    "win-msi": /_x64_en-US\.msi$/,
  };

  const apply = (release) => {
    for (const el of document.querySelectorAll("[data-dl]")) {
      const asset = release.assets.find((a) => PATTERNS[el.dataset.dl]?.test(a.name));
      el.href = asset ? asset.browser_download_url : FALLBACK;
    }
    for (const el of document.querySelectorAll("[data-version]")) el.textContent = release.tag_name.replace(/^v/, "");
  };

  for (const el of document.querySelectorAll("[data-dl]")) el.href = FALLBACK; // safe default until the lookup returns

  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem("qp_release") || "null"); } catch { /* ignore */ }
  if (cached) apply(cached);

  fetch(API, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((release) => {
      const slim = { tag_name: release.tag_name, assets: release.assets.map((a) => ({ name: a.name, browser_download_url: a.browser_download_url })) };
      try { sessionStorage.setItem("qp_release", JSON.stringify(slim)); } catch { /* ignore */ }
      apply(slim);
    })
    .catch(() => { /* links stay on the releases page */ });

  // Highlight the button for the visitor's system.
  const ua = navigator.userAgent;
  const mine = /Windows/.test(ua) ? "win" : /Mac/.test(ua) ? "mac-arm" : null;
  if (mine) document.querySelector(`[data-dl="${mine}"]`)?.classList.add("recommended");
})();
