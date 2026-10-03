# Building Editor

Read docs/PRD-v0.3.md and docs/PROGRESS.md before continuing. Preserve unrelated files.

Required architecture: Tauri 2 / React / TypeScript / native Three.js / Rust. Single window, WebView, primary Canvas. No iframe, R3F, Next.js, backend service or plugin architecture.
EditorCore alone owns immutable formal project data. UI and pointer edits use the same commands. Preview never changes document; one drag creates one history item. Separate project, session, runtime and local settings. Core/geometry have no React, DOM, Tauri or UI dependencies. UI package has no building/Three/Tauri dependencies. Imports use public exports. Change sets update affected geometry and continuity; renderer survives UI changes. Dispose events, scheduling and GPU resources. Export independent revision snapshot through shared builders, without display overlays. No per-frame global React or IPC.

UI colors only from @building/ui semantic tokens, raw values only in packages/ui/src/tokens/source.json; generated CSS checked. Model material data in core presets is a registered exception. shadcn components live in packages/ui. Add both themes for any new key. Run npm run check, npm test, npm run build and relevant E2E/Rust tests.

Code conventions: read docs/CODE-QUALITY.md. Use the pinned local oxfmt and oxlint via npm run format and npm run lint:fix; npm run check enforces formatting, zero-warning lint and architecture/token rules. Keep explicit brace blocks and type imports. No blanket lint/type suppression. Preserve documented snapshot and instrumentation exceptions. Never format pinned Skills, generated token CSS, original PRD/acceptance rows or historical evidence; their ignore patterns are intentional. npm run typecheck also checks node configuration and pure core/geometry targets.

Before UI design read .agents/skills/frontend-design/SKILL.md. During React work read .agents/skills/vercel-composition-patterns/SKILL.md. After runnable UI use .agents/skills/impeccable/SKILL.md audit/critique/harden/polish and record issues. These files are project-installed, pinned, readable skills; no automatic hook trust is implied.

Q2 user approved designated closure seam while preserving physical texture size. T-branch routing still requires explicit evidence. Q5 target systems/hardware pending. Acceptance statuses: 未实现 / 已实现未验证 / 验证通过 / 验证失败 / 环境阻塞 / 需求待确认. Never label browser tests desktop or macOS acceptance. Maintain docs/ACCEPTANCE.md with requirement, implementation, test, evidence and limitation.
