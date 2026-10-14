# Building Editor CLI 实施提示词

以下内容是交给实施型 AI 的完整任务提示词。实施 AI 必须把它当作当前仓库的正式工程任务执行，而不是只输出设计建议。

---

## 任务目标

你正在 `D:\Code\builder` 中为 Building Editor 实现一个可发布、可维护、可测试的 Rust CLI。

CLI 必须：

1. 支持文件模式：通过 CLI 新建、打开、编辑、验证、保存、另存为、关闭和导出工程。
2. 支持实时连接模式：连接已经运行的 Tauri 桌面编辑器，执行同样的编辑、工程、渲染和窗口命令。
3. 使用 Rust 编译为独立可执行文件，随桌面应用安装包发布，并放在安装根目录可直接调用。
4. 支持 PNG 导出、相机控制、渲染器切换、路径追踪控制和窗口控制。
5. 保证 CLI、UI 和 Three.js 指针操作使用同一套正式命令、验证、历史和资源生命周期。
6. 达到可以进入正式发布验证的工程质量；不接受只在浏览器中演示的半成品。

本任务要求实际修改代码、补充测试、更新文档、构建和验证。不能只给出计划或伪造通过状态。

## 必读资料

开始前完整阅读并遵守：

- `AGENTS.md`
- `docs/PRD-v0.3.md`
- `docs/PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/CODE-QUALITY.md`
- `docs/ACCEPTANCE.md`
- `docs/KNOWN-ISSUES.md`
- `C:\Users\52683\.agents\skills\tauri-v2\SKILL.md`
- `C:\Users\52683\.agents\skills\rust-best-practices\SKILL.md`

如果项目内的文档与本提示词冲突，以用户指令、`AGENTS.md`、现有 EditorCore 架构和已确认验收约束为优先依据，并在最终报告中记录冲突和选择。

## 不可违反的架构边界

### EditorCore 是唯一正式工程数据所有者

- `EditorCore` 继续唯一拥有 `ProjectDocument`、revision、Undo/Redo、预览事务、验证和 ChangeSet。
- UI、Inspector、Three runtime pointer、CLI 都必须经过同一个无 React 的 `CommandGateway` 提交正式编辑。
- Rust CLI、Rust Tauri gateway 和 transport 层不得持有第二份 `ProjectDocument`，不得复制墙体连接、门窗洞口、连续纹理、几何验证或导出算法。
- 不允许 CLI 直接修改 Mesh、Three 场景、React state 或 `.building` 中的 JSON。
- 不允许为 CLI 创建第二套领域规则。

### Rust CLI 的正确定位

Rust CLI 是控制面和传输端，正式执行面仍然是同一套 TypeScript EditorCore/ThreeRuntime：

```text
AI / shell
  -> building CLI (Rust)
  -> JSONL + local authenticated transport
  -> Tauri Rust control gateway
  -> TypeScript CliBridge
  -> ProjectController / CommandGateway / RuntimeGateway
  -> EditorCore / ThreeRuntime
```

文件模式由 CLI 启动同安装目录的桌面 binary，使用一次性的 automation host。automation host 是短生命周期进程，不是常驻 backend service；它必须使用相同的前端构建、EditorCore、几何和 Three runtime。

如果实现过程中发现“Rust CLI 完全脱离桌面 binary 仍要编辑和渲染”需要复制领域逻辑，必须停止该方向，在报告中说明这是另一项 Rust Core 重写工程，不能偷偷实现第二套规则。

### 单窗口边界

- 实时模式只连接正在运行的唯一主窗口、唯一 WebView、唯一主 Canvas。
- 文件模式每个 automation host 进程最多创建一个受控窗口，不创建第二个编辑窗口。
- 隐藏或最小化窗口不自动等价于可用 GPU 渲染。必须验证非零 Canvas 尺寸、RAF/手动 render、WebGL/WebGPU、path tracing 和资源释放。
- 如果隐藏窗口导致渲染不可靠，必须实现经过验证的 automation render tick/显式 renderOnce，或提供受控可见 fallback；不能宣称功能已经完成。

## 开始实施前的工作方式

### 先建立工作基线

