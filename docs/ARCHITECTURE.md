# 实现决策与边界

技术栈按照 PRD 固定为 Tauri 2、React 19、TypeScript、原生 Three.js 与 Rust。保留原始窗口图标和无关资产，将模板迁入 apps/desktop；核心和几何采用独立无 DOM TypeScript 编译边界。npm 可运行、原 Bun launcher 不能运行，故使用 npm workspace 和 package-lock.json；不另引入框架或在线服务。

| 数据／运行部分                        | 所有者                       | 提交与生命周期                                                                                        |
| ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| 建筑工程与 revision                   | editor-core／EditorCore      | frozen snapshot；typed command；完整验证后原子提交；Undo/Redo；失败保留数据                           |
| 当前层、工具、选择、显示隐藏          | editor-core／SessionStore    | 编辑会话，无需保存到工程；只订阅低频变化                                                              |
| 相机、拖动草稿、吸附、GPU、门动画进度 | three-runtime／ThreeRuntime  | 单 Canvas、单 renderer；原生 pointer 与 OrbitControls；按需 RAF；提交结束才发命令                     |
| 主题与语言偏好                        | packages/ui + 平台／Rust     | light/dark直接切换；旧system／无效值迁移light；启动缓存先应用、设置先读取后挂载；本机保存，与工程分离 |
| 资源与文件 IO                         | apps/desktop/platform + Rust | native ZIP／GLB raw 二进制 IPC；本地 dialog；原子写与校验；浏览器适配用于开发和独立测试               |

UI 面板与 pointer 使用同一个 `submit`，禁止反推 Mesh。一次拖动只有一次正式 update 命令；取消清理草稿。墙端点更新解正交连通约束并原子传播，邻墙开洞超界、反转或连接脱落时阻止整次提交。ChangeSet 包含受影响的墙、连续 UV、门窗、板；运行时按变更对象替换派生结构。主题和语言只更新 UI／辅助颜色，不重建 Scene、Camera 或 Renderer。

几何在 TypeScript 中生成真实厚墙、L/T/共线实体并集边界和真实门窗洞口，按 stable A/B/edge/reveal 角色分组。当前支持同厚正交直线、L 形、T 形，提交前拒绝十字、异厚连接、未知实体重叠。楼板是单厚矩形实体，上下表面独立；封板用途／上表面标高显式存储，加载和导出不补板。算法数值测试包含焊接边计数、体积、实际可见面长度、穿洞后 UV 和闭环指定收口。

TextureContinuity 的参考点、收口与实际重复尺寸进入工程；同材质相连可见面按实际周界连续，T 形沿可见凹角转向。Q2 用户确认允许指定收口并保持物理纹理尺寸；外部图片自己的左右接缝不由软件改写。显式选择收口保留其他连续路径，而不是宣称非整周期闭环全周无缝。

资源池按建筑 binding 和 resource 版本共享材质／纹理，每个构件持租约；显示 clone 由其构件所有者释放。初始化、替换、销毁都有独立 owner；导出场景单独建造、等待图像准备、完成后释放。所有 builder、表面、UV、门支点和动画逻辑由编辑与导出复用。导出只读固定 revision 快照，包含所有正式楼层与编辑时隐藏封板，不包含辅助、临时透明或 theme；门播放中快照采样当前角度并保留完整开关端点。

`.building` 是 version 1 ZIP 容器，project.json 存正式参数，resources 按 SHA-256 内容地址去重。未提取不可信路径；重复／未知条目、缺失／损坏资源、不支持版本／字段均拒绝。PNG/JPEG 单图 32 MiB、最大 8192×8192；工程 256 MiB、JSON 32 MiB。Rust 写临时文件、flush、校验后替换；失权／磁盘错误保持上次有效工程。

packages/ui 单一 JSON token 源生成 CSS，提供公共 `/tokens` 纯数据、`/theme`、`/styles.css`、`/components/*` 入口。集成层将 token 解析色值传入 ThreeRuntime；建筑材质色是正式用户数据例外。shadcn 生成源码已替换固定遮罩／阴影／状态颜色并纳入检查。依赖、颜色字面量、主题键、生成一致性及生产 CSS 自动验证。

官方兼容性核对：2026-10-03 读取 [Tauri Vite 配置](https://v2.tauri.app/start/frontend/vite/)、[shadcn monorepo](https://ui.shadcn.com/docs/monorepo)、[React 外部订阅](https://react.dev/reference/react/useSyncExternalStore)、[Three.js GLTFExporter](https://threejs.org/docs/#GLTFExporter)。API 使用所锁定包的类型与源码再次核对。Tauri hooks 的工作目录、frontendDist、单窗口与 raw invoke、GLTFExporter 动画轨道、React snapshot 稳定引用都有实际构建／测试证据。

暂不引入 Worker／Rust WASM 或通用插件系统。CPU 基准已有数据，正式 FPS／指针 P95 门槛待 Q5 参考硬件确认；浏览器软件 WebGL 结果不能替代 Windows 桌面／macOS 实测。安装产物与实际通过范围见 TEST-RESULTS.md 和 ACCEPTANCE.md。

## ThreeRuntime 模块所有权（2026-10-11）

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

## 全仓审查后的职责边界（2026-10-11）

Core 的命令应用、变更集和不可变数据进入 commands／changes／immutable；validation-primitives 与 topology 分别持有字段校验与墙配对约束。geometry 的公开 index 只重导出 types／solids／surface-paths／meshes 与 snap-boundaries。Mesh／UV 的公开构建路径保持共享，预计算复用同一 solids，不引入 React、DOM 或文件依赖。

Rust storage 保留公开 IO、设置和原子替换入口；project_schema 验证正式数据，image_assets 验证建筑图片，project_archive 负责 ZIP 与内容地址资源，storage_tests 单独放场景矩阵。解码前按每个 manifest 引用累计资源展开预算，内容去重不能绕过内存预算。最终 ZIP 与原子临时文件均不得超过重开限制。

Inspector 的完整面级材质职责在 MaterialFields，资源完成后读取最新正式 binding；Numeric／TextField 只有真实输入才提交，纯聚焦不会覆盖外部动画／撤销结果。App 的 project-close 组合守卫在最后偏好 flush 后核对批准快照身份；等待期间有新修改就重新确认。确认 provider 的替换／卸载结算旧调用者，窗口 listener 只在 active 生命周期内销毁。

scene／export 与 ResourcePool 的释放经过 resource-cleanup：全部资源均尝试释放，正常失败汇总报告；构造／导出已有首因时保留它，清理次因仍记录。部分清理失败不保留已脱离所有权的 lease accounting，重复 dispose 不重复释放。全部生产 TS／Rust 源现受统一500行门禁约束，没有逐文件大小例外。
