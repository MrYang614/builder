# UI 与组合模式审查

## 全仓代码审查的 UI 修复（2026-10-11）

对象是主编辑器、楼层／属性与设置弹窗。先读取固定 frontend-design、Composition Patterns、Impeccable context／audit／harden／craft-floor，保持现有 Operate 界面。没有替换设计风格或引入颜色。detector 最终运行 exit0、无标准输出；这不替代实际浏览器交互和截图检查。

| 维度         | 分数  | 证据与限制                                                                                              |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------- |
| 可访问性     | 3/4   | 字段标签、非法状态、Escape 与弹窗焦点沿用共享组件；修复重复 alert；未运行屏幕阅读器／原生高对比度       |
| 性能         | 3/4   | 状态分层保持，Renderer 不因 UI 重建；移除无关 ChangeSet 扫描；主 bundle 大 chunk 提示及 Q5 硬件缺口保留 |
| 桌面响应布局 | 3/4   | 中英／双主题／900×600 使用浏览器回归；不宣称 macOS、真实 DPI 或触控板通过                               |
| 主题         | 4/4   | 单一语义 token、生成 CSS、真实亮暗材质与灯光隔离断言；没有新增颜色字面量                                |
| 实现一致性   | 4/4   | 原子命令、同一 Core、共享组件与选中对象生命周期保持；字段、关闭及异步资源边界补齐                       |
| 合计         | 17/20 | 桌面 WebView 表面的技术 audit；不是完整 WCAG 或原生验收认证                                             |

P1：最后偏好写入及打开文件解码期间新工程 revision 未重新批准。project-close与open用快照身份复核，新增关闭竞态／失败单元及真实ZIP打开竞态回归。P2：数值精度被展示格式改写、门动画完成后被未编辑字段覆盖、名字撤销显示陈旧、快照异常锁死文件操作、图片导入覆盖期间平铺修改、确认替换／卸载不结算旧 Promise、重复错误 alert。具体修复与回归 ID 见 REPOSITORY-REVIEW 的 U01–U10。

MaterialFields 提取完整面级材质与连续性职责；TextField／Numeric 保持草稿和非法状态，纯聚焦不提交。UI 操作使用实时 busy 信号防止旧闭包重入。正常业务弹窗、保存保护、双语言／双主题和新边界一起回归，原错误 traces 保留。最终数量、实际截图路径与平台范围见 repository-review-validation.json。

实际复核900×600亮／暗Header、中文亮色设置、英文暗色最小窗口滚动内容和损坏HDR单alert截图。新UI六项均通过，打开竞态与真实确认替换／卸载的最终回归通过。SwiftShader大型工程原600秒压力项超时；实际GPU相同断言通过，性能分数仍保留Q5和包体积缺口，不把硬件复测当作软件或原生验收。

2026-10-03。依据 frontend-design、vercel-composition-patterns 和 Impeccable audit／harden／polish／craft-floor 的已读规则。本产品是 Windows/macOS 桌面 WebView 编辑器，采用 web audit 的焦点、Portal、对比度和布局规则；不套用 iOS/Android 导航要求。Skills 安装／上下文与 detector 执行证据见 SKILLS.md；检测返回空数组不等于人工和交互审查通过。

## 设计与代码组合

frontend-design 阶段先按需求选择 Operate：工具和文件操作置顶，楼层及对象位于左侧，单 Canvas 占据中心，右侧只显示当前对象的参数。蓝色选择／焦点、纸面亮色和蓝灰暗色均来自共享语义 token。系统离线字体、紧凑数值和清楚单位服务桌面使用；没有营销 hero、装饰性图标或无关动效。

Composition Patterns：EditorProvider 提供稳定编辑服务；文档、会话、状态分别通过缓存快照订阅；数值字段保留本地草稿，面板按对象类型组合 WallFields／SlabFields／OpeningFields／Materials。ThemeProvider、LanguageProvider、ConfirmProvider 只承担各自职责，基础 Dialog／Select／Field 来自 ui 包；React 19 使用 `use` 和 context 组件，不用 Effect 推导墙洞或 UV。原生 Three runtime 持相机／拖动／动画，React 不逐帧持有这些状态。

## 实际发现与修复

| 问题与影响                                                   | 修复                                                                                                          | 证据                                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 部分核心／文件错误码落入通用失败，无法知道恢复方法           | 根据真正返回码提供中英错误及插值参数，保留原数据和输入；新增墙板穿插警告                                      | ui-contract.test.ts 会从 TS AST／Rust 源收集返回码并检测漏译；12项全部通过                                                                       |
| shadcn 源码有固定遮罩、隐式默认阴影、纯白状态字              | 全部改为公开 overlay／shadow／destructive-foreground 等语义 token；阴影类显式消费 shadow                      | scripts/check.mjs + 实际隔离生产 CSS 构建；未豁免生成组件                                                                                        |
| 基础 Dialog 的关闭文案固定英语                               | 启用基础关闭控件时必须提供 closeLabel；业务弹窗提供明确双语按钮                                               | 公共类型边界及中英 Portal 实际操作                                                                                                               |
| 项目路径及添加楼层依赖原生title，无法按双主题核验Tooltip     | 改为共享shadcn Tooltip的Trigger/Content组合，文本双语、Portal和箭头消费语义token，路径可键盘聚焦              | ui-states.browser.spec.ts 四种语言／主题组合的实际鼠标与键盘Tooltip、菜单、错误、禁用状态与900×600截图                                           |
| 受控设置Dialog关闭后焦点落到body                             | 共享Dialog记录打开前的活动元素，关闭时恢复仍连接的元素，并保留调用方显式自动焦点处理                          | 首次真实设置关闭测试失败保留；修复后Settings按钮获得焦点，5项ui-states回归通过，未用延迟或重试规避                                               |
| 启动设置异步读完可能覆盖已选择偏好                           | 读取完成后再挂载 UI，启动 inline 缓存先应用；连续写设置串行化，异常可见反馈                                   | 浏览器重启及 native 实际进程重启；平台设置与工程分离                                                                                             |
| 删除整层未说明对象影响范围，undo/删除后的会话可能引用旧层    | 确认前列明墙／板／门窗数；核心先订阅 session.reconcile，覆盖 undo/redo/replace                                | materials.browser.spec.ts 真实取消、删除整层、撤销和删宿主墙恢复                                                                                 |
| 连续材质组只对已注册显式组应用，初次勾选没有完整改组         | 依据几何可见连续路径生成 batch，标明数量、一条历史；材质资源与目标面分离                                      | materials.browser.spec.ts 验证4面一致、B面与第二层不变、整体撤销                                                                                 |
| 指定收口操作可能新建重复组，T走向不透明                      | 优先复用实际路径 ID，显示有序 wall/side 路径；用户确认尺寸保持                                                | 闭环数学／真实 UI 收口移动与撤销；不声明非整周期全周无缝                                                                                         |
| 视口辅助选中面／铰链不清楚、角点操作与失焦需验证             | 补语义面边界、门铰链标记、楼板角点和完整预览校验                                                              | runtime.browser.spec.ts 的实际操作记录以最终测试结果为准                                                                                         |
| 辅助对象释放与同时动画存在风险                               | 构件独占显示 clones，删除 handles 几何／材质；独立播放 Map；按 ChangeSet 同步                                 | 导出资源单测 + 真实运行时 GPU 回归，不以仅存在源码为通过                                                                                         |
| 聚焦后即点击，相机矩阵仍来自旧视角导致拾取错位               | focus、投影和raycast入口同步相机矩阵，命中前更新候选对象与控制点；保持按需渲染                                | 旧代码确定复现1524px偏差；同JS任务内真实聚焦事件与独立Camera投影误差<1e-6，窗真实拖动连续5次通过，没有sleep或retry掩盖                           |
| 保存期间继续编辑，New/Open/Close可能在旧保存完成后丢弃新修改 | 保存后再检查核心dirty，只有捕获保存已覆盖当前修改才放行                                                       | snapshot.browser.spec.ts：真实UI确认Save、平台hash延迟、新参数输入及实际ZIP；原缺陷确定复现，修后新修改和dirty保留；导出竞态独立GLTFLoader也通过 |
| 状态栏显示实现标签、减弱用户操作信息                         | 移除 Browser/Tauri 标签，保留楼层和单位；区分楼层基准标高与板上表面                                           | 生产源码及截图                                                                                                                                   |
| 控件焦点／小尺寸／减少动效支持需要统一                       | 所有字段关联 label，icon按键命名，语义 focus，caret／selection／scrollbar；系统减少动效下停 Portal transition | 对比度单测，900×600实际生产截图；视口按钮、Dialog/Select focus 路径                                                                              |

