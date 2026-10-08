//! Bookmark import: Chrome's profile file and the Netscape HTML export every browser can produce.

use serde_json::Value;

#[derive(Debug, PartialEq, Clone)]
pub struct Imported {
    pub url: String,
    pub title: String,
    pub folder: String,
}

fn keep(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|u| matches!(u.scheme(), "http" | "https"))
}

fn clean(s: &str, max: usize) -> String {
    s.trim().chars().take(max).collect()
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'").replace("&amp;", "&")
}

/// Chrome's `Bookmarks` JSON file. The folder is the name of the folder directly containing the page.
pub fn parse_chrome_json(text: &str) -> Vec<Imported> {
    fn walk(node: &Value, folder: &str, out: &mut Vec<Imported>) {
        match node["type"].as_str() {
            Some("url") => {
                if let Some(url) = node["url"].as_str().filter(|u| keep(u)) {
                    out.push(Imported { url: url.to_string(), title: clean(node["name"].as_str().unwrap_or_default(), 300), folder: folder.to_string() });
                }
            }
            Some("folder") => {
                let name = clean(node["name"].as_str().unwrap_or_default(), 80);
                for c in node["children"].as_array().into_iter().flatten() {
                    walk(c, &name, out);
                }
            }
            _ => {}
        }
    }
    let Ok(v) = serde_json::from_str::<Value>(text) else { return vec![] };
    let mut out = vec![];
    for root in ["bookmark_bar", "other", "synced"] {
        // Pages directly on the bookmarks bar have no folder.
        for c in v["roots"][root]["children"].as_array().into_iter().flatten() {
            walk(c, "", &mut out);
        }
    }
    out
}

/// Netscape bookmark HTML (`<DL><DT><H3>Folder</H3><DL><DT><A HREF="…">Title</A>`).
pub fn parse_netscape_html(html: &str) -> Vec<Imported> {
    let lower = html.to_ascii_lowercase();
    let mut out = vec![];
    let mut stack: Vec<String> = vec![]; // folder names, one per open <DL>
    let mut pending: Option<String> = None; // an <H3> seen, waiting for its <DL>
    let mut i = 0;
    while let Some(off) = lower[i..].find('<') {
        let at = i + off;
        let rest = &lower[at..];
        if rest.starts_with("<h3") {
            let Some(gt) = rest.find('>') else { break };
            let end = lower[at..].find("</h3>").map(|e| at + e).unwrap_or(html.len());
            pending = Some(clean(&unescape(&html[at + gt + 1..end]), 80));
            i = end;
        } else if rest.starts_with("<dl") {
            stack.push(pending.take().unwrap_or_default());
            i = at + 3;
        } else if rest.starts_with("</dl") {
            stack.pop();
            i = at + 4;
        } else if rest.starts_with("<a ") {
            let Some(gt) = rest.find('>') else { break };
            let tag = &html[at..at + gt];
            let end = lower[at..].find("</a>").map(|e| at + e).unwrap_or(html.len());
            let title = clean(&unescape(&html[at + gt + 1..end.max(at + gt + 1)]), 300);
            let href = tag.to_ascii_lowercase().find("href=\"").and_then(|p| {
                let s = p + 6;
                tag[s..].find('"').map(|e| unescape(&tag[s..s + e]))
            });
            if let Some(url) = href.filter(|u| keep(u)) {
                // The first folder level is usually the browser's own root ("Bookmarks bar"); keep the innermost name.
                let folder = stack.iter().rev().find(|f| !f.is_empty()).cloned().unwrap_or_default();
                out.push(Imported { url, title, folder });
            }
            i = end;
        } else {
            i = at + 1;
        }
    }
    out
}

pub fn chrome_bookmarks_path() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    let p = std::path::PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support/Google/Chrome/Default/Bookmarks");
    #[cfg(target_os = "windows")]
    let p = std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("Google/Chrome/User Data/Default/Bookmarks");
    #[cfg(all(unix, not(target_os = "macos")))]
    let p = std::path::PathBuf::from(std::env::var_os("HOME")?).join(".config/google-chrome/Default/Bookmarks");
    Some(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_chrome_json_and_skips_non_web() {
        let json = r#"{"roots":{"bookmark_bar":{"children":[
          {"type":"url","name":"Home","url":"https://a.com/"},
          {"type":"folder","name":"Work","children":[{"type":"url","name":"Docs","url":"https://b.com/d"},{"type":"url","name":"JS","url":"javascript:alert(1)"}]}]},
          "other":{"children":[]}}}"#;
        let got = parse_chrome_json(json);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0], Imported { url: "https://a.com/".into(), title: "Home".into(), folder: "".into() });
        assert_eq!(got[1].folder, "Work");
        assert!(parse_chrome_json("not json").is_empty());
    }

    #[test]
    fn parses_netscape_html_with_nested_folders() {
        let html = r#"<DL><p><DT><H3>Bookmarks bar</H3><DL><p>
          <DT><A HREF="https://a.com/?x=1&amp;y=2">A &amp; B</A>
          <DT><H3>School</H3><DL><p><DT><A HREF="https://s.org/">S</A></DL><p>
          <DT><A HREF="ftp://nope">F</A>
          <DT><A HREF="https://after.com/">After</A></DL><p></DL>"#;
        let got = parse_netscape_html(html);
        assert_eq!(got.len(), 3);
        assert_eq!(got[0].url, "https://a.com/?x=1&y=2");
        assert_eq!(got[0].title, "A & B");
        assert_eq!(got[0].folder, "Bookmarks bar");
        assert_eq!(got[1].folder, "School");
        assert_eq!(got[2].folder, "Bookmarks bar");
    }
}
