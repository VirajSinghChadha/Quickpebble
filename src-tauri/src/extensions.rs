//! Chrome extension support: install from the Chrome Web Store or a `.crx` file and run the
//! extension's **content scripts** natively.
//!
//! System webviews (WKWebView / WebView2) cannot host Chrome's extension runtime, so this is a
//! deliberately small compatibility layer: content scripts, CSS and `chrome.storage` work;
//! background workers, popups and the `chrome.tabs`-style APIs do not. Installs are therefore
//! reported with explicit warnings, and every extension starts **disabled**.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{Cursor, Read, Write},
    path::{Component, Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const MAX_CRX_BYTES: usize = 60 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 100 * 1024 * 1024;
const MAX_FILES: usize = 3000;
const SHIM: &str = include_str!("ext_shim.js");

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub enabled: bool,
    pub hosts: Vec<String>,
    pub permissions: Vec<String>,
    pub has_content_scripts: bool,
    pub warnings: Vec<String>,
    pub source: String,
}

pub fn root_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("extensions");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && id.chars().all(|c| matches!(c, 'a'..='z' | '0'..='9' | '-' | '_'))
}

/// Chrome extension ids are 32 chars in a–p.
fn is_store_id(s: &str) -> bool {
    s.len() == 32 && s.chars().all(|c| ('a'..='p').contains(&c))
}

/// Accepts a bare id or a Chrome Web Store URL and returns the extension id.
pub fn store_id_from_input(input: &str) -> Option<String> {
    let s = input.trim();
    if is_store_id(s) {
        return Some(s.to_string());
    }
    let u = url::Url::parse(s).ok()?;
    let host = u.host_str()?;
    if host != "chromewebstore.google.com" && !(host == "chrome.google.com" && u.path().starts_with("/webstore")) {
        return None;
    }
    u.path_segments()?.find(|seg| is_store_id(seg)).map(String::from)
}

/// Strips the CRX header and returns the embedded ZIP bytes (plain ZIPs pass through).
pub fn crx_zip_bytes(data: &[u8]) -> Result<&[u8], String> {
    if data.starts_with(b"PK") {
        return Ok(data);
    }
    if data.len() < 16 || &data[0..4] != b"Cr24" {
        return Err("Not a Chrome extension (.crx) file".into());
    }
    let u32_at = |o: usize| u32::from_le_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]) as usize;
    let start = match u32_at(4) {
        3 => 12usize.checked_add(u32_at(8)),
        2 => 16usize.checked_add(u32_at(8)).and_then(|v| v.checked_add(u32_at(12))),
        v => return Err(format!("Unsupported CRX version {v}")),
    }
    .ok_or("Corrupt CRX header")?;
    data.get(start..).filter(|z| !z.is_empty()).ok_or_else(|| "Corrupt CRX header".to_string())
}