## 可复现验证与视觉证据

`npm test` 当前 71 项通过，其中 UI 合约 12 项包含完整语义键、文字≥4.5:1、焦点≥3:1、中英占位符、所有实际错误码、公开依赖、生成一致性和实际生产 CSS。`tests/editor.spec.ts` 使用真实鼠标／文本／弹窗验证主题语言不重建 renderer、不修改工程，系统 media 运行期变化及重启偏好。`tests/materials.browser.spec.ts` 两项已通过。

`tests/ui-states.browser.spec.ts` 的5项真实操作覆盖英语／简体中文×亮／暗四组合，Tooltip Portal与箭头、Select菜单、Dialog、错误alert、状态栏、禁用redo和语义焦点环，900×600无横溢；系统media变化时未提交数值“-”草稿、输入焦点、选择、相机不变。`tests/artifacts/ui-states-validation.json` 与8张截图保留最终断言和此前失败原因。`tests/async-theme.browser.spec.ts` 从实际渲染场景逐项检查建筑材质／贴图UUID、灯光、曝光、tone mapping不变，网格、描边、面、铰链、吸附和预览色匹配公开token；不是仅比较桥接函数调用。

实际编译产物还通过 `node scripts/production-smoke.mjs`：生产入口无 dev instrument，单 Canvas；中英亮暗 Portal 和 900×600 最小窗口无横向溢出；实际参数修改及 GLB 下载／Validator，0错误0警告、4段动画、图片内嵌。记录 `docs/production-smoke.json`；截图 `docs/screenshots/production-light-zh.png`、`production-dark-en.png`、`production-min-dark-en.png`。这些测试明确是浏览器生产代码验证，不能冒充 release Tauri 或安装验证。

Windows 原生双主题／双语截图在 `tests/artifacts/native`，实际鼠标／文件／动画链见 WINDOWS-NATIVE.md。原生主题语言保持 renderer 和选择，进程重启偏好已验证。macOS、原生操作系统主题变动、标题栏关闭未保存路径和安装包启动尚未验证。

## 审查结果及剩余项

编辑器主要动作明确，双主题和单位可读；主面板滚动范围独立，在900×600时工具栏正常换行、右侧属性可滚动，单 Canvas保留有效面积。减少动效只作用 UI，门动画仍服务用户显式操作。生产主 chunk 1113.93KB未压缩／316.97KB gzip，保留构建警告；尚未为了体积拆分场景生命周期。

尚未招募“未参与开发、无专业建模经验”的外部测试者完成 PRD11.2任务，不能给出已通过易用性结论。键盘焦点路径已有自动化，屏幕阅读器整栋三维操作完整性／macOS触控板与Command仍需人工核验。Q5参考硬件未确定，性能不纳入主观打分或宣布达标。PRODUCT.md旧上下文 schema 的报告已保留，不擅自迁移事实。

## 工具接入后的相关复核（2026-10-03）

按已安装 Composition Patterns 的状态／实现解耦要求，服务层维护 runtime 注册和按实例清理，React只订阅及组合；按 Impeccable audit／harden 中的主题、键盘及并发检查复核此次lint引出的修改。引用更新移入layout effect，状态栏改用语义output，项目名保留键盘Tooltip且对单个可访问性规则记录理由；没有关闭React refs／immutability／exhaustive-deps。

14项相关真实浏览器回归通过：中英×亮暗、900×600、Tooltip／Dialog／Select焦点、系统主题与未提交草稿、20次runtime资源循环、门并发动画、保存／导出竞态和图片晚到。4组实际生产资源复测通过，GLB Validator零错误零警告；主题／语言仍不重建renderer、不改变建筑材质。此次属于桌面WebView前端的浏览器技术复核，没有新设计或重跑Impeccable上下文初始化，不对手机、屏幕阅读器、原生窗口或macOS补填通过。

原有大chunk／外部初学者任务／平台缺口仍在；新主JS1114.01KB／317.01KB gzip，与此前体量相当。源码旁的局部规则例外和工具执行记录见CODE-QUALITY.md及code-quality-validation.json。

## 渲染扩展增量审查（2026-10-03）

本节仅覆盖新增桌面设置、全景环境、渲染器偏好及渲染错误恢复，不改写上文历史验证。依据已安装 Impeccable 的 audit／harden、Operate 模式和 Composition Patterns 的状态／实现解耦规则，先做只读源码审查，再由对应代码所有者修复及验证；没有重新初始化产品上下文，也没有执行被停止的原生 GUI。环境是 EditorCore 工程属性；backend 是本机偏好；光追采样、相机和 GPU 生命周期仍由独立 runtime 管理。