1. 检查工作树和现有未提交修改，保留无关文件。
2. 阅读现有 `EditorCore`、`services.tsx`、`App.tsx`、`platform/index.ts`、`platform/container.ts`、`three-runtime` 和 Tauri Rust storage。
3. 列出当前所有工程生命周期入口、命令入口、渲染入口和窗口入口。
4. 先写一份短的实现决策记录到 `docs/CLI-IMPLEMENTATION-DECISIONS.md`，记录协议版本、transport、host lifecycle、安装布局和隐藏渲染策略。
5. 先实现并验证 automation host POC：启动、handshake、加载 Core、创建非零 Canvas、执行一个查询、干净退出。
6. POC 未通过前，不要批量开发所有 CLI 命令；先解决宿主、GPU、RAF、退出和资源清理问题。

## 目标代码组织

按职责拆分，保持手写源文件不超过 500 行：

```text
rust/
  Cargo.toml                         # virtual workspace
  crates/control-protocol/           # Rust envelope、framing、错误和 schema 工具
  apps/cli/                           # building / building.exe

apps/desktop/src-tauri/src/control/
  server.rs                           # pipe/socket server
  discovery.rs                        # endpoint descriptor、PID、token
  relay.rs                            # request queue、response routing
  lifecycle.rs                        # automation host startup/shutdown

apps/desktop/src/cli/
  bridge.ts                           # control.request/control.respond
  protocol.ts                         # 前端协议类型和校验
  capabilities.ts                     # 能力协商

apps/desktop/src/app/
  project-controller.ts               # 工程路径、open/new/save/close
  command-gateway.ts                  # UI/CLI/pointer 共用提交队列
  runtime-gateway.ts                  # runtime coarse actions
  window-controller.ts                # close guard 和窗口动作

packages/project-io/                  # DOM/Tauri 无关的归档/资源协议
```

如需调整当前 workspace 或 Cargo workspace，保留现有 Tauri crate 的移动端入口、`lib.rs` 结构和公开包边界。

## 协议要求

### 请求封装

所有模式使用同一个版本化 JSONL 协议。stdout 只输出响应 JSONL，诊断和日志写 stderr。

```json
{
  "protocolVersion": 1,
  "requestId": "req-17",
  "clientSessionId": "client-x",
  "hostInstanceId": "host-x",
  "operation": "edit.batch",
  "project": {
    "projectId": "project-x",
    "revision": 12,
    "documentEpoch": 4
  },
  "args": {},
  "options": {
    "dryRun": false,
    "ifDirty": "fail",
    "timeoutMs": 120000
  }
}
```

每个写请求必须带 `projectId + revision + documentEpoch`。实时会话还必须校验 `hostInstanceId` 和 `clientSessionId`。

响应至少包含：

- `requestId`
- `ok`
- `projectId`
- `revision`
- `documentEpoch`
- `runtimeEpoch`（涉及 runtime 时）
- `changeSet`（正式编辑时）
- `warnings`
- `error`（失败时）
- 当前 capability/status 摘要

### 幂等、顺序和冲突

- `requestId` 是幂等键；宿主需要保留有界结果缓存。
- 同一 host 内所有请求严格串行进入 CommandGateway。
- `open/new/replace/close` 递增 `documentEpoch`，使旧的异步保存、解码、导出和渲染结果失效。
- runtime 替换或 renderer 切换递增 `runtimeEpoch`。
- revision 不匹配返回 `revision.conflict`，默认拒绝重放和隐式合并。
- 连接断线重连不得自动重放非幂等写命令。
- 如果请求已经发给宿主但响应在断线前未返回，必须返回 `unknown_outcome`；CLI 不得擅自重放该写请求。
- 请求队列满、宿主未 ready、runtime 未 ready、超时、取消和 host 崩溃必须返回明确错误。

### framing 和限制

- 文件模式 stdio 使用 JSONL；实时模式使用 JSONL 或长度前缀帧，二者必须共用同一 envelope。
- 单请求和单响应大小设上限；大型图片、工程和 PNG 通过路径传递。
- 不通过 pipe、Tauri event 或 JSON Base64 传输大二进制。
- 传输请求带超时、取消和 backpressure。

## CLI 能力范围

### 工程和编辑

必须实现并提供 JSON 协议及人类子命令：

