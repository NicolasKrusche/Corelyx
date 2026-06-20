//! Corelyx Desktop Bridge library.
//!
//! The file-operation engine (poll loop, sandbox, ops, wire model) and local
//! config live here as a plain library so they can be unit-tested with
//! `cargo test` independently of the Tauri windowing/binary target.

pub mod bridge;
pub mod config;
