//! The typed, sandboxed file operations the Bridge can perform.
//!
//! This is a closed set — never a generic "run this path" shell. Every operation
//! resolves its path(s) through [`sandbox::resolve_within_grants`] before touching
//! the disk, so an op can only ever act inside a granted folder. Results never
//! include data the operation was not explicitly asked to read.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use super::model::{GrantDto, Operation, SnapshotInfo};
use super::sandbox::{resolve_within_grants, Grant, Permission};
use super::snapshot::SnapshotStore;

/// What an op produced: its JSON result plus any prior-state snapshots it saved
/// (so the change can be rolled back). Non-mutating ops carry no snapshots.
#[derive(Debug)]
pub struct ExecOutcome {
    pub result: Value,
    pub snapshots: Vec<SnapshotInfo>,
}

/// Hard caps so a single op can't exhaust memory or stall the Bridge.
const MAX_READ_BYTES: u64 = 5 * 1024 * 1024;
const MAX_LIST_ENTRIES: usize = 1000;
const MAX_SEARCH_RESULTS: usize = 500;
const MAX_SEARCH_DEPTH: usize = 12;

pub fn grants_from_dtos(dtos: &[GrantDto]) -> Vec<Grant> {
    dtos.iter()
        .map(|d| Grant {
            root: PathBuf::from(&d.path),
            permission: Permission::from_str(&d.permission),
        })
        .collect()
}

/// Run one operation. Returns its result + any rollback snapshots on success, or
/// a human-readable error string on failure (reported back as status:"error").
pub fn execute(op: &Operation, grants: &[Grant], store: &SnapshotStore) -> Result<ExecOutcome, String> {
    // Restore is keyed by snapshot ref, not a path — handle it before the
    // generic path extraction the other ops share.
    if op.op_type == "restore" {
        let result = restore(op, grants, store)?;
        return Ok(ExecOutcome { result, snapshots: Vec::new() });
    }

    let path = arg_str(op, "path").ok_or_else(|| "missing 'path'".to_string())?;
    let requested = Path::new(path);
    let mut snaps: Vec<SnapshotInfo> = Vec::new();

    let result = match op.op_type.as_str() {
        "read" => read(requested, grants),
        "write" => write(op, requested, grants, false, store, &mut snaps),
        "append" => write(op, requested, grants, true, store, &mut snaps),
        "list" => list(requested, grants),
        "stat" => stat(requested, grants),
        "mkdir" => mkdir(requested, grants),
        "delete" => delete(op, requested, grants, store, &mut snaps),
        "move" => transfer(op, requested, grants, true, store, &mut snaps),
        "copy" => transfer(op, requested, grants, false, store, &mut snaps),
        "search" => search(op, requested, grants),
        other => Err(format!("unsupported operation '{other}'")),
    }?;

    Ok(ExecOutcome { result, snapshots: snaps })
}

fn arg_str<'a>(op: &'a Operation, key: &str) -> Option<&'a str> {
    op.args.get(key).and_then(Value::as_str)
}

fn resolve(requested: &Path, grants: &[Grant], need_write: bool) -> Result<PathBuf, String> {
    resolve_within_grants(requested, grants, need_write).map_err(|e| e.to_string())
}

fn read(requested: &Path, grants: &[Grant]) -> Result<Value, String> {
    let target = resolve(requested, grants, false)?;
    let meta = fs::metadata(&target).map_err(io)?;
    if meta.is_dir() {
        return Err("path is a directory; use 'list'".into());
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!(
            "file is {} bytes; exceeds the {} byte read cap",
            meta.len(),
            MAX_READ_BYTES
        ));
    }
    let bytes = fs::read(&target).map_err(io)?;
    match String::from_utf8(bytes) {
        Ok(text) => Ok(json!({ "encoding": "utf-8", "content": text, "bytes": meta.len() })),
        Err(e) => {
            let encoded = base64_encode(e.as_bytes());
            Ok(json!({ "encoding": "base64", "content": encoded, "bytes": meta.len() }))
        }
    }
}

fn write(
    op: &Operation,
    requested: &Path,
    grants: &[Grant],
    append: bool,
    store: &SnapshotStore,
    snaps: &mut Vec<SnapshotInfo>,
) -> Result<Value, String> {
    let target = resolve(requested, grants, true)?;
    // Save the prior state before we change it. Append still snapshots the file
    // so a rollback can truncate it back to its pre-append length.
    if let Some(info) = store.capture(&target, if append { "append" } else { "write" }) {
        snaps.push(info);
    }
    let content = arg_str(op, "content").unwrap_or("");
    if append {
        use std::io::Write;
        let mut f = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&target)
            .map_err(io)?;
        f.write_all(content.as_bytes()).map_err(io)?;
    } else {
        fs::write(&target, content.as_bytes()).map_err(io)?;
    }
    Ok(json!({ "path": target.to_string_lossy(), "bytes_written": content.len() }))
}

