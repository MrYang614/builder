# 第一期验收追踪表

更新日期：2026-10-03。依据 `docs/PRD-v0.3.md` 的 A01–A42；42 行场景及通过条件逐字保留。此表不宣称第一期整体完成。

**最新工具增量（2026-10-03）**：已接入 oxfmt／oxlint 和 Google TypeScript 规范项目适配版，格式、lint、四套严格类型、71项测试及生产构建通过；14项相关浏览器回归及4组生产资源检查通过。见 [代码规范](CODE-QUALITY.md) 与 [执行报告](code-quality-validation.json)。本次未跑全套33项、原生 GUI、Rust或NSIS重建；下文全套与桌面产物属于此前交付证据。工具接入补充A26／A29／A35／A36／A37／A39／A41的检查证据，不改变42行场景、条件或验收状态，不补填平台缺口。

状态仅使用：**未实现、已实现未验证、验证通过、验证失败、环境阻塞、需求待确认**。无平台条款的对象、文件格式或静态条件可以依据完整的单元／浏览器断言标为通过，核验范围列明确证据所属环境；这不等于该功能在所有桌面平台完成验收。完整条件只获得部分证据时仍为已实现未验证；含双平台条款的 A14／A24／A34／A41 保留环境阻塞。

**已执行证据**：最终 `npm test` 71／71通过（UI12、core38、core-topology3、geometry8、export5、container5）；全工作区与core／geometry独立无DOM严格类型检查通过。`npm run test:e2e -- --output test-results/final-delivery` 最终33／33通过（16文件，250.26秒，0跳过／失败／flaky），原始JSON在 `test-results/e2e-results.json`，旧21项报告保留在 `test-results/e2e-21-before-ui-focus.json`。范围包括真实文件／鼠标、连接墙、门窗孔、墙端点对比、厚板上下材质、跨层命中、保存／导出竞争、旧图片晚到、实际渲染主题及完整UI状态、资源和大型工程。浏览器文件流程使用开发适配器，不能冒充Tauri原生对话框。

**N** 指 `tests/artifacts/native/results.json` 与 `docs/WINDOWS-NATIVE.md`：Windows 11 build 26200 的实际 Tauri debug／WebView2 宿主，19 个 finalCases 通过，保留 4 次原始失败及重试原因。原生真实鼠标、中文路径保存／打开及 Rust 二进制 IPC、门及动画 GLB 验证均有产物。Computer Use 被用户物理 Escape 停止后未再操作；Windows 标题栏未保存关闭路径没有通过。原生证据采自最终运行时重构之前，不作为其新增行为的原生回归。Rust 文件可靠性测试 14 项通过；实际原生产物 Validator 零错误、零警告，独立 GLTFLoader 已验证图片／半开姿态／开关片段。

