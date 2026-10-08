//! Password manager. Passwords are encrypted with ChaCha20-Poly1305 under a key derived from the person's
//! master password (Argon2id). The key lives only in memory and locks after a period of inactivity.
//! Sites and usernames are stored in clear so entries can be listed and matched; passwords never are.
//!
//! Web pages can only *report* that a login happened. Nothing is saved until the person agrees, and a
//! saved login is only ever filled into a page whose host matches the saved host exactly.

use crate::browser::{tab_label, Browser};
use crate::database::Db;
use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, Webview, Window};
use zeroize::Zeroize;

const IDLE_LOCK: Duration = Duration::from_secs(15 * 60);
const PENDING_TTL: Duration = Duration::from_secs(5 * 60);
const MIN_MASTER: usize = 8;
const CHECK: &[u8] = b"quick-pebble-vault-v1";

pub struct VaultKey([u8; 32]);
impl Drop for VaultKey {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

struct Pending {
    host: String,
    username: String,
    password: String,
    at: Instant,
}
impl Drop for Pending {
    fn drop(&mut self) {
        self.password.zeroize();
    }
}

#[derive(Default)]
pub struct Vault {
    key: Mutex<Option<(VaultKey, Instant)>>,
    pending: Mutex<HashMap<String, Pending>>,
}

impl Vault {
    fn unlocked(&self) -> bool {
        let mut g = self.key.lock().unwrap_or_else(|e| e.into_inner());
        match g.as_ref() {
            Some((_, at)) if at.elapsed() < IDLE_LOCK => true,
            Some(_) => {
                *g = None; // idle too long: drop (and zero) the key
                false
            }
            None => false,
        }
    }

    /// Runs `f` with the key and counts this as activity. Fails if locked.
    fn with_key<T>(&self, f: impl FnOnce(&VaultKey) -> T) -> Result<T, String> {
        if !self.unlocked() {
            return Err("The vault is locked.".into());
        }
        let mut g = self.key.lock().unwrap_or_else(|e| e.into_inner());
        let (k, at) = g.as_mut().ok_or("The vault is locked.")?;
        *at = Instant::now();
        Ok(f(k))
    }

    fn set_key(&self, k: VaultKey) {
        *self.key.lock().unwrap_or_else(|e| e.into_inner()) = Some((k, Instant::now()));
    }
}

// ---- crypto ----------------------------------------------------------------------------------

pub fn derive_key(master: &str, salt: &[u8]) -> Result<VaultKey, String> {
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let mut out = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(master.as_bytes(), salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(VaultKey(out))
}

/// `nonce (12) || ciphertext`. `aad` ties the secret to its entry so rows can't be swapped.
pub fn encrypt(key: &VaultKey, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce = [0u8; 12];
    getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
    let ct = ChaCha20Poly1305::new(Key::from_slice(&key.0))
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext, aad })
        .map_err(|_| "encryption failed".to_string())?;
    Ok([nonce.to_vec(), ct].concat())
}

pub fn decrypt(key: &VaultKey, blob: &[u8], aad: &[u8]) -> Option<Vec<u8>> {
    if blob.len() < 12 + 16 {
        return None;
    }
    let (nonce, ct) = blob.split_at(12);
    ChaCha20Poly1305::new(Key::from_slice(&key.0)).decrypt(Nonce::from_slice(nonce), Payload { msg: ct, aad }).ok()
}

// ---- helpers ---------------------------------------------------------------------------------

/// Lower-case host without a leading "www.", or None if it isn't a plausible host name.
pub fn normalize_host(host: &str) -> Option<String> {
    let h = host.trim().trim_end_matches('.').to_ascii_lowercase();
    let h = h.strip_prefix("www.").unwrap_or(&h).to_string();
    let ok = !h.is_empty() && h.len() <= 253 && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    ok.then_some(h)
}

fn aad(host: &str, username: &str) -> Vec<u8> {
    format!("{host}\n{username}").into_bytes()
}

fn clean_username(u: &str) -> Result<String, String> {
    let u = u.trim();
    if u.chars().count() > 256 {
        return Err("That username is too long.".into());
    }
    Ok(u.to_string())
}

