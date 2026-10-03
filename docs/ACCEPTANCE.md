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
