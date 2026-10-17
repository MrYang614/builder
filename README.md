# 三维建筑编辑器 0.1.0

本地 Tauri 2 桌面编辑器：在单个三维视口绘制正交墙和厚楼板，放置门窗并真实开洞，编辑面材质／纹理连续／楼层／封板，撤销重做，保存可搬运 `.building` 工程，导出带独立门开关动画的 GLB。

需求与状态以 [原始 PRD](docs/PRD-v0.3.md)、[验收矩阵](docs/ACCEPTANCE.md) 和 [当前进度](docs/PROGRESS.md) 为准。Windows 已运行真实 Tauri 宿主；macOS 当前环境不能执行。尚未达到全平台第一期整体验收，不把浏览器测试称为桌面验收。

## 安装与启动

从源码启动需 Node.js、npm、Rust，以及 [Tauri 官方平台前置条件](https://v2.tauri.app/start/prerequisites/)。本机实际使用 Windows x64、Node 26.1.0、npm 12.2.0、Rust/Cargo 1.92.0、MSVC 工具和 WebView2。无需在线后端。依赖锁在 `package-lock.json`、`apps/desktop/src-tauri/Cargo.lock`；不要用 `npm audit fix --force` 自动降级 shadcn。

在仓库根目录执行：

```powershell
npm ci
npm run tauri -- dev
```

桌面开发启动一个主窗口和一个 Canvas。若已经运行 `npm run dev`，停止该独立进程后再使用 Tauri dev，避免 1420 端口冲突。只检查浏览器适配可运行 `npm run dev`，打开 `http://127.0.0.1:1420`；浏览器文件选择／下载只是测试适配层。

Windows 重装依赖前，在运行本项目 `npm run dev`／`npm run tauri -- dev` 的终端按 Ctrl+C 并等待退出，再执行 `npm ci`。若出现 `EPERM unlink ...lightningcss.win32-x64-msvc.node`，先确认项目开发进程已停止：Vite 加载的原生模块会阻止该文件被删除。本机已实际定位并释放此文件占用后重装成功；保留 `package-lock.json`，不要为此结束所有 Node 进程。

生产安装包构建：

```powershell
npm run tauri -- build --bundles nsis
```

Windows NSIS 输出在 `apps/desktop/src-tauri/target/release/bundle/nsis/`，独立 exe 在 `apps/desktop/src-tauri/target/release/builder.exe`。当前 Nova 源码尚未重新打包和验证安装、签名。macOS 在本机 Xcode 工具就绪后执行 `npm ci`、`npm run tauri -- build --bundles app,dmg`；实际系统版本与 CPU 架构待 Q5 确认，构建步骤不代表已经通过。

## 基础 UI 与 Storybook

`@building/ui` 提供完整、严格类型的组件家族；正式编辑器与独立 Storybook 使用同一实现。组件覆盖、旧调用迁移和使用方式见 [UI 组件体系](docs/UI-COMPONENTS.md)，新增示例与浏览器编译规则见 [Storybook README](apps/storybook/README.md)。

```powershell
npm run storybook          # http://127.0.0.1:6006
npm run build:storybook    # apps/storybook/dist
npm run test:storybook     # 独占 6007 的浏览器验证
```

TSX、JSON 和 Controls 支持当前页面内的临时预览，不写回文件或保存草稿；刷新、离开示例或重置恢复仓库基线。本地组件／示例／配置修改通过 HMR 更新，现有浏览器草稿保留，重置载入最新基线。重装依赖前也需停止自己启动的 Storybook 进程，避免原生 CSS 模块被占用。

## Nova 工作区

当前界面采用中性灰 Nova 风格、克制蓝色强调，默认暗色，并完整提供独立亮色主题。44px Header 保留工程操作菜单、新建／打开／保存／另存为／撤销／重做六个直接操作、工程名和保存状态；右侧集中导出、外观、语言、渲染引擎、设置与原生窗口按钮。34px 工作区行控制场景和属性面板，44px 左侧工具栏承载六种建模工具，中央单一 Canvas 是视觉中心。

场景面板默认220px，属性面板默认288px；两侧可独立折叠和拖动调宽，也可聚焦分隔柄后用方向键、Shift+方向键、Home／End调整，双击恢复默认。面板按可用空间收缩并为Canvas保留至少300px；折叠不卸载面板或重建场景。属性使用原生折叠组与横向标签／数值输入；中号控件32px，小号28px。视口与停靠面板保持平面连接，不套装饰卡片。

Inter 用于普通界面，JetBrains Mono 用于尺寸、坐标、角度、采样及技术读数；中文回退到系统 PingFang SC／Microsoft YaHei UI 等字体。两个 Latin 可变 WOFF2 随应用本地打包，共88,660字节，均为SIL OFL 1.1，不依赖在线字体。设计规格、双主题token摘录及组件规则见 [DESIGN.md](DESIGN.md)；[Impeccable侧车](.impeccable/design.json)记录扩展元数据和可渲染组件片段，运行时颜色仍只有 `packages/ui/src/tokens/source.json` 一个来源。

## 常用操作

1. 选择墙体，点击起点与终点，可继续连接；Esc 结束草稿。选择楼板，点击两个对角点。
2. 选择门／窗，把鼠标移到当前层墙面查看预览，再单击放置。选择后可拖动门窗、墙端点或楼板控制点；Esc 或指针取消不落入工程。
3. 右侧属性输入显示米／角度／秒，Enter 或离开输入框提交。非法尺寸保留正式数据并说明原因。撤销／重做按钮和 Ctrl/Command+Z 可恢复一次编辑。
4. 材质工具点击实际表面，选择 A／B、板上／下或厚度面。厚度与洞口内侧只用纯色。导入 PNG/JPEG 后图片进入工程资源，无需保留原文件。
5. 相连且绑定一致的墙面按实际可见边界保持纹理相位。勾选“应用到连接的匹配表面”一次更新路径，撤销完整恢复。可指定选中面起点为闭环收口，保持纹理物理尺寸；面板展示 T 形边界走向。图片自身边缘不连续时不会自动修改图片。
6. 楼层列表选择当前层，其余层半透明且不命中选择／放置／吸附。新增层不补楼梯。楼板工具切为“顶层封板”，确认上表面标高后创建；隐藏仅用于观察，不影响整栋导出。
7. 右键旋转，Shift+右键或中键平移，滚轮缩放；也可使用“旋转／平移”按钮和左键。聚焦选择、当前层、整栋及俯视均可用。整栋预览只读，允许相机和门预览。
8. 保存／打开／另存为使用本地原生文件对话框；新建／打开／关闭时未保存修改可保存、放弃或取消。导出 GLB 包含整栋真实对象、封板和每扇门独立 Open/Close 动画，播放中导出会采样当时角度。

Header 提供英语／简体中文选择和亮色／暗色直接切换按钮。新安装、缺失、旧 system 或异常主题偏好均回退到暗色，有效亮色／暗色选择继续保留，不跟随系统；偏好保存在本机，不进入工程、撤销或导出。主题只更新UI和编辑辅助配色，不改变建筑材质、模型光照、曝光或Renderer生命周期。启动窗口默认1600×900，最小900×600；当前平台限制见 [剩余范围](docs/KNOWN-ISSUES.md)。

Header 的渲染引擎选择器可切换 WebGL／WebGPU；默认 WebGL，设备无法初始化 WebGPU 时保留原渲染器并显示原因。后端选择保存在本机，回退后可明确保存当前后端。拾取使用实例级 three-mesh-bvh，不改变面身份、洞口或导出几何。

“环境光照”可导入 HDR、EXR、PNG、JPEG 等距柱状全景，调整强度、旋转及背景。贴图随 `.building` 工程携带，可撤销删除；无需保留原图片。“开始光追”使用 three-gpu-pathtracer 渐进采样，可暂停／继续并保存当前视口 PNG。编辑及移动相机后重新累计，输出排除网格和选中辅助；GLB 保持建筑和门动画，环境保存在工程中。具体范围与实测平台见 [渲染扩展](docs/RENDERING.md)。

`npm run test:webgpu` 使用完整 Chromium 和真实 GPU，要求成功切换、实际16采样及无验证错误。硬件采样失败继续按 [已知问题](docs/KNOWN-ISSUES.md) 跟踪。

## 可编辑样例与测试

[examples](examples/README.md) 有两层、两扇不同铰链侧／开启方向的门、双面材质、窗和半开姿态；分别提供有封板／无封板 `.building` 与动画 `.glb`，所有图片内嵌。测试截图、trace、报告、基准及本地产物统一写入被 Git 忽略的 `.test-artifacts/`。

[环境与光追样例](examples/rendering/README.md) 提供同一次真实操作下载的工程、门动画GLB及16采样PNG，环境HDR已嵌入；这是实际软件WebGL验证产物，采样噪声和平台限制随样例说明记录。

```powershell
npm run check
npm test
npm run --workspace @building/editor-core typecheck
npm run test:rust
npx playwright install chromium
npm run test:e2e
npm run bench
npm run bench:bvh
npm run build
```

E2E 会使用真实鼠标、键盘、文件选择器和导出下载；`tests/export*.spec.ts` 独立加载并播放导出门、Khronos glTF Validator 校验。原生 WebDriver 的运行／OS 对话框方法见 [WINDOWS-NATIVE](docs/WINDOWS-NATIVE.md)，其测试不会自动伪造系统文件对话框。

Playwright 配置负责测试范围、浏览器／GPU、测试服务器和报告路径；保留三个常用入口：

| 配置                             | 命令                     | 用途                                     |
| -------------------------------- | ------------------------ | ---------------------------------------- |
| `playwright.config.ts`           | `npm run test:e2e`       | 编辑器回归，默认软件 WebGL，独占1421     |
| `playwright.webgpu.config.ts`    | `npm run test:webgpu`    | WebGPU 硬件专项，完整 Chromium，独占1423 |
| `playwright.storybook.config.ts` | `npm run test:storybook` | 共享 UI 组件与 HMR，独占6007             |

`npm run test:regression` 是 `test:e2e` 的兼容别名。单独验证文件用 `npm run test:e2e -- tests/numeric-display.browser.spec.ts`，筛选用例加 `--grep`，无需新增配置。编辑器回归也可用真实 GPU：PowerShell 中设置 `$env:BUILDING_E2E_HARDWARE='1'` 后执行同一命令，用完执行 `Remove-Item Env:BUILDING_E2E_HARDWARE`。GPU 测试应串行运行，避免竞争设备；测试不会复用1420开发服务。上述测试都属于浏览器验证。

`docs/` 只维护需求、架构、开发指南、当前状态和 Skills 清单；不再提交逐次测试报告、截图或日期命名的审查文档。中英文截图校验要求继续执行，原始产物留在本地忽略目录。

## 格式与代码规范

采用 [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) 的项目适配版，使用精确锁定的 oxfmt 0.71.0 和 oxlint 1.86.0。格式、正确性、React Hooks、可访问性和模块导入检查与既有架构／颜色检查一起阻止构建；严格 TypeScript 检查继续保留。

```powershell
npm run format        # 格式化维护源码
npm run lint          # 零警告检查
npm run lint:fix      # 仅安全自动修复
npm run verify        # 格式、lint、边界、类型、测试及生产构建
```

配置、规范差异、局部例外、生成文件排除和编辑器设置见 [代码规范](docs/CODE-QUALITY.md)。Windows GitHub Actions 质量流程已配置，远程结果以仓库 Actions 为准；本地通过不代表远程 CI 通过。

## 工作区与续做

| 目录                       | 职责                                                    |
| -------------------------- | ------------------------------------------------------- |
| apps/desktop               | React 业务面板、集成层、文件适配、Tauri Rust 宿主       |
| packages/editor-core       | 领域模型、验证、命令、事务、历史、编辑会话及工具状态机  |
| packages/building-geometry | 真实墙板实体、连接与洞口、表面身份及连续 UV，无 DOM     |
| packages/three-runtime     | 原生 Three 场景映射、拾取、需求渲染、资源租约、门和导出 |
| packages/ui                | shadcn 基础组件、主题、颜色单一 token 源与公开入口      |

[架构决策](docs/ARCHITECTURE.md)、[Skills 来源](docs/SKILLS.md)、[剩余范围](docs/KNOWN-ISSUES.md)、[进度](docs/PROGRESS.md) 提供中断后恢复依据。六项 skill 已固定在 `.agents/skills`；编辑 UI 前按 AGENTS.md 读取。

token 只改 `packages/ui/src/tokens/source.json`，再 `npm run tokens`。公开入口是 `@building/ui`、`/tokens`、`/theme`、`/styles.css`、`/components/*`；不得穿透 workspace `src`。自动检查禁止 UI 颜色字面量／固定色类、核心显示依赖、过期生成 CSS、漏译错误码和缺少生产样式。

支持同厚正交共线、L 和 T；拒绝十字、异厚连接与未支持实体重叠，失败原子回退。PNG/JPEG 最大 8192×8192／单图 32 MiB；工程 256 MiB。当前仅公开 GLB；JSON glTF 生成器独立测试通过但未提供菜单输出。最低平台、正式性能门槛及 macOS 验收仍待确认／执行。
