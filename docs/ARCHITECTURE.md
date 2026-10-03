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