实施完整性结论：这次设置延续任务型编辑器的表单、语义 token、双语和错误恢复方式，没有新增营销布局或固定渲染演示。WebGPU 的实际初始化结果决定显示的 backend，失败保留可用渲染器；环境参数和资源修改走同一命令入口，取消、错误或迟到结果不能反推 Mesh 改工程。已有 detector 报告仍是历史证据，本次没有重新运行 detector，不能把此前空数组当作渲染增量自动审查通过。

### 发现、修复与恢复证据

| 等级 | 问题及恢复要求                                                                              | 修复位置与行为                                                                                                                                                                                          | 验证范围                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | 环境导入、参数及 PNG 文件错误只显示在 modal 外，设置打开时无法读到恢复原因                  | `RenderingSettings.tsx` 订阅 notice，与 runtime.error 合为弹窗内一个 role=alert；`render-messages.ts` 提供双语原因及恢复文案                                                                            | `rendering-ui.browser.spec.ts` 实际越界参数和损坏 HDR 文件选择；`docs/rendering-errors-validation.json` 记录弹窗内唯一可见错误、工程及资源不变                                                                                               |
| P2   | 改回合法值后旧错误仍挂在设置中                                                              | 环境操作仅在命令成功后写 environmentUpdated；明确保存 backend 成功后写 backendSaved，取消／失败不冒充成功，也不全局清除其他工具警告                                                                     | 真实错误恢复路径及上述错误 JSON；通用 submit 行为保留                                                                                                                                                                                        |
| P2   | 已存 WebGPU 不可用时 selector 显示实际 WebGL，却无法保存当前 fallback，重启反复尝试失败偏好 | 当 preferred 与 actual 不一致时提供“使用并保存当前渲染器”，保存真实成功 backend；localStorage 异常显示 settingsFailure                                                                                  | `docs/rendering-startup-preference-validation.json`：实际 adapter 返回 null，UI 保存 WebGL 后 reload／重新打开设置恢复；不声明真实 WebGPU 渲染通过                                                                                           |
| P2   | 异步导入使用打开文件前的环境参数，可能覆盖等待期间的修改                                    | `RenderingSettings.tsx` 在导入完成后检查工程 ID，重新读取 current.environment，再提交资源与引用的一条 batch                                                                                             | 源码审查；`runtime-rendering.test.ts` 覆盖解码期间采用最新参数、替换／清除后的旧结果释放；该单测不冒充原生文件对话框竞态                                                                                                                     |
| P2   | 偏好异步写入未完成就关闭，或一次 IO 失败后永远无法重试关闭                                  | 无 DOM `app/preferences.ts` 捕获请求快照并串行写入，动态 flush；每次关闭 retryAndFlush 重新保存当前偏好。`main.tsx` 注入动作，`App.tsx` 先等偏好再检查最新工程，失败显示 settingsFailure 并阻止 destroy | 两个 preferences 测试文件 9 项：实际延迟回调、并发入队、失败保留、IO 恢复而偏好不变时再次关闭；实际 registerCloseGuard 的模拟 Tauri host，非原生 GUI。beforeunload 未加入假异步等待                                                          |
| P1   | 长设置弹窗 Tab 环回使用 preventScroll，使真实焦点移到不可见区域                             | 共享 `packages/ui/src/components/dialog.tsx` 保留 Radix 的顺序及 focus trap，只在已聚焦控件超出滚动视口时 scrollIntoView                                                                                | 第四轮设置 UI 三项通过；四种中英／亮暗组合及 900×600 的每个聚焦控件都可见，关闭回到实际 opener                                                                                                                                               |
| P1   | 数值草稿 Escape 在目标控件处理前被 Radix capture 关闭整弹窗                                 | `ui/fields.tsx` 标明 data-escape-handled；共享 Dialog 的 onEscapeKeyDown 只阻止该草稿编辑器的 dismissal，目标仍收到 Escape 并还原草稿                                                                   | 真实键盘 Escape 保持设置打开、恢复数值草稿，见错误验证 JSON；没有移除 Radix 的正常关闭行为                                                                                                                                                   |
| P1   | 900×600 resize 时默认 transition-property:all 对 max-height／top 插值，弹窗被临时裁切       | 共享 Dialog 改为 transition-[opacity,transform]；设置保留 max-height 与纵向滚动                                                                                                                         | `test-results/rendering-ui-fourth/rendering-ui.browser-rende-e439a-ions-and-a-900x600-viewport/responsive-resize-frames.json`：resize 即时及两次真实 RAF 均为 viewport600、height/maxHeight552、y24、bottom576；不靠 sleep／降低包含断言规避 |
| P2   | 新 render.*Failed 错误被旧 .failed 后缀判断当成普通状态                                     | `three-runtime/src/renderer.ts` 的明确错误分类和 `integration/ViewportHost.tsx` 桥接，区分错误与可恢复状态                                                                                              | 单元／集成和双语错误路径；不将所有渲染提示一律提升为错误                                                                                                                                                                                     |
| P2   | 新 renderer 已提交后旧 renderer.dispose 抛错，会误报切换失败或阻止保存真实偏好              | runtime 按实际提交结果返回成功，单独报告 cleanupFailed；新旧请求及 device-loss 回调检查当前所有权                                                                                                       | `runtime-rendering.test.ts` 覆盖旧释放异常、迟到初始化、并发成功发布和旧设备丢失；实际 backend UI 回退证据另列，非真实 GPU 设备丢失测试                                                                                                      |
| P2   | 环境替换失败后的旧光追／贴图可能残留，清除或晚到结果不能恢复默认光照                        | runtime 环境请求序号、失败停止光追、清除释放保留贴图与晚到解码结果                                                                                                                                      | `runtime-rendering.test.ts` 覆盖失败→清除、快速替换、pending 清除及最新参数；真实 HDR 工程便携链见 rendering-environment-validation.json                                                                                                     |
| P2   | 光追 solid-background 创建的 gradient 贴图缺少独立释放                                      | `three-runtime/src/pathtracing.ts` 补齐派生资源所有权，借入的建筑／环境资源仍由各自所有者释放                                                                                                           | `pathtracing.test.ts` 逐 session 检查 owned gradient 只释放一次；真实 GPU 循环按最终渲染测试报告记录，不能由 mock 推断已全部通过                                                                                                             |
| P2   | 相机刚修改但采样尚未复位时保存 PNG，可能保存旧相机结果                                      | runtime 在 PNG present／encode 前检查当前相机、版本、环境及采样准备状态，未就绪明确提示重采样                                                                                                           | `runtime-rendering.test.ts` 验证旧相机累积立即拒绝、暂停中的投影变更复位；真实 PNG 像素与资源循环仍以最终 browser 报告为准                                                                                                                   |

