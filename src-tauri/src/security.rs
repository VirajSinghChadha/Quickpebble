//! Privacy centre: tracker blocking, URL normalisation/validation, permission policy helpers.

use std::sync::atomic::{AtomicU64, Ordering};
use url::Url;

/// Host suffixes of well-known ad / tracking networks. Matched on label boundaries.
pub const TRACKER_HOSTS: &[&str] = &[
    // Google / Meta / Microsoft / big-tech ad and analytics endpoints
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com",
    "googletagmanager.com", "googletagservices.com", "adservice.google.com", "pagead2.googlesyndication.com",
    "2mdn.net", "admob.com", "app-measurement.com", "facebook.net", "connect.facebook.net",
    "an.facebook.com", "analytics.twitter.com", "ads-twitter.com", "ads-api.twitter.com", "static.ads-twitter.com",
    "ads.linkedin.com", "px.ads.linkedin.com", "snap.licdn.com", "bat.bing.com", "clarity.ms", "ads.yahoo.com",
    "analytics.yahoo.com", "ads.tiktok.com", "analytics.tiktok.com", "business-api.tiktok.com", "ads.pinterest.com",
    "ct.pinterest.com", "log.pinterest.com", "analytics.snapchat.com", "sc-static.net", "tr.snapchat.com",
    "amazon-adsystem.com", "aax.amazon-adsystem.com", "advertising.amazon.com",
    // Ad exchanges and networks
    "criteo.com", "criteo.net", "taboola.com", "outbrain.com", "adnxs.com", "adnxs-simple.com",
    "rubiconproject.com", "pubmatic.com", "openx.net", "openx.com", "advertising.com", "adsrvr.org",
    "casalemedia.com", "indexww.com", "zedo.com", "adform.net", "smartadserver.com", "contextweb.com",
    "lijit.com", "sovrn.com", "sharethrough.com", "triplelift.com", "33across.com", "media.net",
    "revcontent.com", "mgid.com", "adroll.com", "perfectaudience.com", "bidswitch.net", "sitescout.com",
    "yieldmo.com", "gumgum.com", "teads.tv", "moatads.com", "adsafeprotected.com", "doubleverify.com",
    "serving-sys.com", "flashtalking.com", "mathtag.com", "turn.com", "demdex.net", "everesttech.net",
    "krxd.net", "bluekai.com", "exelator.com", "eyeota.net", "tapad.com", "agkn.com", "rlcdn.com",
    "liadm.com", "id5-sync.com", "pippio.com", "adgrx.com", "adtechus.com", "adtech.de", "innovid.com",
    "spotxchange.com", "springserve.com", "freewheel.tv", "tremorhub.com", "undertone.com", "inmobi.com",
    "applovin.com", "unityads.unity3d.com", "supersonicads.com", "ironsrc.com", "vungle.com",
    "chartboost.com", "adcolony.com", "mopub.com", "smaato.net", "tapjoy.com",
    // Analytics, session replay, tag managers
    "scorecardresearch.com", "quantserve.com", "quantcount.com", "hotjar.com", "hotjar.io", "mixpanel.com",
    "segment.io", "segment.com", "amplitude.com", "heap.io", "heapanalytics.com", "fullstory.com", "logrocket.com",
    "mouseflow.com", "crazyegg.com", "luckyorange.com", "inspectlet.com", "smartlook.com", "chartbeat.com",
    "chartbeat.net", "newrelic.com", "nr-data.net", "optimizely.com", "vwo.com", "branch.io", "adjust.com",
    "appsflyer.com", "kochava.com", "singular.net", "tealiumiq.com", "tiqcdn.com", "ensighten.com", "omtrdc.net",
    "2o7.net", "adobedtm.com", "demandbase.com", "6sc.co", "bounceexchange.com", "bouncex.net", "yotpo.com",
    "kissmetrics.com", "getclicky.com", "statcounter.com", "hs-analytics.net",     "pardot.com", "marketo.net", "mktoresp.com", "munchkin.marketo.net",
];

/// Sites that trust the real browser string and flag a spoofed one as a bot (e.g. Google's "are you a robot" page).
pub fn skip_ua_spoof(host: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    ["google.com", "youtube.com", "gstatic.com", "apple.com", "icloud.com"].iter().any(|d| h == *d || h.ends_with(&format!(".{d}")))
        || h.split('.').any(|part| part == "google")
}

pub static BLOCKED_COUNT: AtomicU64 = AtomicU64::new(0);

pub fn blocked_total() -> u64 {
    BLOCKED_COUNT.load(Ordering::Relaxed)
}

pub fn is_tracker_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    TRACKER_HOSTS
        .iter()
        .any(|t| host == *t || host.ends_with(&format!(".{t}")))
}

/// Decide whether a top-level navigation is allowed. Only http(s) and about:blank may load,
/// so `javascript:`, `file:`, `data:` and custom schemes can never be opened from a page.
pub fn allow_navigation(url: &Url, block_trackers: bool) -> bool {
    match url.scheme() {
        "about" => url.as_str() == "about:blank",
        "http" | "https" => {
            if block_trackers {
                if let Some(h) = url.host_str() {
                    if is_tracker_host(h) {
                        BLOCKED_COUNT.fetch_add(1, Ordering::Relaxed);
                        return false;
                    }
                }
            }
            true
        }
        _ => false,
    }
}

/// Hosts that are never upgraded to HTTPS: loopback, private networks and `.local` names.
pub fn is_local_host(host: &str) -> bool {
    let h = host.trim_matches(|c| c == '[' || c == ']').to_ascii_lowercase();
    if h == "localhost" || h.ends_with(".localhost") || h.ends_with(".local") || !h.contains('.') && h.parse::<std::net::IpAddr>().is_err() {
        return true;
    }
    match h.parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified(),
        Ok(std::net::IpAddr::V6(ip)) => ip.is_loopback() || ip.is_unspecified(),
        Err(_) => false,
    }
}

