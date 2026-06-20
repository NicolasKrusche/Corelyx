//! The path sandbox — the single most important security control in the Bridge.
//!
//! A file operation may only touch a path that resolves to a real location inside
//! one of the device's granted folders. This module canonicalises the requested
//! path (following symlinks), then checks containment **component-wise** against
//! the canonicalised grant roots. A non-existent target (a write/mkdir) is
//! resolved against its nearest existing ancestor, and any `..` in the remaining
//! tail is rejected so a write can never escape its grant.
//!
//! Everything else in the Bridge trusts the `PathBuf` this module returns. If this
//! is wrong, "cloud service deletes the user's files" is on the table — so it is
//! deliberately conservative and heavily tested.

use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    Read,
    ReadWrite,
}

impl Permission {
    pub fn from_str(s: &str) -> Permission {
        match s {
            "read_write" => Permission::ReadWrite,
            _ => Permission::Read,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Grant {
    /// Folder root exactly as granted by the user (web is the source of truth).
    pub root: PathBuf,
    pub permission: Permission,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SandboxError {
    /// The resolved path is not inside any granted folder.
    OutsideGrants,
    /// The path is inside a grant, but a write was requested on a read-only grant.
    WriteToReadOnly,
    /// The path is relative, empty, or has a `..` in its non-existent tail.
    InvalidPath,
}

impl std::fmt::Display for SandboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SandboxError::OutsideGrants => {
                write!(f, "path is outside every folder granted to this device")
            }
            SandboxError::WriteToReadOnly => {
                write!(f, "write requested on a read-only folder grant")
            }
            SandboxError::InvalidPath => write!(f, "path is relative or contains an invalid traversal"),
        }
    }
}

/// Resolve a requested path to a concrete, canonical path inside the grants, or
/// reject it. `need_write` is true for write/append/move/copy/delete/mkdir.
///
/// On success the returned path is what the operation must act on — callers must
/// not re-derive a path from the original request.
pub fn resolve_within_grants(
    requested: &Path,
    grants: &[Grant],
    need_write: bool,
) -> Result<PathBuf, SandboxError> {
    if requested.as_os_str().is_empty() || requested.is_relative() {
        // Grants are absolute; a relative request is ambiguous and unsafe.
        return Err(SandboxError::InvalidPath);
    }

    let resolved = canonicalize_allowing_missing(requested)?;

    // Collect every grant whose canonical root contains the resolved path.
    let mut inside_any = false;
    let mut writable = false;
    for grant in grants {
        let Ok(canonical_root) = grant.root.canonicalize() else {
            // A granted folder that no longer exists can't contain anything.
            continue;
        };
        if resolved.starts_with(&canonical_root) {
            inside_any = true;
            if grant.permission == Permission::ReadWrite {
                writable = true;
            }
        }
    }

    if !inside_any {
        return Err(SandboxError::OutsideGrants);
    }
    if need_write && !writable {
        return Err(SandboxError::WriteToReadOnly);
    }
    Ok(resolved)
}

/// Canonicalise a path that may not fully exist yet (e.g. a write target).
///
/// The longest existing ancestor is canonicalised (resolving any symlinks), then
/// the remaining components are re-appended. The tail may only contain "normal"
/// components — a `..`, `.`, or root/prefix in the tail is rejected so the result
/// cannot climb out of the canonical ancestor.
fn canonicalize_allowing_missing(path: &Path) -> Result<PathBuf, SandboxError> {
    // Fast path: the whole thing already exists.
    if let Ok(real) = path.canonicalize() {
        return Ok(real);
    }

    let mut tail: Vec<&std::ffi::OsStr> = Vec::new();
    let mut cursor = path;
    loop {
        match cursor.canonicalize() {
            Ok(base) => {
                let mut out = base;
                for part in tail.iter().rev() {
                    out.push(part);
                }
                return Ok(out);
            }
            Err(_) => {
                // Step up to the parent, recording the final component. Only
                // "normal" components may live in a not-yet-existing tail.
                match cursor.components().next_back() {
                    Some(Component::Normal(name)) => {
                        tail.push(name);
                        match cursor.parent() {
                            Some(parent) if !parent.as_os_str().is_empty() => cursor = parent,
                            // No existing ancestor at all → nothing to anchor to.
                            _ => return Err(SandboxError::InvalidPath),
                        }
                    }
                    // `..`, `.`, or a root/prefix in the unresolved tail is unsafe.
                    _ => return Err(SandboxError::InvalidPath),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn grant(root: &Path, permission: Permission) -> Grant {
        Grant {
            root: root.to_path_buf(),
            permission,
        }
    }

    fn unique_dir(label: &str) -> PathBuf {
        let mut base = std::env::temp_dir();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        base.push(format!("corelyx_sandbox_{label}_{nanos}"));
        fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn allows_read_inside_granted_folder() {
        let dir = unique_dir("read");
        let file = dir.join("invoice.pdf");
        fs::write(&file, b"x").unwrap();
        let grants = [grant(&dir, Permission::Read)];
        let resolved = resolve_within_grants(&file, &grants, false).unwrap();
        assert_eq!(resolved, file.canonicalize().unwrap());
    }

    #[test]
    fn rejects_write_to_read_only_grant() {
        let dir = unique_dir("ro");
        let file = dir.join("data.txt");
        fs::write(&file, b"x").unwrap();
        let grants = [grant(&dir, Permission::Read)];
        let err = resolve_within_grants(&file, &grants, true).unwrap_err();
        assert_eq!(err, SandboxError::WriteToReadOnly);
    }

    #[test]
    fn allows_write_to_read_write_grant() {
        let dir = unique_dir("rw");
        let file = dir.join("data.txt");
        fs::write(&file, b"x").unwrap();
        let grants = [grant(&dir, Permission::ReadWrite)];
        assert!(resolve_within_grants(&file, &grants, true).is_ok());
    }

    #[test]
    fn allows_creating_new_file_in_granted_folder() {
        // The target does not exist yet (a write/mkdir) but its parent is granted.
        let dir = unique_dir("new");
        let target = dir.join("subdir").join("new.txt");
        let grants = [grant(&dir, Permission::ReadWrite)];
        let resolved = resolve_within_grants(&target, &grants, true).unwrap();
        assert!(resolved.starts_with(dir.canonicalize().unwrap()));
        assert!(resolved.ends_with("new.txt"));
    }

    #[test]
    fn rejects_path_outside_all_grants() {
        let dir = unique_dir("in");
        let other = unique_dir("out");
        let file = other.join("secret.txt");
        fs::write(&file, b"x").unwrap();
        let grants = [grant(&dir, Permission::ReadWrite)];
        assert_eq!(
            resolve_within_grants(&file, &grants, false).unwrap_err(),
            SandboxError::OutsideGrants
        );
    }

    #[test]
    fn rejects_sibling_with_shared_name_prefix() {
        // "/.../granted" must NOT also cover "/.../granted_evil" — containment is
        // component-wise, not a string prefix.
        let parent = unique_dir("siblings");
        let granted = parent.join("granted");
        let evil = parent.join("granted_evil");
        fs::create_dir_all(&granted).unwrap();
        fs::create_dir_all(&evil).unwrap();
        let evil_file = evil.join("x.txt");
        fs::write(&evil_file, b"x").unwrap();
        let grants = [grant(&granted, Permission::ReadWrite)];
        assert_eq!(
            resolve_within_grants(&evil_file, &grants, false).unwrap_err(),
            SandboxError::OutsideGrants
        );
    }

    #[test]
    fn rejects_dotdot_escape_via_existing_path() {
        let parent = unique_dir("escape");
        let granted = parent.join("granted");
        fs::create_dir_all(&granted).unwrap();
        let outside = parent.join("outside.txt");
        fs::write(&outside, b"x").unwrap();
        // granted/../outside.txt resolves (via canonicalize) to parent/outside.txt.
        let sneaky = granted.join("..").join("outside.txt");
        let grants = [grant(&granted, Permission::ReadWrite)];
        assert_eq!(
            resolve_within_grants(&sneaky, &grants, false).unwrap_err(),
            SandboxError::OutsideGrants
        );
    }

    #[test]
    fn rejects_dotdot_in_nonexistent_tail() {
        let dir = unique_dir("tail");
        let grants = [grant(&dir, Permission::ReadWrite)];
        // Neither component exists, and the tail contains `..` → invalid.
        let target = dir.join("nope").join("..").join("..").join("etc");
        let err = resolve_within_grants(&target, &grants, true).unwrap_err();
        assert!(matches!(
            err,
            SandboxError::InvalidPath | SandboxError::OutsideGrants
        ));
    }

    #[test]
    fn rejects_relative_path() {
        let dir = unique_dir("rel");
        let grants = [grant(&dir, Permission::ReadWrite)];
        assert_eq!(
            resolve_within_grants(Path::new("relative/file.txt"), &grants, false).unwrap_err(),
            SandboxError::InvalidPath
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escaping_grant() {
        use std::os::unix::fs::symlink;
        let parent = unique_dir("symlink");
        let granted = parent.join("granted");
        fs::create_dir_all(&granted).unwrap();
        let secret = parent.join("secret.txt");
        fs::write(&secret, b"top secret").unwrap();
        // A symlink INSIDE the grant pointing OUTSIDE it must not grant access.
        let link = granted.join("link.txt");
        symlink(&secret, &link).unwrap();
        let grants = [grant(&granted, Permission::ReadWrite)];
        assert_eq!(
            resolve_within_grants(&link, &grants, false).unwrap_err(),
            SandboxError::OutsideGrants
        );
    }
}