fn clean_password(p: &str) -> Result<(), String> {
    if p.is_empty() || p.len() > 1024 {
        return Err("Enter a password (up to 1024 characters).".into());
    }
    Ok(())
}

// ---- commands --------------------------------------------------------------------------------

#[derive(Serialize)]
pub struct VaultStatus {
    exists: bool,
    unlocked: bool,
}

#[tauri::command]
pub fn vault_status(db: State<Db>, vault: State<Vault>) -> VaultStatus {
    VaultStatus { exists: db.vault_meta_get("salt").is_some(), unlocked: vault.unlocked() }
}

#[tauri::command]
pub async fn vault_create(app: AppHandle, master: String) -> Result<(), String> {
    if master.chars().count() < MIN_MASTER {
        return Err(format!("Use at least {MIN_MASTER} characters for the master password."));
    }
    if master.len() > 512 {
        return Err("That master password is too long.".into());
    }
    let (db, vault) = (app.state::<Db>(), app.state::<Vault>());
    if db.vault_meta_get("salt").is_some() {
        return Err("A vault already exists.".into());
    }
    let mut salt = [0u8; 16];
    getrandom::getrandom(&mut salt).map_err(|e| e.to_string())?;
    let m = master.clone();
    let key = tauri::async_runtime::spawn_blocking(move || derive_key(&m, &salt)).await.map_err(|e| e.to_string())??;
    let check = encrypt(&key, CHECK, b"check")?;
    db.vault_meta_set("salt", &salt).map_err(|e| e.to_string())?;
    db.vault_meta_set("check", &check).map_err(|e| e.to_string())?;
    vault.set_key(key);
    Ok(())
}

#[tauri::command]
pub async fn vault_unlock(app: AppHandle, master: String) -> Result<(), String> {
    let (db, vault) = (app.state::<Db>(), app.state::<Vault>());
    let salt = db.vault_meta_get("salt").ok_or("No vault yet. Create one first.")?;
    let check = db.vault_meta_get("check").ok_or("The vault is damaged.")?;
    if master.len() > 512 {
        return Err("Wrong master password.".into());
    }
    let key = tauri::async_runtime::spawn_blocking(move || derive_key(&master, &salt)).await.map_err(|e| e.to_string())??;
    if decrypt(&key, &check, b"check").as_deref() != Some(CHECK) {
        return Err("Wrong master password.".into());
    }
    vault.set_key(key);
    Ok(())
}

#[tauri::command]
pub fn vault_lock(vault: State<Vault>) {
    *vault.key.lock().unwrap_or_else(|e| e.into_inner()) = None;
    vault.pending.lock().unwrap_or_else(|e| e.into_inner()).clear();
}

#[derive(Serialize)]
pub struct VaultEntry {
    id: i64,
    host: String,
    username: String,
    created_at: i64,
}

#[tauri::command]
pub fn vault_list(db: State<Db>, vault: State<Vault>, query: Option<String>) -> Result<Vec<VaultEntry>, String> {
    vault.with_key(|_| ())?;
    db.vault_list(&query.unwrap_or_default())
        .map(|rows| rows.into_iter().map(|(id, host, username, created_at)| VaultEntry { id, host, username, created_at }).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_reveal(db: State<Db>, vault: State<Vault>, id: i64) -> Result<String, String> {
    let (host, username, blob) = db.vault_item(id).ok_or("That login no longer exists.")?;
    let plain = vault.with_key(|k| decrypt(k, &blob, &aad(&host, &username)))?.ok_or("Could not decrypt that login.")?;
    String::from_utf8(plain).map_err(|_| "Could not decrypt that login.".to_string())
}

fn store(db: &Db, vault: &Vault, host: &str, username: &str, password: &str) -> Result<i64, String> {
    let host = normalize_host(host).ok_or("Enter a website like example.com.")?;
    let username = clean_username(username)?;
    clean_password(password)?;
    let blob = vault.with_key(|k| encrypt(k, password.as_bytes(), &aad(&host, &username)))??;
    db.vault_put(&host, &username, &blob).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_save(db: State<Db>, vault: State<Vault>, host: String, username: String, password: String) -> Result<i64, String> {
    store(&db, &vault, &host, &username, &password)
}

#[tauri::command]
pub fn vault_delete(db: State<Db>, vault: State<Vault>, id: i64) -> Result<(), String> {
    vault.with_key(|_| ())?;
    db.vault_delete(id).map_err(|e| e.to_string())
}

fn fill_script(username: &str, password: &str) -> String {
    let u = serde_json::to_string(username).unwrap_or_else(|_| "\"\"".into());
    let p = serde_json::to_string(password).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"(function(U,P){{
  const vis=e=>{{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'}};
  const set=(el,v)=>{{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{{bubbles:true}}));el.dispatchEvent(new Event('change',{{bubbles:true}}));}};
  const pw=[...document.querySelectorAll('input[type=password]')].find(vis); if(!pw) return false;
  const scope=pw.form||document;
  const cands=[...scope.querySelectorAll('input')].filter(i=>i!==pw&&vis(i)&&/^(text|email|tel)$/i.test(i.type||'text'));
  const user=cands.filter(i=>i.compareDocumentPosition(pw)&Node.DOCUMENT_POSITION_FOLLOWING).pop()||cands[0];
  if(user&&U) set(user,U); set(pw,P); return true;
}})({u},{p})"#
    )
}

