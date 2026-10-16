# Tauri 2 / Rust 项目规则

这份规则把上游 Tauri 2 与 Rust 指南收敛到 Building Editor 的实际边界。它约束 `apps/desktop/src-tauri` 的宿主代码和前端 IPC 适配，不改变 `packages/editor-core`、`packages/building-geometry` 的纯 TypeScript 约束。机器可读入口是 [building-tauri-rust skill](../.agents/skills/building-tauri-rust/SKILL.md)；上游参考 skill 仍保留在同目录并按需读取。

## 依赖和来源

- [Tauri v2 官方文档](https://v2.tauri.app/) 是 API、capability、窗口和插件权限的最终依据。项目锁定 `tauri`、`tauri-build`、`@tauri-apps/api` 和 CLI 的精确版本；升级时同时复核 Rust 与 TypeScript 入口。
- [Apollo Rust Best Practices](https://github.com/apollographql/rust-best-practices) 负责借用、错误、Clippy、测试、性能和文档判断。它不替代本文件的 IPC、文件格式或项目架构规则。
- `.agents/skills/tauri-v2` 和 `.agents/skills/rust-best-practices` 是提交固定、带 SHA-256 清单的只读上游资料；不要在其正文中追加项目例外。

## 宿主边界

1. `main.rs` 只保留 Windows 子系统属性和 `builder_lib::run()`；Builder、command 注册和插件初始化放在 `lib.rs`。
2. Rust 只负责宿主能力、受限文件 I/O、二进制容器和设置；EditorCore 独占不可变项目数据，Rust 不复制一套文档状态，也不绕过 EditorCore 写历史。
3. UI 和指针编辑通过同一个公共命令接口；预览是前端/runtime 事务，不能通过 IPC 改正式文档。每次导出使用显式 revision 快照，不读取显示覆盖层。
4. 单窗口标签为 `main`。新增窗口、sidecar、shell 或插件必须先有产品需求、capability 最小权限和跨平台证据，不能因为上游示例存在就引入。

## IPC 契约

- 每个 `#[tauri::command]` 都必须在 `tauri::generate_handler![]` 注册，并在前端使用 `@tauri-apps/api/core` 的 `invoke`；禁止引用 Tauri v1 的 `@tauri-apps/api/tauri` 或 `get_window`。
- 命令参数和结果是明确的 owned/serializable 类型。异步命令不跨 `await` 借用输入；二进制项目、GLB、PNG 和资源导入继续使用受控 `Request`/`Response`，不要把大块数据编码成 JSON 或 base64 往返。
- 可恢复失败返回可序列化的 `AppError { code, details }`；前端按稳定 `code` 映射文案，`details` 只用于诊断。不要用 `String` 错误、panic 或把操作系统路径和密钥写进用户可见消息。
- IPC 是命令边界，不是帧循环。渲染帧、采样进度和 pointermove 留在 runtime；只有明确的低频状态、完成、取消或错误事件才跨边界。
- 监听器、事件和异步任务必须有拥有者和取消/清理路径。不要在 `await` 期间持有 Mutex/RwLock；文件和图像解码使用 `spawn_blocking`，避免阻塞 Tauri 主线程。

## 文件和资源安全

- 用户选择的路径必须是绝对路径、预期扩展名和普通文件；不要拼接未经验证的 archive entry 或把 WebView 传来的相对路径当作本地路径。
- 读取先检查文件字节、ZIP 条目、JSON、实体数量和图片尺寸上限，再分配或完整解码。环境图像和表面图像遵守各自格式、MIME、像素、有限浮点和 64 MiB/32 MiB 预算。
- `.building`、GLB、PNG 和设置写入走临时文件 → `sync_all` → 重新打开/校验 → 原子替换；校验失败、磁盘满或权限失败都必须保留旧文件并返回稳定错误码。
- ZIP entry 必须拒绝绝对路径、`..` 穿越、重复危险别名和超限展开。便携工程只保存内嵌资源及校验信息，不依赖原机器的临时或绝对资源路径。
- 不新增 shell、HTTP、asset protocol 或任意文件 capability；如需求确实需要，先最小化 `capabilities/default.json`，再增加针对拒绝/越权/平台差异的测试。

## Rust 质量门

- 生产路径使用 `Result` 和 `?`；`unwrap`/`expect` 只允许在测试或已证明不变量的窄边界，并留下说明。不要用 blanket `allow`；局部 lint 例外用 `#[expect(...)]` 并写原因。
- 公共命令、生命周期入口、异步状态转换、资源所有者和安全边界写简短注释，解释状态约束、副作用、释放责任或性能取舍；不要重复代码表面行为。
- 依赖使用 `cargo add`/`cargo remove` 管理并精确锁版本；提交 `Cargo.lock`。新增 crate 说明用途、feature 取舍和安全影响，优先关闭默认 features。
- 保持手写 Rust 源文件不超过 500 行；按 storage、archive、asset validation、commands 等责任拆分，禁止为了过门禁压缩代码或扩大例外。
- 任何 schema、错误码、压缩/解压、路径、原子保存和资源上限改动都要有失败路径测试；测试要覆盖旧文件保护、恶意输入、中文/迁移路径和重复调用。

## 验证入口

```powershell
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
npm run test:rust
npm run check
npm test
npm run build
```

浏览器和模拟 IPC 结果不能标记 Windows 原生或 macOS 验收通过；原生结果按 `docs/ACCEPTANCE.md` 的状态字典记录。发布前还要确认 capability 生成 schema、当前 Rust/Tauri 版本、资源清理和真实目标平台限制。
