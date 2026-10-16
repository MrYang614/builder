---
name: building-tauri-rust
description: Apply the Building Editor's Tauri 2 and Rust host rules when changing apps/desktop/src-tauri, Tauri IPC, capabilities, project storage, native file dialogs, or Rust validation. Use with the upstream tauri-v2 and rust-best-practices references; this project policy takes precedence where architecture differs.
metadata:
  short-description: Tauri 2 and Rust rules for Building Editor
  version: 1.0.0
---

# Building Editor Tauri/Rust

Use this skill for changes at the Tauri boundary. Read [the project rules](../../../docs/TAURI-RUST-RULES.md) first, then load only the relevant upstream reference:

- Tauri commands, capabilities, channels, windows, or plugin permissions: `../tauri-v2/SKILL.md` and the matching file under `../tauri-v2/references/`.
- Rust ownership, errors, Clippy, tests, performance, or docs: `../rust-best-practices/SKILL.md` and the matching chapter under `../rust-best-practices/references/`.

## Required decisions

1. Keep `main.rs` a thin passthrough and put builder setup and the complete `generate_handler![]` list in `lib.rs`.
2. Treat IPC as a typed, low-frequency boundary. Use owned serializable arguments, `AppError { code, details }`, and binary `Request`/`Response` for large payloads. Never put per-frame rendering or document history in Rust.
3. Keep EditorCore as the only owner of formal project data. Rust persists and validates snapshots; it never invents a second document or history model.
4. Validate absolute paths, extensions, MIME, byte/pixel/entity budgets, archive entry names, and checksums before decoding or replacing a file. Preserve the prior file on every failed save.
5. Use `spawn_blocking` for filesystem and image/archive work; do not hold a lock over `await`, leak listeners/tasks, or block the Tauri main thread.
6. Grant only the capability required by the current command. Do not add shell, HTTP, sidecars, extra windows, or a plugin because an upstream example mentions it.
7. Keep production Rust fallible paths free of unexplained `unwrap`/`expect`, add focused failure tests for boundaries, and preserve the 500-line source limit.

## Change workflow

- Inspect `apps/desktop/src-tauri/src`, `Cargo.toml`, `capabilities/default.json`, `tauri.conf.json`, and the matching TypeScript bridge before editing.
- Trace both directions of the contract: frontend argument names/bytes and Rust deserialization/response/error codes. Register every new command and remove stale registrations.
- For storage changes, test malformed/future schemas, traversal, oversized data, corrupt checksums, disk/permission errors, atomic replacement, and migration paths.
- Run `cargo fmt --check`, locked Clippy with warnings denied, `npm run test:rust`, `npm run check`, `npm test`, and `npm run build`; run the focused browser/native test required by the changed boundary.
- Record platform limitations in `docs/ACCEPTANCE.md`. A browser or simulated IPC run is not desktop-native or macOS evidence.

## Explicit exclusions

This skill does not authorize a new Tauri plugin, capability, sidecar, network service, window, mobile target, or external message. Those remain product decisions. It also does not move React, DOM, Tauri, or UI dependencies into `packages/editor-core` or `packages/building-geometry`.
