//! Screen agent bridge. The work (screenshot + grid, Gemini call, mouse/keyboard) lives in the Python
//! sidecar under `agent/`; this module starts it on demand and proxies two calls to it over 127.0.0.1.
//!
//! Opt-in: nothing runs until the user sends a task in Screen mode. Every screenshot goes to Google Gemini.

use crate::browser::ai_config;
use crate::daemon;
use crate::database::Db;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

struct Running {
    child: Child,
    port: u16,
    token: String,
    model: String,
    precision: String,
}

impl Drop for Running {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

#[derive(Default)]
pub struct ScreenAgent(Mutex<Option<Running>>);

fn agent_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = vec![];
    if let Ok(p) = std::env::var("QP_AGENT_DIR") {
        candidates.push(p.into());
    }
    if let Ok(r) = app.path().resource_dir() {
        candidates.push(r.join("agent"));
    }
    candidates.push(PathBuf::from("../agent")); // `npm run tauri:dev` runs from src-tauri/
    candidates.push(PathBuf::from("agent"));
    candidates
        .into_iter()
        .find(|p| p.join("qp_agent").join("server.py").exists())
        .ok_or_else(|| "The screen agent files were not found (expected an `agent` folder).".to_string())
}

/// `python3` on macOS and Linux, `python` on Windows (where python.org's installer provides no `python3`). `QP_PYTHON` overrides.
fn python_command() -> String {
    std::env::var("QP_PYTHON").unwrap_or_else(|_| if cfg!(windows) { "python" } else { "python3" }.into())
}

fn start(app: &AppHandle, model: &str, precision: &str) -> Result<Running, String> {
    let key = daemon::get_key("gemini").ok_or("Screen mode needs a Gemini API key. Add one in Settings → AI.")?;
    let dir = agent_dir(app)?;
    let python = python_command();
    let mut cmd = Command::new(&python);
    cmd.args(["-m", "qp_agent.server"]).current_dir(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: don't flash a console
    }
    let mut child = cmd
        .env("GEMINI_API_KEY", key)
        .env("QP_AGENT_MODEL", model)
        .env("QP_AGENT_PRECISION", precision)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "Python 3 was not found. Install it from https://www.python.org (on Windows, tick \"Add python.exe to PATH\") to use Screen mode.".to_string())?;
    let stdout = child.stdout.take().ok_or("Could not start the screen agent")?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let _ = BufReader::new(stdout).read_line(&mut line);
        let _ = tx.send(line);
    });
    let line = rx.recv_timeout(Duration::from_secs(10)).unwrap_or_default();
    let field = |name: &str| line.split_whitespace().find_map(|p| p.strip_prefix(name)).map(str::to_string);
    match (line.starts_with("QP_AGENT_READY"), field("port="), field("token=")) {
        (true, Some(port), Some(token)) if port.parse::<u16>().is_ok() => {
            Ok(Running { child, port: port.parse().unwrap(), token, model: model.to_string(), precision: precision.to_string() })
        }
        _ => {
            let _ = child.kill();
            let mut err = String::new();
            if let Some(mut e) = child.stderr.take() {
                let _ = e.read_to_string(&mut err);
            }
            let hint = if err.contains("ModuleNotFoundError") {
                format!("Install the agent's Python packages: {python} -m pip install -r \"{}\"", dir.join("requirements.txt").display())
            } else {
                err.lines().last().unwrap_or("it did not start").to_string()
            };
            Err(format!("The screen agent could not start. {hint}"))
        }
    }
}