fn list(requested: &Path, grants: &[Grant]) -> Result<Value, String> {
    let dir = resolve(requested, grants, false)?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for entry in fs::read_dir(&dir).map_err(io)? {
        if entries.len() >= MAX_LIST_ENTRIES {
            truncated = true;
            break;
        }
        let entry = entry.map_err(io)?;
        let meta = entry.metadata().map_err(io)?;
        entries.push(json!({
            "name": entry.file_name().to_string_lossy(),
            "is_dir": meta.is_dir(),
            "size": meta.len(),
        }));
    }
    Ok(json!({ "path": dir.to_string_lossy(), "entries": entries, "truncated": truncated }))
}

fn stat(requested: &Path, grants: &[Grant]) -> Result<Value, String> {
    let target = resolve(requested, grants, false)?;
    let meta = fs::metadata(&target).map_err(io)?;
    Ok(json!({
        "path": target.to_string_lossy(),
        "is_dir": meta.is_dir(),
        "size": meta.len(),
        "readonly": meta.permissions().readonly(),
    }))
}

fn mkdir(requested: &Path, grants: &[Grant]) -> Result<Value, String> {
    let target = resolve(requested, grants, true)?;
    fs::create_dir_all(&target).map_err(io)?;
    Ok(json!({ "path": target.to_string_lossy(), "created": true }))
}

fn delete(
    op: &Operation,
    requested: &Path,
    grants: &[Grant],
    store: &SnapshotStore,
    snaps: &mut Vec<SnapshotInfo>,
) -> Result<Value, String> {
    let target = resolve(requested, grants, true)?;
    let meta = fs::metadata(&target).map_err(io)?;
    // Snapshot a file before removing it so it can be restored. (Directory
    // deletes aren't snapshotted — a recursive tree can't be captured as one
    // blob; that's a Phase-3 concern.)
    if meta.is_file() {
        if let Some(info) = store.capture(&target, "delete") {
            snaps.push(info);
        }
    }
    if meta.is_dir() {
        let recursive = op.args.get("recursive").and_then(Value::as_bool).unwrap_or(false);
        if recursive {
            fs::remove_dir_all(&target).map_err(io)?;
        } else {
            // Refuse to silently wipe a non-empty tree; require an explicit flag.
            fs::remove_dir(&target).map_err(|_| {
                "directory is not empty; pass recursive:true to delete it".to_string()
            })?;
        }
    } else {
        fs::remove_file(&target).map_err(io)?;
    }
    Ok(json!({ "path": target.to_string_lossy(), "deleted": true }))
}

fn transfer(
    op: &Operation,
    requested: &Path,
    grants: &[Grant],
    is_move: bool,
    store: &SnapshotStore,
    snaps: &mut Vec<SnapshotInfo>,
) -> Result<Value, String> {
    let dest_str = arg_str(op, "dest").ok_or_else(|| "missing 'dest'".to_string())?;
    // Move removes the source, so the source needs write access too; copy only reads it.
    let source = resolve(requested, grants, is_move)?;
    let dest = resolve(Path::new(dest_str), grants, true)?;
    // A move removes the source — snapshot it so it can be put back. Either op may
    // overwrite an existing dest — snapshot that too. (capture records non-
    // existence for dest when it's a fresh target, so restore can delete it.)
    if is_move {
        if let Some(info) = store.capture(&source, "move") {
            snaps.push(info);
        }
    }
    if let Some(info) = store.capture(&dest, if is_move { "move" } else { "copy" }) {
        snaps.push(info);
    }
    if is_move {
        fs::rename(&source, &dest).map_err(io)?;
    } else {
        if fs::metadata(&source).map_err(io)?.is_dir() {
            return Err("copy of directories is not supported yet".into());
        }
        fs::copy(&source, &dest).map_err(io)?;
    }
    Ok(json!({ "from": source.to_string_lossy(), "to": dest.to_string_lossy() }))
}

/// Roll a file back to a snapshot's prior state. `ref` names a snapshot the
/// Bridge itself saved earlier; the original path is re-validated against the
/// current grants, so a folder that has since been un-granted can't be written.
fn restore(op: &Operation, grants: &[Grant], store: &SnapshotStore) -> Result<Value, String> {
    let reference = arg_str(op, "ref").ok_or_else(|| "missing 'ref'".to_string())?;
    let meta = store
        .load_meta(reference)
        .ok_or_else(|| "snapshot not found or already pruned".to_string())?;

    let original = Path::new(&meta.original_path);
    let target = resolve(original, grants, true)?;

    if meta.existed {
        let bin = store.bin_path(reference);
        if !bin.is_file() {
            return Err("snapshot bytes are no longer available".into());
        }
        fs::copy(&bin, &target).map_err(io)?;
        Ok(json!({
            "restored": true,
            "path": target.to_string_lossy(),
            "bytes": meta.size_bytes,
        }))
    } else {
        // The snapshotted op had created this path; undo = remove it.
        if target.is_file() {
            fs::remove_file(&target).map_err(io)?;
        }
        Ok(json!({
            "restored": true,
            "path": target.to_string_lossy(),
            "deleted": true,
        }))
    }
}