前三轮设置 UI 回归的实际失败记录保留在 `test-results/rendering-ui-first`、`rendering-ui-second`、`rendering-ui-third`；第四轮为 3/3 通过，6.4 秒，未降低断言。`docs/rendering-ui-validation.json`、`rendering-errors-validation.json`、`rendering-startup-preference-validation.json` 分别保存键盘／布局、输入／文件错误和偏好重启的实际断言。四张中英／亮暗截图及 `render-settings-en-dark-900x600.png` 在 `docs/screenshots`。截图保留真实滚动位置：测试保证每个控件被聚焦时可见，长弹窗仍需纵向滚动，不宣称所有内容同时可见。

### 有界审查结论

以下为本次 Operate 桌面 WebView 范围的工程审查分数，结合源码、已有 token 合约与上述浏览器证据；不等同 WCAG 合规认证、屏幕阅读器验收、触屏／手机适配或原生平台测试。

| 维度         | 分数  | 依据与限制                                                                                                    |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------- |
| 可访问性     | 3/4   | label、语义分组、焦点环、Tab 可见性、Escape 草稿与 modal 错误已验证；完整屏读操作及系统辅助功能未验           |
| 性能         | 2/4   | loader／WebGPU／光追按需加载，采样状态限频，GPU 资源有所有权测试；大 chunk 警告保留，参考硬件及正式目标未确认 |
| 桌面窗口适配 | 3/4   | 四种语言／主题及 900×600 包含、无横溢、纵向滚动和真实焦点通过；没有扩大为手机、触控、系统文本缩放和多屏验收   |
| 主题         | 4/4   | 共享 token、双主题键和生成一致性检查通过；环境／建筑材质保留工程身份，不随 UI 主题改色                        |
| 实施完整性   | 4/4   | 正式工程、偏好和高频状态分离，错误诚实、取消可恢复，GLB 与环境工程资源职责明确                                |
| 合计         | 16/20 | 本次限定范围良好，性能和平台缺口仍需后续证据                                                                  |

Composition Patterns 复核：稳定 EditorProvider 和独立 Signal 被设置组件订阅，字段保留本地草稿；偏好队列已提取为无 DOM、可注入 writer，并以单一 flush 动作接入 App，没有新增布尔 props 驱动的通用设置框架。设置中的导入／PNG 平台动作仍是局部编排，可在功能继续增长时移入服务动作层；这是维护建议，不将现有可测试行为记作功能失败。

最终 `npm run verify` 的 15 个测试文件／123 项通过、四套 TS、零警告 lint、格式、边界／token 及生产构建记录在 `test-results/rendering-final-verify.log`；Rust 18项及删除原 HDR／EXR 后跨目录 TS↔Rust 容器流程也通过。末次 Dialog 修复有第四轮真实 UI 确认；完整39项浏览器335.541秒全部通过、0跳过／失败／flaky，最终报告为 `test-results/rendering-owned-server-e2e.json`，实际生产资源4组检查通过。首轮23通过／16因外部dev服务器退出而连接失败的报告保留，最终复测由Playwright自身启动管理Vite。生产主 JS 约1005.15KB／290.78KB gzip，WebGPU chunk 约688.06KB／191.81KB gzip，构建保留超过500KB警告，未抬高阈值或伪称消除。WebGPU API 存在，但本机三个启动方案都没有可用 adapter，成功切换与 WebGPU 光追明确保持环境阻塞。Windows／macOS 本次原生新功能、真实设备丢失、参考硬件性能和外部初学者任务仍未验；Windows本次NSIS已重建但未安装或启动release宿主，旧报告不补填这些状态。

## Header 布局增量审查（2026-10-04）

本节仅审查用户明确要求的 Header 操作布局、直接偏好切换及自定义窗口控件。依照 frontend-design 的任务型编辑器方向、Composition Patterns 的服务／组件分离和 Impeccable audit／harden／polish／Operate 规则，保留原字体、语义配色、双栏面板和单 Canvas。本轮最新指令覆盖 PRD 中“文字与图标共同表达”及“设置中的外观”操作路径，原 PRD 与 42 行验收条件不改写；H01–H06 的要求、实现、证据与限制在 `HEADER-LAYOUT.md`。

实施完整性判定：一致。文件／历史动作形成左侧明确分组，直接偏好与导出／设置在右侧，窗口动作有独立分隔；工程名称及保存状态仍说明正在编辑的内容。图标来自同一 SVG 家族，双语文字通过共享 Tooltip 和 Select Portal 提供，选择工具的状态及底部提示仍保留。原生按钮接平台边界，Core、几何及 ui 包没有新增 Three／Tauri 业务依赖。图标取代常显文字是本次用户明确的密度决定，不将这项已确认需求记成设计缺陷；外部初学者能否理解图标仍需实际用户任务验证。

独立审查者先读源码与已有截图，再查看本轮首轮真实截图，确认产品缺陷后交由源码所有者合并一批修复；第二轮一次性查看英语／简体中文 × 亮／暗四张 900×600 截图、模拟 IPC 下的英语亮色窗口按钮截图及中文暗色长工程名截图。确认时没有提出新的外观调整。单次 detector 的空结果作为静态参考，不能替代实际图像、键盘或平台证据，也没有额外 detector／开放式打磨循环。

### 发现与修复

| 等级 | 实际问题及影响                                                                 | 修复                                                                                                            | 确认依据                                                                                               |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| P1   | Header 偏好值直接显示为 Light／English／WebGL 或换行中文，违反仅保留图标的要求 | Radix SelectValue 丢弃传入的 className／style；将实际 Value 放入外层 sr-only span，使可访问值保留而可见文字隐藏 | 首轮浏览器及模拟 IPC 截图均复现；第二轮四组合和窗口截图值均隐藏，iconOnly 与 ariaSnapshot 断言同时保留 |
| P1   | 选择器打开时 Tooltip 遮挡英语语言选项，实际鼠标点击被拦截                      | HeaderChoice 分别管理选择器／Tooltip 的打开状态，选择菜单打开时关闭提示层                                       | 首轮实际选择失败保留；第二轮语言与主题鼠标切换、Enter／Escape 和焦点回归通过                           |
| P2   | 整栋只读预览禁用建模图标，pointer-events-none 同时丢失悬浮说明                 | 建模工具增加 Tooltip hover 包裹，保留 ToggleGroup 的选择状态与键盘路径；禁用文件动作沿用 IconButton 包裹        | 源码确认 disabled 样式原因；四组合实际进入只读预览、悬浮禁用墙工具、退出后恢复同一选中工具通过         |
| P2   | 拖动区域键盘 Enter／空格会最大化，而可访问名称只描述移动窗口                   | 中英文名称明确拖动、双击及 Enter 最大化／还原；最大化按钮随实际窗口状态显示方框或还原 SVG                       | 修正后源码；模拟 IPC 的原生命令与实际窗口状态交互按最终专项报告记录，仍不声称真实桌面通过              |

