//! Local persistence for the device's pairing (server URL + device token).
//!
//! The token is the long-lived credential the Bridge presents to the web app. It
//! is stored in the app's config directory with owner-only permissions where the
//! OS supports it. A production build should additionally back this with the OS
//! keychain (macOS Keychain / Windows Credential Manager) — see README.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BridgeConfig {
    /// Base URL of the Corelyx web app (e.g. https://app.corelyx.app).
    pub base_url: String,
    /// Device token (plaintext). None until the device is paired.
    pub token: Option<String>,
    /// Friendly device name shown in the UI.
    #[serde(default)]
    pub device_name: Option<String>,
}

impl BridgeConfig {
    pub fn is_paired(&self) -> bool {
        self.token.as_deref().map(|t| !t.is_empty()).unwrap_or(false) && !self.base_url.is_empty()
    }

    pub fn load(path: &Path) -> BridgeConfig {
        fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        fs::write(path, json)?;
        restrict_permissions(path);
        Ok(())
    }
}

pub fn config_path(config_dir: &Path) -> PathBuf {
    config_dir.join("bridge.json")
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    // Owner read/write only (0600) — the token must not be world-readable.
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) {
    // Windows ACLs inherit the user's profile directory restrictions; the OS
    // keychain backing (see README) is the production hardening here.
}
