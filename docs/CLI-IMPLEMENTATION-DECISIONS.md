# CLI 实施决策记录

更新时间：2026-10-14

## 2026-10-16 可用性修复

CLI 控制面已从“参数校验骨架”接通到 sibling Tauri automation host。Rust CLI 现在发现并启动 `builder --automation-host --stdio`，等待 TypeScript `host.handshake`，再代理同一 JSONL envelope；人类 `inspect`、`validate` 和 `apply --save` 先打开工程取得 cursor，再走现有 TypeScript EditorCore／CommandGateway。`project.new/open/close` 可在首次没有 cursor 时通过，Rust 与 TypeScript 对可选字段统一省略 `null`。

本次审查修复了 Tauri 事件名 `control.request` 的非法点号、React StrictMode 异步 listener 重复注册、host EOF 未退出、响应 protocol/requestId 校验、相对项目路径和超时清理。验证使用新 debug Tauri host 与非零 Canvas；安装后 sibling 路径、release/macOS、Named Pipe/UDS 及尚未接入的导出／camera／window 命令仍未标记为通过。

本轮按 `docs/CLI-IMPLEMENTATION-PROMPT.md` 落地 G0 协议边界和 G1 automation host 控制面骨架。正式工程数据仍只由 TypeScript `EditorCore` 持有；Rust 只负责 framing、认证边界、排队、生命周期和文件输出。

| 主题               | 决定                                                                                                                                                               | 原因与限制                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 协议               | `protocolVersion = 1`，请求与响应共用版本化 JSONL envelope；未知字段拒绝，单帧上限 4 MiB                                                                           | CLI、Tauri gateway 和前端 bridge 需要同一 schema；大资源走路径和现有资源导入流程，不走 Base64 IPC              |
| 文件模式 transport | 首阶段使用 `builder --automation-host --stdio` sibling host；实时模式接口预留 Named Pipe/Unix Socket                                                               | stdio 最容易先验证 framing、handshake、幂等和退出；本机只有 Windows，Unix Socket 只能在 macOS 原生验收时补证据 |
| host lifecycle     | 每次 `building run` 启动一个桌面 host；host 退出关闭 stdio 并释放 Tauri 状态，Rust 不常驻为 backend service                                                        | 保持单窗口、单 WebView、单 Canvas，避免第二套 EditorCore                                                       |
| 控制边界           | `control/request` 事件进入 TypeScript `CliBridge`，完成后通过 `control_respond` 返回；Rust 不解释领域命令                                                          | UI、指针和 CLI 最终经过同一 `CommandGateway`；未 ready、超时和断线返回明确错误                                 |
| 安装布局           | Tauri bundle 预留 sibling `building` external binary 输入；Windows 目标是 `$INSTDIR\builder.exe` 与 `$INSTDIR\building.exe` 同目录，macOS 目标是 `Contents/MacOS/` | 当前仓库尚未安装和签名，真实路径、签名、macOS 架构及隐藏 GPU 仍是环境阻塞                                      |
| 隐藏渲染           | host 默认不显示编辑 UI；Canvas 尺寸、manual render tick、PNG 和 WebGPU 能力必须由原生 WebView 逐项验证，失败时返回 capability error                                | 浏览器和模拟 IPC 不能填补 Windows WebView2/macOS WKWebView 验收；本轮先保留 `runtime-ready` handshake 边界     |

## 当前实现边界

- `rust/crates/control-protocol` 提供 serde envelope、JSONL 编解码、未知字段/版本/大小检查和有界 requestId 结果缓存。
- `rust/apps/cli` 提供版本、能力清单和 stdio JSONL loop；正式工程操作在未连接 sibling host 时返回 `host.notAttached`，不会复制 Core 规则。
- Tauri automation host 已有单 stdio 控制线程、`control_ready` listener barrier、`host.handshake`、请求转发、超时、`unknown_outcome` 和响应缓存入口。
- 前端启动会先注册 Tauri listener 并发送 transport-level `control_ready`；协议层 `controller_ready` / `runtime_ready` 目前由 host 按请求获取，原生启动时序仍待验证。
- 前端 `ProjectController`、`CommandGateway` 和 `RuntimeGateway` 已接入 `services.tsx`、`ViewportHost` 与 Tauri event bridge；CLI handler 的 open/new/save/saveAs/close、session、render 查询和有限编辑命令都会经过这些 owner。
- Rust CLI 的人类子命令已完成参数校验和统一错误 envelope，但在没有 sibling desktop host 时明确返回 `host.notAttached`；当前没有把 EditorCore 复制到 Rust，也没有把未验证的 GUI 启动路径宣称为文件模式通过。
- 当前仍未完成 Named Pipe/Unix Socket、真实 host sibling 自动发现、外部文件 mtime/file-id/hash 检查、跨平台锁、PNG/camera/window 全命令和安装后签名/启动验证；这些继续按 `docs/ACCEPTANCE.md` 标为未验证、环境阻塞或未实现。