```text
project.new
project.open
project.save
project.saveAs
project.close
project.inspect
project.validate

edit.apply
edit.batch
edit.dryRun
history.undo
history.redo

level.create / level.update / level.delete
wall.create / wall.update / wall.delete
slab.createRectangle / slab.update / slab.delete
opening.place / opening.update / opening.delete
material.set
resource.import / resource.list
continuity.set
environment.set
project.rename

export.glb
export.gltf
```

高层命令必须通过共享 builders 生成现有 Core 命令，不能要求 AI 自行创建内部对象 ID、材质默认值或连接关系。

`edit.batch` 必须全成全败，只生成一个历史项。失败保持工程、revision、history、session 和 runtime 状态不变。

### 会话和工具状态

在实时模式和 automation host 中提供：

```text
session.get
session.setLevel
session.setTool
session.select
session.setHidden
session.setWholeBuildingPreview
session.setSnapSettings
```

这些数据属于 `SessionStore`，不写入工程、不进入工程历史。CLI 不通过模拟 pointer 事件完成正式编辑。

### 文件生命周期

- `project.open`：解码、验证、安装工程、重置历史和 session。
- `project.new`：创建空工程或示例工程，生成新 project ID。
- `project.save`：捕获不可变 revision 快照，原子写入并重新验证。
- `project.saveAs`：显式更新当前路径。
- `project.close`：按 `ifDirty=fail|save|discard` 处理，不等待 GUI 弹窗。
- 保存完成后，只有 `projectId + revision + documentEpoch` 仍匹配才允许 `markSaved`。
- 保存前读取并记录文件 mtime/file-id/content hash；外部修改返回 `external_change`，只有明确 `overwrite` 才覆盖。
- 保存前获取跨平台旁车锁；Windows 使用带当前用户 ACL 的锁句柄，Unix 使用用户专属目录和 flock/等价机制；锁异常退出后必须可恢复。
- 沿用现有绝对路径、扩展名、符号链接、父目录、256 MiB 工程、32 MiB 图片、JSON 和 ZIP 展开预算。
- 保存仍使用临时文件、flush、重新读取验证和原子替换。

### 资源和导出

资源导入必须复制并嵌入工程，不能保留原始本地路径。导出必须读取正式 revision 快照：

- 不含 UI、网格、选择框、预览草稿、隐藏辅助物和主题覆盖层；
- 包含正式楼层、封板、材质和门动画；
- GLB/GTLF builder 与 UI 导出共用；
- 导出 owner 独立构造和释放资源；
- 导出错误保留原工程和历史状态。

## 实时模式 transport

### 端点

- Windows：用户专属 Named Pipe。
- macOS：用户专属 Unix Domain Socket。
- 默认不开放 TCP 监听。
- endpoint descriptor 放在用户专属 runtime 目录，权限只允许当前用户。
- descriptor 包含 PID、processStartTime、hostInstanceId、protocolVersion、transport、endpoint、随机 token 引用、应用版本和能力摘要。
- 应用退出、异常清理和 host 重启都要删除或替换 descriptor。
- 连接前校验 PID、processStartTime、当前用户、endpoint 所有权和协议版本；拒绝过期 descriptor、符号链接和 PID 重用。
- handshake 使用 nonce + token/HMAC；随机 endpoint 名称不能单独作为安全措施。

### Rust gateway

Rust gateway 只做：

- framing；
- token/PID/版本校验；
- 请求大小和超时限制；
- 请求队列；
- request/response 路由；
- host lifecycle；
- 窗口平台 API；
- 大文件原子 IO。

正式工程命令必须转发到 TypeScript `CliBridge`。前端启动后主动发送 `controller_ready` 和 `runtime_ready` handshake；未 ready 时不能假装成功。

低频控制请求可以通过 Tauri event/request-response；长任务进度使用有界 Channel。禁止每帧把 React state 或 GPU 状态通过 IPC 推送。

## 文件模式 automation host

CLI 通过当前安装目录的 sibling desktop binary 启动 host：

```text
builder.exe --automation-host --stdio
```

或使用临时命名管道端点。host 必须：

