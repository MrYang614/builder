# UI 与组合模式审查

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
