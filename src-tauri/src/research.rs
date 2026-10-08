//! Opt-in web research. Credentials stay in the OS keychain, never in page webviews.
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use url::Url;

const SERVICE: &str = "app.quickpebble.browser.research";
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, "brave").map_err(|e| e.to_string())
}
#[tauri::command]
pub fn research_status() -> bool {
    entry().and_then(|e| e.get_password().map_err(|e| e.to_string())).is_ok_and(|k| !k.is_empty())
}
#[tauri::command]
pub fn research_key_set(key: String) -> Result<(), String> {
    let entry = entry()?;
    if key.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        if key.len() > 4096 { return Err("Invalid search key".into()); }
        entry.set_password(key.trim()).map_err(|e| e.to_string())
    }
}
#[derive(Serialize)]
pub struct ResearchSource { title: String, url: String, text: String }

fn plain(s: &str) -> String {
    let mut tag = false;
    s.chars().filter(|c| match c { '<' => { tag = true; false }, '>' => { tag = false; false }, _ => !tag }).take(4000).collect()
}
fn sources(value: &Value) -> Vec<ResearchSource> {
    let mut seen = std::collections::HashSet::new();
    value["web"]["results"].as_array().into_iter().flatten().filter_map(|r| {
        let url = Url::parse(r["url"].as_str()?).ok()?;
        if !matches!(url.scheme(), "https" | "http") || !seen.insert(url.to_string()) { return None; }
        let mut text = plain(r["description"].as_str().unwrap_or_default());
        for excerpt in r["extra_snippets"].as_array().into_iter().flatten().filter_map(Value::as_str).take(3) {
            text.push('\n'); text.push_str(&plain(excerpt));
        }
        if text.trim().is_empty() { return None; }
        Some(ResearchSource { title: plain(r["title"].as_str().unwrap_or_default()), url: url.to_string(), text: text.chars().take(4000).collect() })
    }).take(4).collect()
}
#[tauri::command]
pub async fn research_search(query: String) -> Result<Vec<ResearchSource>, String> {
    if query.trim().is_empty() || query.chars().count() > 600 || query.split_whitespace().count() > 75 {
        return Err("Use a research question under 600 characters and 75 words".into());
    }
    let key = entry()?.get_password().map_err(|_| "Add a Brave Search API key in Settings → Web research")?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e| e.to_string())?;
    let response = client.get("https://api.search.brave.com/res/v1/web/search")
        .query(&[("q", query.as_str()), ("count", "6"), ("extra_snippets", "true"), ("text_decorations", "false"), ("safesearch", "moderate")])
        .header("Accept", "application/json").header("X-Subscription-Token", key)
        .send().await.map_err(|_| "Web research couldn't connect. Check your internet connection.")?;
    if !response.status().is_success() { return Err(format!("Search provider returned HTTP {}. Check your key and search quota.", response.status())); }
    let results = sources(&response.json::<Value>().await.map_err(|_| "Search provider returned an unreadable response")?);
    if results.is_empty() { return Err("No useful web sources found. Try a more specific question or attach a page.".into()); }
    Ok(results)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excludes_unsafe_empty_and_duplicate_results() {
        let value = serde_json::json!({"web":{"results":[
            {"url":"javascript:alert(1)","description":"bad"},
            {"url":"https://example.com/","title":"A","description":"<strong>Real</strong> evidence","extra_snippets":["More evidence"]},
            {"url":"https://example.com/","description":"duplicate"},
            {"url":"https://empty.example/","description":""}
        ]}});
        let out = sources(&value);
        assert_eq!(out.len(),1);
        assert_eq!(out[0].text,"Real evidence\nMore evidence");
    }
}
