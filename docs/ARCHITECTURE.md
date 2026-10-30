# 实现决策与边界

技术栈按照 PRD 固定为 Tauri 2、React 19、TypeScript、原生 Three.js 与 Rust。保留原始窗口图标和无关资产，将模板迁入 apps/desktop；核心和几何采用独立无 DOM TypeScript 编译边界。npm 可运行、原 Bun launcher 不能运行，故使用 npm workspace 和 package-lock.json；不另引入框架或在线服务。

| 数据／运行部分                        | 所有者                       | 提交与生命周期                                                                                                                     |
| ------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 建筑工程与 revision                   | editor-core／EditorCore      | frozen snapshot；typed command；完整验证后原子提交；Undo/Redo；失败保留数据                                                        |
| 当前层、工具、选择、显示隐藏          | editor-core／SessionStore    | 编辑会话，无需保存到工程；只订阅低频变化                                                                                           |
| 相机、拖动草稿、吸附、GPU、门动画进度 | three-runtime／ThreeRuntime  | 单 Canvas、单 renderer；原生 pointer 与 OrbitControls；按需 RAF；提交结束才发命令                                                  |
| 主题与语言偏好                        | packages/ui + 平台／Rust     | light/dark直接切换，默认dark；缺失／旧system／无效值回退dark，有效选择保留；启动缓存先应用、设置先读取后挂载；本机保存，与工程分离 |
| 资源与文件 IO                         | apps/desktop/platform + Rust | native ZIP／GLB raw 二进制 IPC；本地 dialog；原子写与校验；浏览器适配用于开发和独立测试                                            |

UI 面板与 pointer 使用同一个 `submit`，禁止反推 Mesh。一次拖动只有一次正式 update 命令；取消清理草稿。墙端点更新解正交连通约束并原子传播，邻墙开洞超界、反转或连接脱落时阻止整次提交。ChangeSet 包含受影响的墙、连续 UV、门窗、板；运行时按变更对象替换派生结构。主题和语言只更新 UI／辅助颜色，不重建 Scene、Camera 或 Renderer。

几何在 TypeScript 中生成真实厚墙、L/T/共线实体并集边界和真实门窗洞口，按 stable A/B/edge/reveal 角色分组。当前支持同厚正交直线、L 形、T 形，提交前拒绝十字、异厚连接、未知实体重叠。楼板是单厚矩形实体，上下表面独立；封板用途／上表面标高显式存储，加载和导出不补板。算法数值测试包含焊接边计数、体积、实际可见面长度、穿洞后 UV 和闭环指定收口。

TextureContinuity 的参考点、收口与实际重复尺寸进入工程；同材质相连可见面按实际周界连续，T 形沿可见凹角转向。Q2 用户确认允许指定收口并保持物理纹理尺寸；外部图片自己的左右接缝不由软件改写。显式选择收口保留其他连续路径，而不是宣称非整周期闭环全周无缝。

资源池按建筑 binding 和 resource 版本共享材质／纹理，每个构件持租约；显示 clone 由其构件所有者释放。初始化、替换、销毁都有独立 owner；导出场景单独建造、等待图像准备、完成后释放。所有 builder、表面、UV、门支点和动画逻辑由编辑与导出复用。导出只读固定 revision 快照，包含所有正式楼层与编辑时隐藏封板，不包含辅助、临时透明或 theme；门播放中快照采样当前角度并保留完整开关端点。

`@building/ez-tree-adapter` 是唯一的 ez-tree 边界：它依赖 `@dgreenheck/ez-tree` 与 workspace Three.js，向后续 vegetation/editor integration 提供 builder 自有请求、能力和释放接口。editor-core、three-runtime、项目 schema 与现有 UI 对象树不依赖上游包；LOD／风动／项目纹理资源的缺口由 adapter 的 capability 和 warning 明确保留。