fn unpack(zip_bytes: &[u8], dest: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("Bad archive: {e}"))?;
    if archive.len() > MAX_FILES {
        return Err("Archive has too many files".into());
    }
    let mut total: u64 = 0;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = f.enclosed_name() else { continue }; // rejects absolute paths and `..`
        let out = dest.join(rel);
        if f.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        // Count what is actually written, not what the header claims.
        let mut buf = Vec::new();
        (&mut f).take(MAX_UNPACKED_BYTES + 1).read_to_end(&mut buf).map_err(|e| e.to_string())?;
        total += buf.len() as u64;
        if total > MAX_UNPACKED_BYTES {
            return Err("Extension is too large when unpacked".into());
        }
        fs::File::create(&out).and_then(|mut o| o.write_all(&buf)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn resolve_msg(dir: &Path, manifest: &Value, text: &str) -> String {
    let Some(key) = text.strip_prefix("__MSG_").and_then(|t| t.strip_suffix("__")) else {
        return text.to_string();
    };
    let loc = manifest["default_locale"].as_str().unwrap_or("en");
    for l in [loc, "en"] {
        if let Ok(raw) = fs::read_to_string(dir.join("_locales").join(l).join("messages.json")) {
            if let Ok(Value::Object(m)) = serde_json::from_str::<Value>(&raw) {
                if let Some(msg) = m.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).and_then(|(_, v)| v["message"].as_str()) {
                    return msg.to_string();
                }
            }
        }
    }
    key.to_string()
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

fn build_info(dir: &Path, id: &str, source: &str) -> Result<ExtensionInfo, String> {
    let raw = fs::read_to_string(dir.join("manifest.json")).map_err(|_| "manifest.json is missing")?;
    let m: Value = serde_json::from_str(raw.trim_start_matches('\u{feff}')).map_err(|e| format!("Invalid manifest: {e}"))?;
    let name = resolve_msg(dir, &m, m["name"].as_str().ok_or("Manifest has no name")?);
    let mut perms = strings(&m["permissions"]);
    let mut hosts = strings(&m["host_permissions"]);
    perms.retain(|p| {
        if p.contains("://") || p == "<all_urls>" {
            hosts.push(p.clone());
            false
        } else {
            true
        }
    });
    let scripts = m["content_scripts"].as_array().cloned().unwrap_or_default();
    for cs in &scripts {
        hosts.extend(strings(&cs["matches"]));
    }
    hosts.sort();
    hosts.dedup();

    let mut warnings = vec![];
    if m["background"].is_object() {
        warnings.push("Has a background worker, which Quick Pebble does not run.".into());
    }
    if m["action"]["default_popup"].is_string() || m["browser_action"]["default_popup"].is_string() {
        warnings.push("Its toolbar popup is not supported.".into());
    }
    let unsupported: Vec<_> = perms.iter().filter(|p| !matches!(p.as_str(), "storage" | "unlimitedStorage" | "activeTab" | "scripting")).cloned().collect();
    if !unsupported.is_empty() {
        warnings.push(format!("Uses browser APIs that are unavailable here: {}.", unsupported.join(", ")));
    }
    if scripts.is_empty() {
        warnings.push("Has no content scripts, so it has nothing that can run in Quick Pebble.".into());
    }
    Ok(ExtensionInfo {
        id: id.into(),
        name,
        version: m["version"].as_str().unwrap_or("0").into(),
        description: resolve_msg(dir, &m, m["description"].as_str().unwrap_or("")),
        enabled: false,
        hosts,
        permissions: perms,
        has_content_scripts: !scripts.is_empty(),
        warnings,
        source: source.into(),
    })
}

fn slug(name: &str) -> String {
    let s: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    let s: String = s.chars().take(40).collect();
    if s.is_empty() { "extension".into() } else { s }
}

fn write_meta(dir: &Path, info: &ExtensionInfo) -> Result<(), String> {
    fs::write(dir.join(".qp-meta.json"), serde_json::to_vec_pretty(info).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn read_meta(dir: &Path) -> Option<ExtensionInfo> {
    serde_json::from_slice(&fs::read(dir.join(".qp-meta.json")).ok()?).ok()
}

/// Unpacks `bytes` into `root/<id>` (installed disabled) and returns its description.
pub fn install_bytes(root: &Path, bytes: &[u8], id_hint: Option<&str>, source: &str) -> Result<ExtensionInfo, String> {
    let zip = crx_zip_bytes(bytes)?;
    let stage = root.join(format!(".staging-{}", std::process::id()));
    let _ = fs::remove_dir_all(&stage);
    fs::create_dir_all(&stage).map_err(|e| e.to_string())?;
    let result = (|| {
        unpack(zip, &stage)?;
        let probe = build_info(&stage, "tmp", source)?;
        let id = id_hint.map(String::from).unwrap_or_else(|| format!("local-{}", slug(&probe.name)));
        if !valid_id(&id) {
            return Err("Invalid extension id".to_string());
        }
        let info = ExtensionInfo { id: id.clone(), ..probe };
        write_meta(&stage, &info)?;
        let dest = root.join(&id);
        let _ = fs::remove_dir_all(&dest);
        fs::rename(&stage, &dest).map_err(|e| e.to_string())?;
        Ok(info)
    })();
    let _ = fs::remove_dir_all(&stage);
    result
}

pub fn list(root: &Path) -> Vec<ExtensionInfo> {
    let mut out: Vec<_> = fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| read_meta(&e.path()))
        .collect();
    out.sort_by_key(|e| e.name.to_lowercase());
    out
}

pub fn set_enabled(root: &Path, id: &str, enabled: bool) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid id".into());
    }
    let dir = root.join(id);
    let mut info = read_meta(&dir).ok_or("Extension not found")?;
    info.enabled = enabled;
    write_meta(&dir, &info)
}

pub fn remove(root: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid id".into());
    }
    fs::remove_dir_all(root.join(id)).map_err(|e| e.to_string())
}

fn safe_rel(p: &str) -> Option<PathBuf> {
    let path = Path::new(p.trim_start_matches('/'));
    path.components().all(|c| matches!(c, Component::Normal(_))).then(|| path.to_path_buf())
}