- 完成协议和能力 handshake；
- 初始化相同的 `EditorCore`、`ProjectController`、`CommandGateway` 和 runtime；
- 默认不显示普通编辑 UI；
- 为 PNG 创建明确宽高的 Canvas；
- 对隐藏窗口的 0×0、RAF 节流、GPU 不可用和 WebGPU 不支持返回可诊断错误；
- 通过 manual render tick 或显式 renderOnce 保证渲染请求可完成；
- 正常和异常退出都释放监听器、GPU、纹理、几何体、RAF、临时文件和 endpoint；
- CLI 超时或被杀死后不留下孤儿 host 或锁文件。

如果隐藏宿主在 Windows WebView2 或 macOS WKWebView 无法稳定完成真实 PNG、WebGPU 或 path tracing，必须实现并测试受控 fallback；在测试未通过前，把该能力标为 `环境阻塞`，不能用普通浏览器测试替代桌面证据。

## 相机能力

相机属于 runtime/session，不进入 `.building`：

```text
camera.get
camera.set
camera.focus(selected|level|all|top)
camera.orbit
camera.pan
camera.zoom
camera.project
camera.captureState
```

相机命令必须通过 ThreeRuntime owner：

1. 设置 position/target/up/projection；
2. 更新 controls 和 camera matrix；
3. 清理 TAA/GTAO/path tracing 历史；
4. 请求一次按需渲染；
5. 返回实际生效状态。

不允许 CLI 直接写 Three 对象或维护第二份相机状态。

## 渲染器和 PNG 能力

必须提供：

```text
render.getState
render.setBackend(webgl|webgpu)
render.setMode(raster|pathtrace)
render.setSamples
render.pause
render.resume
render.setPostProcessing
render.capturePng
render.diagnostics
```

`render.capturePng` 必须支持：

- 明确 width、height、DPR；
- 指定相机快照或当前相机；
- 指定 backend 和 fallback 策略；
- `waitFor=idle|converged`；
- timeout 和取消；
- 返回输出路径、bytes、sha256、revision、backend、actual size；
- 通过 Rust 原子写入目标文件；
- 不包含编辑器覆盖层；
- 在环境加载、renderer 切换、相机历史、编辑交互和 path tracing sample 未稳定时拒绝或等待；
- 使用现有 `capturePNG()` 约束，不绕过稳定性检查。

renderer 切换必须沿现有 owner 顺序执行：停止编辑和光追、创建新 renderer、替换 Canvas、重连 controls/events、发布成功状态、释放旧 renderer。失败时保持旧 renderer 可用，并返回 requested backend、actual backend 和 fallback reason。

## 窗口控制

提供：

```text
window.getState
window.show
window.hide
window.focus
window.minimize
window.maximize
window.restore
window.toggleMaximize
window.setSize
window.setPosition
window.center
window.setFullscreen
window.setTitle
window.requestClose
```

窗口控制属于 Rust/Tauri platform owner。`requestClose` 必须先经过 `ProjectController` 的偏好 flush 和工程 dirty 守卫，不能直接 destroy 绕过保存保护。

文件模式只控制 automation host 的生命周期和虚拟渲染视口；真实桌面窗口控制属于实时连接模式。隐藏 host 对 `window.show/hide/minimize/maximize/setPosition` 等 OS 窗口动作应返回明确的 capability error，不能假装操作了用户桌面窗口。

新增 Tauri capabilities 时逐项使用最小权限，所有新 command 必须注册到 `tauri::generate_handler!`。不能通过宽泛权限或任意 shell 执行实现控制。

## CLI 命令形态

至少提供：

```text
building --version
building capabilities --json
building run --project <path>
building apply --project <path> --commands <json> --save
building inspect --project <path> --json
building validate --project <path> --json
building connect --pid <pid>
building attach --session <id> <operation>
building export --project <path> --format glb --out <path>
building render --attach --out <path> --width 1600 --height 900
building window --attach maximize
```

人类子命令只是 JSONL 协议的封装；所有行为必须能通过 JSONL 复现。

建议稳定退出码：

| 退出码 | 含义 |
|---:|---|
| 0 | 成功 |
| 2 | 参数或协议错误 |
| 3 | 领域验证失败 |
| 4 | revision、epoch 或 session 冲突 |
| 5 | dirty 策略拒绝 |
| 6 | 文件、资源、锁或磁盘错误 |
| 7 | renderer、GPU 或 PNG 错误 |
| 8 | transport、认证、host 启动或断线错误 |
| 9 | 未预期内部错误 |

