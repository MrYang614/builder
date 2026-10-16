# Skills 安装与使用记录

2026-10-03，在 UI 设计前完成项目级安装。三个实际目录都包含可读 `SKILL.md`，编码工具使用 PowerShell `Get-Content -Raw` 读取正文及适用的引用；根 `AGENTS.md` 指定续做时读取。目录由源码安装形成，没有把 README 名称当作安装，也没有注册未经授权的编辑器 hooks。

| Skill 实际标识              | 官方来源与固定版本                                                                                                                                                                                                                                                   | 安装位置                                     | 读取／应用证据                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| frontend-design             | [anthropics/skills](https://github.com/anthropics/skills/tree/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/frontend-design)，提交 `8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4`；源没有独立 semver                                                                   | `.agents/skills/frontend-design`             | 主文及 LICENSE.txt 可读；先确定桌面 Operate 任务、紧凑栏布局和离线字体，形成 DESIGN.md，然后实现 UI                                              |
| vercel-composition-patterns | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/composition-patterns)，提交 `063bee94c3f4df8453406c830b0a7df0f2860278`，metadata 1.0.0                                                   | `.agents/skills/vercel-composition-patterns` | 主文、context-interface、React 19 rule 与 compiled AGENTS.md；EditorProvider 注入服务，面板各自订阅，字段／材料区组合，无通用业务 mega-component |
| impeccable                  | [pbakaus/impeccable](https://github.com/pbakaus/impeccable/tree/e103efe779e2dd01274dabae83531fef00bf2563/cursor-plugin/skills/impeccable)，提交 `e103efe779e2dd01274dabae83531fef00bf2563`；plugin 4.5.0／engine 0.1.11（上游 root package 4.1.0，版本来源分别记录） | `.agents/skills/impeccable`                  | 主文及 audit、harden、polish、craft-floor；实际运行 context 和 detect，产物 `docs/impeccable-detection.json`；UI 修复记录见 UI-REVIEW.md         |

安装使用已读的系统 skill-installer 的 `scripts/install-skill-from-github.py`。本机 `python` 是 Store stub，实际执行解释器为 `C:/Users/52683/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`。两个 skill 以 `--repo`、`--path`、`--ref`、`--dest D:/Code/builder/.agents/skills` 安装；Vercel 额外指定 `--name vercel-composition-patterns`，保留正式标识。Impeccable 从同一固定提交复制官方完整 `cursor-plugin/skills/impeccable`，包含 references 和 launcher，未复制其他插件 hooks。工程检查会检查主文件与实际 name。

可复现命令（首次安装时执行；现有目录不要覆盖）：

```powershell
$skillPython = 'C:/Users/52683/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$installer = 'C:/Users/52683/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py'
& $skillPython $installer --repo anthropics/skills --path skills/frontend-design --ref 8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4 --dest D:/Code/builder/.agents/skills
& $skillPython $installer --repo vercel-labs/agent-skills --path skills/composition-patterns --ref 063bee94c3f4df8453406c830b0a7df0f2860278 --name vercel-composition-patterns --dest D:/Code/builder/.agents/skills
Get-Content -Raw .agents/skills/frontend-design/SKILL.md
Get-Content -Raw .agents/skills/vercel-composition-patterns/SKILL.md
Get-Content -Raw .agents/skills/impeccable/SKILL.md
& .agents/skills/impeccable/scripts/impeccable.cmd context --target apps/desktop/src/App.tsx
& .agents/skills/impeccable/scripts/impeccable.cmd detect --json apps/desktop/src packages/ui/src
```

context 已实际运行一次并加载 PRODUCT.md／DESIGN.md；它报告 PRODUCT.md 使用非结构化旧 schema。按该 skill 的约束保留现有事实，不在 UI 工作中自行迁移 schema。后续可明确发起 init／doctor。detect 退出 0，返回 `[]`；这只说明该 detector 无匹配项，不代替交互、视觉、架构或平台验收。操作系统桌面 WebView 的审查使用 web audit 和 Windows 实际路径；iOS／Android audit.native 的平台条款不适用于本产品。

内置砖、墙面、木纹、地砖均由本项目程序生成，资源可离线使用及随模型导出；相关样例源按 CC0 提供，见 examples/README.md。三项上游 Skill 保留各自许可，不能将其声称为本项目原创。

渲染扩展（2026-10-03）在设计设置前再次读取已安装 frontend-design，React组合时读取 vercel-composition-patterns，可运行后读取 Impeccable audit／harden／craft-floor 并审查新增设置、错误恢复和资源生命周期；不重复安装或启用 hooks。另读取本机 `C:/Users/52683/.agents/skills/webgpu-threejs-tsl/SKILL.md` 作 WebGPU 指引，其已安装状态来自环境，不宣称项目固定了该 Skill 的来源／提交；实际 API 仍以锁定 Three／pathtracer 发布包和官方文档核对。新 UI 审查和平台范围见 UI-REVIEW.md、RENDERING.md。

## 渲染设置的增量读取与应用（2026-10-03）

此次在已有 Operate 桌面编辑器内扩展设置，保留既有 PRODUCT.md／DESIGN.md 与首次 context 结果，没有重新运行上下文初始化、重新安装三项固定 Skills、迁移旧 schema 或开启 detector hooks。只读审查再次读取项目已安装的 Impeccable 主文、`reference/audit.md`、`reference/harden.md`，以及 Composition Patterns 主文、`state-decouple-implementation.md`、`state-context-interface.md`；frontend-design 的既有布局及交互方向沿用。实际审查和修复证据追加在 UI-REVIEW.md，不用 detector 历史空数组替代新交互验证。

环境另外提供了全局 `shadcn` Skill，实际读取位置为 `C:/Users/52683/.agents/skills/shadcn/SKILL.md`。其来源是当前编码环境的已安装能力，正文没有独立 semver 或固定提交；未复制进 `.agents/skills`，不声称该全局文件由本项目 pin 或重新安装。与它配合的项目 CLI 仍精确锁定 `shadcn@4.21.1`，实际执行 `npx shadcn@4.21.1 docs dialog` 返回 [官方 shadcn Dialog](https://ui.shadcn.com/docs/components/dialog)，并阅读 [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) 的焦点、Escape 和受控关闭 API。本次记录直接引用该实际执行，不再次运行 CLI。此次修改已有生成源码 `packages/ui/src/components/dialog.tsx`，没有重新 init／add 覆盖组件，也没有放宽语义 token 检查。

使用顺序与效果：既有 frontend-design 决定紧凑分组和任务文案；Composition Patterns 保持字段／共享 Dialog 的组合与 Provider 边界，并将本机偏好序列化／重试／flush 提取到无 DOM writer；Impeccable audit／harden 找到 modal 错误不可见、旧错误不清、fallback 偏好无法保存、异步陈旧参数、立即关闭丢偏好、长 modal 键盘滚动／Escape／resize 裁切问题。所有修复及实际验证范围见 UI-REVIEW.md；第四轮设置 UI 3/3 通过，早期失败保留，偏好队列9项及本轮123项单元／集成通过。

此处是 Skill 正文读取和具体应用记录，没有自动编码 hook、自动审批或新的 Skill 安装声明。审查限定 Windows 浏览器中的桌面 WebView 前端及源码／模拟宿主；不宣称完成原生 GUI、macOS、屏幕阅读器、触屏、真实 WebGPU 设备或正式性能验收。

## WebGPU 修复读取与应用（2026-10-04）

本轮沿用已安装的 frontend-design 编辑器方向，没有重新设计界面。实际读取全局 webgpu-threejs-tsl 正文，API仍以锁定Three／pathtracer源码与官方资料核对；阅读项目Composition Patterns正文，修改前复核Impeccable主文、harden及craft-floor。应用结果包括保留第一条GPU错误并恢复可编辑状态、按实例清理回调与拥有资源、补齐非交互Tooltip的鼠标穿透。真实鼠标失败及修复验证在UI-REVIEW.md与webgpu-fix-validation.json，不将源代码存在或Skill读取当成验收通过。

没有安装新Skill、启用hook或重复初始化设计上下文。用户确认另一任务并行调整UI，本轮保留它的产品修改；仅增加已复现Tooltip问题的共享输入修复。硬件浏览器验证与原生／macOS范围分别记录。

## Tauri 2 / Rust 专项增量（2026-10-13）

按项目请求新增两项固定上游资料和一项项目策略 skill。Rust 采用 [Apollo GraphQL rust-best-practices](https://github.com/apollographql/skills/tree/1ee2bddb80c9777d958f3e0a77560ffe58b291a7/skills/rust-best-practices)，提交 `1ee2bddb80c9777d958f3e0a77560ffe58b291a7`、MIT、正文版本 1.1.2；其手册覆盖借用／所有权、Result 错误、Clippy、性能、测试、泛型／指针和文档，并有约 1.6 万次安装信号。Tauri 采用 [nodnarbnitram/claude-code-extensions tauri-v2](https://github.com/nodnarbnitram/claude-code-extensions/tree/35e7f7deae689e12b94f9c242b8f59efe0f66476/.claude/skills/tauri-v2)，提交 `35e7f7deae689e12b94f9c242b8f59efe0f66476`、MIT、正文版本 1.0.1；其 60 次仓库提交包含 capabilities、IPC、窗口、分发和官方插件引用资料。两个目录都保留上游 LICENSE。来源、版本和 SHA-256 见 `docs/skills-manifest.json`，工程检查现在同时校验六个 skill 的 `name` 与正文哈希。

项目策略入口是 `.agents/skills/building-tauri-rust/SKILL.md`，人类可读规则是 [TAURI-RUST-RULES.md](TAURI-RUST-RULES.md)。它把上游通用示例限制到本项目实际约束：`main.rs` 薄入口、`lib.rs` 注册命令、EditorCore 独占正式数据、二进制低频 IPC、受限绝对路径／资源预算、临时文件同步后重开校验再原子替换、最小 capability、`spawn_blocking` 和旧文件保护。上游资料保持原文，不在 vendored skill 中写本地例外；项目 skill 明确排除新增插件、sidecar、网络服务、额外窗口和移动目标的隐式授权。

安装由固定的 `skill-installer` 脚本完成，命令和读取证据如下；没有注册 hooks、MCP、运行时依赖或自动外部操作：

```powershell
$skillPython = 'C:/Users/52683/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$installer = 'C:/Users/52683/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py'
& $skillPython $installer --repo apollographql/skills --path skills/rust-best-practices --ref 1ee2bddb80c9777d958f3e0a77560ffe58b291a7 --dest D:/Code/builder/.agents/skills
& $skillPython $installer --repo nodnarbnitram/claude-code-extensions --path .claude/skills/tauri-v2 --ref 35e7f7deae689e12b94f9c242b8f59efe0f66476 --name tauri-v2 --dest D:/Code/builder/.agents/skills
Get-Content -Raw .agents/skills/rust-best-practices/SKILL.md
Get-Content -Raw .agents/skills/tauri-v2/SKILL.md
Get-Content -Raw .agents/skills/building-tauri-rust/SKILL.md
```
