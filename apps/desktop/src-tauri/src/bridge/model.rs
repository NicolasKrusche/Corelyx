//! Wire types shared with the web app's Bridge endpoints (/api/bridge/*).
//!
//! These mirror the file_operations / device_folder_grants contract. Keep field
//! names in sync with the web routes and the Supabase migration.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub struct GrantDto {
    pub path: String,
    pub permission: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Operation {
    pub id: String,
    pub op_type: String,
    #[serde(default)]
    pub args: Value,
}

/// A folder the web app wants this device to watch (a `file_watch` trigger).
/// `path`/`events`/`patterns` come straight from the trigger config — the Bridge
/// still re-validates `path` against its grants before watching anything.
#[derive(Debug, Clone, Deserialize)]
pub struct WatchDto {
    pub trigger_id: String,
    pub path: String,
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub patterns: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PollResponse {
    #[serde(default)]
    pub grants: Vec<GrantDto>,
    #[serde(default)]
    pub operations: Vec<Operation>,
    #[serde(default)]
    pub watches: Vec<WatchDto>,
}

/// One filesystem change the Bridge observed in a watched folder, reported to
/// `POST /api/bridge/events`. Mirrors the Zod schema on that route.
#[derive(Debug, Clone, Serialize)]
pub struct WatchEvent {
    pub trigger_id: String,
    /// "created" | "modified" | "deleted"
    pub event: String,
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
pub struct EventsBody {
    pub events: Vec<WatchEvent>,
}

/// Metadata for one prior-state snapshot the Bridge saved before a mutating op,
/// reported alongside the op result so the web can index it for rollback. The
/// bytes themselves stay on the device, found later by `reference`.
#[derive(Debug, Clone, Serialize)]
pub struct SnapshotInfo {
    #[serde(rename = "ref")]
    pub reference: String,
    pub original_path: String,
    pub operation: String,
    pub size_bytes: u64,
    /// false → the op created this path; restoring means deleting it.
    pub existed: bool,
}

#[derive(Debug, Serialize)]
pub struct SubmitBody {
    /// "done" | "error"
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Prior-state snapshots captured while running this op (empty for read-only
    /// ops and for ops that changed nothing).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub snapshots: Vec<SnapshotInfo>,
}

impl SubmitBody {
    pub fn done(result: Value, snapshots: Vec<SnapshotInfo>) -> SubmitBody {
        SubmitBody {
            status: "done".into(),
            result: Some(result),
            error: None,
            snapshots,
        }
    }

    pub fn error(message: impl Into<String>) -> SubmitBody {
        SubmitBody {
            status: "error".into(),
            result: None,
            error: Some(message.into()),
            snapshots: Vec::new(),
        }
    }
}
