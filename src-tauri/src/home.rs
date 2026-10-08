//! Home page widgets (both optional, off until the person turns them on): today's weather and top headlines.
//!
//! Weather uses Open-Meteo (no account or key): only the coordinates of the city the person chose are sent.
//! News is fetched from ONE public RSS feed the person picks from a fixed list; the page can't ask for any other
//! address. Everything is fetched here, not by a web page, with a timeout and a size limit.

use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const MAX_BYTES: usize = 1_500_000;

pub const NEWS_SOURCES: &[(&str, &str)] = &[
    ("bbc", "https://feeds.bbci.co.uk/news/rss.xml"),
    ("bbc-world", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("npr", "https://feeds.npr.org/1001/rss.xml"),
    ("guardian", "https://www.theguardian.com/world/rss"),
    ("aljazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    ("hn", "https://news.ycombinator.com/rss"),
];

async fn get_text(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(5))
        .user_agent("QuickPebble/1.1")
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client.get(url).send().await.map_err(|_| "Couldn't reach the internet.".to_string())?;
    if !resp.status().is_success() {
        return Err(format!("The service answered with an error ({}).", resp.status().as_u16()));
    }
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|_| "The download was interrupted.".to_string())? {
        if body.len() + chunk.len() > MAX_BYTES {
            return Err("The response was unexpectedly large, so I stopped.".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

// ---- weather ---------------------------------------------------------------------------------

#[derive(Serialize, Debug, PartialEq)]
pub struct Place {
    pub name: String,
    pub region: String,
    pub country: String,
    pub lat: f64,
    pub lon: f64,
}

pub fn parse_places(v: &Value) -> Vec<Place> {
    v["results"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|r| {
            let (lat, lon) = (r["latitude"].as_f64()?, r["longitude"].as_f64()?);
            if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
                return None;
            }
            let s = |k: &str| r[k].as_str().unwrap_or_default().chars().take(80).collect::<String>();
            Some(Place { name: r["name"].as_str()?.chars().take(80).collect(), region: s("admin1"), country: s("country"), lat, lon })
        })
        .collect()
}

#[tauri::command]
pub async fn weather_search(query: String) -> Result<Vec<Place>, String> {
    let q = query.trim();
    if q.chars().count() < 2 || q.len() > 80 {
        return Err("Type at least two letters of a city name.".into());
    }
    let name: String = url::form_urlencoded::byte_serialize(q.as_bytes()).collect();
    let text = get_text(&format!("https://geocoding-api.open-meteo.com/v1/search?name={name}&count=6&language=en&format=json")).await?;
    let v: Value = serde_json::from_str(&text).map_err(|_| "Unexpected answer from the place search.".to_string())?;
    Ok(parse_places(&v))
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Weather {
    pub temp: f64,
    pub feels: f64,
    pub code: i64,
    pub is_day: bool,
    pub high: f64,
    pub low: f64,
    pub rain_chance: Option<i64>,
    pub wind: f64,
}

pub fn parse_weather(v: &Value) -> Option<Weather> {
    let c = &v["current"];
    let d = &v["daily"];
    Some(Weather {
        temp: c["temperature_2m"].as_f64()?,
        feels: c["apparent_temperature"].as_f64().unwrap_or_else(|| c["temperature_2m"].as_f64().unwrap_or_default()),
        code: c["weather_code"].as_i64()?,
        is_day: c["is_day"].as_i64().unwrap_or(1) != 0,
        high: d["temperature_2m_max"][0].as_f64()?,
        low: d["temperature_2m_min"][0].as_f64()?,
        rain_chance: d["precipitation_probability_max"][0].as_i64(),
        wind: c["wind_speed_10m"].as_f64().unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn weather_fetch(lat: f64, lon: f64, fahrenheit: bool) -> Result<Weather, String> {
    if !lat.is_finite() || !lon.is_finite() || !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return Err("That place has no valid location.".into());
    }
    let unit = if fahrenheit { "fahrenheit" } else { "celsius" };
    let wind = if fahrenheit { "mph" } else { "kmh" };
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat:.3}&longitude={lon:.3}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day\
         &daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1&temperature_unit={unit}&wind_speed_unit={wind}"
    );
    let v: Value = serde_json::from_str(&get_text(&url).await?).map_err(|_| "Unexpected answer from the weather service.".to_string())?;
    parse_weather(&v).ok_or_else(|| "The weather service sent incomplete data.".to_string())
}

// ---- news ------------------------------------------------------------------------------------

#[derive(Serialize, Debug, PartialEq)]
pub struct Headline {
    pub title: String,
    pub url: String,
}

fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let decoded = rest.find(';').filter(|e| *e <= 10).and_then(|e| {
            let ent = &rest[1..e];
            let ch = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ => ent.strip_prefix('#').and_then(|n| match n.strip_prefix(['x', 'X']) {
                    Some(h) => u32::from_str_radix(h, 16).ok(),
                    None => n.parse().ok(),
                }).and_then(char::from_u32),
            };
            ch.map(|c| (c, e + 1))
        });
        match decoded {
            Some((c, used)) => {
                out.push(c);
                rest = &rest[used..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for c in s.chars() {
        match c {
            '<' => inside = true,
            '>' if inside => inside = false,
            _ if !inside => out.push(c),
            _ => {}
        }
    }
    out
}

/// Text of the first `<tag>…</tag>` in `block`, with CDATA, entities and inline tags removed.
fn tag_text(block: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let mut from = 0;
    while let Some(i) = block[from..].find(&open) {
        let start = from + i + open.len();
        match block[start..].chars().next() {
            Some('>') | Some(' ') | Some('\n') | Some('\t') | Some('\r') => {
                let gt = block[start..].find('>')? + start + 1;
                if block[..gt].ends_with("/>") {
                    return None;
                }
                let end = block[gt..].find(&format!("</{tag}"))? + gt;
                let raw = block[gt..end].trim();
                let raw = raw.strip_prefix("<![CDATA[").and_then(|r| r.strip_suffix("]]>")).unwrap_or(raw);
                let text = unescape(&strip_tags(raw)).split_whitespace().collect::<Vec<_>>().join(" ");
                return (!text.is_empty()).then_some(text);
            }
            _ => from = start,
        }
    }
    None
}

fn link_of(block: &str) -> Option<String> {
    let plain = tag_text(block, "link").filter(|l| l.starts_with("http"));
    let href = || {
        let i = block.find("<link")?;
        let tag = &block[i..i + block[i..].find('>')?];
        let h = tag.find("href=\"")? + 6;
        Some(unescape(&tag[h..h + tag[h..].find('"')?]))
    };
    plain.or_else(href)
}

pub fn parse_rss(xml: &str, max: usize) -> Vec<Headline> {
    let mut out: Vec<Headline> = vec![];
    for marker in ["<item", "<entry"] {
        for block in xml.split(marker).skip(1) {
            let block = block.split("</item>").next().unwrap_or(block).split("</entry>").next().unwrap_or(block);
            let (Some(title), Some(link)) = (tag_text(block, "title"), link_of(block)) else { continue };
            let Ok(u) = url::Url::parse(&link) else { continue };
            if !matches!(u.scheme(), "http" | "https") || out.iter().any(|h| h.url == link) {
                continue;
            }
            out.push(Headline { title: title.chars().take(200).collect(), url: link });
            if out.len() >= max {
                return out;
            }
        }
        if !out.is_empty() {
            break;
        }
    }
    out
}

#[tauri::command]
pub async fn news_fetch(source: String, count: Option<usize>) -> Result<Vec<Headline>, String> {
    let url = NEWS_SOURCES.iter().find(|(id, _)| *id == source).map(|(_, u)| *u).ok_or("Unknown news source.")?;
    let items = parse_rss(&get_text(url).await?, count.unwrap_or(5).clamp(1, 10));
    if items.is_empty() {
        return Err("That feed had no headlines right now.".into());
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rss_titles_links_cdata_and_entities() {
        let xml = r#"<rss><channel><title>Feed</title>
          <item><title><![CDATA[Fish &amp; chips: a <b>history</b>]]></title><link>https://a.com/1</link></item>
          <item><title>Rock &amp; Roll &#8211; &#x27;live&#x27;</title><link>https://a.com/2?x=1&amp;y=2</link></item>
          <item><title>Bad scheme</title><link>javascript:alert(1)</link></item>
          <item><title>Dup</title><link>https://a.com/1</link></item>
          <item><title></title><link>https://a.com/3</link></item></channel></rss>"#;
        let got = parse_rss(xml, 10);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0], Headline { title: "Fish & chips: a history".into(), url: "https://a.com/1".into() });
        assert_eq!(got[1].title, "Rock & Roll – 'live'");
        assert_eq!(got[1].url, "https://a.com/2?x=1&y=2");
    }

    #[test]
    fn atom_feeds_and_limits() {
        let xml = r#"<feed><title>F</title><entry><title>One</title><link rel="alternate" href="https://b.com/1"/></entry>
                     <entry><title>Two</title><link href="https://b.com/2"/></entry></feed>"#;
        assert_eq!(parse_rss(xml, 10).len(), 2);
        assert_eq!(parse_rss(xml, 1).len(), 1);
        assert!(parse_rss("not xml at all", 5).is_empty());
    }

    #[test]
    fn weather_parses_and_rejects_incomplete_data() {
        let v = json!({"current":{"temperature_2m":21.4,"apparent_temperature":20.1,"weather_code":3,"wind_speed_10m":12.0,"is_day":1},
                       "daily":{"temperature_2m_max":[24.0],"temperature_2m_min":[15.5],"precipitation_probability_max":[40]}});
        let w = parse_weather(&v).unwrap();
        assert_eq!((w.temp, w.code, w.rain_chance, w.is_day), (21.4, 3, Some(40), true));
        assert!(parse_weather(&json!({"current":{},"daily":{}})).is_none());
    }

    #[test]
    fn places_are_validated() {
        let v = json!({"results":[{"name":"Dubai","admin1":"Dubai","country":"UAE","latitude":25.07,"longitude":55.3},
                                  {"name":"Nowhere","latitude":99.0,"longitude":0.0},{"latitude":1.0,"longitude":1.0}]});
        let p = parse_places(&v);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].country, "UAE");
        assert!(parse_places(&json!({})).is_empty());
    }

    #[test]
    fn only_listed_sources_exist_and_all_are_https() {
        assert!(NEWS_SOURCES.iter().all(|(_, u)| u.starts_with("https://")));
        assert!(NEWS_SOURCES.iter().any(|(id, _)| *id == "bbc"));
    }
}