/// One init script per content-script entry of every enabled extension.
pub fn init_scripts(root: &Path) -> Vec<String> {
    let mut out = vec![];
    for info in list(root).into_iter().filter(|i| i.enabled) {
        let dir = root.join(&info.id);
        let Ok(raw) = fs::read_to_string(dir.join("manifest.json")) else { continue };
        let Ok(m) = serde_json::from_str::<Value>(raw.trim_start_matches('\u{feff}')) else { continue };
        let manifest_json = serde_json::json!({
            "name": info.name, "version": info.version, "manifest_version": m["manifest_version"]
        })
        .to_string();
        for cs in m["content_scripts"].as_array().cloned().unwrap_or_default() {
            let read_all = |key: &str| -> String {
                strings(&cs[key])
                    .iter()
                    .filter_map(|f| safe_rel(f))
                    .filter_map(|rel| fs::read_to_string(dir.join(rel)).ok())
                    .collect::<Vec<_>>()
                    .join("\n;\n")
            };
            let (js, css) = (read_all("js"), read_all("css"));
            if js.is_empty() && css.is_empty() {
                continue;
            }
            let run_at = cs["run_at"].as_str().unwrap_or("document_idle");
            out.push(fill(
                SCRIPT_TEMPLATE,
                &[
                    ("__SHIM__", SHIM.to_string()),
                    ("__ID__", serde_json::to_string(&info.id).unwrap()),
                    ("__MANIFEST__", manifest_json.clone()),
                    ("__MATCHES__", serde_json::to_string(&strings(&cs["matches"])).unwrap()),
                    ("__EXCLUDES__", serde_json::to_string(&strings(&cs["exclude_matches"])).unwrap()),
                    ("__ALL_FRAMES__", (if cs["all_frames"].as_bool().unwrap_or(false) { "true" } else { "false" }).to_string()),
                    ("__RUN_AT__", serde_json::to_string(run_at).unwrap()),
                    ("__CSS__", serde_json::to_string(&css).unwrap()),
                    ("__CODE__", js),
                ],
            ));
        }
    }
    out
}

/// Single left-to-right pass so substituted text (page CSS, extension code) is never re-scanned.
fn fill(template: &str, vars: &[(&str, String)]) -> String {
    let mut out = String::with_capacity(template.len() + 4096);
    let mut rest = template;
    'outer: while !rest.is_empty() {
        for (k, v) in vars {
            if let Some(tail) = rest.strip_prefix(k) {
                out.push_str(v);
                rest = tail;
                continue 'outer;
            }
        }
        let ch = rest.chars().next().unwrap();
        out.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    out
}

const SCRIPT_TEMPLATE: &str = r#"(function () {
  try {
    if (!__ALL_FRAMES__ && window.top !== window) return;
    function compile(p) {
      if (p === "<all_urls>") return function (u) { return /^(https?|file|ftp):$/.test(u.protocol); };
      var m = /^(\*|https?|file|ftp):\/\/([^\/]*)(\/.*)$/.exec(p);
      if (!m) return function () { return false; };
      var esc = function (s) { return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"); };
      var scheme = m[1], host = m[2], path = new RegExp("^" + m[3].split("*").map(esc).join(".*") + "$");
      return function (u) {
        var proto = u.protocol.slice(0, -1);
        if (scheme === "*" ? !/^https?$/.test(proto) : scheme !== proto) return false;
        if (host !== "*" && host !== "") {
          if (host.indexOf("*.") === 0) { var base = host.slice(2); if (u.hostname !== base && !u.hostname.endsWith("." + base)) return false; }
          else if (u.hostname !== host) return false;
        }
        return path.test(u.pathname + u.search);
      };
    }
    var url = new URL(location.href);
    var any = function (list) { return list.some(function (p) { return compile(p)(url); }); };
    if (!any(__MATCHES__) || any(__EXCLUDES__)) return;
    var shim = (__SHIM__)(__ID__, __MANIFEST__);
    var css = __CSS__;
    var injectCss = function () {
      if (!css) return;
      var s = document.createElement("style");
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    var runCode = function () {
      (function (chrome, browser) {
__CODE__
      }).call(window, shim, shim);
    };
    var go = function () { injectCss(); runCode(); };
    var when = __RUN_AT__;
    if (when === "document_start") go();
    else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
    else go();
  } catch (e) { console.debug("[Quick Pebble] extension failed to start", e); }
})();"#;

// ------------------------------------------------------------------------------------------
// Commands
// ------------------------------------------------------------------------------------------

#[tauri::command]
pub fn extension_list(app: AppHandle) -> Result<Vec<ExtensionInfo>, String> {
    Ok(list(&root_dir(&app)?))
}

