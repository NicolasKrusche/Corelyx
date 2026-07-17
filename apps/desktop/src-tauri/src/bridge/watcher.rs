//! Folder watching for `file_watch` triggers.
//!
//! The Bridge subscribes to OS filesystem events for each folder the web app
//! tells it to watch (the poll response's `watches`), filters them locally
//! against the trigger's event kinds + name globs, and reports matches to
//! `POST /api/bridge/events`. The web app re-validates every report before
//! firing — the local filter is only there to keep the wire quiet.
//!
//! Security: a watch path is run through the same [`resolve_within_grants`]
//! sandbox the file ops use, so the Bridge only ever watches a folder that is
//! actually granted to this device — even though the web sends the configured
//! path without that check.
//!
//! `notify` runs on its own OS threads with a synchronous callback; matched
//! events land on a shared queue that the async poll loop drains each cycle.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{event::ModifyKind, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::model::{WatchDto, WatchEvent};
use super::sandbox::{resolve_within_grants, Grant};

/// Suppress repeat reports for the same (trigger, path, kind) within this window.
/// A single save often fires several raw OS events; this collapses them.
const DEDUP_WINDOW: Duration = Duration::from_millis(1500);

/// Defensive cap so a runaway folder can't grow the pending queue without bound.
const MAX_QUEUED_RAW_EVENTS: usize = 10_000;

#[derive(Clone)]
struct WatchSpec {
    trigger_id: String,
    /// Canonical watched root; reported paths must live under it.
    root: PathBuf,
    events: Vec<String>,
    patterns: Vec<String>,
}

struct RawFsEvent {
    kind: EventKind,
    paths: Vec<PathBuf>,
}

pub struct WatcherManager {
    /// One recursive OS watcher per canonical root currently watched.
    watchers: HashMap<PathBuf, RecommendedWatcher>,
    /// Active specs (several may share a root).
    specs: Vec<WatchSpec>,
    /// Raw events pushed by notify callbacks, drained by the poll loop.
    queue: Arc<Mutex<VecDeque<RawFsEvent>>>,
    /// (trigger_id, path, kind) -> last reported, for dedup.
    recent: HashMap<(String, PathBuf, &'static str), Instant>,
}

impl WatcherManager {
    pub fn new() -> WatcherManager {
        WatcherManager {
            watchers: HashMap::new(),
            specs: Vec::new(),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            recent: HashMap::new(),
        }
    }

    /// Number of OS watchers currently active (distinct folders).
    pub fn active_count(&self) -> usize {
        self.watchers.len()
    }

    /// Reconcile OS watchers + specs with the desired watch list from the web
    /// app. Each watch path is validated against the device's grants; anything
    /// outside a granted folder (or not an existing directory) is skipped.
    pub fn reconcile(&mut self, watches: &[WatchDto], grants: &[Grant]) {
        let mut desired: Vec<WatchSpec> = Vec::new();
        let mut desired_roots: Vec<PathBuf> = Vec::new();

        for w in watches {
            let requested = Path::new(&w.path);
            let root = match resolve_within_grants(requested, grants, false) {
                Ok(p) => normalize_root(p),
                Err(e) => {
                    eprintln!("[bridge] not watching {} — {}", w.path, e);
                    continue;
                }
            };
            if !root.is_dir() {
                eprintln!("[bridge] not watching {} — not an existing folder", w.path);
                continue;
            }
            if !desired_roots.contains(&root) {
                desired_roots.push(root.clone());
            }
            desired.push(WatchSpec {
                trigger_id: w.trigger_id.clone(),
                root,
                events: w.events.clone(),
                patterns: w.patterns.clone(),
            });
        }

        // Drop watchers for roots no longer desired (dropping stops the watch).
        let stale: Vec<PathBuf> = self
            .watchers
            .keys()
            .filter(|root| !desired_roots.contains(root))
            .cloned()
            .collect();
        for root in stale {
            self.watchers.remove(&root);
        }

        // Start watchers for newly desired roots.
        for root in &desired_roots {
            if self.watchers.contains_key(root) {
                continue;
            }
            match self.make_watcher(root) {
                Ok(w) => {
                    self.watchers.insert(root.clone(), w);
                }
                Err(e) => eprintln!("[bridge] failed to watch {} — {e}", root.display()),
            }
        }

        self.specs = desired;
    }