/// `http://example.com/a` -> `https://example.com/a`; None if not applicable.
pub fn https_upgrade(url: &Url) -> Option<Url> {
    if url.scheme() != "http" || is_local_host(url.host_str()?) {
        return None;
    }
    let mut u = url.clone();
    u.set_scheme("https").ok()?;
    if url.port() == Some(80) {
        u.set_port(None).ok()?;
    }
    Some(u)
}

pub const SEARCH_ENGINES: &[(&str, &str)] = &[
    ("google", "https://www.google.com/search?q="),
    ("brave", "https://search.brave.com/search?q="),
    ("duckduckgo", "https://duckduckgo.com/?q="),
    ("bing", "https://www.bing.com/search?q="),
    ("startpage", "https://www.startpage.com/do/search?q="),
    ("ecosia", "https://www.ecosia.org/search?q="),
];

fn encode_query(q: &str) -> String {
    url::form_urlencoded::byte_serialize(q.as_bytes()).collect()
}

/// Turns whatever the user typed into a loadable URL (or a search URL).
pub fn normalize_input(input: &str, engine: &str) -> Option<Url> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(u) = Url::parse(s) {
        if matches!(u.scheme(), "http" | "https") && u.host_str().is_some() {
            return Some(u);
        }
        if s == "about:blank" {
            return Some(u);
        }
    }
    let looks_like_host = !s.contains(char::is_whitespace)
        && (s.contains('.') || s.starts_with("localhost") || s.parse::<std::net::Ipv4Addr>().is_ok());
    if looks_like_host {
        let scheme = if s.starts_with("localhost") || s.starts_with("127.") { "http" } else { "https" };
        if let Ok(u) = Url::parse(&format!("{scheme}://{s}")) {
            if u.host_str().map(|h| h.contains('.') || h == "localhost").unwrap_or(false) {
                return Some(u);
            }
        }
    }
    let base = SEARCH_ENGINES
        .iter()
        .find(|(n, _)| *n == engine)
        .map(|(_, u)| *u)
        .unwrap_or(SEARCH_ENGINES[0].1);
    Url::parse(&format!("{base}{}", encode_query(s))).ok()
}

pub const PERMISSIONS: &[&str] = &["camera", "microphone", "location", "notifications"];
pub const POLICIES: &[&str] = &["ask", "allow", "block"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn google_and_apple_never_get_a_spoofed_browser_string() {
        assert!(skip_ua_spoof("www.google.com"));
        assert!(skip_ua_spoof("accounts.google.co.uk"));
        assert!(skip_ua_spoof("youtube.com"));
        assert!(!skip_ua_spoof("example.com"));
        assert!(!skip_ua_spoof("notgoogle.com"));
    }

    #[test]
    fn tracker_list_is_clean_and_matches_subdomains() {
        assert!(TRACKER_HOSTS.iter().all(|h| !h.contains('/') && !h.contains(' ') && h.contains('.')));
        assert!(is_tracker_host("securepubads.g.doubleclick.net"));
        assert!(is_tracker_host("tr.snapchat.com"));
        assert!(!is_tracker_host("notdoubleclick.net"));
        assert!(!is_tracker_host("example.com"));
    }

    fn n(s: &str) -> String {
        normalize_input(s, "duckduckgo").unwrap().to_string()
    }

    #[test]
    fn urls_and_hosts() {
        assert_eq!(n("https://example.com/a"), "https://example.com/a");
        assert_eq!(n("example.com"), "https://example.com/");
        assert_eq!(n("localhost:3000"), "http://localhost:3000/");
    }

    #[test]
    fn searches() {
        assert_eq!(n("rust lang"), "https://duckduckgo.com/?q=rust+lang");
        assert!(normalize_input("   ", "google").is_none());
        assert!(n("javascript:alert(1)").starts_with("https://duckduckgo.com/?q="));
    }

    #[test]
    fn tracker_matching_uses_label_boundaries() {
        assert!(is_tracker_host("stats.doubleclick.net"));
        assert!(is_tracker_host("doubleclick.net"));
        assert!(!is_tracker_host("notdoubleclick.net"));
    }

    #[test]
    fn https_upgrade_rules() {
        let up = |s: &str| https_upgrade(&Url::parse(s).unwrap()).map(|u| u.to_string());
        assert_eq!(up("http://example.com/a?b=1").as_deref(), Some("https://example.com/a?b=1"));
        assert_eq!(up("http://example.com:80/").as_deref(), Some("https://example.com/"));
        assert_eq!(up("http://localhost:3000/"), None);
        assert_eq!(up("http://192.168.1.5/"), None);
        assert_eq!(up("http://127.0.0.1:8080/"), None);
        assert_eq!(up("http://printer.local/"), None);
        assert_eq!(up("http://intranet/"), None);
        assert_eq!(up("https://example.com/"), None);
    }

    #[test]
    fn navigation_policy() {
        assert!(!allow_navigation(&Url::parse("file:///etc/passwd").unwrap(), true));
        assert!(!allow_navigation(&Url::parse("javascript:alert(1)").unwrap(), true));
        assert!(!allow_navigation(&Url::parse("https://x.doubleclick.net/a").unwrap(), true));
        assert!(allow_navigation(&Url::parse("https://x.doubleclick.net/a").unwrap(), false));
        assert!(allow_navigation(&Url::parse("https://example.com").unwrap(), true));
    }
}