fn connection(app: &AppHandle, db: &Db, state: &ScreenAgent) -> Result<(u16, String), String> {
    let cfg = ai_config(db);
    let model = db.get_setting("screen_model").filter(|m| !m.is_empty()).unwrap_or_else(|| {
        if cfg.provider == "gemini" { cfg.model.clone() } else { String::new() }
    });
    let precision = if db.get_setting("screen_precision").as_deref() == Some("standard") { "standard" } else { "high" };
    let mut guard = state.0.lock().map_err(|_| "screen agent lock poisoned")?;
    let alive = match guard.as_mut() {
        Some(r) => r.model == model && r.precision == precision && matches!(r.child.try_wait(), Ok(None)),
        None => false,
    };
    if !alive {
        *guard = None; // drops (kills) a stale process
        *guard = Some(start(app, &model, precision)?);
    }
    let r = guard.as_ref().ok_or("screen agent not running")?;
    Ok((r.port, r.token.clone()))
}

async fn post(port: u16, token: &str, path: &str, body: Value) -> Result<Value, String> {
    let resp = reqwest::Client::new()
        .post(format!("http://127.0.0.1:{port}{path}"))
        .header("X-QP-Token", token)
        .timeout(Duration::from_secs(120))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("The screen agent is not responding: {e}"))?;
    let ok = resp.status().is_success();
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    if ok { Ok(v) } else { Err(v["error"].as_str().unwrap_or("Screen agent request failed").to_string()) }
}

/// Screenshot + Gemini. Returns `{ user: {thinking, message}, action: {...} }`; nothing is executed.
#[tauri::command]
pub async fn screen_propose(
    app: AppHandle,
    db: State<'_, Db>,
    state: State<'_, ScreenAgent>,
    goal: String,
    history: Vec<String>,
    categories: Option<Value>,
    page_text: Option<String>,
) -> Result<Value, String> {
    if goal.trim().is_empty() || goal.len() > 4000 || history.len() > 40 {
        return Err("Invalid request".into());
    }
    let (port, token) = {
        let (app, db, state) = (app.clone(), &*db, &*state);
        tokio::task::block_in_place(|| connection(&app, db, state))?
    };
    post(port, &token, "/propose", json!({ "goal": goal, "history": history, "categories": categories, "page_text": page_text })).await
}

/// Runs one user-approved action. The Python side validates it again before touching the mouse or keyboard.
#[tauri::command]
pub async fn screen_act(state: State<'_, ScreenAgent>, action: Value) -> Result<Value, String> {
    let (port, token) = {
        let guard = state.0.lock().map_err(|_| "screen agent lock poisoned")?;
        let r = guard.as_ref().ok_or("The screen agent is not running. Start a new task.")?;
        (r.port, r.token.clone())
    };
    post(port, &token, "/act", json!({ "action": action })).await
}

/// Independent second look before a submit-type action. Returns `{ ok, problems }`.
#[tauri::command]
pub async fn screen_verify(
    app: AppHandle,
    db: State<'_, Db>,
    state: State<'_, ScreenAgent>,
    goal: String,
    history: Vec<String>,
    pending: String,
    page_text: Option<String>,
) -> Result<Value, String> {
    if goal.trim().is_empty() || goal.len() > 4000 || history.len() > 40 || pending.len() > 300 {
        return Err("Invalid request".into());
    }
    let (port, token) = {
        let (app, db, state) = (app.clone(), &*db, &*state);
        tokio::task::block_in_place(|| connection(&app, db, state))?
    };
    post(port, &token, "/verify", json!({ "goal": goal, "history": history, "pending": pending, "page_text": page_text })).await
}

/// Gemini models this key can call for text generation (names without the `models/` prefix).
#[tauri::command]
pub async fn gemini_models() -> Result<Vec<String>, String> {
    let key = daemon::get_key("gemini").ok_or("Add a Gemini API key in Settings → AI first.")?;
    let v: Value = reqwest::Client::new()
        .get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200")
        .header("x-goog-api-key", key)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Could not reach Gemini: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(msg) = v["error"]["message"].as_str() {
        return Err(msg.to_string());
    }
    Ok(v["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|m| m["supportedGenerationMethods"].as_array().is_some_and(|a| a.iter().any(|x| x == "generateContent")))
        .filter_map(|m| m["name"].as_str().and_then(|n| n.strip_prefix("models/")).map(String::from))
        .collect())
}