#[tauri::command]
pub async fn extension_install_store(app: AppHandle, input: String) -> Result<ExtensionInfo, String> {
    let id = store_id_from_input(&input).ok_or("Paste a Chrome Web Store link or a 32-letter extension id")?;
    let url = format!(
        "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.0.0&acceptformat=crx2,crx3&x=id%3D{id}%26installsource%3Dondemand%26uc"
    );
    let resp = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("The Chrome Web Store did not return this extension (HTTP {})", resp.status()));
    }
    if resp.content_length().map(|n| n as usize > MAX_CRX_BYTES).unwrap_or(false) {
        return Err("Extension download is too large".into());
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Download failed: {e}"))?;
    if bytes.len() > MAX_CRX_BYTES {
        return Err("Extension download is too large".into());
    }
    let root = root_dir(&app)?;
    install_bytes(&root, &bytes, Some(&id), "chrome-web-store")
}

/// Opens a native file picker for a `.crx` and installs the chosen file. `None` = cancelled.
#[tauri::command]
pub async fn extension_install_file(app: AppHandle) -> Result<Option<ExtensionInfo>, String> {
    use tauri_plugin_dialog::DialogExt;
    let handle = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        handle.dialog().file().add_filter("Chrome extension", &["crx", "zip"]).blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() as usize > MAX_CRX_BYTES {
        return Err("File is too large".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    install_bytes(&root_dir(&app)?, &bytes, None, "file").map(Some)
}

#[tauri::command]
pub fn extension_set_enabled(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    set_enabled(&root_dir(&app)?, &id, enabled)
}

#[tauri::command]
pub fn extension_remove(app: AppHandle, id: String) -> Result<(), String> {
    remove(&root_dir(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_zip(files: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        let mut w = zip::ZipWriter::new(&mut buf);
        for (name, body) in files {
            w.start_file(*name, zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)).unwrap();
            w.write_all(body.as_bytes()).unwrap();
        }
        w.finish().unwrap();
        buf.into_inner()
    }

    fn crx3(zip: &[u8]) -> Vec<u8> {
        let mut v = b"Cr24".to_vec();
        v.extend(3u32.to_le_bytes());
        v.extend(4u32.to_le_bytes());
        v.extend([0u8; 4]);
        v.extend(zip);
        v
    }

    const MANIFEST: &str = r#"{"manifest_version":3,"name":"Demo Ext","version":"1.2",
        "permissions":["storage","tabs"],"background":{"service_worker":"b.js"},
        "content_scripts":[{"matches":["https://*.example.com/*"],"js":["c.js"],"css":["c.css"]}]}"#;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("qp-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn parses_store_inputs() {
        let id = "abcdefghijklmnopabcdefghijklmnop";
        assert_eq!(store_id_from_input(id).as_deref(), Some(id));
        assert_eq!(store_id_from_input(&format!("https://chromewebstore.google.com/detail/some-name/{id}?hl=en")).as_deref(), Some(id));
        assert_eq!(store_id_from_input(&format!("https://chrome.google.com/webstore/detail/x/{id}")).as_deref(), Some(id));
        assert!(store_id_from_input("https://evil.com/abcdefghijklmnopabcdefghijklmnop").is_none());
        assert!(store_id_from_input("hello").is_none());
    }

    #[test]
    fn installs_disabled_with_warnings_and_generates_script() {
        let root = tmp("install");
        let bytes = crx3(&make_zip(&[("manifest.json", MANIFEST), ("c.js", "window.__demo = 1;"), ("c.css", "body{}"), ("b.js", "")]));
        let info = install_bytes(&root, &bytes, None, "file").unwrap();
        assert_eq!(info.id, "local-demo-ext");
        assert!(!info.enabled && info.has_content_scripts);
        assert!(info.warnings.iter().any(|w| w.contains("background")));
        assert!(info.warnings.iter().any(|w| w.contains("tabs")));
        assert!(init_scripts(&root).is_empty(), "disabled extensions inject nothing");
        set_enabled(&root, &info.id, true).unwrap();
        let scripts = init_scripts(&root);
        assert_eq!(scripts.len(), 1);
        assert!(scripts[0].contains("window.__demo = 1;") && scripts[0].contains("https://*.example.com/*"));
        remove(&root, &info.id).unwrap();
        assert!(list(&root).is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_traversal_and_bad_files() {
        let root = tmp("bad");
        let evil = crx3(&make_zip(&[("manifest.json", MANIFEST), ("../escape.txt", "x")]));
        install_bytes(&root, &evil, None, "file").unwrap();
        assert!(!root.parent().unwrap().join("escape.txt").exists());
        assert!(install_bytes(&root, b"not a crx at all, definitely", None, "file").is_err());
        assert!(set_enabled(&root, "../x", true).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
