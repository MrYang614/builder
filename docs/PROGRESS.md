# 当前进度

更新：2026-10-17。需求逐项见 [ACCEPTANCE.md](ACCEPTANCE.md)，限制见 [KNOWN-ISSUES.md](KNOWN-ISSUES.md)。本文件只保留当前实现、最近验证和下一步。

## 已实现

- Tauri 2／React／TypeScript／原生 Three.js／Rust 单窗口编辑器；EditorCore 独占不可变正式数据，UI、指针和 CLI 共用命令入口。
- 同厚正交共线／L／T 墙体、真实门窗洞口、厚矩形楼板、显式封板、多楼层、独立表面图片与连续纹理、撤销重做。
- 便携 `.building` 容器、原子保存、资源校验；固定 revision 的 GLB 导出与每门独立开关动画。
- WebGL／WebGPU、GTAO／TAA、渐进光追、环境贴图与 PNG；GPU、调度与释放归 runtime。
- Nova 紧凑界面，默认暗色与完整亮色，本地 Inter／JetBrains Mono；左右面板可折叠、调宽，保留 Canvas 与 Renderer。
- 简明中英文、按用途定宽的控件和完整楼板用途选项。小数输入与选点读数最多两位；仅显式数字编辑归一化，不量化已有正式数据或精确吸附点。
- 共享 UI、独立 Storybook；CLI sibling automation host、JSONL 与 Windows Named Pipe。安装后和跨平台范围仍待验。
- 独立 `@building/ez-tree-adapter`：封装 `@dgreenheck/ez-tree@1.1.0` 的请求规范化、预设创建、材质转换警告、几何快照、LOD fallback 与可重复释放；未接入 editor-core、three-runtime、项目 schema 或现有对象树。

## 最近验证

以下区分实现阶段与本次清理的复验；删除报告不改变既有失败或扩大通过范围。

| 范围                                        | 最近结果与边界                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 格式、lint、架构／token、五套类型、生产构建 | 本次整理后复验通过；构建大 chunk 提示仍存在                                                                                       |
| 单元测试                                    | 本次整理后 435／435，50 文件                                                                                                      |
| 共享数值输入浏览器                          | 合并配置后 5／5，含粘贴、IME、步进、舍入与范围                                                                                    |
| 编辑器相关浏览器                            | 合并配置后数值／选点 5／5；实现阶段相关套件 29／30，光追采样两次在 10 秒后仍为 0，原因未定，该失败本次未重跑                      |
| 中英文视觉                                  | 已检查亮／暗、1600 与最小 900×600 的输入、选点读数和窄面板；浏览器不代表原生验收                                                  |
| Rust／硬件 WebGPU                           | 改版阶段曾通过；两位小数阶段未重跑                                                                                                |
| ez-tree adapter 包级构建与单测              | `npm run build --workspace @building/ez-tree-adapter` 通过；Vitest 5／5 通过；Node 单测使用最小 DOM stub，桌面 WebView 尚未单独验 |
| 原生／macOS／安装                           | 未补验；历史物理 Escape 停止边界保持                                                                                              |

## 下一步

1. 保留原断言定位光追采样超时，不以旧通过或放宽限时覆盖失败。
2. 补最新 Windows 原生完整流程、安装／签名、macOS、真实 IME／DPI／触控板与设备丢失。
3. 确认 Q5 目标系统、CPU／GPU 与参考硬件再验性能；T 形纹理分支仍需针对指定策略的明确证据。
4. 后续如接入植被，再由 vegetation/editor integration 依赖 adapter；本次不把上游树对象写入正式工程数据。

## 文档与产物

`docs/` 保存需求、架构、开发规则和简短状态，已移除历史报告和截图。Playwright 从 12 份配置合并为编辑器、WebGPU、Storybook 三份；用例发现分别为 93／6／65 项，本次未据此宣称全套运行。42 项原始需求条件与文档链接检查通过。

测试源码继续纳入版本管理；截图、trace、日志、基准、验证 JSON 与安装产物写入被忽略的 `.test-artifacts/`，不再累计到文档目录。UI 改动仍须实际检查中英文截图，并在交付说明中记录结果与限制。
