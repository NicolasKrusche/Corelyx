//! Local snapshot store for the file rollback sandbox.
//!
//! Before any op that modifies or removes an existing file, the Bridge copies
//! the current bytes here so the change can be undone losslessly. Snapshots live
//! on the device (next to the Bridge config); only metadata is reported to the
//! cloud, so file contents never leave the machine. Retention is bounded by age
//! and total size so the store can't grow without limit.
//!
//! A snapshot captures the *prior* state of one path:
//!   - `existed = true`  → the bytes are saved (`<id>.bin`); restore writes them back.
//!   - `existed = false` → the op created the path; restore deletes it.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::model::SnapshotInfo;

/// Don't snapshot files larger than this — a huge file would blow the store.
/// Such an op is then non-undoable (the result still notes nothing was saved).
const MAX_SNAPSHOT_BYTES: u64 = 50 * 1024 * 1024;
/// Prune snapshots older than this.
const RETENTION_SECS: u64 = 14 * 24 * 60 * 60; // 14 days
/// Prune oldest snapshots once the store exceeds this total size.
const MAX_STORE_BYTES: u64 = 512 * 1024 * 1024; // 512 MB

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMeta {
    pub id: String,
    pub original_path: String,
    pub operation: String,
    pub size_bytes: u64,
    pub existed: bool,
    pub created_unix: u64,
}

pub struct SnapshotStore {
    dir: PathBuf,
}

impl SnapshotStore {
    /// Store rooted at `<base_dir>/snapshots`.
    pub fn new(base_dir: &Path) -> SnapshotStore {
        let dir = base_dir.join("snapshots");
        let _ = fs::create_dir_all(&dir);
        SnapshotStore { dir }
    }

    /// Capture the prior state of `path` before an op modifies or removes it.
    /// Best-effort: a snapshot failure is logged and returns None (the op still
    /// runs — but is then non-undoable). `path` must already be the resolved,
    /// grant-checked target.
    pub fn capture(&self, path: &Path, operation: &str) -> Option<SnapshotInfo> {
        let id = new_id();
        let existed = path.is_file();
        let mut size_bytes = 0u64;

        if existed {
            match fs::metadata(path) {
                Ok(m) if m.len() <= MAX_SNAPSHOT_BYTES => {
                    if let Err(e) = fs::copy(path, self.bin_path(&id)) {
                        eprintln!("[bridge] snapshot copy failed for {}: {e}", path.display());
                        return None;
                    }
                    size_bytes = m.len();
                }
                Ok(m) => {
                    eprintln!(
                        "[bridge] not snapshotting {} — {} bytes over the {} cap",
                        path.display(),
                        m.len(),
                        MAX_SNAPSHOT_BYTES
                    );
                    return None;
                }
                Err(_) => return None,
            }
        }

        let meta = SnapshotMeta {
            id: id.clone(),
            original_path: path.to_string_lossy().to_string(),
            operation: operation.to_string(),
            size_bytes,
            existed,
            created_unix: now_unix(),
        };
        let meta_json = match serde_json::to_vec(&meta) {
            Ok(j) => j,
            Err(_) => return None,
        };
        if let Err(e) = fs::write(self.meta_path(&id), meta_json) {
            eprintln!("[bridge] snapshot meta write failed: {e}");
            let _ = fs::remove_file(self.bin_path(&id)); // don't orphan the bytes
            return None;
        }

        self.prune();

        Some(SnapshotInfo {
            reference: meta.id,
            original_path: meta.original_path,
            operation: meta.operation,
            size_bytes: meta.size_bytes,
            existed: meta.existed,
        })
    }

    /// Load a snapshot's metadata by reference, if it still exists.
    pub fn load_meta(&self, reference: &str) -> Option<SnapshotMeta> {
        if !is_safe_ref(reference) {
            return None;
        }
        let bytes = fs::read(self.meta_path(reference)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn bin_path(&self, reference: &str) -> PathBuf {
        self.dir.join(format!("{reference}.bin"))
    }

    fn meta_path(&self, reference: &str) -> PathBuf {
        self.dir.join(format!("{reference}.json"))
    }

    /// Drop snapshots older than the retention window, then, if still over the
    /// size cap, drop the oldest until under it. Best-effort.
    fn prune(&self) {
        let mut entries: Vec<(u64, u64, String)> = Vec::new(); // (created_unix, size, id)
        let now = now_unix();
        let Ok(read_dir) = fs::read_dir(&self.dir) else {
            return;
        };
        for entry in read_dir.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Some(id) = p.file_stem().and_then(|s| s.to_str()).map(String::from) else {
                continue;
            };
            let Some(meta) = self.load_meta(&id) else { continue };

            if now.saturating_sub(meta.created_unix) > RETENTION_SECS {
                self.remove(&id);
                continue;
            }
            entries.push((meta.created_unix, meta.size_bytes, id));
        }

        let total: u64 = entries.iter().map(|(_, size, _)| *size).sum();
        if total <= MAX_STORE_BYTES {
            return;
        }
        entries.sort_by_key(|(created, _, _)| *created); // oldest first
        let mut over = total - MAX_STORE_BYTES;
        for (_, size, id) in entries {
            if over == 0 {
                break;
            }
            self.remove(&id);
            over = over.saturating_sub(size);
        }
    }

    fn remove(&self, id: &str) {
        let _ = fs::remove_file(self.bin_path(id));
        let _ = fs::remove_file(self.meta_path(id));
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// A hex id used as the snapshot basename. Not cryptographic — just collision-
/// free per device: the wall clock makes it unique across process restarts, the
/// process-lifetime counter makes it unique within a busy run.
fn new_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{nanos:032x}{n:016x}")
}

/// Guard against path traversal in a reference coming back from the web: a ref is
/// only ever our own hex basename.
fn is_safe_ref(reference: &str) -> bool {
    !reference.is_empty()
        && reference.len() <= 64
        && reference.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_store() -> (SnapshotStore, PathBuf) {
        let base = std::env::temp_dir().join(format!("corelyx-snap-test-{}", new_id()));
        fs::create_dir_all(&base).unwrap();
        (SnapshotStore::new(&base), base)
    }

    #[test]
    fn captures_and_restores_existing_file() {
        let (store, base) = temp_store();
        let file = base.join("doc.txt");
        let mut f = fs::File::create(&file).unwrap();
        f.write_all(b"original").unwrap();
        drop(f);

        let info = store.capture(&file, "write").expect("snapshot");
        assert!(info.existed);
        assert_eq!(info.size_bytes, 8);

        // Simulate the op overwriting the file.
        fs::write(&file, b"clobbered").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"clobbered");

        // Restore the saved bytes.
        let meta = store.load_meta(&info.reference).unwrap();
        assert!(meta.existed);
        fs::copy(store.bin_path(&info.reference), &file).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"original");
    }

    #[test]
    fn capture_of_absent_file_records_nonexistence() {
        let (store, base) = temp_store();
        let file = base.join("new.txt"); // does not exist yet
        let info = store.capture(&file, "write").expect("snapshot");
        assert!(!info.existed);
        assert_eq!(info.size_bytes, 0);
        // No bytes are saved for a not-yet-existing file.
        assert!(!store.bin_path(&info.reference).exists());
    }

    #[test]
    fn rejects_unsafe_reference() {
        let (store, _base) = temp_store();
        assert!(store.load_meta("../etc/passwd").is_none());
        assert!(store.load_meta("..").is_none());
        assert!(store.load_meta("not-hex!").is_none());
    }
}