/// Fills a saved login into the tab, but only if the tab's address matches the saved site exactly.
#[tauri::command]
pub fn vault_fill(app: AppHandle, window: Window, db: State<Db>, vault: State<Vault>, state: State<Browser>, tab_id: String, id: i64) -> Result<(), String> {
    let (host, username, blob) = db.vault_item(id).ok_or("That login no longer exists.")?;
    let label = tab_label(window.label(), &tab_id);
    let (url, private) = state.tab_url(&label).ok_or("That tab isn't open.")?;
    let page = url::Url::parse(&url).map_err(|_| "This page has no address.".to_string())?;
    if page.scheme() != "https" {
        return Err("Passwords are only filled on secure (https) pages.".into());
    }
    if normalize_host(page.host_str().unwrap_or_default()).as_deref() != Some(host.as_str()) {
        return Err(format!("This login is saved for {host}, not this site, so I won't fill it here."));
    }
    let _ = private; // private windows may fill too; they just never save
    let plain = vault.with_key(|k| decrypt(k, &blob, &aad(&host, &username)))?.ok_or("Could not decrypt that login.")?;
    let password = String::from_utf8(plain).map_err(|_| "Could not decrypt that login.".to_string())?;
    let wv = app.get_webview(&label).ok_or("That tab has no page loaded.")?;
    wv.eval(fill_script(&username, &password)).map_err(|e| e.to_string())
}

/// Page-facing: "a login form was just submitted". Only reports; identity and host come from the tab,
/// never from the payload. The person decides in the UI whether anything is saved.
#[tauri::command]
pub fn qp_login_seen(app: AppHandle, webview: Webview, state: State<Browser>, db: State<Db>, vault: State<Vault>, username: String, password: String) {
    if password.is_empty() || password.len() > 1024 || username.chars().count() > 256 {
        return;
    }
    let label = webview.label().to_string();
    let Some((url, private)) = state.tab_url(&label) else { return };
    if private {
        return;
    }
    let Ok(page) = url::Url::parse(&url) else { return };
    if page.scheme() != "https" {
        return;
    }
    let Some(host) = normalize_host(page.host_str().unwrap_or_default()) else { return };
    if db.vault_never_has(&host) {
        return;
    }
    // Already saved with this very password? Then there is nothing to offer.
    if let Some(same) = db.vault_list(&host).ok().and_then(|rows| rows.into_iter().find(|r| r.1 == host && r.2 == username)) {
        if let Some((h, u, blob)) = db.vault_item(same.0) {
            if vault.unlocked() && vault.with_key(|k| decrypt(k, &blob, &aad(&h, &u))).ok().flatten().as_deref() == Some(password.as_bytes()) {
                return;
            }
        }
    }
    let Some((window, id)) = state.tab_window_id(&label) else { return };
    vault.pending.lock().unwrap_or_else(|e| e.into_inner()).insert(
        label,
        Pending { host: host.clone(), username: username.trim().to_string(), password, at: Instant::now() },
    );
    let _ = app.emit("qp://login-seen", json!({ "window": window, "id": id, "host": host, "username": username.trim() }));
}