`.building` 是 version 1 ZIP 容器，project.json 存正式参数，resources 按 SHA-256 内容地址去重。未提取不可信路径；重复／未知条目、缺失／损坏资源、不支持版本／字段均拒绝。PNG/JPEG 单图 32 MiB、最大 8192×8192；工程 256 MiB、JSON 32 MiB。Rust 写临时文件、flush、校验后替换；失权／磁盘错误保持上次有效工程。

packages/ui 单一 JSON token 源生成 CSS，提供公共 `/tokens` 纯数据、`/theme`、`/styles.css`、`/components/*` 入口。集成层将 token 解析色值传入 ThreeRuntime；建筑材质色是正式用户数据例外。shadcn 生成源码已替换固定遮罩／阴影／状态颜色并纳入检查。依赖、颜色字面量、主题键、生成一致性及生产 CSS 自动验证。

官方兼容性核对：2026-10-03 读取 [Tauri Vite 配置](https://v2.tauri.app/start/frontend/vite/)、[shadcn monorepo](https://ui.shadcn.com/docs/monorepo)、[React 外部订阅](https://react.dev/reference/react/useSyncExternalStore)、[Three.js GLTFExporter](https://threejs.org/docs/#GLTFExporter)。API 使用所锁定包的类型与源码再次核对。Tauri hooks 的工作目录、frontendDist、单窗口与 raw invoke、GLTFExporter 动画轨道、React snapshot 稳定引用都有实际构建／测试证据。

暂不引入 Worker／Rust WASM 或通用插件系统。正式 FPS／指针 P95 门槛待 Q5 参考硬件确认；浏览器软件 WebGL 不能替代 Windows 桌面／macOS 实测。当前验收范围见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## ThreeRuntime 模块所有权

`runtime.ts` 保留公开入口、稳定 Scene／Camera／OrbitControls，以及各所有者之间的协调顺序；业务状态和GPU资源归对应模块。应用仍从 `@building/three-runtime` 公开入口调用，不需要知道内部模块。没有继承式私有字段共享、全局可变context或新插件层。

| 模块                                   | 状态与资源责任                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| runtime-contracts                      | 公开Tool／RuntimeSession／RuntimeOptions／ViewportTheme类型与命令转换；不持有运行状态            |
| runtime-interaction                    | 完整指针手势、capture、工具转换、相机指针与画布／失焦监听；结束手势才提交命令                    |
| runtime-preview、runtime-picking       | 预览token／revision与唯一草稿Mesh；复用射线，投射与吸附结果供预览和提交共同消费                  |
| runtime-building                       | 正式文档的派生Mesh、ResourcePool与ChangeSet同步；当前层拾取集合、显示clone、异步图片完成失效保护 |
| runtime-selection、runtime-decorations | 选择边界／端点／铰链辅助；网格／点标记／默认灯光／阴影资源；不进入正式模型                       |
| runtime-animations                     | 门的瞬态角度与播放；完成后提交Core命令；输出采样角度快照不改文档                                 |
| runtime-rendering、runtime-scheduler   | renderer切换、后处理、渲染状态和PNG；独立RAF合并与异步帧串行化，UI不持GPU资源                    |
| runtime-pathtrace、runtime-environment | 独立干净建筑、path session与合并重建计时器；环境解码与纹理版本，陈旧请求自行释放                 |
| pathtracing、pathtrace-drivers         | 采样会话生命周期；锁定第三方backend驱动及其完整释放适配                                          |

正式同步先取消失效手势，再更新building、动画姿态和吸附缓存，失效选择与后处理／光追快照，最后应用session显示。renderer切换先取消编辑／光追借用，替换canvas后重接controls和事件，再释放旧backend。销毁先停止RAF与observer，清输入和预览token，再释放正式Mesh、辅助及灯光，最后释放渲染资源；迟到的采样异常不更新已销毁编辑器的状态。

所有three-runtime手写源文件均受默认500行门禁约束，`runtime.ts`／`pathtracing.ts`的旧例外删除。单元测试直接执行真实owner；部分异步故障注入仍通过受控私有探针设置挂起状态，同时新增实际调用dispose的回归验证完整释放顺序。浏览器诊断形状保持兼容，不把单元fakes或浏览器结果标为原生桌面验收。

## SVG 平面视图

2026-10-29 用户批准 SVG 2D 接入方案，扩展原 PRD 的单三维编辑流程；仍为单窗口、单 WebView、一个 Three Renderer／Canvas。`apps/desktop/src/plan-view` 承担 SVG、DOM 输入和独立相机，模式、平移开关与导航信号属于应用会话，不进入 ProjectDocument 或本机工程文件。

两个视图均读同一个 EditorCore 快照，通过 `services.submit`／CommandGateway 提交，属性、删除、撤销、保存和导出继续复用现有入口。`PlanInteraction` 只保留当前工具和单对象草稿，指针移动不验证整份工程、不提交命令；释放时执行一次正式命令。失焦、指针取消、切层、选区变化、文档替换和视图切换丢弃草稿。共享纯 `dragAnchor`／`dragGeometry` 归 Core，runtime 原路径只作兼容重导出。

坐标按米使用 XZ→SVG XY，正 Z 向下；客户端坐标使用 CSS 像素，DPR 不重复参与转换。正式数据不因显示两位小数而量化。SVG 正式对象层 memo 化并使用稳定 ID，局部预览单独更新。`building-geometry/plan` 复用 solids／ownerAt 输出墙体实际轮廓和外露边界，共线／L／T 接缝不另造算法。门符号与 Three 门扇共用 `doorRotationRadians`，开启弧是辅助线。

ThreeRuntime 的 `setActive` 保留 Renderer、场景、相机和增量文档同步，隐藏时停止输入、RAF、光追重建并取消未完成门动画；恢复后重新测量和绘制。SVG 不拥有或释放 GPU 资源。2D 的开关门按钮通过同一命令入口提交最终角度，不在 SVG 中另建动画历史。只读平面预览仍显示当前层；整栋三维预览从 3D 进入。

第一阶段沿用单选与矩形楼板；不新增 schema、分屏、自动房间、家具或植物实例。后续资产必须先定义版本化的资源定义／楼层实例（ID、位置、旋转、缩放、资源引用），再提供独立 2D 符号／3D builder 与迁移验证；禁止将 SVG 字符串、DOM 或 Three 对象存入正式文档，ez-tree adapter 保持独立边界。

2D／3D 切换流程按用户提供的 `packages/1.html`：进入时，runtime 从 SVG 当前中心、每米像素与楼层标高计算重合俯视姿态，绘制压平模型后开始 450ms 淡入；等待 420ms（与淡入重叠），再用 1700ms 球坐标弧线插值抬升相机并升起模型。返回时先用 1300ms 回转压平，再用 450ms 淡回 SVG。每次进入的斜视姿态由保留的 2D 视口推导；繁忙期间忽略重复请求。减少动态效果时只保留 80ms 淡入淡出。

斜视终点保留参考的目标与方向，并根据当前平面窗口内可见建筑的实际高度／深度扩展最小距离，避免外墙被视口裁切；不会为窗口外远处对象缩小当前构图。压缩期间暂时关闭原本启用的阴影接收，避免近共面表面的阴影条纹，恢复全高或取消后恢复原标志。

`RuntimeViewTransition` 独占临时相机／建筑根变换，通过既有渲染调度器推进；phase 在实际光栅绘制后按真实时间发布，React 只订阅阶段边界。临时高度绕当前层标高缩放，其他楼层与辅助层暂时隐藏；结束／取消恢复原变换和可见性，不进入 Core、历史或独立导出快照。过渡期间使用实时光栅，暂停干净光追场景的工作并保留用户渲染设置。工程／会话变化、真实尺寸变化、渲染后端切换、动态效果偏好变化或卸载会取消并恢复起始视图。

SVG／Canvas 保持同一区域尺寸，工具栏用重叠网格预留稳定高度，楼板输入只保留一份；切换与编辑输入在过渡期间隔离。不新增逐帧 React、IPC、截图复制或第二个 Renderer。相同尺寸／DPR 不重设缓冲；真实尺寸变化先绘制光栅帧再恢复采样，暂停且无采样时保留光栅回退并停止调度。参考 HTML 是只读原件，不作为构建入口或运行时依赖。

## 核心与文件职责边界

Core 的命令应用、变更集和不可变数据进入 commands／changes／immutable；validation-primitives 与 topology 分别持有字段校验与墙配对约束。geometry 的公开 index 统一导出几何、表面、snap-boundaries 和 plan 的纯接口。Mesh／UV／平面轮廓的公开构建路径保持共享，预计算复用同一 solids，不引入 React、DOM 或文件依赖。

Rust storage 保留公开 IO、设置和原子替换入口；project_schema 验证正式数据，image_assets 验证建筑图片，project_archive 负责 ZIP 与内容地址资源，storage_tests 单独放场景矩阵。解码前按每个 manifest 引用累计资源展开预算，内容去重不能绕过内存预算。最终 ZIP 与原子临时文件均不得超过重开限制。

Inspector 的完整面级材质职责在 MaterialFields，资源完成后读取最新正式 binding；Numeric／TextField 只有真实输入才提交，纯聚焦不会覆盖外部动画／撤销结果。App 的 project-close 组合守卫在最后偏好 flush 后核对批准快照身份；等待期间有新修改就重新确认。确认 provider 的替换／卸载结算旧调用者，窗口 listener 只在 active 生命周期内销毁。

scene／export 与 ResourcePool 的释放经过 resource-cleanup：全部资源均尝试释放，正常失败汇总报告；构造／导出已有首因时保留它，清理次因仍记录。部分清理失败不保留已脱离所有权的 lease accounting，重复 dispose 不重复释放。全部生产 TS／Rust 源现受统一500行门禁约束，没有逐文件大小例外。

## 基础 UI 与组件工作台边界

`packages/ui/src/components` 导出完整语义 API 和类型，`src/primitives` 承载内部 shadcn/Radix 组合。CLI 的 ui alias 指向 primitives；高级组合只从明确的公开 `@building/ui/primitives` 命名空间进入。公共组件不提供外观 className/style，页面容器仍负责区域布局。命名空间只组织静态成员；Form context 承担字段标签／帮助／错误／禁用关联，不承担建筑业务。

Input／InputNumber 的草稿 owner 属于 UI：输入中间态、IME、Enter／blur 去重和 Escape 取消不直接修改工程。桌面 fields 适配器仍通过同一 services.submit／EditorCore 命令确认数值和文本，领域校验与历史留在应用。Language context 从翻译字典提取，偏好生命周期与 Renderer 分离。

`apps/storybook` 是独立 React/Vite 开发 workspace，标准 iframe 只用于 Storybook。它直接导入公开 UI；不依赖 Core、geometry、Three 或 Tauri。编译器和 Storybook 依赖不进入正式编辑器模块图，真实生产构建的模块图有回归断言。编辑器继续单窗口、单 WebView、单主 Canvas，GPU／后处理／光追 owner 和统一快照导出均未转移。

浏览器代码以 Sucrase 编译可信本地 TSX，通过明确依赖表运行；没有后台或文件写入 API。JSON 与 Controls 共享 Storybook args，错误保留最后有效配置并明确标记旧结果。组件源码 HMR 更新当前实现；示例／配置 HMR 更新恢复基线，页面内存快照协调 Storybook 的异步 remount。真实导航清空草稿；监听、编译任务、Blob URL、观察器分别由 owner 清理。
