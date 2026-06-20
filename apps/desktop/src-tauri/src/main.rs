// Prevent a console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use corelyx_bridge::bridge::client::BridgeClient;
use corelyx_bridge::bridge::snapshot::SnapshotStore;
use corelyx_bridge::bridge::{run_loop, BridgeStatus, SharedStatus};
use corelyx_bridge::config::{config_path, BridgeConfig};
use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tauri::{Manager, State};

/// App-wide state: the live Bridge status, the config path, and a handle to the
/// running poll loop so re-pairing can restart it cleanly.
struct AppState {
    status: SharedStatus,
    config_file: PathBuf,
    loop_handle: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Serialize)]
struct StatusDto {
    paired: bool,
    connected: bool,
    base_url: String,
    device_name: Option<String>,
    last_error: Option<String>,
    ops_completed: u64,
    last_activity_unix: Option<u64>,
    watches_active: usize,
}

fn start_loop(state: &AppState, cfg: &BridgeConfig) {
    let Some(token) = cfg.token.clone() else { return };
    // Stop any previous loop before starting a new one.
    if let Ok(mut handle) = state.loop_handle.lock() {
        if let Some(h) = handle.take() {
            h.abort();
        }
        let client = BridgeClient::new(cfg.base_url.clone(), token);
        let status = state.status.clone();
        // Snapshots live next to the config file (…/snapshots).
        let base_dir = state
            .config_file
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let snapshots = SnapshotStore::new(&base_dir);
        *handle = Some(tauri::async_runtime::spawn(run_loop(client, status, snapshots)));
    }
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> StatusDto {
    let cfg = BridgeConfig::load(&state.config_file);
    let s = state
        .status
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    StatusDto {
        paired: cfg.is_paired(),
        connected: s.connected,
        base_url: cfg.base_url,
        device_name: cfg.device_name,
        last_error: s.last_error,
        ops_completed: s.ops_completed,
        last_activity_unix: s.last_activity_unix,
        watches_active: s.watches_active,
    }
}

fn do_pair(
    state: &AppState,
    base_url: String,
    token: String,
    device_name: Option<String>,
) -> Result<(), String> {
    let base_url = base_url.trim().trim_end_matches('/').to_string();
    let token = token.trim().to_string();
    if base_url.is_empty() || token.is_empty() {
        return Err("Server URL and device token are both required.".into());
    }
    if !token.starts_with("crlxdev_") {
        return Err("That does not look like a Corelyx device token.".into());
    }
    let cfg = BridgeConfig {
        base_url,
        token: Some(token),
        device_name,
    };
    cfg.save(&state.config_file).map_err(|e| e.to_string())?;
    start_loop(state, &cfg);
    Ok(())
}

/// Called by the web app's post-login handshake: it registers a device for the
/// signed-in session and hands the token straight to the Bridge — no copy-paste.
#[tauri::command]
fn set_device_token(
    state: State<'_, AppState>,
    base_url: String,
    token: String,
) -> Result<(), String> {
    do_pair(&state, base_url, token, None)
}

/// Manual pairing fallback (advanced / headless), kept for parity with the
/// Settings → Devices token. The login handshake is the primary path.
#[tauri::command]
fn pair(
    state: State<'_, AppState>,
    base_url: String,
    token: String,
    device_name: Option<String>,
) -> Result<(), String> {
    do_pair(&state, base_url, token, device_name)
}

#[tauri::command]
fn unpair(state: State<'_, AppState>) -> Result<(), String> {
    // Forget the token locally and stop polling. (Revoke server-side from the web
    // Settings → Devices page to invalidate the token everywhere.)
    let cfg = BridgeConfig::default();
    cfg.save(&state.config_file).map_err(|e| e.to_string())?;
    if let Ok(mut handle) = state.loop_handle.lock() {
        if let Some(h) = handle.take() {
            h.abort();
        }
    }
    if let Ok(mut s) = state.status.lock() {
        *s = BridgeStatus::default();
    }
    Ok(())
}

/// Check the signed update manifest on launch and, if a newer version is
/// available, download + verify (against the pubkey in tauri.conf.json) + install
/// it, then relaunch. Release builds only — best-effort, never blocks startup.
#[cfg(not(debug_assertions))]
async fn check_and_install_update(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[updater] init failed: {e}");
            return;
        }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            eprintln!("[updater] update {} available — downloading", update.version);
            if let Err(e) = update.download_and_install(|_chunk, _total| {}, || {}).await {
                eprintln!("[updater] install failed: {e}");
                return;
            }
            eprintln!("[updater] installed — restarting");
            app.restart();
        }
        Ok(None) => {} // already up to date
        Err(e) => eprintln!("[updater] check failed: {e}"),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let state = AppState {
                status: Arc::new(Mutex::new(BridgeStatus::default())),
                config_file: config_path(&config_dir),
                loop_handle: Mutex::new(None),
            };

            // Resume polling immediately if the device is already paired.
            let cfg = BridgeConfig::load(&state.config_file);
            if cfg.is_paired() {
                start_loop(&state, &cfg);
            }

            app.manage(state);

            // Auto-update on launch (release only).
            #[cfg(not(debug_assertions))]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(check_and_install_update(handle));
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            set_device_token,
            pair,
            unpair
        ])
        .run(tauri::generate_context!())
        .expect("error while running Corelyx Desktop");
}
