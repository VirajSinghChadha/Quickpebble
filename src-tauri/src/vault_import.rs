//! Reads the CSV export every password manager can produce (Chrome, Edge, Brave, Firefox, Safari / Apple
//! Passwords, 1Password, Bitwarden, LastPass, Dashlane …). Columns are found by header name, not by position.

use zeroize::Zeroize;

#[derive(Debug, PartialEq, Clone)]
pub struct Login {
    pub host: String,
    pub username: String,
    pub password: String,
}

impl Drop for Login {
    fn drop(&mut self) {
        self.password.zeroize();
    }
}

#[derive(Debug, Default)]
pub struct Parsed {
    pub logins: Vec<Login>,
    /// Rows with no password, no recognisable website, or that are not logins (notes, cards…).
    pub skipped: usize,
}

pub const MAX_ROWS: usize = 5000;

/// RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes, optional BOM.
pub fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let (mut rows, mut row, mut field) = (vec![], vec![], String::new());
    let (mut quoted, mut chars) = (false, text.chars().peekable());
    while let Some(c) = chars.next() {
        match (quoted, c) {
            (true, '"') if chars.peek() == Some(&'"') => {
                chars.next();
                field.push('"');
            }
            (true, '"') => quoted = false,
            (true, _) => field.push(c),
            (false, '"') if field.is_empty() => quoted = true,
            (false, ',') => row.push(std::mem::take(&mut field)),
            (false, '\n' | '\r') => {
                if c == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                row.push(std::mem::take(&mut field));
                if row.iter().any(|f| !f.is_empty()) {
                    rows.push(std::mem::take(&mut row));
                } else {
                    row.clear();
                }
            }
            (false, _) => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        if row.iter().any(|f| !f.is_empty()) {
            rows.push(row);
        }
    }
    rows
}

const URL_COLS: &[&str] = &["url", "login_uri", "website", "web site", "origin", "site", "uri", "login_url", "hostname", "web address"];
const USER_COLS: &[&str] = &["username", "login_username", "user", "user name", "login", "email", "login name", "identifier"];
const PASS_COLS: &[&str] = &["password", "login_password", "pass", "pwd"];
const NAME_COLS: &[&str] = &["name", "title", "login_name"];
const TYPE_COLS: &[&str] = &["type", "category"];

fn find(header: &[String], names: &[&str]) -> Option<usize> {
    names.iter().find_map(|n| header.iter().position(|h| h == n))
}

fn host_of(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    let url = url::Url::parse(raw).ok().filter(|u| u.host_str().is_some()).or_else(|| url::Url::parse(&format!("https://{raw}")).ok())?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    crate::vault::normalize_host(url.host_str()?)
}

pub fn parse_logins(text: &str) -> Result<Parsed, String> {
    let rows = parse_csv(text);
    let Some((header, body)) = rows.split_first() else { return Err("That file is empty.".into()) };
    let header: Vec<String> = header.iter().map(|h| h.trim().to_ascii_lowercase()).collect();
    let pass = find(&header, PASS_COLS).ok_or("I couldn't find a password column. Is this a password export (CSV)?")?;
    let url = find(&header, URL_COLS);
    let name = find(&header, NAME_COLS);
    if url.is_none() && name.is_none() {
        return Err("I couldn't find a website column in that file.".into());
    }
    let user = find(&header, USER_COLS);
    let kind = find(&header, TYPE_COLS);
    let cell = |r: &[String], i: Option<usize>| i.and_then(|i| r.get(i)).map(|s| s.trim().to_string()).unwrap_or_default();

    let mut out = Parsed::default();
    for r in body.iter().take(MAX_ROWS) {
        // Bitwarden and 1Password mix notes, cards and identities into the same file.
        let k = cell(r, kind).to_ascii_lowercase();
        let is_login = k.is_empty() || k == "login" || k == "password" || k == "passwords";
        let password = r.get(pass).cloned().unwrap_or_default();
        let host = host_of(&cell(r, url)).or_else(|| host_of(&cell(r, name)).filter(|h| h.contains('.')));
        match (is_login, host, password.is_empty() || password.len() > 1024) {
            (true, Some(host), false) => out.logins.push(Login { host, username: cell(r, user).chars().take(256).collect(), password }),
            _ => out.skipped += 1,
        }
    }
    out.skipped += body.len().saturating_sub(MAX_ROWS);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_handles_quotes_newlines_bom_and_crlf() {
        let rows = parse_csv("\u{feff}a,b\r\n\"x, y\",\"he said \"\"hi\"\"\"\r\n\"multi\nline\",z\r\n\r\n");
        assert_eq!(rows, vec![vec!["a", "b"], vec!["x, y", "he said \"hi\""], vec!["multi\nline", "z"]]);
        assert_eq!(parse_csv("a,b"), vec![vec!["a", "b"]]);
        assert!(parse_csv("").is_empty());
    }

    #[test]
    fn chrome_format() {
        let p = parse_logins("name,url,username,password,note\nexample.com,https://www.example.com/login,me@x.com,p@ss\"w,\n").unwrap();
        assert_eq!(p.logins, vec![Login { host: "example.com".into(), username: "me@x.com".into(), password: "p@ss\"w".into() }]);
    }

    #[test]
    fn firefox_safari_and_lastpass_formats() {
        let ff = parse_logins("url,username,password,httpRealm,formActionOrigin,guid\nhttps://a.com,u,pw,,,{1}\n").unwrap();
        assert_eq!(ff.logins[0].host, "a.com");
        let safari = parse_logins("Title,URL,Username,Password,Notes,OTPAuth\nA,https://b.org/x,v,pw2,,\n").unwrap();
        assert_eq!((safari.logins[0].host.as_str(), safari.logins[0].username.as_str()), ("b.org", "v"));
        let lp = parse_logins("url,username,password,totp,extra,name,grouping,fav\nhttp://c.net,w,pw3,,,C,,0\n").unwrap();
        assert_eq!(lp.logins[0].host, "c.net");
    }

    #[test]
    fn bitwarden_skips_notes_and_cards() {
        let csv = "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n\
                   ,0,login,Site,,,0,https://d.com,me,pw4,\n,0,note,A note,secret,,0,,,,\n,0,card,Visa,,,0,,,,\n";
        let p = parse_logins(csv).unwrap();
        assert_eq!(p.logins.len(), 1);
        assert_eq!(p.skipped, 2);
    }

    #[test]
    fn skips_rows_without_password_or_site_and_non_web_urls() {
        let p = parse_logins("url,username,password\nhttps://a.com,me,\n,me,pw\nandroid://abc@com.app,me,pw\nftp://x.com,me,pw\nok.com,me,pw\n").unwrap();
        assert_eq!(p.logins.len(), 1);
        assert_eq!(p.logins[0].host, "ok.com");
        assert_eq!(p.skipped, 4);
    }

    #[test]
    fn falls_back_to_the_name_column_when_it_is_a_domain() {
        let p = parse_logins("name,username,password\nshop.example.com,me,pw\nMy Bank,me,pw\n").unwrap();
        assert_eq!(p.logins.len(), 1);
        assert_eq!(p.logins[0].host, "shop.example.com");
    }

    #[test]
    fn unrecognised_files_give_clear_errors() {
        assert!(parse_logins("").unwrap_err().contains("empty"));
        assert!(parse_logins("a,b\n1,2\n").unwrap_err().contains("password column"));
        assert!(parse_logins("username,password\nme,pw\n").unwrap_err().contains("website column"));
    }
}
