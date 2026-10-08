//! Pebble Memory Saver: suspends idle background tabs to free RAM.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Balanced,
    Maximum,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConfig {
    pub enabled: bool,
    pub mode: Mode,
    /// Overrides the mode's default idle timeout when set.
    pub timeout_minutes: Option<u64>,
}

impl Default for MemoryConfig {
    fn default() -> Self {
        Self { enabled: true, mode: Mode::Balanced, timeout_minutes: None }
    }
}

/// Fraction of system RAM in use above which timeouts are halved.
pub const PRESSURE_THRESHOLD: f32 = 0.85;

impl MemoryConfig {
    pub fn idle_timeout(&self, memory_pressure: f32) -> Duration {
        let mins = self.timeout_minutes.unwrap_or(match self.mode {
            Mode::Balanced => 20,
            Mode::Maximum => 5,
        });
        let mut secs = mins.max(1) * 60;
        if memory_pressure >= PRESSURE_THRESHOLD {
            secs /= 2;
        }
        Duration::from_secs(secs)
    }
}

/// Everything the suspension decision depends on.
#[derive(Debug, Clone, Copy)]
pub struct TabFacts {
    pub is_active: bool,
    pub pinned: bool,
    pub audible: bool,
    pub recording: bool,
    pub downloading: bool,
    pub suspended: bool,
    pub has_page: bool,
    pub idle: Duration,
}

/// Exclusion rules: never suspend the active tab, pinned tabs, tabs that play audio,
/// capture camera/mic, or are downloading a file.
pub fn should_suspend(cfg: &MemoryConfig, t: &TabFacts, memory_pressure: f32) -> bool {
    cfg.enabled
        && t.has_page
        && !t.suspended
        && !t.is_active
        && !t.pinned
        && !t.audible
        && !t.recording
        && !t.downloading
        && t.idle >= cfg.idle_timeout(memory_pressure)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> TabFacts {
        TabFacts {
            is_active: false, pinned: false, audible: false, recording: false,
            downloading: false, suspended: false, has_page: true, idle: Duration::from_secs(3600),
        }
    }

    #[test]
    fn idle_background_tab_is_suspended() {
        assert!(should_suspend(&MemoryConfig::default(), &facts(), 0.2));
    }

    #[test]
    fn exclusions_hold() {
        let cfg = MemoryConfig::default();
        for f in [
            TabFacts { is_active: true, ..facts() },
            TabFacts { pinned: true, ..facts() },
            TabFacts { audible: true, ..facts() },
            TabFacts { recording: true, ..facts() },
            TabFacts { downloading: true, ..facts() },
            TabFacts { suspended: true, ..facts() },
            TabFacts { has_page: false, ..facts() },
            TabFacts { idle: Duration::from_secs(60), ..facts() },
        ] {
            assert!(!should_suspend(&cfg, &f, 0.2));
        }
    }

    #[test]
    fn modes_and_pressure_change_timeout() {
        let bal = MemoryConfig::default();
        let max = MemoryConfig { mode: Mode::Maximum, ..bal.clone() };
        assert_eq!(bal.idle_timeout(0.1), Duration::from_secs(1200));
        assert_eq!(max.idle_timeout(0.1), Duration::from_secs(300));
        assert_eq!(max.idle_timeout(0.95), Duration::from_secs(150));
    }

    #[test]
    fn disabled_never_suspends() {
        let cfg = MemoryConfig { enabled: false, ..MemoryConfig::default() };
        assert!(!should_suspend(&cfg, &facts(), 0.99));
    }
}
