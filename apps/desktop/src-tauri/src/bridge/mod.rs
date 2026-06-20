//! The Bridge: poll the web app for file operations, run them inside granted
//! folders, and report results. This is the new capability the desktop app
//! exists to deliver.

pub mod client;
pub mod model;
pub mod ops;
pub mod sandbox;
pub mod snapshot;
pub mod watcher;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use client::BridgeClient;
use model::SubmitBody;
use snapshot::SnapshotStore;

/// Shared, observable Bridge state for the tray/UI.
#[derive(Debug, Clone, Default)]
pub struct BridgeStatus {
    pub connected: bool,
    pub last_error: Option<String>,
    pub ops_completed: u64,
    pub last_activity_unix: Option<u64>,
    /// Number of folders currently being watched for `file_watch` triggers.
    pub watches_active: usize,
}

pub type SharedStatus = Arc<Mutex<BridgeStatus>>;

/// Poll cadence. Fast tick right after doing work (likely more queued), slower
/// when idle to keep the device quiet. A dropped connection backs off further.
const IDLE_INTERVAL: Duration = Duration::from_secs(3);
const BUSY_INTERVAL: Duration = Duration::from_millis(500);
const ERROR_INTERVAL: Duration = Duration::from_secs(10);

/// Run the poll/execute/submit loop forever. Spawn this on the async runtime.
/// `snapshots` is the local rollback store (kept for the loop's lifetime).
pub async fn run_loop(client: BridgeClient, status: SharedStatus, snapshots: SnapshotStore) {
    // The watcher persists across iterations: it holds the live OS watchers and
    // a queue of filesystem events that accumulate between polls.
    let mut watcher = watcher::WatcherManager::new();

    loop {
        let delay = match client.poll().await {
            Ok(resp) => {
                let grants = ops::grants_from_dtos(&resp.grants);

                // Run any queued file operations.
                let had_ops = !resp.operations.is_empty();
                for op in &resp.operations {
                    let body = match ops::execute(op, &grants, &snapshots) {
                        Ok(outcome) => SubmitBody::done(outcome.result, outcome.snapshots),
                        Err(message) => SubmitBody::error(message),
                    };
                    if let Err(e) = client.submit(&op.id, &body).await {
                        eprintln!("[bridge] submit failed for op {}: {e}", op.id);
                    } else {
                        bump_completed(&status);
                    }
                }

                // Bring folder watchers in line with the active file_watch
                // triggers, then report any changes seen since the last poll.
                watcher.reconcile(&resp.watches, &grants);
                let matched = watcher.drain_matched();
                let had_events = !matched.is_empty();
                if had_events {
                    if let Err(e) = client.report_events(&matched).await {
                        eprintln!("[bridge] report_events failed: {e}");
                    } else {
                        bump_activity(&status);
                    }
                }

                mark_connected(&status, watcher.active_count());
                if had_ops || had_events {
                    BUSY_INTERVAL
                } else {
                    IDLE_INTERVAL
                }
            }
            Err(e) => {
                mark_error(&status, e);
                ERROR_INTERVAL
            }
        };
        tokio::time::sleep(delay).await;
    }
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn mark_connected(status: &SharedStatus, watches_active: usize) {
    if let Ok(mut s) = status.lock() {
        s.connected = true;
        s.last_error = None;
        s.last_activity_unix = Some(now_unix());
        s.watches_active = watches_active;
    }
}

fn bump_activity(status: &SharedStatus) {
    if let Ok(mut s) = status.lock() {
        s.last_activity_unix = Some(now_unix());
    }
}

fn mark_error(status: &SharedStatus, message: String) {
    eprintln!("[bridge] poll error: {message}");
    if let Ok(mut s) = status.lock() {
        s.connected = false;
        s.last_error = Some(message);
    }
}

fn bump_completed(status: &SharedStatus) {
    if let Ok(mut s) = status.lock() {
        s.ops_completed += 1;
        s.last_activity_unix = Some(now_unix());
    }
}