## 安全要求

- CLI 默认只允许本地控制。
- 不允许 shell、网络、插件或任意代码执行。
- 不接受项目内容中的字符串作为命令。
- 拒绝未知 JSON 字段、原型污染、过大数组、过大请求和资源耗尽输入。
- token、项目图片内容和完整 data URL 不写日志。
- 路径校验与 Rust storage 一致，拒绝路径穿越、符号链接、非法扩展名和不存在父目录。
- 输出目标必须显式提供；覆盖现有文件需要明确 `overwrite`。
- Named Pipe/Unix Socket 权限限于当前用户，endpoint descriptor 不能被其他用户使用。
- 请求超时、取消、断线和 host 崩溃必须可恢复，不能留下损坏项目文件。

## 安装与发布

### Windows

最终安装目录必须包含：

```text
<InstallRoot>\builder.exe
<InstallRoot>\building.exe
<InstallRoot>\resources\...
```

NSIS/MSI 都必须验证 CLI 位于安装根目录，不只位于资源目录。CLI 和桌面程序必须使用同一版本号和 protocol version，并分别签名。

### macOS

App Bundle 至少包含：

```text
Building Editor.app/Contents/MacOS/builder
Building Editor.app/Contents/MacOS/building
```

Intel 和 Apple Silicon 分别构建、签名和验证。若提供全局 shell 命令，额外制作明确的 `.pkg` 或安装脚本，不能默认修改用户 PATH。

构建脚本必须：

1. 为每个目标 target triple 构建 CLI；
2. 将 CLI 放入 Tauri `externalBin` 输入目录；
3. 验证 Tauri bundle 中的实际文件路径；
4. 生成 app/CLI/协议版本和 SHA-256 清单；
5. 对 Windows 和 macOS 完成签名验证；
6. 在安装后的真实路径运行 CLI smoke test。

Tauri `externalBin` 只负责把带 target triple 的 sidecar 纳入 bundle；不能以 `$RESOURCE` 中存在文件作为“安装根目录可调用”的证据。Windows 必须在解包后的真实 NSIS/MSI `$INSTDIR` 中检查 `builder.exe` 与 CLI 同目录；macOS 必须检查 `.app/Contents/MacOS/` 中 CLI 的架构、可执行权限、签名和实际启动。

## 否决门（Gates）

实施按以下门逐个推进；前一门未通过时，不得宣称后续功能完成：

### G0：协议和控制器边界

- `ProjectController`、`CommandGateway`、`RuntimeGateway` 已从 React 组件职责中抽出；
- CLI/Rust 依赖图没有 React、DOM、Three 或第二套 EditorCore；
- schema 拒绝未知字段、超大请求和不支持的协议版本；
- requestId/idempotencyKey、base revision 和 epoch 规则有单元测试。

### G1：automation host POC

- Windows WebView2 和 macOS WKWebView 各自真实启动一次 automation host；
- 唯一窗口、唯一 WebView、唯一 Canvas、固定 viewport/DPR 可观测；
- `controller_ready`、`runtime_ready` handshake 顺序正确；
- WebGL 真实绘制、PNG 指定尺寸和无覆盖层通过；
- 隐藏窗口的 RAF/GPU/path tracing 失败时，有真实验证的 manual tick、非最小保活策略或明确 capability error；
- 正常、超时、kill、崩溃退出后资源和 endpoint 都清理。

### G2：文件模式

- stdio JSONL 一次性和长会话都能执行 open/new/edit/batch/dryRun/save/saveAs/GLB/PNG；
- 外部文件修改、锁竞争、磁盘错误、损坏保存、超时和重试有证据；
- GLB Validator 零错误，PNG 返回真实 bytes/path/sha256；
- 旧保存不能清除新 revision，工程替换会使旧异步任务失效。

### G3：实时模式