2026-10-03 补充依赖恢复证据：释放本项目 Vite 对 Lightning CSS 原生文件的占用后，`npm ci`、check、71项测试和生产构建通过，锁文件哈希不变；生产页面4组冒烟及实际 GLB Validator通过，见 [恢复记录](TEST-RESULTS.md#npm-ci-文件占用恢复2026-10-03) 与 [独立报告](../test-results/npm-ci-recovery-20261003/production-smoke.json)。本次未改产品源码，不变更下表验收状态，也不作为原生或 macOS 验收。

A18翻译和A36默认阴影色的首次失败已修复并回归。最终整组窗拖动失败定位为聚焦后camera矩阵过期，旧代码1524px偏差可复现；修复后连续5次及最终整组通过。新增确定性保存竞态复现旧保存放行New丢新修改，已修复并通过真实ZIP／GLB文件回归，保留旧失败与测试器修正记录。`docs/benchmark-core.json`与`docs/benchmark-browser.json`分别记录NodeCPU及软件WebGL性能／资源；它们不是原生GPU或正式性能达标证据。Q5正式系统／CPU／参考设备仍待确认。

| 编号 | PRD 场景 | PRD 通过条件 | 实现位置 | 测试／证据位置 | 当前状态 | 核验范围与剩余工作 |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | 新建墙、楼板、门、窗 | 全程在三维视口完成，无需手动编辑网格 | packages/three-runtime/src/runtime.ts；apps/desktop/src/ui/Inspector.tsx；editor-core | tests/editor.spec.ts；tests/core.test.ts；N/WIN-03、13；tests/runtime.browser.spec.ts | 验证通过 | 浏览器真实鼠标完成墙、厚矩形楼板、门、窗的新建，不编辑网格；窗完整移动／尺寸／导出洞口路径也通过。Windows原生墙／门通过，最终窗和板的原生路径未跑；此对象条件通过不等于全平台验收。 |
| A02 | 直线和直角连接 | 已支持连接类型无裂缝、闪烁及外露内部端盖 | packages/building-geometry/src/index.ts | tests/geometry.test.ts；tests/core-topology.test.ts；N/WIN-03；tests/connections.browser.spec.ts；docs/connections-{collinear,L,T}-validation.json；docs/screenshots/connections-* | 验证通过 | 真实鼠标建立同厚正交直线、L、T，各实际GLB独立加载：闭合边计数2、退化／重复／共面重叠／内部端盖为0，体积和边界射线与解析结果一致，Validator零错误零警告；每种3个真实相机旋转视角截图已审查，无可见裂缝或重叠面闪烁根源。拒绝十字及未知重叠；不据软件WebGL承诺所有硬件结果。 |
| A03 | 给墙 A 面、B 面设置不同图片 | 两侧分别正确；厚度面仍为纯色 | editor-core/model.ts、core.ts；three-runtime/scene.ts | tests/export.browser.spec.ts；tests/geometry.test.ts；N/WIN-16、19 | 验证通过 | 对象材质条件通过：浏览器独立加载实际 A/B 图片并检查像素与纯色厚度；Windows 原生属性赋不同图片并独立加载其磁盘 GLB。此行无双平台条款；macOS 宿主未验证。 |
| A04 | 门洞、窗洞与墙体贴图 | 真实开洞；内侧按规则纯色；周围 UV 不重置 | building-geometry/index.ts；editor-core/validation.ts | tests/geometry.test.ts；tests/core.test.ts；tests/export.browser.spec.ts | 验证通过 | 对象几何条件通过：无 DOM 门／窗真实扣孔面积与体积、纯色 reveal、洞口周围 UV 不重置；浏览器实际门与 GLB 加载补充验证。新建窗的原生 UI 路径仍归 A01 未验证范围。 |
| A05 | 2.4 m 与 1.8 m 墙段使用 0.5 m 重复纹理 | 共线连接相位准确，不逐段重新起图 | building-geometry/deriveSurfacePaths、wallGeometry | tests/geometry.test.ts（2.4＋1.8 共线、4.8 周期） | 验证通过 | 无 DOM 几何验收通过：共线相位按物理累计距离准确，内部端盖移除，没有逐段重置。仅指该对象／数值条件，不代表平台外观或性能结论。 |
| A06 | 同材质墙面转直角 | 沿指定连续面正确接续，内外角长度处理正确 | building-geometry/deriveSurfacePaths | tests/geometry.test.ts；tests/export.browser.spec.ts（独立加载内外角 UV） | 验证通过 | 对象 UV 条件通过：内外实际周界长度与独立加载后的接缝坐标一致，0.5 m 平铺保持实际尺寸；Windows 原生绘制直角墙已有补充证据。 |
| A07 | 闭合房间及 T 形分支 | 按确认后的收口／分支策略验收，不伪称无条件无缝 | editor-core/TextureContinuity；building-geometry/deriveSurfacePaths | tests/geometry.test.ts；tests/core.test.ts；tests/materials.browser.spec.ts | 验证通过 | Q2 已确认允许指定收口并保持实际尺寸。无 DOM 非整周期闭环和 T 可见周界路由通过；浏览器真实选择／移动收口、连续组批量参数、撤销及路径展示通过。结论限已记录的收口／分支策略，没有承诺无条件无缝。 |
| A08 | 楼板上木纹、下白色或另一贴图 | 两面独立，板厚正常，没有重合天花板模型 | editor-core/Slab；building-geometry/buildSlabGeometry | tests/core.test.ts；tests/geometry.test.ts；tests/export-samples.spec.ts；tests/slab-floor.browser.spec.ts；tests/artifacts/slab-floor-validation.json | 验证通过 | 真实鼠标建单块厚板，UI为top木纹、bottom另一图片；实际GLB独立加载验证实体1、12三角形、闭边计数2、厚0.35m、体积4.2、上下面图独立且侧边纯色，Validator零错误零警告。原生材质路径未单独运行。 |
| A09 | 门从 0° 转至建议的 90° 再关闭 | 门板绕铰链轴旋转；框、墙和支点不漂移 | three-runtime/doorRadians、doorAnimations、animateDoor | tests/export.test.ts；tests/export.browser.spec.ts；N/WIN-19；tests/runtime.browser.spec.ts | 验证通过 | 编辑器内真实UI点击开／关，两门并发独立播放并分别作为命令完成，0°／90°最终正确、撤销取消播放；独立导出0／50／100%验证铰链、门框与墙固定。原生45°与导出另有证据，最新内置播放原生回归未运行。 |
| A10 | 移动、缩放或删除门窗 | 洞口同步；删除恢复墙面；无幽灵洞口 | editor-core 更新／删除 opening；runtime.sync | tests/core.test.ts；tests/geometry.test.ts；tests/editor.spec.ts；N/WIN-14；tests/runtime.browser.spec.ts；tests/door-edit.browser.spec.ts；docs/door-edit-validation.json | 验证通过 | 门真实放置→宽1.2m／高2.35m→鼠标移动→直接删除门→一次Undo，7个实际GLB逐次独立加载验证洞口面积／边界射线，删除墙体fingerprint等于无孔原墙且无门节点／动画，Undo完全恢复门和孔并独立播放；窗相同真实尺寸／移动／删除恢复链已通过。Validator零错误零警告；原生整链未补跑。 |
| A11 | 切换楼层并尝试点选其他层 | 其他层半透明且不可选择、吸附或贴图 | editor-core/snapPoint；three-runtime/pick、setSession | tests/core.test.ts；tests/editor.spec.ts（current-floor filtering）；tests/slab-floor.browser.spec.ts；tests/artifacts/slab-floor-validation.json | 验证通过 | 浏览器实际render核对ghost0.25透明、当前墙1且不透明；真实鼠标对其他层墙／板／门／窗选择和材质操作均不命中，门窗放置无预览不改文档；墙端点及板角off-grid吸附均排除，当前层选择和放门positive control通过。原生多层路径未运行。 |
| A12 | 修改墙长、重建几何并撤销 | 材质、开洞、连接和纹理锚点完整恢复 | editor-core 事务／历史；geometry 重建 | tests/core.test.ts；tests/core-topology.test.ts；tests/geometry.test.ts；tests/editor.spec.ts；N/WIN-04、06 | 验证通过 | 对象／命令验收通过：L／闭环／T 连接传播与完整撤销、材质／洞口／锚点不丢失及上下游 UV 重建通过；浏览器和 Windows 原生属性改长／撤销补充真实操作证据。 |
| A13 | 保存后删除导入图片原文件并移动项目 | 重新打开仍可编辑，贴图完整 | platform/container.ts；src-tauri/src/storage.rs | tests/editor.spec.ts（portable file flow）；platform/container.test.ts；Rust portable_container_survives_original_deletion_and_migration；N/WIN-09、12、17 | 验证通过 | 便携文件条件通过：浏览器真实导入本地中文图片，保存到迁移目录，删除原图后重开资源与可编辑数据一致；Rust 真实跨目录和原图删除测试通过；原生中文路径保存／打开另有证据。完整 OS 导入图片迁移 UI 流程未单独执行。 |
| A14 | 项目在 Windows 与 macOS 之间迁移 | 参数、材质和门状态一致，路径不失效 | 便携 .building 容器与米／Y-up 数据 | docs/WINDOWS-NATIVE.md；tests/native-container.ts；平台补验步骤 | 环境阻塞 | Windows 原生文件链及 TypeScript↔Rust 容器互通已通过；没有 macOS 宿主，未做真实 Windows↔macOS 迁移。不得把格式兼容或同机迁移当作本行双平台通过。 |
| A15 | 非当前层半透明时导出整栋 | 导出所有正式对象；不含辅助元素与临时透明 | three-runtime/buildBuilding、export.ts | tests/export.test.ts；tests/editor.spec.ts（两层实际 UI 文件导出）；tests/export-samples.spec.ts | 验证通过 | 正式导出对象条件通过：浏览器两层工程实际导出，不含网格／预览；导出单元核对正式对象数、封板数及唯一透明玻璃材质，显示幽灵透明不进入建筑材质。原生完整多层导出路径未执行。 |
| A16 | 独立加载导出模型 | 单位、UV、双面材质、洞口、玻璃、封板和支点正确；可读取动画 | 三维共享 builder；GLTFExporter／GLTFLoader | tests/export.test.ts；tests/export.browser.spec.ts；docs/export-validation.json；N/WIN-18、19 | 验证通过 | 对象／产物验收通过：独立加载两层模型验证米制范围、真实几何／玻璃／封板与节点，A/B 图片像素和内外 UV 接缝、支点及动画可读取；Validator 零错误、零警告。Windows 原生产物另验证双面图片和半开门动画；macOS 显示未验证。 |
| A17 | 文件损坏、无权限或磁盘写入失败 | 错误明确，上次有效工程不被破坏 | Rust 原子替换／ZIP 校验；platform decode | platform/container.test.ts；Rust storage.rs 14 项 IO；tests/ui-contract.test.ts；tests/file-failure.browser.spec.ts；docs/file-failure-validation.json | 已实现未验证 | 实际UI保存有效ZIP后，经文件选择器打开截断／未知版本／图片校验和损坏的真实文件，中文错误明确、当前文档／saved状态／有效文件SHA256保持，重新打开好文件恢复；英文错误字典由静态合约核验。Windows只读目标保护旧文件和Rust故障通过；真实桌面失败弹层、磁盘空间耗尽与全部权限场景仍未执行。 |
| A18 | 切换英语与简体中文 | 自有界面完整翻译，尺寸和工程内容不变 | apps/desktop/src/ui/i18n.ts | tests/ui-contract.test.ts（12 项全部通过）；tests/editor.spec.ts；N/WIN-02、07、08 | 验证通过 | 旧错误码翻译缺口已修复并回归：中英字典键、占位符、实际核心／平台／Rust 错误码及 UI 文案查询完整。浏览器和 Windows 原生切换语言保持工程尺寸、文档和 Renderer，双语截图已记录。系统原生文件对话框跟随 OS 语言。 |
| A19 | 独立播放导出门的开／关动画 | 各导出形式均含动画；0%、50%、100% 时姿态正确，铰链不漂移，门框不动 | doorAnimations；exportGLB/exportGLTF | tests/export.test.ts；tests/export.browser.spec.ts；tests/export-samples.spec.ts；docs/export-validation.json；N/WIN-18、19 | 验证通过 | 当前提供给用户的 GLB 形式通过：每门 Open／Close、0／50／100%、支点／门框固定，含原生实际写盘产物。内部 JSON glTF API 的动画／Validator 通过，但未作为独立 UI 文件形式交付；若新增该菜单须补同等文件及播放流程。 |
| A20 | 多楼层、多门及不同铰链侧／开启方向 | 每扇门片段可单独播放，方向正确，不影响其他门或楼层 | Opening 铰链／direction；按 stable ID 节点／轨道 | tests/export.test.ts；tests/export-samples.spec.ts；docs/export-validation.json | 验证通过 | 对象／动画条件通过：两个楼层、两门左右铰链与不同方向、每扇独立片段的姿态和稳定支点，播放不影响其他门／层；两种封板样例独立加载记录齐全。原生多门 UI 创建链未执行。 |
| A21 | 半开门保存、重开、移动后再次导出 | 静态姿态与完整动画端点均正确，无角度重复叠加、旧支点绑定或工程状态污染 | runtime.snapshot；DoorRoot／HingePivot | tests/export.test.ts；tests/editor.spec.ts；N/WIN-14、15、17、18、19；tests/door-roundtrip.browser.spec.ts；docs/door-roundtrip-validation.json | 验证通过 | 同一工程完整实际链通过：45°门保存→文件选择重开→真实拖动→改铰链／方向→保存和GLB导出；独立加载验证新的支点、静态45°、每门Open／Close端点及0／50／100%、门框固定、其他门与正式文档不污染。原生有部分操作证据，不宣称原生整链回归。 |
| A22 | 顶层封板创建、删除、撤销与导出 | 是否封顶受用户控制；上下材质正确；重开与导出不擅自补板或漏板 | Slab purpose='roof'；用户显式高度 | tests/core.test.ts；tests/editor.spec.ts（封板创建／删除／撤销）；tests/export-samples.spec.ts；docs/export-validation.json | 验证通过 | 对象／浏览器条件通过：用户明确创建封板、删除并撤销；含封板／无封板样例容器重开保持正式文档，导出板数与高度相符，不自动補板；top/bottom 独立规则在核心／几何测试中核验。原生封板文件链未单独运行。 |
| A23 | 三项 Skills 安装与加载验证 | 官方来源、版本、路径可追溯，实际编码工具可读取；不是只有文档声明 | .agents/skills/frontend-design、impeccable、vercel-composition-patterns | docs/SKILLS.md；.agents/skills/*/SKILL.md；scripts/check.mjs | 验证通过 | 三项官方固定提交、版本来源、项目安装路径、实际读取命令及使用记录存在，编码工具可读取。Impeccable context／detect 实际运行有记录及产物；detector 的空结果不代替产品审查或平台验收。 |
| A24 | UI 与 React 开发流程复核 | 有 frontend-design 应用、Composition Patterns 审查和 Impeccable 打磨记录；双语与双平台流程回归通过 | 业务面板及共享组件组合 | docs/SKILLS.md；docs/impeccable-detection.json；docs/UI-REVIEW.md；N/WIN-02、07、08 | 环境阻塞 | frontend-design、Composition Patterns与Impeccable实际应用／审查／修复清单已完成；Windows双语交互和截图、浏览器生产资源双主题／双语回归通过。本行明确要求双平台，macOS无宿主，不能整体通过。 |
| A25 | 无跨层通行设施的多层项目 | 无需楼梯或楼板连通洞口即可创建、保存、重开和导出；软件不自动补入这些对象 | ProjectDocument 仅层、墙、板、门窗 | tests/core.test.ts；tests/editor.spec.ts（两层保存／重开／GLB）；tests/export-samples.spec.ts | 验证通过 | 对象／浏览器文件条件通过：无楼梯或楼板连通设施的两层项目可创建、保存重开及导出，版本严格 schema 不引入额外设施，封板由用户控制。Windows 原生只完成单层局部链。 |
| A26 | 依赖边界与单视口初始化 | 单 WebView／Canvas；无 iframe／R3F；核心及几何无 React／DOM／Tauri／ui 依赖；ui 无建筑或 Three.js 业务 | 工作区 public exports；单 Tauri WebView／ThreeRuntime | tests/ui-contract.test.ts；scripts/check.mjs；editor-core 独立 ES2022 typecheck；N/WIN-01 | 验证通过 | 静态架构与实际初始化条件通过：包边界、公开 API、核心／几何无 UI／DOM／Tauri，ui 无建筑／Three 业务；原生单主窗口单 WebView 配置与实际单 Canvas，无 iframe／R3F。不据此宣称所有生命周期场景通过。 |
| A27 | 同一墙长从属性与拖拽修改 | 同一命令规则；一次拖拽一条历史；取消不落入工程；关联门窗和连接完整恢复 | EditorCore.execute／beginPreview／commitPreview | tests/core.test.ts；tests/core-topology.test.ts；tests/editor.spec.ts；N/WIN-14；tests/wall-roundtrip.browser.spec.ts；docs/wall-roundtrip-validation.json | 验证通过 | 同一手绘L墙与门，属性3.2m和真实端点鼠标3.2m的实际GLB几何／UV fingerprint完全相同；预览正式文档和历史不变，释放仅一条历史，撤销和Esc取消完整恢复连接／门／双面贴图／连续UV。四个GLB独立加载及Validator零错误零警告。原生端点完整路径未跑。 |
| A28 | 改变连续墙的上游长度 | 几何、洞口与后续连续 UV 正确更新；过期异步结果及旧项目结果不覆盖新版本 | ChangeSet 传播；RevisionGate；连续路径重算 | tests/core.test.ts；tests/core-topology.test.ts；tests/geometry.test.ts；tests/wall-roundtrip.browser.spec.ts；docs/benchmark-browser.json；tests/async-theme.browser.spec.ts；docs/late-image-validation.json；tests/snapshot.browser.spec.ts | 验证通过 | L／闭环／T上游改长、洞口／下游UV／锚点恢复与真实属性／端点修改独立导出一致；仅重建受影响4墙。实际图片load回调晚到期间通过UI替换工程，旧CPU缓存3→0，不恢复旧Scene／对象、不额外invalidate或渲染；版本门控、旧保存不清新dirty及导出快照竞争也有真实文件证据。范围为浏览器异步及纯模块，最终原生回归未执行。 |
| A29 | 重复挂载／卸载、切换面板、语言和主题 | 无重复监听／渲染循环；非卸载动作不重建 Renderer；共享资源不提前释放 | runtime 生命周期／资源池／ViewportHost 清理 | tests/export.test.ts（共享资源租约）；tests/editor.spec.ts；N/WIN-07；runtime.browser.spec.ts；tests/runtime.browser.spec.ts；tests/resources.browser.spec.ts；docs/runtime-validation.json；docs/resource-cache-validation.json | 验证通过 | 实际React StrictMode挂载／清理created2、disposed1、active1；20次选择／主题／创建删除／项目替换，Renderer、8监听和geometry3固定，工程图片／材质／引用为0，仅Three内部DFG_LUT留存并核对身份。共享租约、同ID图片替换及CPU缓存释放通过；这些是浏览器与模块证据，不替代最终原生回归。 |
| A30 | 高频拖动、相机、门动画与按需渲染 | 无逐帧全局 React／IPC 更新；活动时连续更新，稳定后停止空转；最终状态准确 | runtime.invalidate／RAF／private drafts/liveAngles | tests/core.test.ts；tests/editor.spec.ts（idle frame）；docs/benchmark-core.json；runtime.browser.spec.ts；tests/runtime.browser.spec.ts；tests/performance.browser.spec.ts；docs/benchmark-browser.json | 验证通过 | 真实相机、墙／板／门窗预览及两个并发门动画按需渲染，完成只提交最终命令，稳定500ms不增帧；静态边界和订阅保证无逐帧全局React／IPC。此行为条件通过；软件WebGL观察FPS与响应P95没有达到／认定PRD建议性能目标，Q5正式硬件仍待确定。 |
| A31 | 输入框、弹窗、IME、指针取消与相机操作 | UI 事件不穿透；编辑文字不删场景；失焦可恢复；工具预览不丢失；非当前层不抢拾取 | keyboardIntent／routeInput；Canvas pointer capture；Dialog | tests/core.test.ts；tests/editor.spec.ts；N/WIN-05、07；tests/runtime.browser.spec.ts；tests/slab-floor.browser.spec.ts；tests/ui-states.browser.spec.ts | 已实现未验证 | 浏览器与原生文本Delete／弹窗不删场景；核心IME／文本／弹层路由通过，真实Esc取消及相机暂挂工具／恢复草稿、跨层命中均通过。发现并修复受控Dialog关闭焦点丢失，实际关闭Settings恢复按钮。实际IME组合、失焦／pointercancel所有组合与原生标题栏关闭未完整执行。 |
| A32 | 编辑过程中保存或导出 | 使用版本一致的快照；主题／透明／高亮不污染结果；旧保存完成不清除新修改状态 | core revision／markSaved；runtime.snapshot；平台分离快照 | tests/core.test.ts；tests/export.test.ts；tests/export.browser.spec.ts；tests/editor.spec.ts；N/WIN-17、18；tests/snapshot.browser.spec.ts；docs/save-race-validation.json；docs/export-race-validation.json | 验证通过 | 真实UI New→确认Save，在实际ZIP哈希延迟中继续编辑：存储捕获版本、当前新版本仍dirty，新建不丢新修改；真实GLB编码延迟中编辑，独立加载保留捕获几何而源文档保留新修改。主题／ghost／高亮不污染及播放姿态快照另有断言；延迟是平台故障模拟，未冒充原生对话框。 |
| A33 | 手动选择亮色、暗色并重启 | 两模式即时生效并持久化；选择、相机、输入草稿和工程不变；无明显错误主题闪屏 | UI ThemeProvider；启动 HTML 缓存；平台设置 | tests/ui-contract.test.ts；tests/editor.spec.ts；N/WIN-02、07、08、11；tests/runtime.browser.spec.ts；tests/ui-states.browser.spec.ts | 已实现未验证 | Windows原生亮暗即时切换和重启英语／暗色持久化通过；浏览器重载、启动缓存、Renderer／相机／工具草稿保持通过，系统media变动还保留未提交数值“-”、输入焦点和选择。原生未提交数值输入草稿保持和启动闪屏完整观察尚未核验。 |
| A34 | 跟随系统时切换操作系统主题 | Windows／macOS 运行期同步；手动模式不被覆盖；切回 system 立即解析当前系统主题 | ThemeProvider matchMedia change listener | tests/ui-contract.test.ts；tests/editor.spec.ts（emulateMedia）；docs/WINDOWS-NATIVE.md | 环境阻塞 | 浏览器媒体模拟验证跟随 system、手动不被覆盖及切回 system 立即解析通过。未实际改变 Windows OS 主题；macOS 无可用宿主，本行明确双平台条件仍阻塞。 |
| A35 | 双主题完整 UI 与 Portal | 菜单、弹窗、Tooltip、Toast、禁用／错误／焦点状态一致；中英文不溢出，文本与控件清晰 | packages/ui 语义主题；Dialog／Select／Tooltip Portal；双语 | tests/ui-contract.test.ts；tests/editor.spec.ts；tests/ui-states.browser.spec.ts；tests/artifacts/ui-states-validation.json；tests/artifacts/ui-states；docs/screenshots；N/WIN-07、08 | 验证通过 | 英语／简体中文×亮／暗四组合真实鼠标和键盘覆盖Tooltip／箭头、Select、Dialog、错误alert、状态提示、禁用Redo与焦点环，实际计算色与公开token一致；输入／菜单／弹层文字和900×600截图无横溢，关闭恢复焦点。用可关闭alert/status呈现反馈，不另造未使用Toast；本UI条件通过不替代macOS或屏幕阅读器整链验收。 |
| A36 | 颜色单源、语义完整性与静态检查 | 所有 UI 颜色来自 packages/ui；双主题键齐全；无未批准字面量、基础色类、重复色表或过期生成产物 | ui/tokens/source.json → tokens.css；静态检查 | tests/ui-contract.test.ts（12 项全部通过）；scripts/check.mjs；packages/ui/src/tokens/source.json | 验证通过 | 旧 shadcn 默认阴影缺口已修复并回归。双主题语义键、唯一色源、颜色字面量／固定调色板／隐式阴影色、生成 CSS 精确一致性和真实生产样式检查通过，未关闭类型／静态约束。 |
| A37 | shadcn/ui 新增组件与生产构建 | 共享组件进入 ui 包；公开导出和别名有效；生产样式完整；生成源码亦满足 token 和主题规则 | 共享 ui 组件／components.json／public exports | tests/ui-contract.test.ts（独立生产构建、公开导出、生成源码）；scripts/check.mjs | 验证通过 | 共享 shadcn 组件位于 ui 包，公开入口／别名与包边界可解析；实际独立生产构建包含主题变量、Portal／焦点／语义样式，生成源码 token 检查回归通过。完整 UI 交互外观另见 A35。 |
| A38 | 主题切换与同工程导出比较 | 辅助配色同步；模型材质、灯光设置、UV、几何、动画语义不变；无主题对象被导出 | 主题桥接仅辅助配色；独立导出 builder | tests/export.browser.spec.ts；tests/ui-contract.test.ts；tests/editor.spec.ts；N/WIN-07、16、19；tests/async-theme.browser.spec.ts；docs/scene-theme-validation.json | 验证通过 | 双主题实际导出语义完全一致，图片／UV／几何／动画不变且无辅助对象；实际Scene渲染回调采集材质及贴图UUID、2灯、曝光1和tone mapping0均不变。网格／轴、选中轮廓／面、铰链、吸附、预览均精确匹配对应语义token；Renderer保持。此浏览器对象条件通过，不宣称OS主题或macOS整链通过。 |
| A39 | UI 包解耦与主题桥接 | /tokens 无 React／DOM／Three.js；集成层传解析色值；运行时无逐帧 CSS 读取；核心不反向依赖 ui | ui/tokens 纯数据入口；integration/ViewportHost | tests/ui-contract.test.ts；editor-core 独立 ES2022 typecheck；integration/ViewportHost.tsx 与 ThreeRuntime 依赖检查 | 验证通过 | 架构／静态条件通过：tokens 纯数据入口无 React／DOM／Three，颜色由集成层解析注入，运行时渲染帧没有 CSS 读取或 ui 反向导入，核心独立无 DOM 编译通过。此行不包含双平台运行条款。 |
| A40 | 主题偏好异常、启动读取与工程迁移 | 无效值回退 system；晚到读取不覆盖新选择；主题不进工程／撤销；迁移工程不改本机主题 | 本机设置与工程分离；validTheme；启动 await settings | tests/ui-contract.test.ts；Rust settings_are_separate_and_bad_preferences_fall_back；platform/container.test.ts；N/WIN-11、12 | 已实现未验证 | 异常值回 system、设置／工程分离、原生重启偏好和打开工程后本机英语／暗色保持通过。人为延迟 settings 读取期间新选择、跨机器接收设置保护及异常启动文件流程尚未完整核验。 |
| A41 | 三项 Skills 与本版规则复核 | 审查包含架构边界、shadcn/ui、token、双主题／双语／双平台；保留加载及修复证据 | AGENTS.md；三项项目 Skills；模块／token 规则 | AGENTS.md；docs/SKILLS.md；docs/impeccable-detection.json；tests/ui-contract.test.ts；docs/UI-REVIEW.md | 环境阻塞 | 架构边界、shadcn生成源码、token单源、双语双主题与三项Skills实际安装读取均有最终组合审查和修复证据。明确要求双平台，macOS无运行环境；不以浏览器或Windows单平台替代。 |
| A42 | CPU／GPU 与文件故障回归 | 资源可释放、错误可恢复、权限受控；二进制导出不强制 Base64；原工程及上次有效保存保持完整 | 资源池／dispose；Rust 二进制 IPC／原子 IO | tests/export.test.ts；platform/container.test.ts；Rust IO 14 项；docs/benchmark-core.json；N/WIN-09、12、17、18；tests/resources.browser.spec.ts；docs/resource-cache-validation.json；docs/benchmark-browser.json | 已实现未验证 | 共享资源租约、20次图片CPU／GPU缓存释放、20次编辑器生命周期循环及大型50循环／5导出计数稳定；Rust raw二进制IPC、损坏／只读写失败保留旧保存、资源迁移通过。原生实际CPU／VRAM及文件内存峰值、真实磁盘满与全部权限反馈仍未核验，计数不能替代字节预算。 |


当前行状态统计：验证通过 33 项；已实现未验证 5 项；环境阻塞 4 项。Q5 单独标记需求待确认，不人为改变 A01–A42 的原始通过条件。

## 当前专项与最终证据位置

| 专项 | 实际结果 | 证据 |
| --- | --- | --- |
| 运行时、拖动、相机／动画／生命周期与新增用户链 | 最终整组33／33通过；旧失败与修复后结果均保留 | 16个测试文件与test-results/e2e-results.json、final-delivery；各validation JSON |
| GPU／交互及资源循环 | 3层100墙60门窗24板20独立2K图片，1920×1080，50循环与5导出资源计数稳定，Validator0错误0警告；未认定FPS／响应目标达标 | docs/benchmark-browser.json；test-results/final-delivery；原生GPU和Q5参考设备未验证 |
| Windows生产NSIS | 最终包含相机／保存竞态、共享Tooltip和Dialog焦点修复的优化exe／NSIS构建成功；未安装／启动release宿主 | docs/release-artifacts.json，绝对路径／字节／SHA256；TEST-RESULTS.md |
| UI／Skills组合审查 | 最终审查及修复记录完成，生产资源4组检查通过；macOS阻塞 | docs/UI-REVIEW.md、SKILLS.md、production-smoke.json、screenshots；macOS不以浏览器替代 |

## 平台与待确认项

| 范围 | 实际记录 | 剩余核验 |
| --- | --- | --- |
| Windows 11 10.0.26200 x64，AMD Ryzen 7 7800X3D | Node／浏览器上述测试通过；真实 Tauri debug 已完成19项。原生进程与浏览器结果分别记述。 | 最终运行时原生回归、系统主题实际变化、输入草稿／启动闪屏、关闭保护；最终release及NSIS已构建，安装／release启动未验证。 |
| macOS | 环境阻塞，未运行本机宿主或安装包；独立于无平台条款的对象通过项。 | 在确认的系统与 CPU 架构运行全部文件／建模／动画流程，加入 Command、触控板、系统主题、权限和跨平台工程迁移。 |
| Q2 闭环纹理 | 用户确认允许指定收口，保持实际尺寸；几何与浏览器收口选择／撤销通过。 | T 按已记录的实体可见周界分支路由展示；进一步宿主外观与迁移比对可补充，不能宣称任意闭环无条件无缝。 |
| Q5 系统／CPU／正式基准设备 | 需求待确认；本机测量不替代产品兼容范围。 | 用户确定后记录双方参考环境 1920×1080 视口、持续时间、FPS、指针 P95、CPU／GPU／文件资源峰值与循环稳定性。 |

## 续做边界

继续执行表中5项未完整验证条件及4项双平台阻塞条件，重点是真实原生关闭／系统主题、最终修订的原生输入／资源／文件失败回归、macOS与外部初心者任务，按Q5确认环境测正式性能。原生会话按用户物理Escape停止，本轮未继续GUI；不以浏览器结果填补缺口。所有42条原始场景／通过条件可由 `node scripts/acceptance-report.mjs` 校验并生成状态摘要。

## 渲染扩展验收补充（2026-10-04）

新增R01–R09的要求、实现位置、测试、实际证据及限制见 [RENDERING.md](RENDERING.md)，最终汇总见 [rendering-validation.json](rendering-validation.json)。123项单元／集成、39项完整浏览器路径、Rust18项、便携环境真实文件链和生产资源4组通过；Windows最终渲染NSIS已重建但未安装／启动release宿主。可编辑环境与光追样例附固定验证报告和SHA清单。

本机无可用WebGPU adapter，成功切换及WebGPU实际光追保持环境阻塞；真实设备丢失、原生PNG／关闭流程和macOS未验证。原始A01–A42的场景、通过条件及33通过／5已实现未验证／4环境阻塞不变，不用新增浏览器结果补填原生缺口。

## Header 布局验收补充（2026-10-04）

本轮用户明确要求 Header 操作仅保留 SVG 图标、悬浮显示文字，主题／语言／渲染引擎从设置移至 Header；新建、打开、保存、另存为、撤销、重做置左，原生最小化／最大化／关闭移入 Header 并移除装饰栏。这项最新要求覆盖 PRD 3.1 的常显图标加文字和 3.3 的设置外观路径，原 PRD 与 A01–A42 的原始条件和状态保持不变。

| 编号 | 新增要求 | 实现位置 | 测试与证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- | --- |
| H01 | 六个文件／历史动作依指定顺序放在 Header 左侧 | App file-actions；ui IconButton | header.browser 四组合的实际名称、顺序、位置；HEADER-LAYOUT.md；header-layout-validation.json | 验证通过 | 新布局的浏览器证据；本轮未操作原生系统文件框 |
| H02 | Header／建模工具仅常显 SVG，鼠标悬浮显示本地化说明 | IconButton／Tooltip；工具 ToggleGroup | SVG／可见文字与辅助树断言、禁用动作／工具 Tooltip、键盘菜单和焦点；四组合 PNG | 验证通过 | 不等同外部初心者或屏幕阅读器整栋任务验收 |
| H03 | 主题、语言、实际渲染引擎可在 Header 直接选择 | HeaderPreferences；SelectIconTrigger；本机偏好 | Header 切换／重载／工程和历史保持；rendering UI 与 backend 回退回归；header-layout-validation.json | 验证通过 | 实际 GPU 能力与 WebGPU 成功路径按渲染矩阵单独验证 |
| H04 | 原生装饰栏移除，Header 内窗口三按钮、拖动及关闭保护可用 | Tauri decorations=false／capability；platform/window；WindowControls | window 9项适配器、window-header 5项 Chromium 模拟 IPC；原生配置编译检查 | 已实现未验证 | 用户此前停止原生 GUI，本轮未继续；实际 Windows／macOS 窗口与关闭尚未验证，模拟宿主不能替代 |
| H05 | 900×600 双语／双主题操作可见，长项目名不遮挡保存状态或窗口按钮 | editor.css 紧凑分组、名称截断／状态不收缩、Portal | 四组合 Header PNG、实际长文件打开、模拟 IPC 长工程与未保存状态边界；HEADER-LAYOUT.md | 验证通过 | 浏览器／模拟 IPC 布局证据，不代表原生 DPI、多屏、系统缩放验收 |
| H06 | UI 偏好切换不改工程、不重建场景；原生状态监听释放 | EditorProvider／偏好 Signal；Header 原始值订阅；window 监听清理 | Header 快照／历史／Renderer／Scene／Camera 断言；window 迟到结果和清理；最终专项报告 | 验证通过 | 断言和模拟资源计数不替代真实原生 CPU／GPU 资源测量 |

H01–H06 的完整要求、实现、测试、证据来源和限制见 [HEADER-LAYOUT.md](HEADER-LAYOUT.md)；独立设计／技术审查及发现修复见 [UI-REVIEW.md](UI-REVIEW.md)，本轮实际统一结果见 [header-layout-validation.json](header-layout-validation.json)。浏览器／模拟 IPC 与原生验收严格区分；Q2、Q5、原生停止边界和全部历史渲染证据继续保留。

## WebGPU 修复验收补充（2026-10-04）

前述“没有可用adapter”为上一轮软件GPU探测结论。此次完整Chromium已在实际RTX4070 SUPER通过默认／PNG／JPEG环境16采样、暂停继续、真实GPU着色器错误后恢复与重试、WebGL↔WebGPU切换和三周期资源稳定。最新要求关联、代码／测试／证据及原生限制在[渲染矩阵](RENDERING.md)和[专项报告](webgpu-fix-validation.json)。真实设备丢失、Tauri宿主新路径、系统安装和macOS未验证；A01–A42原条件与33通过／5已实现未验证／4环境阻塞状态保持。

## Header 工程标题与保存状态补充（2026-10-04）

| 编号 | 新增要求 | 实现位置 | 测试与证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- | --- |
| H07 | 移除 Header“建筑编辑器”，工程名居中；已保存／未保存修改置于撤销、重做右侧，状态行为保持 | App header-project-actions／project-label；editor.css 等宽左右网格；HeaderWindow 右组 | header.browser 与 window-header.browser 最新11项全部通过；双语／双主题900和1440宽、长名保存／未保存、Tooltip及窗口模拟动作；header-title-validation.json | 验证通过 | 此项为浏览器及模拟IPC布局验证；未启动原生GUI，Windows／macOS实际窗口验收不变 |

状态直接读取既有 status.isDirty，原保存／打开／撤销／重做和关闭保护不改。所有实测标题中心偏差为0px，状态在六动作末尾完整显示。首轮透明拖动区域旧32px尺寸断言的两项失败留存；最终限制只约束可见图标按钮，空白拖动区域仍实际验证鼠标、双击及键盘动作。

## Header 全区域拖动与纯展示工程名补充（2026-10-04）

用户最新要求覆盖之前工程名的 Tooltip／焦点行为及独立窄拖动按钮：Header 除交互控件外都需要按下拖动，工程名没有单独交互或鼠标样式变化。

| 编号 | 新增要求 | 实现位置 | 测试与证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- | --- |
| H08 | 整个Header非交互区域均可请求窗口拖动；工程名为无Tooltip／焦点／悬浮变化的纯文字 | HeaderWindow根header事件、DOM及交互目标过滤；App project-name；editor.css默认光标／禁止文字选择 | 最新15项相关E2E通过；五处鼠标背景逐次请求一次drag，双击一次drag+最大化；图标／禁用包裹／选择器及Portal零drag；纯文字24布局与草稿焦点保持；header-drag-validation.json | 已实现未验证 | 输入路由、文本、布局与关闭保护在Chromium及模拟IPC通过；未启动原生GUI，Windows／macOS实际移动与DPI仍未验证 |

## 双主题直接切换与启动窗口尺寸补充（2026-10-04）

用户最新要求优先于原 PRD 3.3、A34 和 A40 的三态／跟随系统／异常值回 system 条件：当前主题仅为亮色与暗色，Header 图标直接切换且无主题菜单，旧 system 与异常主题固定回亮色。原始42行及对应历史证据保留；当前主题验收按 H09，实际原生系统主题同步不再是本次要求。用户另要求默认窗口1600×900。

| 编号 | 新增要求 | 实现位置 | 测试与证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- | --- |
| H09 | 只保留亮／暗主题，图标点击直接切换，无系统跟随或主题弹窗；重启保留偏好 | HeaderPreferences按钮；ui ThemeProvider／validTheme；main／HTML首屏；platform与Rust设置迁移 | 双语点击／Enter／Space、无listbox、OS媒体变化不改主题、偏好重载与旧system迁移；设置／UI合约与Rust边界；theme-toggle-validation.json | 已实现未验证 | 浏览器及设置边界验证记录在专项报告；实际新Tauri宿主重启未执行，不替代Windows／macOS验收 |
| H10 | 原生窗口默认尺寸由1280×800改为1600×900 | tauri.conf.json main width／height，最低900×600保持 | 配置检查、1600×900浏览器布局及Windows发布构建；theme-toggle-validation.json | 已实现未验证 | 未启动新原生宿主；浏览器viewport不等同操作系统窗口或高DPI实际尺寸 |

## 后处理与主界面光追入口验收补充（2026-10-11）

| 要求 | 实现 | 测试／证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- |
| 主界面启动／退出光追，设置只保留采样、后处理和环境参数 | `apps/desktop/src/ui/RenderControls.tsx`、`runtime.ts` 状态机；准备、渲染、暂停、完成、失败与返回实时编辑文案 | `tests/rendering-ui.browser.spec.ts`；`tests/rendering.browser.spec.ts`；`tests/webgpu.hardware.ts`；真实 Chromium 操作和三周期资源回收 | 验证通过 | Tauri 原生标题栏／文件对话框仍按历史平台边界未重跑 |
| WebGPU 实时 GTAO 与 TRAA 接入 | `webgpu-postprocessing.ts` 使用 Three 0.186.1 `GTAONode`、`TRAANode`；独立深度／法线／velocity pre-pass；光追不复用该链 | `tests/webgpu.hardware.ts` 真实 RTX4070 SUPER/Dawn：着色器、渲染、光追16采样、暂停继续、PNG及切换通过 | 验证通过 | 未在 macOS 或 Tauri WebView 实机运行 |
| WebGL 实时 GTAO 与深度重投影 TAA | `postprocessing.ts` 的 `GTAOPass` 默认色彩合成；`webgl-taa.ts` 8样本 Halton 抖动、前一帧 VP 重投影、深度拒绝、YCoCg邻域裁剪 | `tests/postprocessing.browser.spec.ts` SwiftShader 浏览器：独立开关、相机变化、缩放、画布截图、无 shader/TSL 错误；证据 `test-results/postprocessing/evidence.json` | 验证通过 | 浏览器计时只用于同场景相对观察，不替代正式 Q5 硬件基准 |
| 历史失效、资源释放和兼容性失败反馈 | 模式切换、相机／文档／环境／DPR变化失效；后处理异常回退直渲染并可见提示；旧 renderer、composer、pre-pass 和历史资源释放 | `tests/runtime-rendering.test.ts` 24项；`tests/postprocessing.browser.spec.ts`；`npm run check` | 验证通过 | 真实 device-lost 仍需目标设备补验 |
| 场景视觉层次与代码边界 | 默认双向灯光、阴影、弱化网格、ghost 透明度；`App.tsx` 拆为职责明确的 UI 子组件；`renderer-lifecycle.ts`、`viewport-decorations.ts`、`render-state.ts` | 同视角实时截图 `test-results/postprocessing.browser-*/realtime-postprocessing.png`；Impeccable 交互审查记录；规则检查器 | 已实现未验证 | 光照意图已实际观察，正式设备帧率和显存测量待 Q5 系统确认 |

首轮代码／渲染审查发现 GTAO 最终输出误用灰度 Denoise、WebGPU AO 与场景 pass 自引用、WebGL 全屏 shader 重复声明属性、后处理切换和异步 backend 清理竞态；已修复并以单元、浏览器及真实 WebGPU 回归。第二轮用户视角审查发现设置面板迁移后旧测试仍假定弹窗保持打开、准备中退出路径的按钮约束不足、capturePNG 绕过实时后处理、网格与 ghost 默认干扰主体；已修复并重跑双语／双主题、缩放、连续切换、后处理开关和光追入口测试。

“GTAO”在当前锁定 Three 版本中确有 `GTAONode`，因此 WebGPU 使用它；没有改成 SSAO。WebGPU 的 TAA 开关使用 `TRAANode`，WebGL 使用独立的深度重投影 TAA；光追模式单独使用 path tracer 累积，不叠加实时 GTAO／TAA。

## 可配置几何吸附验收补充（2026-10-11）

修改前记录：拾取由 `ThreeRuntime.coordinates`／`pick` 完成，地面交点由 `ground` 计算，绘制和拖动通过 `ToolStateMachine` 与 EditorCore 预览事务提交；原有 `snapPoint` 只覆盖墙端点／边线与楼板顶点／边线、始终回退网格且没有统一开关。最小接入边界确定为 EditorCore 纯几何候选与排序、SessionStore 的单一 `snap` 状态、ThreeRuntime 的当前层候选索引和辅助标记、ToolOptions 的开关；正式对象、ChangeSet、历史与导出边界保持不变。

| 要求 | 实现 | 测试／证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- |
| 开关与配置属于 session，不写 ProjectDocument 或 undo/redo | `session.ts` 单一 `snap: SnapSettings`；`ToolOptions` Toggle；`SnappingSettings` 模式、公差与网格；services bridge | `snap.test.ts`、`runtime-snap.test.ts`；`snapping.browser.spec.ts` 实际开关／设置、文档及历史不变 | 验证通过 | 默认开启、综合模式、公差0.16m、网格0.1m；会话内设置，不持久化为本机偏好；宿主重启未验 |
| 点目标、可解释结果与确定优先级 | `snap.ts` 墙端点／连接节点、楼板顶点、洞口四个平面角点、有效墙边锚点与交点；对象／楼层／类型／坐标／距离／提示键 | `snap.test.ts` 排序、重复、退化、公差、精度、关闭原始输入；真实两次鼠标墙绘制端点完全相等 | 验证通过 | 沿现有水平XZ编辑平面，Y由当前楼层提供；未引入竖向编辑或任意外部mesh顶点 |
| 有限线段投影与实际墙连接边界 | `snap-primitives.ts` 最近点投影；`building-geometry/snap-boundaries.ts` 共享实体周界，含L外角延长及内侧裁切；墙中心线／外露边线／楼板边线 | `snap-boundaries.test.ts`、`runtime-snap.test.ts` 真实L边界／所有者过滤；浏览器线中点与两墙截图 | 验证通过 | 开口角点为可编辑平面 footprint；完整三维洞口高度不作为新的编辑轴 |
| 正式候选缓存与自吸附／ghost／隐藏／辅助过滤 | `RuntimeSnapIndex` 分楼层及对象几何签名，验证ChangeSet后局部更新；连接边界只在墙几何变化后重解，保留未变owner组 | runtime单元检查无效ChangeSet、宿主改变、材料／楼板不重解墙、局部owner保留；浏览器工程编辑／楼层／相机／resize | 验证通过 | 世界坐标索引与相机无关；相机与窗口变化清除反馈并重新投射，不重复重建静态几何 |
| 预览与提交共用结果，一次拖动一条历史 | `RuntimeSnapping` 约束后求解；`drag-anchor` 保留正式抓取锚点；`drag-geometry` 精确提交目标坐标；Core预览事务 | 实际端点及整墙拖动、文档不变、一次提交、Escape／pointercancel；楼板及门窗既有回归 | 验证通过 | Alt/Option临时绕过；关闭仍沿原始精确输入路径；不支持的对象回退原输入 |
| 克制反馈、两主题两语言与键盘入口 | local DOM米制坐标、目标类型状态、点标记、可复用有限线段网格条；所有UI颜色来自语义token | `snapping.browser.spec.ts` 双语×双主题900×600、按下状态／Tooltip／焦点／只读禁用、配置错误恢复；UI-REVIEW.md | 验证通过 | 浏览器键盘及可访问名称通过，不等同屏幕阅读器整链任务或原生DPI验收 |
| 取消、失焦、相机及渲染切换无残留，资源按所有权释放 | runtime取消事务、capture／blur清理；`SnapFeedback.dispose` 释放自有几何／材质，借用点标记由runtime释放；静止交互不持续TAA调度；公开阴影回调避免陈旧sampler重新上传已释放纹理 | runtime几何／反馈／调度单元；浏览器连续开关、相机、实时↔光追与辅助对象消失；20轮资源专项完整UUID稳定、项目资源归零，`resource-final/runtime-validation.json` | 验证通过 | Three资源单元与浏览器计数不是原生显存字节峰值；真实WebGPU及设备丢失未在本轮验收 |
| 开关性能可复现 | 40点固定世界轨迹、实际鼠标dispatch、runtime帧／查询／重建计数 | `snapping-validation.json` 与 `.test-artifacts/snapping/` 保存完整轨迹、JSON、PNG及测试报告 | 验证通过 | 仅900×600、DPR1、两墙SwiftShader浏览器观察；不是FPS／P95或Q5正式基准 |
| Tauri Windows／macOS与正式参考设备 | 当前功能走现有Tauri／React／Three边界，没有新增原生或IPC循环 | Rust及编译检查；本轮未启动原生GUI | 已实现未验证 | 遵守此前原生停止边界；macOS／Option实机／触控板／屏幕阅读器／DPI多屏未验；Q5目标设备仍为需求待确认 |
| Q5正式系统／硬件及性能目标 | 保留原Q5待确认边界；本轮测量是软件GPU浏览器固定轨迹 | 未采集参考设备FPS／P95及进程／显存峰值 | 需求待确认 | 需要确定正式系统、CPU／GPU、驱动、WebView和设备；两墙数据不替代高密度工程基准 |

固定顺序为交点／连接节点 → 墙端点 → 有效锚点／洞口角点 → 楼板顶点 → 有限线段最近点 → 公差内网格 → 原位置。同级按距离和完整稳定语义键排序，遍历顺序不影响结果。关闭和Alt/Option绕过不查询候选；绕过不进入历史。运行时结果同时保留未调整射线位置及鼠标到结果的距离，抓取锚点距离用于公差判断，避免整墙抓取偏移被误当成吸附半径。

首轮技术审查实际修复：重叠候选元数据不确定、派生交点重复处理、无效ChangeSet导致旧候选、洞口宿主身份／隐藏过滤、拖动抓取偏移与小数精度、墙正交约束造成标记／提交不一致、连接墙外角与内侧边界遗漏、门窗拾取表面与地面投射不一致。对应纯函数、缓存、资源与浏览器回归均保留。runtime原超限文件从既有1812行降为1806行，规则上限同步降低；新增模块均低于500行。

第二轮在真实Chromium编辑器操作两墙、线中点、空白、ghost、拖动、连续开关、相机、resize、主题／语言及光追。发现细线反馈在后处理下难以辨认，改为复用的有限段网格条；发现静止预览反复失效TAA历史导致连续调度，改为输入驱动交互帧、结束后有限精炼。加强GPU探针另发现共享阴影材质重新上传已释放的工程砖纹理，增加公开onBeforeShadow借用材质策略修复，未关闭阴影或隐藏残留。旧资源／相机／动画时序／ghost透明度测试的前提变化另作测试维护，不将其描述为吸附产品缺陷。最终命令、测试数量、控制台及实测值见专项JSON。

性能数据只记录真实40点鼠标dispatch加等待空闲的总耗时、实际渲染帧数、累计查询耗时和候选重建次数。完整世界／屏幕轨迹与场景、viewport、canvas、DPR随证据保存；两组耗时差不能证明吸附提高性能，没有采集FPS或P50/P95。浏览器结果不标记为桌面或macOS验收，Q5参考系统和硬件仍为需求待确认。

## ThreeRuntime 组织优化验收补充（2026-10-11）

| 要求 | 实现 | 测试／证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- |
| 小模块保持完整职责与公开API，整个three-runtime手写源不超过500行 | runtime协调入口；独立交互／预览／拾取／正式场景／选择／动画／渲染／调度／环境／光追所有者；contracts集中类型；移除两项大小例外 | ARCHITECTURE.md；check、typecheck；runtime-refactor-validation.json的源码行数与SHA256 | 验证通过 | 只调整runtime内部组织，不改变UI、正式模型、保存格式或Core所有权 |
| 绘制／拖动／吸附／取消、ChangeSet、主题／楼层及干净导出保持 | 所有者保留原命令／revision边界与同步顺序；diagnostics兼容 | runtime-interaction与runtime-scene-owners直接模块回归；选定浏览器实际鼠标及GLB；最终主题专项通过；按最新结果去重31条浏览器路径通过，详见runtime-refactor-validation.json | 验证通过 | 另有一条既有UI提示计数失败，单独记录；本轮未启动Tauri GUI，macOS／设备仍按历史限制 |
| 资源与监听闭环、陈旧异步完成不污染新编辑器 | owned helper／灯光／阴影幂等释放；backend／decode／path请求版本；销毁后sample reject停止反馈与RAF | runtime-rendering实际dispose、scheduler与scene-owners回归；20轮真实GPU UUID资源专项，工程资源归零、15张renderer纹理身份及9个runtime监听稳定，BVH构造／释放1071，控制台／页面错误0 | 验证通过 | fakes、浏览器GPU资源计数不等同原生显存字节或真实设备丢失验收 |
| 原有设置错误提示只出现一次的浏览器断言 | App视口与RenderingSettings弹窗的既有notice.error分支均保留；本轮不修改无关UI | rendering-ui.browser.spec.ts:281，全页alert期望1、实际2；独立Core实验拒绝intensity11、零发布／历史变化，未调用runtime.sync | 验证失败 | 这是既有UI问题；案例在计数处早停，后续旋转、损坏HDR及英文断言本轮未执行；不计入runtime功能通过 |

本轮没有性能提升主张。原始浏览器失败保留；旧主题测试假定2盏灯，当前重构前基线已为1盏半球灯和2盏方向灯，更新完整3盏身份／类型断言。复测发现旧探针最后读取GTAO法线预处理的临时清屏色，改为记录非override的真实颜色渲染，保留后处理、背景token精确断言、两主题灯光／曝光和正式材质完全一致的检查。修复资源所有权后262项／27文件单元、四套TS、check、Rust20项及build通过；浏览器最终数量与源文件SHA256见runtime-refactor-validation.json。Tauri／macOS及真实硬件范围保持历史限制。

## 全仓审查修复验收补充（2026-10-11）

本节补充本轮结果，原始 A01–A42 条件及此前失败记录保留。逐项问题、触发条件、修复及限制见 REPOSITORY-REVIEW.md；最终执行结果以 repository-review-validation.json 为准。

| 要求 | 实现 | 测试／证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- |
| 正式数据不可变、非法预览不提交、revision可靠前进 | Core独立 immutable／commands／changes／validation；缓存只信任冻结资源，最新非法预览拒绝提交，整数溢出保持历史 | core-review.test.ts；core.test.ts；纯Core类型目标 | 验证通过 | 不改变既有合法命令与文件版本；边界回归不证明所有未知输入均无缺陷 |
| 合法密集洞口可生成完整网格，Core与几何边界一致 | TypedArray一次分配，复用solids，统一1e-7正交边界；无关墙依赖跳过扫描 | geometry-review.test.ts 80窗完整索引／洞口面积；core-geometry-review/evidence.json 冷计算记录 | 验证通过 | Node单次冷计算不是桌面FPS／P95，Q5硬件仍待确认 |
| 绘制相机切换保留起点，关闭或Alt绕过吸附保持精度 | runtime交互恢复绘制；门窗placement／drag使用原始坐标 | runtime-interaction／runtime-drag-geometry单元；runtime.browser.spec.ts真实鼠标操作 | 验证通过 | 浏览器验证不替代macOS Option／触控板／原生窗口验收 |
| 资源异常回滚与迟到任务不污染新状态 | 构造、导出、资源池统一逐项清理；主错误保留；doc／pool身份及最新采样目标检查 | runtime-scene-failure／runtime-export-failure／runtime-rendering故障注入；资源与光追浏览器回归 | 验证通过 | 计数和模拟disposer故障不等同原生VRAM字节峰值或设备丢失 |
| 容器及偏好在解码前有预算、失败保存保持旧文件 | manifest数量／按引用展开256MiB预算、ZIP声明与最终大小校验、设置限读4097字节；PNG空MIME按字节推断；TS与Rust拒绝非对象根JSON | container／settings／images单元；Rust25项含两个native打开入口；实际TS ZIP→Rust→TS互通 | 验证通过 | Rust临时目录及模拟故障不冒充真实磁盘满、权限矩阵或native GUI |
| 关闭只批准同一正式快照，注销及异步失败可恢复 | project-close循环复核快照；最后等待最新偏好队列；active close listener和错误边界 | project-close／preferences-close／window单元；真实注册接口使用模拟Tauri窗口 | 验证通过 | 只验证业务保护与注册生命周期；Windows标题栏X、macOS原生关闭仍已实现未验证 |
| 精确字段、撤销与异步材质导入保持最新编辑；确认均结算 | Numeric／TextField真正编辑才提交；MaterialFields读取最新binding；ConfirmProvider替换／卸载结算cancel；snapshot位于try/finally | repository-review.browser.spec.ts六项通过；实际ConfirmProvider替换／卸载复测通过；services.test.ts | 验证通过 | 确认测试首轮CJS动态import错误保留，修正测试加载后实际provider通过；未执行屏幕阅读器／高对比度验收 |
| 打开文件期间的新正式修改不被迟到替换丢弃 | open捕获批准快照，文件解码后复核；变更时保留工程并提示重新打开 | snapshot.browser.spec.ts真实保存ZIP／打开解码延迟／编辑／保留／再次批准路径，最终源码通过 | 验证通过 | Chromium实际业务路径；不是原生文件对话框验收 |
| 设置错误只显示一个alert，关闭弹窗后错误仍可见 | App与RenderingSettings按弹窗状态分配同一notice展示 | rendering-ui.browser.spec.ts原有完整错误路径通过；repository-review.browser.spec.ts重复alert专项通过 | 验证通过 | 此行描述本轮修复，保留上一节历史验证失败；不是完整屏幕阅读器验收 |
| 全仓生产源码不超过500行并保持依赖边界 | 拆分Core／validation／geometry／Rust storage／Inspector完整职责；删除五项旧ceiling | npm run check／typecheck；CODE-QUALITY／ARCHITECTURE；源码行数与SHA256 | 验证通过 | 测试场景矩阵、生成／vendored源码仍沿原文档范围，不增加生产豁免 |
| Tauri窗口符合已确认尺寸 | main默认1600×900、最小900×600；配置单元断言 | settings.test.ts；tauri.conf.json | 已实现未验证 | 配置与编译不替代实际宿主尺寸、DPI、多屏或macOS验收 |
| 大型工程真实循环与导出保持资源、几何和动画 | 原50循环／5下载／GPU计数／独立Validator断言保持；同一测试在软件和实际GPU分别执行 | 软件SwiftShader原600秒限时失败，完成20轮／2导出；实际RTX4070 SUPER完整50轮／5导出通过、Validator错误／警告均0；最终资源20轮另通过 | 验证通过 | 通过范围为硬件Chromium WebGL业务回归；软件GPU项仍验证失败，原trace保留；不是原生或Q5正式FPS／P95验收 |

没有将浏览器／模拟IPC结果标为桌面验收；未启动新原生GUI或执行安装。固定Skills、生成token CSS、原PRD及历史验收行未修改。首次完整浏览器执行的export-samples刷新了共享最新输出，已保存到隔离目录并修正后续输出路径；具体原始记录及去重方式见本轮验证JSON。

## 实际操作 UI／UX 审查验收补充（2026-10-13）

本表仅增加本轮要求／实现／测试／证据／限制，不改原 A01–A42 条件或历史状态。最新明确决定仍是只保留亮色和暗色。所有浏览器行为状态只适用于本列明的前端环境，不补填 Tauri／macOS 或真实系统窗口验收。

| 要求 | 实现 | 测试与本次证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- |
| 鼠标点击／绘制／拖动 Canvas 不留下键盘蓝框，键盘仍有清楚焦点 | 容器捕获来源、仅Canvas pointer outline屏蔽、blur清理及键盘恢复 | uiux.browser 的 Enter→鼠标／Tab／Shift+Tab／Canvas键盘；UI-REVIEW UX01前后与键盘截图 | 验证通过 | Chromium真实合成鼠标／键盘；原生OS焦点／屏幕阅读器仍未验 |
| 实时渲染入口、关联采样配置、状态与操作路径清楚 | 公开DialogTrigger＋关联Dialog；保留普通预览与渐进光追、暂停／继续／退出／进度／错误重试／PNG；移除重复Canvas进度 | rendering-ui四组合／两尺寸与focus return；rendering真实16采样／PNG／三次释放；WebGPU6／6、背景／小HDR／环境PNG/JPEG／模式切换／真实WGSL故障恢复 | 验证通过 | GPU证据是浏览器，不是WebView2或macOS；首次冷编译严格超时保留，不承诺启动时间 |
| 绘制提示不被吸附／尺寸覆盖，取消和连续绘制保持可靠 | editHint与snapFeedback分层；runtime局部尺寸／坐标；草稿隐藏empty；拒绝终点／dismiss恢复阶段 | uiux stage／snap／camera／连续墙／Esc／undo；snapping7项和runtime7项完整回归；UI-REVIEW UX03 | 验证通过 | 有完整行为断言；旧草稿没有同视角截图，不伪造视觉差异 |
| 数值可读且不隐式改变正式精度或历史 | 15位有效数字仅作显示，edited gate保护原值与精确输入 | numeric-display单元2项／真实浏览器；未编辑Enter／blur、极小值、拒绝／取消／undo／redo | 验证通过 | 米制十进制输入保持；显示不是工程精度或测量误差承诺 |
| 整栋只读预览不能用历史入口更改工程 | 顶部Undo／Redo禁用，场景Ctrl／Cmd历史快捷键阻断，文本作用域优先 | uiux readonly UI／Ctrl+Z／Y／Shift+Z 精确文档＋history比较，退出后恢复 | 验证通过 | 浏览器输入保护；实际macOS Command硬件未验 |
| 纠正命令后旧错误消失且不会污染草稿或历史 | 成功submit清旧error，Alert正文单处，状态栏／dismiss使用最近阶段 | height0拒绝→2.9接受一条历史；非法重叠终点→dismiss→同草稿继续；UX06同保存工程前后截图 | 验证通过 | 真实非法输入复现，不注入异常正式状态 |
| 当前源码无遗漏图标404，等待完整GPU工作才认定idle | native32PNG公开引用；pendingFrame包含in-flight／requested工作并保持原shape | 首套十项favicon404 trace→补齐；scheduler deferred单元；原八帧严格稳定断言WebGPU final通过 | 验证通过 | 正常ANGLE编译／上游deprecation警告与受控故障日志保留，没有过滤错误制造通过 |
| WebGPU普通预览与语义背景、全景策略一致 | runtime在TRAA临时reset前固定beauty MRT清屏色／alpha；Scene Color优先，环境仍由原场景绘制，法线／速度附件不变 | 真实菜单复现黑Canvas；原硬件像素回归失败保留；六项pinned状态／pass单元、亮暗／四AO×AA／lighting-only／panorama硬件回归通过，主题不换Renderer或改工程／history；UX08前后截图 | 验证通过 | 实际Chromium WebGPU像素证明；不代替原生WebView2或macOS，首80项未覆盖画面差异的通过报告保留 |
| 合法小全景图在两后端正常照明且不污染原图／工程 | runtime独立照明派生纹理满足PMREM最低尺寸；原图供背景／光追，异步提交清后处理历史、双owner逐项释放并保留首因 | 原4×2 HDR真实导入两后端黑墙／64×32对照和before像素失败保留；after真实墙面5×5像素／原embedded字节通过；原PNG/JPEG32×16／source身份／16samples精确断言全部保留，observer对齐原背景与独立IBL；helper／owner迟到、clear、replace、unmount及cleanup故障矩阵 | 验证通过 | 新的派生纹理是runtime实现，不修改正式资源尺寸／数据或输出；浏览器照明不代替原生GPU或全部可能全景图认证 |
| 修复后核心编辑、保存重开、导出和资源所有权保持 | Core统一命令与不可变快照；无UI GPU owner；Renderer不因主题／语言／弹窗重建 | 当前源码单元369／40文件、Rust25、四套TS、check／build；完整浏览器80／80与WebGPU6／6；20资源循环／50大型工程循环／5导出；实际GLB Validator零错零警告、独立门动画 | 验证通过 | 保存文件／选择器使用浏览器开发适配器；Rust IO临时目录不冒充真实磁盘满或原生GUI |
| 最新Windows源码可构建与打包，产物可追溯 | Tauri release＋NSIS，176项构建输入前后SHA一致，17项dist资源及图标核对 | validation/tauri-build.log、frontend-assets.json、release/artifacts.json；exe／NSIS当前哈希 | 验证通过 | 仅构建／打包通过，未签名、未安装、未启动 |
| 最新桌面产物冒烟及双平台完整验收 | 当前1600×900／min900×600配置与平台边界保留 | 历史用户物理Escape停止仍有效，本轮无新原生GUI；生产网页4组另列 | 环境阻塞 | 需最新Tauri安装／启动／关闭／WebView输入GPU与macOS实机、迁移、触控板／DPI等验证；网页不代替桌面 |
| 正式系统／硬件与性能、冷启动验收条件明确 | 原Q5仍未由本轮自行决定 | cold首次严格10秒超时／21.314秒观测上界与后续相同断言通过均保留；本次相对计时 | 需求待确认 | 需确认Windows／macOS目标系统与硬件、性能／冷启动预算；真实设备丢失与初心者任务未验 |

本轮最终来源、逐命令日志／测试报告、原始失败、截图查看清单及产物哈希见 `uiux-review-validation.json` 与 `.test-artifacts/uiux-20261013/`。Impeccable仅单次静态detector，未发现项不表示完整WCAG或原生验收。原始PRD、固定Skills、生成token CSS与历史证据没有回写。发布状态仍受上表具体缺口阻塞。

## 基础 UI 家族与独立 Storybook 验收补充（2026-10-13）

本节仅新增UF01–UF16，不修改原A01–A42条件、状态或历史证据。证据根目录为 `test-results/ui-foundation-2026-10-13/`；最终命令、环境、输入SHA、图片查看与原始失败由其 `validation.json` / `INDEX.md`汇总。以下“验证通过”只适用于注明的源码、CLI或浏览器条件，不扩展为原生Windows／Tauri／macOS验收。

| 编号 | 本次要求 | 实现 | 测试／证据 | 状态 | 限制 |
| --- | --- | --- | --- | --- | --- |
| UF01 | 完整基础组件家族与严格公共类型 | Input.TextArea/Password/Search、InputNumber、Select、Checkbox/Radio.Group、Switch、Slider、Button.Icon/Group、Form、浮层/菜单/确认、Tabs/Segmented/Toggle/Accordion及全部展示反馈；统一语义props与公开类型 | UI-COMPONENTS.md逐家族旧/新API、调用、story/example、默认值与验证映射；Storybook35入口294stories+35docs及逐family遍历 | 验证通过 | 渲染与指定交互通过，不声称任意props笛卡尔组合、物理辅助技术或原生宿主覆盖。 |
| UF02 | 正式调用迁移，消除内部外观修正与重复拼装 | App、fields、Floors、Inspector、MaterialFields、HeaderPreferences、ToolOptions、窗口及设置/渲染/确认调用高层UI；约82行重复CSS清理；页面布局保留 | 公开导出与调用盘点、组件外观/依赖架构check；独占GPU完整editor60/60 | 验证通过 | 无应用primitive导入、公共className/style外观透传；样式消除不等同原生DPI/字体测量。 |
| UF03 | 输入中间态、正式精度、Enter/blur、Escape、IME、拒绝及外部变更保持 | UI拥有可选commit草稿；应用继续负责合法性、EditorCore命令和历史；Escape优先处理所属草稿，Form关联错误且避免重复业务alert | inputs.spec.ts精度/中间态/单次commit/IME/非法与业务拒绝/外部值/Escape；Dialog草稿隔离；正式editor字段与历史路径 | 验证通过 | 浏览器composition事件不冒充所有真实中文IME或macOS硬件；非法值范围仍由领域代码决定。 |
| UF04 | 独立正式React/Vite Storybook与共享实现 | apps/storybook工作区、配置/preview、CSF、实际TSX/JSON/schema、API文档；6006开发/6007测试、独立静态dist | clean npm ci安装560包；五套TS、架构检查、build:storybook；64/64完整浏览器、35入口294stories+35docs | 验证通过 | Storybook标准iframe仅属于开发工具；不进入正式编辑器单WebView/Canvas，也不带来业务后台。 |
| UF05 | 浏览器可实际编辑JSX/TSX、多组件、React状态与回调 | Sucrase编译，明确react/@building/ui/lucide映射；当前args传入真实高层组件 | playground代码修改/组合状态与回调；6008静态浏览器实际TSX、组合Password/Input/Button、计数与Reset，manual-browser/static-code-configuration.jpg及.txt | 验证通过 | 浏览器转换不做TypeScript语义类型检查；本地例子由严格tsc验证；受信任代码执行不等同恶意代码沙箱。 |
| UF06 | JSON格式/类型校验与Controls共用生效状态 | schema生成Controls并验证JSON，应用args单一owner；ReactNode/图标/回调在TSX定义 | playground.spec.ts双向Controls/JSON同步、非法配置/修正、schema与默认值审计；完整64/64 | 验证通过 | 只支持文档列明可序列化props与依赖，不把任意React对象伪装为JSON。 |
| UF07 | 临时编辑不写回文件、不自动持久化，明确刷新/切换/重置 | React及页面内存draft缓存，实际离开清理；Reset基线和局部state，复制反馈关联源码revision | manager-memory.spec.ts Default/Disabled真实整页reload、sidebar重入、variant Reset、Controls与字段/代码/JSON；全localStorage/sessionStorage/IndexedDB编辑前后相等；可选Review持久化禁用；6008最终静态人工复验 | 验证通过 | 标准manager可暂时把Controls编码到当前URL；fresh story entry从initialArgs恢复，不把URL或缓存作为仓库基线。首次manager失败及Review写sessionStorage的5/2报告保留；标准Controls保存入口见UF14。 |
| UF08 | 本地组件/示例/JSON HMR与浏览器草稿正确共存，验证改动完整恢复 | 最新组件实现刷新；示例/config更新reset基线、保留活跃草稿并提示；异步编译版本防陈旧完成 | playground.spec.ts真实本地三类文件改动/HMR/reset用例；source-restoration.json：483项源码/配置、changed[]、restoredExactly=true；最新64/64 | 验证通过 | SHA记录对应当轮试改/恢复阶段，不代表整个仓库未产生本次实现或维护文档；最后manager/Review/Controls修复也在最终64/64复验。 |
| UF09 | 编译/配置/runtime错误独立提示、旧结果明确、改正可恢复，资源按生命周期释放 | 三种错误区分、last-valid标记、每revision错误边界；Blob revoke、监听解绑、observer disconnect、迟到任务抑制 | playground错误/恢复及源级清理检查；ConfirmDialog拒绝/重试/防重/替换关闭后迟到Promise隔离真实浏览器用例 | 验证通过 | 不以源码清理检查证明长期heap/VRAM字节峰值或所有恶意脚本可隔离。 |
| UF10 | 亮暗、中英文、窄容器与浮层/键盘/焦点可靠 | 语义token共享；可收缩workbench列/表内滚动；Select搜索ring、Tooltip有界文本，Dialog/Menu/Popover借用Radix焦点与定位 | catalog窄420px CJK/浮层、全部家族dark/narrow；inputs/components键盘/禁用/关闭/焦点；原A35四组合4/4 | 验证通过 | 浏览器420px开发工坊与正式编辑器900px最小窗口是不同对象；触摸、200%缩放、原生屏幕阅读器/DPI未验。 |
| UF11 | 独立Impeccable audit/critique/harden/polish并记录真实问题与截图 | A在收到B前完成；A31/40、B16/20均为修复前评分；单次detector exit0 []；集中修复窄溢出/焦点/默认值/复制/Reset/输入事件/footer | review-a/assessment-a.md、review-b/assessment-b.md；B原JSON/量测/图片；18审查截图已打开，输入4图来源/查看在最终INDEX登记；修复后64/64与A35复验 | 验证通过 | 未重新打满分、未把detector[]当无问题；A未保存本地PNG，其CUA展示不伪写为本地证据；完整WCAG/原生未验。 |
| UF12 | 正式命令、历史、预览/导出和Renderer身份及GPU所有权保持 | 本次只重构UI；EditorCore正式数据、预览事务、独立导出快照及runtime资源owner保留，无每帧全局React/IPC | editor-exclusive.log：同源同断言独占实际GPU Chromium完整60/60约3分钟，含20资源循环、保存/导出、吸附/拖动、主题/弹窗Renderer身份 | 验证通过 | 仅浏览器独占GPU条件；并发58/2严格失败仍保留，geometry4 vs3及samples0未归因；hardware-failure-analysis.md不证明其根因。 |
| UF13 | 干净安装与格式/lint/架构/类型/单元/Rust/生产构建 | 锁定依赖，既定Oxfmt/Oxlint门禁、五套TS、500行上限、token/生成/边界；正式生产图无Storybook/Sucrase | npm-ci.log；format/check；374项/41文件unit、Rust25、desktop-build.log、storybook-build-complete.log；最终manager/Review/Controls修复后的check/typecheck/unit/两构建均复验，见validation | 验证通过 | CLI与Rust临时IO不是原生GUI/真实磁盘满；静态build不等同新的exe/NSIS已打包。 |
| UF14 | 开发工坊编辑不能通过标准Controls保存入口写回story | 截图核查发现Update story/Create new story；官方controls.disableSaveFromUI=true关闭并追加absence断言 | 两个保存动作精确absence断言在最终64/64通过；check-complete.log、storybook-build-complete.log；Controls截图已重新打开审查 | 验证通过 | 关闭标准Controls的保存动作；不添加自定义文件写API。浏览器临时代码仍为受信任JS，不提供通用隔离保证。 |
| UF15 | 最新Tauri与macOS原生UI、安装/关闭/输入/多屏验证可追溯 | 原架构与历史原生GUI停止边界保持，本轮没有启动新宿主或重打包exe/NSIS；不操作1420用户工程 | 浏览器及模拟Tauri窗口单独记录；旧发布产物保留且不含本次UI更新 | 环境阻塞 | 需授权的最新原生Windows/Tauri冒烟、macOS实机、系统输入/焦点/屏幕阅读器/DPI/触控板；网页结果不补验。 |
| UF16 | Q5正式目标系统/硬件、性能与冷启动标准明确 | 本轮不自行决定正式系统/设备或达标预算 | 沿原Q5待确认；浏览器/GPU相对耗时仅复现条件，未采正式FPS/P95/显存与冷启动达标数据 | 需求待确认 | 真实设备丢失、物理触摸/触控板、长期资源与参考性能仍需按已确认环境补验。 |

初始Storybook窄屏/HMR及事件失败、正式编辑器硬件56/4和并发58/2报告均原样保留。UI footer修复保持动作前blur草稿确认，原A35中英/两主题4/4通过；独占GPU60/60通过不能反推并发两项失败原因。固定Skills、token生成产物、原PRD和原A01–A42历史条件没有为本次重构改写；最新原生安装包和完整双平台验收仍不在本轮通过范围内。
