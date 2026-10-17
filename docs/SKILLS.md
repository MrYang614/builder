# 项目 Skills

固定资料位于 `.agents/skills/`，来源、版本和主文件 SHA-256 由 [skills-manifest.json](skills-manifest.json) 记录，并由 `scripts/check.mjs` 校验。保留上游许可和原始字节；目录存在不等于自动运行、hook 信任或产品验收通过。

| Skill                       | 来源与固定提交                                                                                                                                                                                                    | 使用时机                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| frontend-design             | [anthropics/skills](https://github.com/anthropics/skills/tree/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/frontend-design)，`8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4`                                        | UI 设计前读取；方向维护于根 DESIGN.md                         |
| vercel-composition-patterns | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/composition-patterns)，`063bee94c3f4df8453406c830b0a7df0f2860278`                     | React 组合、Provider／状态边界和公共 API                      |
| impeccable                  | [pbakaus/impeccable](https://github.com/pbakaus/impeccable/tree/e103efe779e2dd01274dabae83531fef00bf2563/cursor-plugin/skills/impeccable)，`e103efe779e2dd01274dabae83531fef00bf2563`                             | 可运行后 audit／critique／harden／polish                      |
| rust-best-practices         | [Apollo GraphQL](https://github.com/apollographql/skills/tree/1ee2bddb80c9777d958f3e0a77560ffe58b291a7/skills/rust-best-practices)，`1ee2bddb80c9777d958f3e0a77560ffe58b291a7`                                    | Rust 所有权、错误、性能与测试                                 |
| tauri-v2                    | [nodnarbnitram/claude-code-extensions](https://github.com/nodnarbnitram/claude-code-extensions/tree/35e7f7deae689e12b94f9c242b8f59efe0f66476/.claude/skills/tauri-v2)，`35e7f7deae689e12b94f9c242b8f59efe0f66476` | Tauri IPC、窗口、capability 与分发                            |
| building-tauri-rust         | 本项目策略                                                                                                                                                                                                        | 宿主改动先应用；见 [TAURI-RUST-RULES.md](TAURI-RUST-RULES.md) |

根 AGENTS.md 指定读取顺序。实际读取主文和适用引用后实施；通用上游示例不授权新增插件、sidecar、服务或窗口。安装／更新固定提交并校验 manifest 与许可，不自行启用 hooks。

```powershell
Get-Content -Raw .agents/skills/frontend-design/SKILL.md
Get-Content -Raw .agents/skills/vercel-composition-patterns/SKILL.md
Get-Content -Raw .agents/skills/impeccable/SKILL.md
& .agents/skills/impeccable/scripts/impeccable.cmd context --target apps/desktop/src/App.tsx
& .agents/skills/impeccable/scripts/impeccable.cmd detect --json apps/desktop/src packages/ui/src
```

项目已实际读取并应用这些规则；Impeccable context／detect 曾执行。detector 空结果仅表示没有匹配项，不能代替真实截图、交互、资源或平台验证。未来 UI 工作仍须记录实际问题和修复范围，详细报告与截图写入本地 `.test-artifacts/`。

环境另外提供的 shadcn、WebGPU 等全局 Skill 不属于项目固定清单，不声称由本仓库安装或 pin；API 仍以锁定依赖的类型、源码和官方资料核对。