    fn make_watcher(&self, root: &Path) -> Result<RecommendedWatcher, String> {
        let queue = Arc::clone(&self.queue);
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if let Ok(mut q) = queue.lock() {
                    if q.len() < MAX_QUEUED_RAW_EVENTS {
                        q.push_back(RawFsEvent {
                            kind: event.kind,
                            paths: event.paths,
                        });
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;
        watcher
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        Ok(watcher)
    }

    /// Drain raw FS events and turn them into the deduped, filtered set of
    /// [`WatchEvent`]s to report to the web app.
    pub fn drain_matched(&mut self) -> Vec<WatchEvent> {
        let raw: Vec<RawFsEvent> = match self.queue.lock() {
            Ok(mut q) => q.drain(..).collect(),
            Err(_) => return Vec::new(),
        };
        if raw.is_empty() {
            return Vec::new();
        }

        let now = Instant::now();
        self.recent
            .retain(|_, t| now.duration_since(*t) < DEDUP_WINDOW);

        let mut out: Vec<WatchEvent> = Vec::new();
        for ev in raw {
            for path in &ev.paths {
                let kind = match classify(&ev.kind, path) {
                    Some(k) => k,
                    None => continue,
                };
                let name = match path.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                let is_dir = matches!(kind, "created" | "modified") && path.is_dir();

                for spec in &self.specs {
                    if !path.starts_with(&spec.root) {
                        continue;
                    }
                    if !spec.events.iter().any(|e| e == kind) {
                        continue;
                    }
                    if !matches_any_pattern(&spec.patterns, &name) {
                        continue;
                    }
                    let key = (spec.trigger_id.clone(), path.clone(), kind);
                    if self.recent.contains_key(&key) {
                        continue;
                    }
                    self.recent.insert(key, now);
                    out.push(WatchEvent {
                        trigger_id: spec.trigger_id.clone(),
                        event: kind.to_string(),
                        path: path.to_string_lossy().to_string(),
                        name: name.clone(),
                        is_dir,
                    });
                }
            }
        }
        out
    }
}

impl Default for WatcherManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Map a raw notify event (for a specific path) to our trigger event kind.
/// Renames carry no reliable kind, so resolve them by current existence: a path
/// that now exists is a "created", one that's gone is a "deleted".
fn classify(kind: &EventKind, path: &Path) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("created"),
        EventKind::Remove(_) => Some("deleted"),
        EventKind::Modify(ModifyKind::Name(_)) => {
            if path.exists() {
                Some("created")
            } else {
                Some("deleted")
            }
        }
        EventKind::Modify(_) => Some("modified"),
        // Access / Any / Other — not actionable.
        _ => None,
    }
}

/// Strip the Windows verbatim (`\\?\`) prefix that `fs::canonicalize` adds, so
/// the path we watch and the paths notify reports share one form (notify reports
/// non-verbatim paths, and `Path::starts_with` is component-exact).
fn normalize_root(p: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(s) = p.to_str() {
            if let Some(stripped) = s.strip_prefix(r"\\?\") {
                return PathBuf::from(stripped);
            }
        }
    }
    p
}

/// Case-insensitive filename glob match (`*`, `?`). Empty patterns → match any.
/// Mirrors `matchesAnyPattern` in apps/web/lib/triggers/file-watch.ts: `*` does
/// not cross a path separator and the whole name must match.
fn matches_any_pattern(patterns: &[String], name: &str) -> bool {
    if patterns.is_empty() {
        return true;
    }
    patterns.iter().any(|p| glob_match(p, name))
}

fn glob_match(pattern: &str, name: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let n: Vec<char> = name.to_lowercase().chars().collect();
    glob_rec(&p, &n)
}

fn glob_rec(p: &[char], n: &[char]) -> bool {
    if p.is_empty() {
        return n.is_empty();
    }
    match p[0] {
        '*' => {
            // zero chars consumed…
            if glob_rec(&p[1..], n) {
                return true;
            }
            // …or one more non-separator char, then keep matching '*'.
            if let Some(&c) = n.first() {
                if c != '/' && c != '\\' {
                    return glob_rec(p, &n[1..]);
                }
            }
            false
        }
        '?' => match n.first() {
            Some(&c) if c != '/' && c != '\\' => glob_rec(&p[1..], &n[1..]),
            _ => false,
        },
        lit => match n.first() {
            Some(&c) if c == lit => glob_rec(&p[1..], &n[1..]),
            _ => false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_patterns_match_anything() {
        assert!(matches_any_pattern(&[], "anything.xyz"));
        assert!(matches_any_pattern(&[], ""));
    }

    #[test]
    fn extension_glob() {
        let pats = vec!["*.pdf".to_string()];
        assert!(matches_any_pattern(&pats, "invoice.pdf"));
        assert!(!matches_any_pattern(&pats, "invoice.txt"));
    }

    #[test]
    fn case_insensitive() {
        assert!(matches_any_pattern(&["*.PDF".to_string()], "report.pdf"));
        assert!(matches_any_pattern(&["*.pdf".to_string()], "REPORT.PDF"));
    }

    #[test]
    fn prefix_glob() {
        let pats = vec!["invoice-*.csv".to_string()];
        assert!(matches_any_pattern(&pats, "invoice-2024.csv"));
        assert!(!matches_any_pattern(&pats, "receipt-2024.csv"));
    }

    #[test]
    fn question_mark_is_one_char() {
        let pats = vec!["page-?.png".to_string()];
        assert!(matches_any_pattern(&pats, "page-1.png"));
        assert!(!matches_any_pattern(&pats, "page-12.png"));
    }

    #[test]
    fn dot_is_literal() {
        assert!(matches_any_pattern(&["a.b".to_string()], "a.b"));
        assert!(!matches_any_pattern(&["a.b".to_string()], "axb"));
    }

    #[test]
    fn anchored_whole_name() {
        assert!(!matches_any_pattern(&["*.pdf".to_string()], "evil.pdf.exe"));
        assert!(!matches_any_pattern(&["report".to_string()], "report.pdf"));
    }

    #[test]
    fn star_does_not_cross_separator() {
        assert!(!matches_any_pattern(&["*.pdf".to_string()], "sub/evil.pdf"));
        assert!(!matches_any_pattern(
            &["*.pdf".to_string()],
            "sub\\evil.pdf"
        ));
    }

    #[test]
    fn any_pattern_in_list_matches() {
        let pats = vec!["*.pdf".to_string(), "*.csv".to_string()];
        assert!(matches_any_pattern(&pats, "data.csv"));
        assert!(!matches_any_pattern(&pats, "data.json"));
    }

    #[test]
    fn classify_maps_kinds() {
        use notify::event::{CreateKind, RemoveKind};
        let p = Path::new("whatever.txt");
        assert_eq!(
            classify(&EventKind::Create(CreateKind::Any), p),
            Some("created")
        );
        assert_eq!(
            classify(&EventKind::Remove(RemoveKind::Any), p),
            Some("deleted")
        );
        assert_eq!(
            classify(
                &EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
                p
            ),
            Some("modified")
        );
        assert_eq!(
            classify(&EventKind::Access(notify::event::AccessKind::Any), p),
            None
        );
    }
}