长工程名只截断名称，未保存状态禁止收缩；900×600 模拟 IPC 的中文长路径实际打开／修改截图保留完整“未保存修改”。窗口状态订阅在卸载和迟到初始查询时检查实例所有权并清理监听。Header 仅订阅 backend／switching 两个原始值，采样进度仍由视口局部呈现，不因每次采样更新整条 Header。关闭仍由 closeRequested 进入偏好 flush 与工程保护；取消保留当前工程，放弃才允许 destroy，失败可重试。

### 有界技术与设计复核

| 维度         | 分数  | 依据与限制                                                                                                             |
| ------------ | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 可访问性     | 3/4   | 图标有双语名称、选择值保留在辅助树、Tooltip 支持键盘、菜单／设置关闭焦点复原；未作屏幕阅读器整栋任务或系统辅助功能验收 |
| 性能         | 3/4   | Header 没有采样帧订阅或 render-loop IPC，原生状态为事件订阅并按实例清理；此前大 chunk 与 Q5 参考硬件缺口保留           |
| 桌面窗口适配 | 3/4   | 四组合 900×600 及超长工程名／路径没有控件溢出，模拟 IPC 下原生三按钮可见且分隔；实际 DPI、多屏、缩放和原生窗口未验     |
| 主题         | 4/4   | 全部颜色沿用 ui 包的双主题语义 token，图标、分隔、hover／focus 和 Portal 没有新增字面色                                |
| 实施完整性   | 4/4   | 当前工程、会话、偏好和运行时职责不变；关闭保护没有绕过，浏览器隐藏无可用原生窗口的按钮                                 |
| 合计         | 17/20 | 本轮限定 Header 范围良好；分数不代表 WCAG 认证或双平台桌面验收                                                         |

设计复核保留两项明确限制：仅有图标的界面需要用户通过悬浮／焦点学习动作，外部无建模经验测试者尚未运行；最小化、拖动、最大化及原生关闭保护尚未在实际 Windows／macOS 宿主验证。当前确认截图没有新的 P0／P1 布局问题。浏览器和模拟 IPC 证据均按其真实来源标记，不填补原生或 macOS 缺口。

第二轮实际 Header 浏览器 6 项通过，四组合 `header-layout.json` 与对应 PNG 保留在 `test-results/header-layout-second`。原生适配器 9 项覆盖查询顺序、失败、迟到结果和清理；模拟 IPC 的 5 项及最终全量回归汇总到 `docs/header-layout-validation.json` 与 `test-results/header-layout-final`。首轮可见文字与 Tooltip 失败，以及第二轮测试辅助函数未考虑 sr-only 祖先造成的失败保留，不削弱可见文字断言。最终格式／lint／架构／token、四套类型检查、单元／Rust／浏览器与生产构建结果以该专项报告的实际输出为准。

Questions skipped: 本轮范围已由用户明确，审查用于完成该布局变更；没有需要用户再选择的设计方向。

后续功能核验发现 PointerEvent.detail 在双击两次按下时均为0，不能据此排除第二次原生拖动。真实事件证据在 `test-results/header-layout/pointer-events.json`；拖动改用 mousedown.detail===1，保留 dblclick 最大化／还原，并阻止鼠标按下默认抢占输入焦点。最终5项模拟IPC专项使用实际 dblclick 验证只请求一次拖动、窗口状态还原、关闭保护、失败重试和长工程名布局，全部通过。此项属于窗口输入修复，没有增加新的外观打磨轮次或原生验收声明。

## WebGPU 错误恢复与 Tooltip 输入复核（2026-10-04）

沿用前述设计方向，使用Impeccable harden／craft-floor和Composition Patterns审查真实错误反馈与输入路径。另一个用户任务正在调整Header；本轮保留它的组件、文案及布局，只修复GPU路径和一次实际鼠标阻挡。

| 等级 | 实际问题                                                                         | 修复                                                                                | 实际证据与范围                                                                                |
| ---- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P1   | GPU异步WGSL错误可能持续产生Invalid CommandBuffer，用户无法得到首因或稳定恢复编辑 | 接入当前renderer的onError、停止会话、保留第一条具体shader错误，旧实例不改变当前状态 | 真正GPU着色器故障、8帧不再采样、重试16采样及继续编辑通过；原生device-loss未验                 |
| P1   | WebGPU三周期最后切换WebGL时Tooltip Portal遮住Select选项，真实点击被拦截          | 共享非交互TooltipContent加pointer-events-none，语义token和键盘说明保持              | hardware-stable-server失败trace保留；hardware-verified中真实鼠标WebGL↔WebGPU通过，无force点击 |
| P2   | 光追会话派生纹理未完整释放，每次退出GPU计数增加                                  | 按所有权释放LUT、quad材质和未绑定空atlas纹理，借用工程纹理不释放                    | 三次实际WebGPU退出geometry4／textures4稳定；PNG／JPEG借用source和正式工程保持                 |

硬件4项与相关WebGL／Header路径汇总在webgpu-fix-validation.json。资源计数不代表VRAM字节峰值，浏览器硬件恢复不代表Tauri／macOS验收，没有运行新的detector循环或重新评分。

## Header 工程名居中与保存状态位置复核（2026-10-04）

本节保存标题居中／状态左置版本的历史核验。用户随后追加“全部非按钮 Header 区域拖动、工程名纯展示且无 Tooltip／焦点”的要求，后续实现与证据另作记录；下文名称 Tooltip 与可聚焦行为不代表该追加版本的最终交付。

按用户追加的最终要求，移除 Header 可视“建筑编辑器”，工程名称独占中间 170px 列；两侧使用等宽可伸缩列，使名称中心固定在整个窗口的中心。保存／未保存状态位于左侧撤销、重做之后，保持完整宽度，不参与工程名的居中计算。名称过长时只截断名称，保留可聚焦的完整路径 Tooltip。右侧 HeaderWindow 继续组合偏好及原生窗口控件，最小宽度的图标控件保持 32px；不改变原字体、语义 token 或场景生命周期。

