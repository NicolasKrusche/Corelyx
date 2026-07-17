//! Local persistence for the device's pairing.
//!
//! Non-sensitive settings live in `bridge.json`; the long-lived device token is
//! stored in the operating system's credential vault. `PersistedBridgeConfig`
//! still accepts the legacy plaintext field so existing installs can migrate it
//! on their next launch, but serialization can never write that field again.

use std::fs;
use std::path::{Path, PathBuf};

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "app.corelyx.desktop";
const KEYRING_USER: &str = "device-token";

#[derive(Debug, Clone, Default)]
pub struct BridgeConfig {
    /// Base URL of the Corelyx web app (e.g. https://app.corelyx.app).
    pub base_url: String,
    /// Device token loaded from the OS credential vault. None until paired.
    pub token: Option<String>,
    /// Friendly device name shown in the UI.
    pub device_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct PersistedBridgeConfig {
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    device_name: Option<String>,
    /// Read old configs during migration, but never serialize a credential.
    #[serde(default, skip_serializing)]
    token: Option<String>,
}

impl BridgeConfig {
    pub fn is_paired(&self) -> bool {
        self.token
            .as_deref()
            .map(|t| !t.is_empty())
            .unwrap_or(false)
            && !self.base_url.is_empty()
    }

    pub fn load(path: &Path) -> BridgeConfig {
        let persisted: PersistedBridgeConfig = fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        let mut token = credential_entry()
            .and_then(|entry| entry.get_password())
            .ok();

        if token.is_none() {
            if let Some(legacy_token) = persisted.token.filter(|value| !value.is_empty()) {
                match credential_entry().and_then(|entry| entry.set_password(&legacy_token)) {
                    Ok(()) => {
                        token = Some(legacy_token);
                        let sanitized = PersistedBridgeConfig {
                            base_url: persisted.base_url.clone(),
                            device_name: persisted.device_name.clone(),
                            token: None,
                        };
                        let _ = save_persisted(path, &sanitized);
                    }
                    Err(error) => {
                        // Preserve existing installations if their credential
                        // vault is temporarily unavailable; retry next launch.
                        eprintln!("Could not migrate desktop credential to the OS vault: {error}");
                        token = Some(legacy_token);
                    }
                }
            }
        }

        BridgeConfig {
            base_url: persisted.base_url,
            token,
            device_name: persisted.device_name,
        }
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let entry = credential_entry().map_err(keyring_io_error)?;
        match self.token.as_deref().filter(|value| !value.is_empty()) {
            Some(token) => entry.set_password(token).map_err(keyring_io_error)?,
            None => match entry.delete_credential() {
                Ok(()) | Err(KeyringError::NoEntry) => {}
                Err(error) => return Err(keyring_io_error(error)),
            },
        }

        save_persisted(
            path,
            &PersistedBridgeConfig {
                base_url: self.base_url.clone(),
                device_name: self.device_name.clone(),
                token: None,
            },
        )
    }
}

fn credential_entry() -> Result<Entry, KeyringError> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
}

fn keyring_io_error(error: KeyringError) -> std::io::Error {
    std::io::Error::other(format!("OS credential vault error: {error}"))
}

fn save_persisted(path: &Path, config: &PersistedBridgeConfig) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config).map_err(std::io::Error::other)?;
    fs::write(path, json)?;
    restrict_permissions(path);
    Ok(())
}

pub fn config_path(config_dir: &Path) -> PathBuf {
    config_dir.join("bridge.json")
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) {
    // Windows ACLs inherit the user's profile-directory restrictions. The
    // credential itself is held by Windows Credential Manager.
}

#[cfg(test)]
mod tests {
    use super::PersistedBridgeConfig;

    #[test]
    fn legacy_token_is_read_but_never_serialized() {
        let config: PersistedBridgeConfig = serde_json::from_str(
            r#"{"base_url":"https://corelyx.app","device_name":"Laptop","token":"legacy-secret"}"#,
        )
        .unwrap();

        assert_eq!(config.token.as_deref(), Some("legacy-secret"));
        let serialized = serde_json::to_string(&config).unwrap();
        assert!(!serialized.contains("legacy-secret"));
        assert!(!serialized.contains("token"));
    }
}