fn search(op: &Operation, requested: &Path, grants: &[Grant]) -> Result<Value, String> {
    let root = resolve(requested, grants, false)?;
    let needle = arg_str(op, "pattern").unwrap_or("").to_lowercase();
    let mut matches: Vec<String> = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.clone(), 0)];
    while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_SEARCH_DEPTH || matches.len() >= MAX_SEARCH_RESULTS {
            continue;
        }
        let Ok(read_dir) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in read_dir.flatten() {
            if matches.len() >= MAX_SEARCH_RESULTS {
                break;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let path = entry.path();
            if needle.is_empty() || name.contains(&needle) {
                matches.push(path.to_string_lossy().to_string());
            }
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                stack.push((path, depth + 1));
            }
        }
    }
    let truncated = matches.len() >= MAX_SEARCH_RESULTS;
    Ok(json!({ "root": root.to_string_lossy(), "matches": matches, "truncated": truncated }))
}

fn io(e: std::io::Error) -> String {
    e.to_string()
}

/// Minimal base64 encoder (avoids a dependency) for returning binary file reads.
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        out.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp() -> PathBuf {
        let mut d = std::env::temp_dir();
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        d.push(format!("corelyx_ops_{n}"));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn op(op_type: &str, args: Value) -> Operation {
        Operation {
            id: "op1".into(),
            op_type: op_type.into(),
            args,
        }
    }

    fn store_for(dir: &PathBuf) -> SnapshotStore {
        SnapshotStore::new(dir)
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = temp();
        let store = store_for(&dir);
        let grants = grants_from_dtos(&[GrantDto {
            path: dir.to_string_lossy().to_string(),
            permission: "read_write".into(),
        }]);
        let file = dir.join("note.txt");
        let w = execute(
            &op("write", json!({ "path": file.to_string_lossy(), "content": "hello" })),
            &grants,
            &store,
        )
        .unwrap();
        assert_eq!(w.result["bytes_written"], 5);
        let r = execute(
            &op("read", json!({ "path": file.to_string_lossy() })),
            &grants,
            &store,
        )
        .unwrap();
        assert_eq!(r.result["content"], "hello");
        assert_eq!(r.result["encoding"], "utf-8");
    }

    #[test]
    fn write_denied_on_read_only_grant() {
        let dir = temp();
        let store = store_for(&dir);
        let grants = grants_from_dtos(&[GrantDto {
            path: dir.to_string_lossy().to_string(),
            permission: "read".into(),
        }]);
        let file = dir.join("x.txt");
        let err = execute(
            &op("write", json!({ "path": file.to_string_lossy(), "content": "no" })),
            &grants,
            &store,
        )
        .unwrap_err();
        assert!(err.contains("read-only"));
    }

    #[test]
    fn overwrite_snapshots_and_restore_rolls_back() {
        let dir = temp();
        let store = store_for(&dir);
        let grants = grants_from_dtos(&[GrantDto {
            path: dir.to_string_lossy().to_string(),
            permission: "read_write".into(),
        }]);
        let file = dir.join("doc.txt");

        // Create, then overwrite — the overwrite must snapshot the prior bytes.
        execute(
            &op("write", json!({ "path": file.to_string_lossy(), "content": "v1" })),
            &grants,
            &store,
        )
        .unwrap();
        let over = execute(
            &op("write", json!({ "path": file.to_string_lossy(), "content": "v2-clobbered" })),
            &grants,
            &store,
        )
        .unwrap();
        assert_eq!(over.snapshots.len(), 1, "overwrite should snapshot prior state");
        assert!(over.snapshots[0].existed);
        let snap_ref = over.snapshots[0].reference.clone();
        assert_eq!(fs::read_to_string(&file).unwrap(), "v2-clobbered");

        // Restore brings the file back to "v1".
        let res = execute(&op("restore", json!({ "ref": snap_ref })), &grants, &store).unwrap();
        assert_eq!(res.result["restored"], true);
        assert_eq!(fs::read_to_string(&file).unwrap(), "v1");
    }

    #[test]
    fn restore_of_created_file_deletes_it() {
        let dir = temp();
        let store = store_for(&dir);
        let grants = grants_from_dtos(&[GrantDto {
            path: dir.to_string_lossy().to_string(),
            permission: "read_write".into(),
        }]);
        let file = dir.join("fresh.txt");

        // Writing a brand-new file snapshots its non-existence.
        let created = execute(
            &op("write", json!({ "path": file.to_string_lossy(), "content": "new" })),
            &grants,
            &store,
        )
        .unwrap();
        assert_eq!(created.snapshots.len(), 1);
        assert!(!created.snapshots[0].existed);
        assert!(file.is_file());

        // Restoring that snapshot undoes the creation.
        execute(
            &op("restore", json!({ "ref": created.snapshots[0].reference.clone() })),
            &grants,
            &store,
        )
        .unwrap();
        assert!(!file.exists());
    }

    #[test]
    fn base64_roundtrips_simple_input() {
        assert_eq!(base64_encode(b"Man"), "TWFu");
        assert_eq!(base64_encode(b"Ma"), "TWE=");
        assert_eq!(base64_encode(b"M"), "TQ==");
    }
}