独立目测先于机械结果：一次批量查看最终英语／简体中文 × 亮／暗 × 900×600／1440×900 的八张标准浏览器截图，以及模拟 IPC 的英语暗色窄窗口、中文亮色宽窗口、最紧的英文 Unsaved changes 长工程名和中文未保存长工程名代表截图。名称真居中，保存状态完整置于重做右侧，左右操作没有遮挡名称或彼此重叠，没有发现需要继续修改的布局问题。最终专项 11／11 通过、0跳过／失败／flaky，耗时30.403秒；标准与16种长工程名状态组合测得名称中心偏差均为0px。证据在 `test-results/header-title-layout/status-left-final` 的 `e2e-results.json`、各 `header-layout.json`、`centered-long-project.json` 和 PNG。Header 选择器的 Tab／Enter／Escape、Tooltip／设置关闭的焦点回归继续通过；源码保留名称 tabIndex 与焦点环。模拟 IPC 保留实际鼠标点击、Enter、dblclick、关闭取消／偏好等待和失败重试的断言，空白拖动区域仍有正宽度且可操作。

机械扫描由独立代理在不看截图的上下文执行一次；最新源码指纹核对一致，退出码0、发现0，报告为 `test-results/header-title-layout/source-layout-scan.json`，原始输出为 `source-layout-detector.raw.json`。CSS 数学推导也确认名称中心为窗口宽度的一半；实际可见文字与输入路径仍以运行证据为准。首轮两项失败来自把透明拖动间隙当作32px图标按钮的旧测试判断，改为分别验证图标最小32px和拖动区域正宽度，保留实际命令及双击断言；首轮报告继续保留。此次记录限于 Chromium 浏览器及真实前端连接模拟 Tauri IPC，没有启动原生 GUI，不能补填 Windows／macOS 的装饰栏、系统移动／缩放、DPI、多屏或屏幕阅读器验收。

## 全 Header 背景拖动与纯展示工程名复核（2026-10-04）

本节记录当前用户要求，覆盖前节工程名 Tooltip／键盘聚焦及独立窄拖动按钮方案。Header 的非按钮背景、工程名、保存状态与操作组间隙统一处理左键 mousedown 拖动，双击背景最大化／还原。项目名是普通 span，没有 title、Tooltip、tabIndex、按钮角色或悬浮样式，使用默认鼠标指针；170px 中列居中与左侧保存状态位置保持。源码按实际 DOM contains 排除 Portal 冒泡，再用 closest 排除按钮、SVG 所属按钮、选择器及禁用 Tooltip 包裹等交互目标，避免操作菜单或禁用动作时拖动窗口。mousedown 阻止背景默认抢焦点，并仅在 detail===1 请求拖动，第二次按下交给双击处理。Header 保留 banner 地标，窗口三个实际按钮继续提供键盘操作；仅该原生背景事件标签保留一条有理由的 lint 例外，记录在 CODE-QUALITY.md。

独立源码检查和一次批量查看最新七张代表截图后，没有发现需要继续修复的输入或布局问题。四种语言／主题的900×600、中文亮色1440×900、模拟IPC英语暗色窄窗口及英文未保存长工程名截图中，项目名没有交互视觉，状态完整位于重做之后，中心保持稳定。专项15／15通过，46.074秒，0跳过／失败／flaky；24组浏览器布局测得名称中心偏差0px，默认cursor、无tabIndex／Tooltip和悬浮样式不变均有实际断言。模拟IPC的五个代表背景点逐次仅增加一次拖动请求，双击只增加一次拖动及一次最大化；SVG、禁用包裹、Select与Portal操作不请求拖动。数字“-”草稿的焦点、内容和正式工程在背景操作后保持，关闭保护及错误重试仍通过。原始报告、输入附件与截图保存在 `test-results/header-drag-layout/e2e-results.json`、`playwright.log` 和 `artifacts`，此前标题版本证据保持为历史记录。

本轮没有重新运行context、机械detector或额外外观打磨。上述证明来自Chromium浏览器和真实前端连接模拟Tauri IPC，不能据此宣称实际Windows／macOS系统拖动、双击、DPI、多屏、操作系统焦点及原生关闭已经验收；遵守原生GUI停止边界。

## 后处理入口与实时画面专项审查（2026-10-11）

本轮使用 Impeccable 的源码 detector、独立设计／交互评估及真实 Chromium 操作复核新增 RenderControls、RenderingSettings、实时后处理开关和 900×600 布局。detector 针对 `apps/desktop/src/ui`、`App.tsx` 和 `editor.css` 返回空数组（0 条）；该结果只表示未命中静态反模式，不能替代运行时与人工观察。

### 两轮审查的实际修复

第一轮以代码、渲染链和资源生命周期为重点，发现并修复了 WebGL GTAO 误把去噪结果作为灰度输出、WebGPU AO 与场景 pass 自引用造成 TSL 栈溢出、全屏 WebGL shader 重复声明 `position`／`uv`、后处理关闭后仍保留历史资源，以及异步 backend 切换可能释放新 renderer 的竞态。运行时随后恢复为实时直接渲染的可见降级路径，并对相机、文档、DPR、环境和效果开关统一失效历史。

第二轮从用户视角连续启动／退出光追、切换 GTAO／TAA、移动相机、调整窗口和保存 PNG。发现并修复设置弹窗迁移后测试仍假定弹窗保持打开、准备中退出按钮约束不足、PNG 导出绕过实时后处理，以及默认网格和 ghost 过强干扰主体的问题。界面评估另发现材质预览使用泛化 `image` alt；已改为资源名称（内置资源使用本地化名称）。

### 保留的设计限制

评估得到 A11y 3/4、性能 4/4、主题 4/4、完整性 4/4、桌面适配 2/4，总体 17/20。900×600 是当前桌面最小边界，CSS 的 `min-width: 860px` 和窄宽度 32px 工具按钮是桌面密度取舍；移动／触控尺寸和屏幕阅读器整栋建模任务不在本轮验收范围。长设置仍需纵向滚动，GTAO、TAA、HDR、EXR、GLB 等术语保留于高级设置并有行内说明，未把 detector 空结果描述成完整可用性通过。

真实截图与状态／相对计时证据保存在 `test-results/postprocessing.browser-*/` 和 `test-results/postprocessing/evidence.json`；截图均来自同一示例场景，开关、相机和 resize 后分别保存。证据中的帧数和耗时只用于本机 SwiftShader 的相对观察，不作为 Q5 正式性能承诺。

## 可配置几何吸附两轮复核（2026-10-11）