fn take_pending(vault: &Vault, label: &str) -> Result<Pending, String> {
    let p = vault.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(label).ok_or("There is no login waiting to be saved.")?;
    if p.at.elapsed() > PENDING_TTL {
        return Err("That login prompt expired. Sign in again to save it.".into());
    }
    Ok(p)
}

#[tauri::command]
pub fn vault_save_pending(db: State<Db>, vault: State<Vault>, window: Window, tab_id: String) -> Result<i64, String> {
    if !vault.unlocked() {
        return Err("Unlock the vault first.".into());
    }
    let p = take_pending(&vault, &tab_label(window.label(), &tab_id))?;
    store(&db, &vault, &p.host, &p.username, &p.password)
}

#[tauri::command]
pub fn vault_dismiss_pending(db: State<Db>, vault: State<Vault>, window: Window, tab_id: String, never: bool) {
    if let Ok(p) = take_pending(&vault, &tab_label(window.label(), &tab_id)) {
        if never {
            let _ = db.vault_never_add(&p.host);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(pw: &str) -> VaultKey {
        derive_key(pw, b"0123456789abcdef").unwrap()
    }

    #[test]
    fn roundtrip_and_wrong_key_or_context_fail() {
        let k = key("correct horse battery");
        let blob = encrypt(&k, b"s3cret!", &aad("a.com", "me")).unwrap();
        assert_eq!(decrypt(&k, &blob, &aad("a.com", "me")).as_deref(), Some(&b"s3cret!"[..]));
        assert!(decrypt(&key("wrong password"), &blob, &aad("a.com", "me")).is_none());
        assert!(decrypt(&k, &blob, &aad("b.com", "me")).is_none(), "entry bound to its host");
        assert!(decrypt(&k, &blob, &aad("a.com", "you")).is_none(), "entry bound to its username");
    }

    #[test]
    fn tampering_is_detected_and_nonces_are_fresh() {
        let k = key("pw-pw-pw-pw");
        let mut blob = encrypt(&k, b"x", b"ctx").unwrap();
        assert_ne!(blob, encrypt(&k, b"x", b"ctx").unwrap());
        *blob.last_mut().unwrap() ^= 1;
        assert!(decrypt(&k, &blob, b"ctx").is_none());
        assert!(decrypt(&k, &[0u8; 5], b"ctx").is_none());
    }

    #[test]
    fn hosts_are_normalised_and_junk_rejected() {
        assert_eq!(normalize_host("WWW.Example.com.").as_deref(), Some("example.com"));
        assert_eq!(normalize_host("sub.example.com").as_deref(), Some("sub.example.com"));
        assert!(normalize_host("").is_none());
        assert!(normalize_host("exa mple.com").is_none());
        assert!(normalize_host("evil.com/path").is_none());
    }

    #[test]
    fn fill_script_escapes_values() {
        let s = fill_script("a\"b</script>", "p'\\\n");
        assert!(s.contains(r#""a\"b</script>""#));
        assert!(!s.contains("p'\\\n)"), "raw newline must not appear unescaped");
    }

    #[test]
    fn vault_db_roundtrip_and_upsert() {
        let db = Db::memory().unwrap();
        let v = Vault::default();
        v.set_key(key("master-password"));
        let id1 = store(&db, &v, "WWW.A.com", "me", "one").unwrap();
        let id2 = store(&db, &v, "a.com", "me", "two").unwrap();
        assert_eq!(id1, id2, "same host+username replaces the password");
        let (h, u, blob) = db.vault_item(id1).unwrap();
        assert_eq!(v.with_key(|k| decrypt(k, &blob, &aad(&h, &u))).unwrap().as_deref(), Some(&b"two"[..]));
        assert_eq!(db.vault_list("").unwrap().len(), 1);
        db.vault_never_add("n.com").unwrap();
        assert!(db.vault_never_has("n.com") && !db.vault_never_has("a.com"));
    }

    #[test]
    fn locked_vault_refuses() {
        let v = Vault::default();
        assert!(v.with_key(|_| ()).is_err());
    }
}