- Windows Named Pipe 和 macOS UDS 的 ACL/权限、token、PID/startTime、stale descriptor 清理通过；
- UI 与 CLI 交错编辑保持同一顺序和结果；
- stale revision、documentEpoch、runtimeEpoch、重复请求、断线 unknown outcome 都有测试；
- `window.requestClose` 保留现有 dirty/偏好 flush 守卫；
- renderer、camera、PNG 和 runtime 失败时保持旧状态可用。

### G4：发布

- CLI 与 desktop 版本、协议版本和能力清单一致；
- Windows 安装根目录、NSIS/MSI、卸载、签名和启动路径通过；
- macOS App Bundle `Contents/MacOS`、架构、签名/公证和 hidden host 通过；
- 文件模式和实时模式分别在 `docs/ACCEPTANCE.md` 记录原生证据；
- 浏览器、模拟 IPC 和旧安装包证据不能替代当前原生验收。

## 测试和验收

必须新增并记录以下测试：

### Rust

- CLI 参数、JSONL framing、退出码；
- requestId 幂等和结果缓存；
- token、PID、版本和权限校验；
- Named Pipe；
- Unix Socket；
- 超时、取消、backpressure 和断线；
- host 启动、ready、崩溃、孤儿清理；
- 文件锁、外部修改、原子写和损坏恢复；
- Windows/macOS 安装后 sibling path 发现。

### TypeScript/Core

- UI/CLI/pointer 共用同一 CommandGateway；
- batch 全成全败和一个历史项；
- revision/documentEpoch/runtimeEpoch 冲突；
- open/new/close 使异步任务失效；
- 保存期间继续编辑不会错误标记 clean；
- resource import、ChangeSet、导出快照和资源释放；
- 相机命令清理后处理和 path tracing 历史；
- renderer 切换失败后旧 renderer 保持可用；
- PNG 不含辅助覆盖层。

### 桌面集成

- Windows 原生 Tauri：CLI 连接、编辑、PNG、窗口、关闭保护；
- macOS 原生 Tauri：同等路径；
- WebGL 和 WebGPU；
- path tracing 样本等待和暂停恢复；
- 隐藏 automation host 的非零 Canvas、手动 render tick 和真实 PNG；
- 20 轮打开/编辑/保存/导出/关闭资源计数归零；
- host 断开和进程 kill 后下一次启动可恢复。

浏览器测试、模拟 IPC 和 Node 单元测试不能填写 Windows/macOS 原生验收。所有验收状态只能使用：

```text
未实现
已实现未验证
验证通过
验证失败
环境阻塞
需求待确认
```

在 `docs/ACCEPTANCE.md` 中增加 CLI01 等条目，每条包含要求、实现、测试、证据、状态和限制。

## 必须运行的项目检查

在代码变更和修复完成后执行：

```text
npm run format
npm run lint:fix
npm run check
npm run typecheck
npm test
npm run test:rust
npm run build
cargo test --workspace
```

随后执行相关浏览器测试、Windows 原生测试、macOS 原生测试和 Tauri 安装包测试。只报告实际运行结果，不把旧证据或浏览器结果扩大成桌面验收。

## 完成标准

只有同时满足以下条件才可以把任务标记为完成：

1. Rust CLI 可从安装根目录直接启动。
2. 文件模式和实时模式使用同一个协议和同一套 Core 命令。
3. 新建、打开、保存、另存为、关闭、Undo/Redo、批量编辑和资源导入可用。
4. GLB、PNG、相机、WebGL/WebGPU、path tracing 和窗口操作可用。
5. revision、documentEpoch、runtimeEpoch、幂等、断线和外部文件修改行为经过测试。
6. UI 编辑和 CLI 编辑结果一致，未出现第二套工程规则。
7. 隐藏 automation host 的 GPU/Canvas/RAF/退出资源生命周期有真实证据。
8. Windows 和 macOS 安装包包含正确位置的 CLI，且签名和启动路径经过验证。
9. `docs/ACCEPTANCE.md`、`docs/PROGRESS.md` 和相关验证报告已更新。
10. `npm run check`、类型检查、单元测试、Rust 测试、生产构建和相关原生测试均通过，或明确记录环境阻塞。

最终报告必须包含：变更文件、协议版本、命令清单、安装产物路径、测试命令、实际结果、未验证项、风险和下一步。禁止使用“应该通过”“理论上支持”“已完成但未运行验证”等措辞代替证据。