沿用项目固定Frontend Design、Composition Patterns和Impeccable，入口置于视口操作组，与实时／光追及编辑状态保持同一设计语言。Toggle有稳定双语可访问名称、aria-pressed、常显开启／关闭文字、Tooltip和键盘焦点；只读和光追禁用。设置复用FieldSet／Choice／Numeric，模式、公差和网格均为米制会话配置。目标提示在底部状态栏，坐标只更新视口内的局部output，UI没有Three资源或每帧全局状态更新。单次detector针对新增ToolOptions／SnappingSettings／ViewportHost及editor.css返回空数组；不以此代替可用性证据。

首轮核对了纯几何排序、Core事务、缓存签名、ChangeSet、约束和资源所有权。实际修改包括：完整稳定候选键与派生节点幂等、宿主／隐藏及自吸附过滤、无效ChangeSet回退扫描、有效周界墙高签名、正式抓取锚点、小数目标精确赋值、手柄直接使用编辑平面坐标而非整墙偏移、墙正交约束后求解、真实连接墙周界及门窗表面拾取。新增公开函数和生命周期注释说明用途及重要状态约束，runtime既有文件上限从1812降低到1806，新模块未增加超限例外。

第二轮由真实鼠标绘制两堵墙、移动端点及整墙到板顶点、移到线中部／空白／ghost、连续十次开关、移动相机、900→1100→900缩放、双语双主题与实时／光追切换。批量目测四张900×600控制截图、两墙有限线、相机后端点、端点／整墙拖动、设置及光追截图；状态文字与焦点可辨认，设置可滚动且关闭入口可达，反馈不覆盖主体属性。拖动截图中辅助几何已经到达目标，正式属性仍保持原始值。

| 实际问题                                                    | 修改                                                                                           | 回归依据                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 细THREE.Line经后处理后难以辨认，线命中无法直观看出范围      | 复用四顶点有限段窄Mesh条，保留点标记与本地化类型，语义颜色、depthTest=false；不逐次创建GPU资源 | 新的two-walls-finite-line.png可见完整有限线段；实际Three几何／材质释放单元测试 |
| 静止绘制预览持续失效TAA历史又请求下一帧，导致编辑器不能空闲 | 交互时仅输入触发帧；操作结束再执行有限历史精炼                                                 | runtime-rendering单元断言静止预览不持续RAF；实际截图等待idle与固定轨迹帧计数   |
| 墙绘制正交限制可能把已显示目标移走                          | 先确定工具轴约束，再进行候选判断，拒绝不在轴上的节点；保留原始指针距离                         | 实际鼠标off-axis目标拒绝，预览与正式提交坐标完全一致                           |

加强GPU探针证明空工程仍有已释放的砖纹理，由共享阴影材质旧sampler重新上传。新增公开onBeforeShadow处理借用深度／距离材质，去除当前不透明轮廓的无用贴图，仅策略变化更新版本，保留masked／alpha-hash。旧证据记录同一UUID上传→释放→阴影重新上传；native材质版本单元及最终20轮GPU身份审计作为回归，没有关闭阴影或放行残留项目图片。

初次回归的旧资源测试只预期DFG_LUT、旧相机测试保留草稿、双门测试两秒UI时序及ghost透明度0.25均与当前运行前提冲突；分别改为按纹理所有权及稳定身份审计、相机取消／新绘制断言、更长真实并发动画窗口及已审查0.18透明度，未以减少关键断言掩盖失败。相关原始失败与最终结果分开保存。

证据在 `.test-artifacts/snapping/`，汇总为 `docs/snapping-validation.json`。没有重复detector或开放式外观打磨；保留原生GUI停止边界，不宣称Tauri／macOS／Option实机、屏幕阅读器建模任务、触控板、DPI或多屏通过。40点两墙软件GPU轨迹只记录真实帧和计时，不构成正式Q5性能达标。

## 实际操作 UI／UX 审查与修复（2026-10-13）

本轮先读取 AGENTS、PRD、PROGRESS、CODE-QUALITY、既有设计／审查／验收，应用项目固定 frontend-design、vercel-composition-patterns、Impeccable audit／critique／harden／polish／craft-floor。Operate 布局、离线字体、现有语义色与 SVG 图标保持；仅保留亮色／暗色，以 2026-10-04 的明确决定覆盖原 system 主题条款。新渲染弹窗组合现有 shadcn Dialog／Field，并通过 ui 公开导出 DialogTrigger；没有安装新组件库或升级固定 Skills。

实际操作使用独立 1422 浏览器，Playwright 回归独占 1421／1423／1424／1425；没有使用用户的 1420 工程。历史物理 Escape 停止原生 Computer Use 的边界仍有效，本轮不启动、安装或操作 Tauri GUI。下面是浏览器前端证据；CLI Tauri 构建、原生产物启动与 macOS 验收分别记录。

| 编号／类型            | 实际复现与用户影响                                                                                                                                                                     | 修改理由与实现                                                                                                                                                                                                                         | 前后证据／回归                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX01 可用性           | 俯视绘墙、选墙，属性高度按 Enter 后用鼠标点击 Canvas；`:focus-visible` 仍为 true，整圈 2px 蓝框持续显示。普通鼠标首次绘制没有复现蓝框，不能概括为每次点击都有问题。                    | 容器捕获鼠标／键盘／失焦来源，只屏蔽 Canvas 鼠标来源的 outline；Tab 返回及 Canvas 内键盘操作保留语义 ring。没有全局移除 outline，没有新建 Renderer。                                                                                   | [之前](screenshots/uiux-20261013/before-focus.jpg)／[之后](screenshots/uiux-20261013/after-focus.jpg)／[键盘](screenshots/uiux-20261013/after-keyboard-focus.png)；uiux 的 Enter→点击／绘制／拖动及 Tab／Shift+Tab 回归 |
| UX02 用户偏好＋可用性 | 普通实时预览自动运行；旧主区同时有“实时渲染”静态文字与“开始光追”按钮，采样配置需另开全局设置；光追状态／采样在工具栏和 Canvas 同时出现。两种渲染能力不同，不能因名称相近删除其中一个。 | 主入口“实时渲染”打开关联弹窗，说明普通预览与渐进光追，配置目标采样并明确“开始光追”。保留暂停／继续、返回实时编辑、采样进度、失败重试、PNG；光追状态与采样只在主工具栏 output。环境／GTAO／TAA／吸附仍在全局设置，GPU owner 未移到 UI。 | [旧设置路径](screenshots/uiux-20261013/before-render-settings.jpg)／[新关联弹窗](screenshots/uiux-20261013/after-render-dialog.jpg)；rendering-ui、rendering、WebGPU 成功／错误恢复及资源回归                           |
| UX03 可用性           | 连续绘墙经过网格／端点后，底部提示被吸附类型或“当前没有吸附目标”覆盖；有起点时看不到下一步。尺寸提示只在未吸附时出现。首墙有效草稿仍显示“从一段墙或一块楼板开始”的泛化浮层。           | 操作阶段与吸附转变分别显示；坐标／墙长或楼板尺寸只更新 runtime 局部 output，不逐帧写 React／IPC。首点、楼板对角点、连续墙段、Esc 均有准确阶段提示；有效草稿隐藏空场引导。非法终点拒绝后，关闭错误恢复原阶段与草稿。                    | UX01 之前截图底部已显示“当前没有吸附目标”；[绘制复验](screenshots/uiux-20261013/after-wall-drawing.png)；uiux 的吸附／尺寸／相机／连续提交／Esc 与错误终点回归。未保存旧草稿同视角截图，不伪造完整视觉差异              |
| UX04 可用性           | 真实网格绘墙的属性出现 `7.800000000000001`、`-4.1000000000000005`，增加读数与输入负担。                                                                                                | 只格式化数值显示为 15 位有效数字；未编辑的 Enter／blur 不提交舍入，极小非零值保留科学记数，用户精确输入仍按原值命令提交。                                                                                                              | UX01 同一墙属性前后对照；numeric-display 单元／真实浏览器覆盖最小最大有限值、原精度／历史不变、取消／拒绝／undo／redo                                                                                                   |
| UX05 功能缺陷         | 新建墙并把高度改为 3，勾选“整栋预览（只读）”，点击顶部撤销后高度实际变回 2.8；快捷键同样绕过 submit 保护。                                                                             | 只读时禁用顶部 Undo／Redo，并阻止场景历史快捷键；输入框自身快捷键仍由文本作用域处理。退出预览恢复历史操作。                                                                                                                            | manual/before-readonly-history.jpg 保留实际失败；[只读复验](screenshots/uiux-20261013/after-readonly-history.png)；uiux 精确比较工程／history，覆盖 Ctrl+Z／Y／Shift+Z 与退出后恢复                                     |
| UX06 功能缺陷         | 高度输入 0 被拒绝，再输入 2.9 成功后，旧“尺寸必须大于零”错误仍挡在 Canvas 上，误导用户有效修改失败。                                                                                   | 成功命令清除被纠正的旧错误，恢复最近编辑阶段；错误正文只在对应 Alert／弹窗显示，状态栏保留操作提示。关闭提示同样不强行切成选择提示。                                                                                                   | [有效修改仍报错](screenshots/uiux-20261013/before-error-recovery.jpg)／[恢复之后](screenshots/uiux-20261013/after-error-recovery.jpg)；uiux 验证非法不写文档、成功仅一条历史、拒绝终点与关闭提示后继续                  |
| UX07 资源缺陷         | 完整 Chromium 回归真实请求 `/favicon.ico` 返回 404；十项测试的错误数组因此失败。                                                                                                       | HTML 显式引用现有原生 32×32 图标的字节副本，补齐资源而非过滤控制台错误。                                                                                                                                                               | browser 首轮 trace 的精确 URL／404 保留；public／dist／native 图标 SHA256 一致检查及实际浏览器复验                                                                                                                      |

最终集中查看截图时另外发现 UX08（渲染功能缺陷），随后经真实菜单 WebGL→WebGPU 切换确认：亮色主题普通实时预览的 Canvas 变成黑色，墙体／网格仍正常。它不是渐进光追，也不是用户选择环境背景后的预期变化。固定 Three 的 TRAA 在执行惰性 scene pass 前临时把 renderer 清屏色重置为黑色，beauty 输出借用了这个临时值。修复在 runtime 后处理 owner 内按当前语义背景设置 beauty MRT 的独立清屏值，保留场景颜色／环境背景优先级、法线／速度附件和 GPU 资源所有权。硬件回归检查实际像素、亮暗切换、Renderer 身份、工程／历史、后处理开关和环境背景；原先80项通过但漏测此画面问题的报告保留为修复前证据。[之前](screenshots/uiux-20261013/before-webgpu-background.jpg)／[之后](screenshots/uiux-20261013/after-webgpu-background.jpg)。

UX09（渲染功能缺陷）来自全景背景复验：实际导入合法 4×2 HDR 后，WebGL／WebGPU 的墙体均变纯黑；同一 RGBE 像素值的 64×32 对照则正常照明。真实 HDRLoader 解码所有值有限且非黑，独立硬件回归在修改前完整采集两后端的黑色 5×5 墙面像素及对照后失败。固定 PMREM 要求最小 16×16 cube face，小图直接进入预过滤产生无效采样范围；不能把已支持的合法输入当成无影响测试图片。runtime 为小图单独持有满足最小尺寸的照明派生纹理，原图／原字节仍用于工程、全景背景和光追；主题、布局和 UI 均不拥有该资源。异步替换、迟到请求、失败释放和照明像素另有回归。[之前](screenshots/uiux-20261013/before-hdr-lighting.jpg)／[之后](screenshots/uiux-20261013/after-hdr-lighting.jpg)。

前后焦点／错误／渲染弹窗使用同一保存墙工程、中文、亮色、1600×900、俯视；WebGPU 背景另使用同一保存墙工程及相同主题／窗口／俯视；HDR 照明使用相同保存工程、中文亮色、1600×900／WebGL／查看当前层。重开自动聚焦导致取景范围不同，JPEG 压缩也不同；不是像素级视觉差异测试。修复后的双语／双主题、1600×900／900×600 使用独立真实示例、选墙属性与弹窗矩阵截图，保存并逐张查看；原始操作工程、下载 PNG、截图、trace 和失败报告在 `.test-artifacts/uiux-20261013/`。

本轮未复现 Tooltip 遮挡点击、设置重复 Alert、主题／语言／弹窗重建 Renderer、未提交预览写工程或一次拖动多历史；新专项仍对这些行为做断言。没有将基础图标密度、高级术语、最小桌面尺寸或个人审美偏好列成缺陷，也没有恢复系统主题。Impeccable context 按 desktop 子目标解析已有 PRODUCT／DESIGN，单次 detector 返回 `[]`；这只说明静态检测未命中，不能替代操作证据或 WCAG／屏幕阅读器认证。

最终测试、源码哈希、发布产物及剩余限制以 `uiux-review-validation.json` 与 ACCEPTANCE 本轮补充为准。历史失败、原 A01–A42 条件与既有平台缺口保持；不能仅凭 build／NSIS 成功认定可发布。
