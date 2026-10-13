# 实施记录与恢复入口

## 基础 UI 家族重构与独立 Storybook（2026-10-13）

已完成 `@building/ui` 基础组件体系和正式调用迁移：Input.TextArea / Password / Search、InputNumber、Select、Checkbox.Group、Radio.Group、Switch、Slider、Button.Icon / Group、Form.Item / Group / Section、Tooltip、Popover、DropdownMenu、ContextMenu、Dialog / ConfirmDialog、Tabs、Segmented、Toggle / ToggleGroup、Accordion，以及 Alert、Badge、Card、Separator、Empty、Skeleton、Spinner、Progress。全部公共组件和类型、准确默认值、旧／新 API、调用文件、story／example 与真实验证映射见 [UI-COMPONENTS.md](UI-COMPONENTS.md)。公共封装使用语义 props，不接收内部外观 className/style；旧 IconButton、Field*、Select*、Dialog*、Tooltip* 顶层拼装入口已移出普通调用。低层 Radix/shadcn 置于 `src/primitives`，shadcn CLI 不覆盖公共封装；正式应用没有 primitive 导入，重复外观 CSS 清理约82行，页面布局仍在应用。

新增真实 React/Vite `apps/storybook` 工作区，提供35个组件入口、294个 stories 和35个 docs 条目。根目录 `npm run storybook` 使用独立6006，`npm run build:storybook` 输出 `apps/storybook/dist`，`npm run test:storybook` 独占6007；正式应用1420未被干扰。所有页面直接用同一 UI 实现，包含实际 TSX、JSON schema、props／组件默认值与示例基线、Controls、复制／重置、两主题及窄容器。浏览器 TSX 使用锁定 Sucrase，支持 React 状态／事件、命名空间组件和明确 import；代码／配置／运行错误分别提示并标记旧有效预览。Controls 与 JSON 共用 args，草稿只留页面内存，不写文件或自动存储；本地组件、示例、配置 HMR 更新实现与重置基线，活跃草稿保留。Reset 也恢复未改代码／配置情况下的示例局部 state。6008静态构建另经真实浏览器临时 TSX／JSON 修改、React 点击状态与 Reset 操作验证；记录在 `manual-browser/`。

干净 `npm ci` 安装560包通过；format、lint:fix、check、五套严格类型、374项／41文件单元、Rust25项、桌面前端 build 与 Storybook 静态 build 均通过。最新完整 Storybook64／64通过，无跳过／flaky；HMR验证用修改按原字节恢复，当轮483项源码／配置SHA前后相同。独占实际 GPU Chromium 的正式编辑器同源、同断言60／60通过，耗时约3分钟；覆盖字段／IME／历史、Canvas输入隔离、弹窗、主题／语言与Renderer身份、保存／重开／导出、吸附／拖动及20轮资源检查。浏览器和模拟Tauri窗口结果不作原生验收。命令日志与原报告在 `test-results/ui-foundation-2026-10-13/`，统一入口由 `INDEX.md` 和 `validation.json` 汇总。

独立 Impeccable A／B 审查均读取固定 Skills与当前源码；A在收到B结论前完成，修复前启发式评分31／40，B技术评分16／20。B仅一次 detector，exit0、JSON `[]`；原报告及量测保存于 `review-a/assessment-a.md` 与 `review-b/assessment-b.md`，未将空detector视为无问题或满分。实际修复420px页面462px内容溢出／410px可用宽度、Select搜索键盘焦点、组件默认值与示例基线混淆、复制旧revision仍显示Copied、临时草稿说明位置、Reset局部state、Radio快速keyup选择丢失、Input被Dialog捕获Escape后无法还原、Toggle可访问名称覆盖，以及Dialog footer在mousedown与click之间因blur错误行增减而移位。footer仍在动作执行前确认blur草稿，原A35中英×亮暗四组合严格断言4／4通过。截图核查还发现Storybook标准Controls的Update story／Create new story保存入口；已用官方 `controls.disableSaveFromUI: true` 关闭，两个保存动作absence断言和最终构建通过。最后实际manager刷新还发现临时args未恢复；按当前CSF initialArgs与公开resetArgs恢复各变体基线，同时关闭会把含临时args的返回URL写入sessionStorage的可选Review功能。新增Default／Disabled两条主页面刷新、真实侧栏重进、variant Reset、Controls状态及全localStorage／sessionStorage／IndexedDB不变断言；最终完整64／64和6008最终静态构建人工复验均通过。首次manager失败与storage违规5通过／2失败报告保留。

原始失败全部保留：Storybook初轮窄屏／HMR、输入与事件探针失败，正式编辑器硬件首轮56通过／4个UI探针失败，随后并发58通过／2个GPU严格断言失败。并发资源geometry4而非3、光追首采样10秒内仍0，均未强行归因；`review-b/hardware-failure-analysis.md`只记录可观察事实。最终独占GPU相同源码和断言60／60通过，说明该环境下复验成功，不删除并发失败，也不宣称已证明并发负载是原因。未降低断言、跳过或放宽原超时。

EditorCore正式数据、草稿／预览／历史、导出快照与runtime GPU所有权边界不变，Storybook／Sucrase不进入桌面生产依赖图。原生GUI的历史停止边界继续有效；本轮没有安装／启动／重打包最新Tauri exe／NSIS，旧产物不包含本次基础UI重构。macOS、原生WebView输入／关闭／系统焦点、屏幕阅读器、DPI／多屏、物理触摸／触控板及Q5正式系统／硬件／性能仍按既有限制待验或待确认，不以网页验证补填。

## 实际操作 UI／UX 审查与修复（2026-10-13）

按最新用户要求完成当前源码的浏览器鼠标／键盘操作、集中问题修复和复验；历史物理 Escape 停止原生 GUI 的边界仍有效，没有操作用户的 1420 工程。实际修复 Canvas 属性键盘编辑后鼠标蓝框、绘制阶段被吸附／尺寸覆盖、草稿空场泛提示、浮点尾数显示、只读预览的历史绕过、纠正有效值后旧错误残留，真实 favicon 404，以及最终截图核查后实际复现的亮色 WebGPU 黑背景、合法小HDR的双后端黑色照明。主入口按明确偏好统一“实时渲染”，关联弹窗配置并启动光追；普通实时预览、暂停／继续／退出／采样／失败恢复／PNG 均保留，环境／后处理／吸附继续在设置。原系统主题条款仍由只保留亮色／暗色的后续决定覆盖。

编辑提示／吸附分别经低频 Signal，坐标／尺寸保持 runtime 局部 DOM；正式命令、预览、拖动历史、材质和导出边界不变。Canvas 来源标记只控制鼠标 outline，键盘 ring 保留；Numeric 只格式化显示，未编辑不提交舍入。公开 DialogTrigger 复用 ui 组件，无新 token／依赖／资源 owner。阶段字典单独抽取，i18n 为499行，生产源全部≤500行，未加豁免。二审及硬件故障回归还修复 scheduler 的 idle 诊断：异步 GPU 帧仍进行时也必须 pending，不能仅检查 RAF handle；加强 deferred GPU 单元断言，原八个稳定浏览器帧不再增长的严格断言保留。

最终当前源码369项／40文件单元、四套严格TS、Rust25项、format／lint:fix／check、生产build通过；完整真实 Chromium／RTX WebGL 浏览器80／80、WebGPU硬件6／6，无跳过／失败／flaky。新 UI 专项8项另在SwiftShader通过，覆盖墙／板／门窗／属性／材质／拖动／Esc／历史／楼层／真实保存重开与 GLB；中英×亮暗×1600×900／900×600及弹窗焦点／输入隔离／Renderer身份验证。20轮资源归零、renderer自有3项geometry／15张texture完整UUID／9个runtime监听稳定；50轮大型工程／5次导出与独立动画加载保留原断言。本轮计时不作Q5达标主张。

首完整套67通过／12失败的原报告、标准软件GPU14／14复测、WebGPU首3通过／1失败、后续4／4，以及测试定位符错误／人工中断均保留。十项首失败准确定位 favicon.ico 404，补资源而非过滤错误；异步 GPU 误报 idle 以源码和严格原测试闭合。集中截图检查又发现 WebGPU 黑背景，经真实菜单复现及未修复硬件精确像素断言失败确认；固定 TRAA 的临时 black clear 在惰性 scene pass 时被借用，runtime beauty MRT 独立清屏值修复，六项真实 pinned reset/pass 单元与四后处理组合／亮暗／全景策略硬件回归通过，不改法线／速度／GPU owner。之前80项未覆盖该画面差异的通过报告和原安装包单独保留，当前源码重跑并重新打包。独立只读观测证明另一个硬件冷编译过程没有输入阻塞状态、持续resize或采样卡死：isCompiling约10.6秒，500ms轮询于启动后21.314秒首次观测整采样≥1（已经13次），这是观测上界，不是精确GPU耗时；首次10秒严格超时和后续相同未改断言通过都记录，不伪称冷启动性能已通过。三方集中查看最终PNG，手动前后JPEG和原始工程保留；证据入口为 UI-REVIEW 与 uiux-review-validation.json。

合法4×2 HDR另在两后端实操复现黑墙，同RGBE的64×32对照正常；修改前硬件回归完整保留两后端黑色5×5像素，源数据有限且非黑。runtime独立持有最低64×32的照明副本，原工程字节／背景／光追保留原图；独立轴下限避免窄高图超额放大，正式8192侧边界下最多新增524288像素／4MiB。迟到decode／derive、clear／replace／dispose、scratch及双owner清理失败保留首因均有回归，真正异步提交才清TRAA历史。原PNG/JPEG32×16／source／身份／字节／16采样精确断言全部保留，observer通过真实UI背景观察原图并单独精确验证IBL副本；没有放宽断言或替换失败输入。最终硬件小HDR墙面约[183,191,199]，64×32对照[183,191,201]不变；相同保存工程WebGL／WebGPU人工复验和截图已查看。

最新Windows优化exe／NSIS由当前176项生产输入重新构建、前后源码fingerprint一致；HTML／public图标与打包资源SHA核对，各中间产物单独归档。当前可下载副本在 `.test-artifacts/uiux-20261013/release`，哈希见 release/artifacts.json；该结果只证明构建与打包。最新生产网页4组冒烟另有证据，不能冒充桌面产物启动。仍有发布阻塞：最新Tauri安装／启动／关闭保护／原生WebView输入与GPU验收受历史停止边界阻塞；macOS与跨平台迁移未实机验证；产物未签名，Q5参考系统／硬件和正式性能／冷启动预算待确认，真实设备丢失、磁盘满、触控板／DPI／初心者任务仍未验。本轮不宣布可上线。

## 全仓代码审查与直接修复（2026-10-11）

四路审查覆盖 desktop UI／服务／平台、Core、geometry、three-runtime、ui、Rust／容器及配置／质量脚本，随后跨模块二审。确认并修复35项具体 BUG，包括非法预览误提交、80窗几何栈溢出、资源校验缓存、revision溢出、raw吸附精度、GPU异常回滚、关闭／打开／保存异步竞态、资源展开预算，以及字段草稿／撤销／图片晚到等 UI 问题。逐项条件与回归在 REPOSITORY-REVIEW.md；没有回滚原有暂存工作或改固定Skills／生成token／原PRD验收条件。

Core／validation／geometry／Rust storage／Inspector五项超限职责拆分后，所有生产 TS／TSX／Rust 统一500行门禁，已删除全部旧ceiling。几何复用solids、空依赖跳过全墙扫描；纯Node冷基准单列，不作桌面性能结论。UI审计与新所有权边界见 UI-REVIEW／ARCHITECTURE／CODE-QUALITY。

最终验证与源码SHA256记录在 repository-review-validation.json。新增测试覆盖基线262项遗漏边界；浏览器使用独立1421、隔离证据，不覆盖历史失败。此前设置alert重复失败在本轮已修复。原生GUI停止边界保持，未补填macOS、安装、触控板、真实磁盘满／设备丢失或Q5验收。

最终345单元／36文件、Rust25、四套TS、check／build与Windows优化程序／NSIS构建通过。功能浏览器去重70／71，保留SwiftShader大型工程600秒超时；实际RTX4070 SUPER同一50轮／5导出及最终20轮资源断言2／2，WebGPU4／4和生产网页4组通过。确认harness的CJS import初次失败与修正后单独通过均保留；没有放宽断言／采样／限时或关闭后处理。资源owner二审25条新增故障注入通过，项目资源及补偿清单逐项尝试释放，主错误保留。

## ThreeRuntime 职责拆分（2026-10-11）

按用户要求将1806行runtime拆成协调入口与独立交互、预览、拾取、正式场景、选择辅助、门动画、装饰、渲染／后处理、环境、光追快照和RAF模块。512行pathtracing的backend适配独立为pathtrace-drivers，保留采样session。公开ThreeRuntime方法、Scene／Camera／Controls身份、诊断与Core命令边界保持。各模块持有自己的状态和资源，通过明确窄接口连接；两项逐文件超限例外已删除，整个three-runtime受500行上限约束。边界与先后顺序见ARCHITECTURE.md。

协调入口最终335行，pathtracing会话283行，包内最大文件为476行。独立审查补齐selection幂等清理、自建灯光与阴影释放及销毁后迟到sample异常反馈。测试已去除AST剥除ThreeRuntime构造器的做法，直接执行真实owner并保留私有故障注入探针；增加actual dispose、输入capture、场景局部重建／ghost、选择GPU与动画快照回归。最终check／四套TS／262项27文件单元／Rust20项／build通过。20轮真实GPU资源专项通过：工程资源归零，renderer自有15张纹理UUID全集、9个runtime监听及renderer身份稳定，BVH构造／释放均为1071，控制台／页面错误0。

浏览器功能回归完整证据见runtime-refactor-validation.json及 `.test-artifacts/runtime-refactor/`：首轮29通过／2失败；最终源码5项复测4通过／1旧探针失败；修正探针后主题专项1通过；20轮资源专项另1通过。按最新结果去重共32条路径，31通过、1项既有UI失败，无跳过／flaky。首轮旧主题断言预期2灯，但拆分前已有半球灯和两盏方向灯；测试改为验证完整3灯类型／身份。复测又定位旧探针最后记录GTAO法线预处理的临时7777ff清屏色，改为只记录非override的真实颜色渲染，保持后处理和背景token精确断言，以及主题材质／曝光不变断言，实际主题复测通过。另有设置错误提示案例在全页alert计数处失败：原App和RenderingSettings同时显示同一notice.error，两个分支在HEAD均已存在；非法环境强度在Core发布前已拒绝，未触发runtime.sync。本轮保留无关UI及原测试断言，记录这项既有失败，不声称所有浏览器测试通过。该案例早停后的旋转、损坏HDR及英文断言未在本轮执行。原生停止边界、未验macOS／真实设备及Q5限制继续保持；本轮没有性能提升结论。

## 可配置几何吸附（2026-10-11）

主界面视口操作组新增“吸附”，默认综合模式开启；设置可选点／线／网格模式、公差及网格间距，Alt/Option临时绕过。配置只有SessionStore一份状态，经现有bridge进入runtime，不写工程、历史或本机偏好。纯Core模块定义候选和确定排序，纯geometry共享实际墙连接周界；runtime按正式对象／当前楼层缓存、过滤ghost／隐藏／预览／自对象，坐标、标记、预览和提交共用求解结果。新增模块均低于500行，原runtime例外上限从1812降至1806。

实际鼠标已验证第二墙端点与第一墙完全相等、有限边线、端点及整墙到楼板顶点、预览文档不变、单条提交历史、Escape／pointercancel、关闭原始输入、连续开关、相机与resize、双语双主题900×600、配置错误恢复及光追清理。技术／用户视角两轮修复包括稳定元数据、无效ChangeSet／墙高／洞口宿主缓存、正式抓取锚点与小数精度、手柄沿编辑平面而非整墙偏移、正交约束后吸附、真实L周界、门窗表面拾取、有限段反馈可见性及静止预览TAA调度。详细要求和两轮发现分别记录在ACCEPTANCE、RENDERING、UI-REVIEW；最新验证及真实性能数据以snapping-validation.json为准。

此前原生GUI停止边界保持，未启动新Tauri窗口。241项／24文件单元集成、四套严格TS、Rust20项、架构／语义token／固定Skills检查及生产构建已通过。浏览器原始失败保留在 `.test-artifacts/snapping/consolidated-first` 与 `consolidated-second`；新吸附7项在两组通过。加强资源探针发现共享阴影材质重新上传已释放砖纹理，已通过原生Three公开onBeforeShadow借用材质策略修复。最终17项功能／既有编辑回归通过，20轮资源专项另行通过：工程对象和资源归零，renderer自有15张纹理的完整UUID逐轮稳定，事件监听9个保持，BVH创建／释放各1071次，控制台错误0。完整原始证据分别保存在 `.test-artifacts/snapping/final-regression` 与 `resource-final`。900×600、DPR1、两墙软件GPU固定40点轨迹的帧数和耗时不作为FPS或Q5基准；Tauri／macOS／Option实机／触控板／屏幕阅读器／DPI多屏及Q5硬件仍待验或确认，不以浏览器结果补填。

最终独占鼠标场景另行通过，合计19条浏览器路径由17+1+1三次命令验证，全部无失败／跳过／flaky。Chromium153 SwiftShader、两楼层两墙、900×600 viewport／485×338 canvas／DPR1，开启吸附40点总耗时2801.10ms／59帧／40次查询累计2.10ms，关闭3148.30ms／47帧／零查询；两组候选及边界重建均为0。总耗时含自动化dispatch和等待空闲，不作FPS或速度提升结论。世界／屏幕轨迹、控制台零错误、最终源码SHA256和三组报告均记录在 `snapping-validation.json`，失败历史与实际截图完整保留。

## 双主题直接切换、1600×900与提交前核验（2026-10-04）

用户最新要求仅保留亮色／暗色，Header点击或Enter／Space直接切换，移除主题菜单和系统跟随；旧system／缺失／异常偏好固定迁移亮色，有效语言与渲染器保留。原生main默认尺寸改为1600×900，最小900×600保持。H09／H10覆盖声明已在HEADER-LAYOUT与ACCEPTANCE追加，原PRD及A01–A42历史条件保留。

前次任务中断时实现、31项主题专项、12项窗口布局及Windows优化程序／NSIS构建已经通过，但汇总文档未完成。本次提交前核对原始报告并补齐theme-toggle-validation.json、README和当前架构／已知限制说明，独立产物副本及SHA256在test-results/theme-toggle/release。最新check、四套严格TS、164项／17文件单元集成、Rust20项和生产构建通过；独立生产浏览器4组检查通过，实际GLB零错误／零警告并包含四个独立门动画片段。

提交前另发现默认autocrlf使暂存Impeccable从CRLF转LF，哈希与固定清单不符；默认Windows检出也会改变另外两项Skills及生成CSS。新增.gitattributes固定维护源码LF并保留Skills／原需求／历史证据原字节，重新暂存后独立检出的架构、token、生成CSS及三项Skills哈希检查通过，未改清单或Skill原文。

提交前完整浏览器53／53通过，455.019秒；实际NVIDIA WebGPU4／4通过，28.352秒，均无失败／跳过／flaky。默认及PNG／JPEG均实际16采样，正常路径GPU错误0；三次退出geometry4／textures4稳定，预期故障注入11条错误后停止、重试与正式编辑恢复通过。大型工程50循环／5导出及生产4组检查通过。独立证据在test-results/commit-preflight/browser-20261004，汇总追加theme-toggle-validation.json；测试副本只改产物与相对导入路径，原断言和测试SHA256保持。

本次没有修改产品源码、启动新原生GUI或执行系统安装；浏览器布局与模拟IPC不补填Windows／macOS的实际尺寸、移动、DPI、关闭或重启验收，已有失败及历史产物保持。

## Header 全区域拖动与纯展示工程名（2026-10-04）

用户最新要求：Header所有非交互控件区域都能按下移动，工程名无交互／指针变化／Tooltip。HeaderWindow改为整条header，背景首次mousedown请求原生拖动，dblclick最大化／还原；排除真实按钮、SVG后代、禁用包裹、选择器及DOM外Portal。工程名普通span、默认光标、无tabIndex／Tooltip；工程名继续真居中，保存状态继续在撤销、重做右侧。单处窗口背景指针事件lint例外保留banner地标而非伪装按钮，记录在CODE-QUALITY.md。

最新format／lint／check、四套严格TS、156项／17文件单元及生产构建通过。相关15项浏览器与模拟IPC通过，五处背景实际按下逐次一次drag、双击一次drag加一次最大化，交互控件零drag；“-”数字草稿不失焦或提交，工程快照和Renderer保持；24个浏览器布局的名称中心偏差0px，名称无Tooltip／焦点且悬浮样式不变。证据test-results/header-drag-layout、header-drag-validation.json；H08输入路由已验证，实际原生移动仍未验证。未继续原生GUI，没有Rust源码／capability变更，不以此次浏览器结果补填Windows／macOS验收。

最终Windows优化程序及NSIS已在全区域拖动修订后重新构建，独立产物保存在test-results/header-drag-layout-release，SHA256及字节长度记录在header-drag-validation.json。没有安装或启动新宿主；运行旧二进制的客户端需使用新产物并重启。

## Header 工程标题与状态位置调整（2026-10-04）

按用户后续要求删除 Header 可视“建筑编辑器”，工程名单独按整窗居中；已保存／未保存修改放在撤销、重做右侧，原 status.isDirty 文案、颜色、保存与关闭保护保持。左右等宽网格、独立右侧窗口容器、窄窗口32px图标保证双语／双主题900和1440宽布局；长工程名可截断并悬浮／聚焦读完整路径。

最新质量、四套严格TS、156项／17文件单元和生产构建通过；Header／模拟IPC窗口相关11项复测通过，标题中心实测偏差0px。首轮9通过／2透明拖动区旧尺寸断言失败保留；修改辅助断言仅限制可见图标按钮，实际拖动／双击／键盘与关闭保护继续验证。H07与范围见 ACCEPTANCE.md、HEADER-LAYOUT.md、header-title-validation.json，最新证据在 test-results/header-title-layout/status-left-final。未继续原生GUI，不填补Windows／macOS实际窗口验收。

## Header 布局交付增量（2026-10-04）

按用户要求将主题、语言、实际渲染引擎移至 Header；新建、打开、保存、另存为、撤销、重做依次置左，Header 与建模工具改为 SVG 图标及双语悬浮／焦点说明。设置保留光追、采样和环境贴图。原生 main 关闭装饰栏，Header 提供最小化、最大化／还原、关闭及空白拖动区域，关闭仍等待偏好写入与未保存工程决定。共享组件在 ui 包，Header 仅订阅 backend／switching，不订阅采样帧。

质量、四套严格类型、153项／17文件单元与集成、Rust18项、完整浏览器52项和生产smoke4项通过。最后按真实Chromium事件差异将窗口拖动改用首次mousedown，新增双击断言后5项模拟IPC窗口专项全部通过；完整52项基线在这次局部修订之前，范围及两次失败记录保留。Windows优化程序和NSIS在该修订后重新构建，独立副本及SHA256见 `docs/header-layout-validation.json` 和 `test-results/header-layout-release`。

Impeccable独立双语／双主题900×600截图审查、机械检查与修复记录见 `UI-REVIEW.md`。H01–H06矩阵追加在 `ACCEPTANCE.md` 和 `HEADER-LAYOUT.md`，原A01–A42条件／状态不改。没有安装或启动原生GUI，实际Windows／macOS窗口装饰、拖动、DPI及关闭保持未验证；运行中的旧客户端须使用新产物并重启。当前WebGPU源码及历史证据均保留，本轮浏览器结果不填补原生或macOS验收。

更新：2026-10-04。开始前完整读取 PRD v0.3；现有 Tauri/React 初始模板无 Git 元数据、AGENTS 或锁文件。保留原资产与图标，将应用与宿主迁入 apps/desktop。现有 Bun launcher 无法运行（不是有效 Windows 程序），采用可用 npm 12.2.0 工作区，固定 package-lock.json 与 Cargo.lock。本机 Node26.1.0、Rust/Cargo1.92.0，Windows11 x64。

## 渲染扩展交付增量（2026-10-03–04）

### WebGPU sampler 修复增量（2026-10-04）

用户报告的第一条 WGSL 错误已定位到默认环境 DataTexture 的双 Nearest 过滤：Three 不生成 sampler，但发布版光追库的环境函数强制使用 textureSampleLevel。独立真实 NodeBuilder 回归复现该遗漏；产品默认／派生环境统一线性 RGBA HalfFloat、双 Linear，PNG/JPEG 实际像素转换保留正式图片资源。GPU onError 生命周期接入恢复实时编辑、保留首条错误和清理陈旧回调，包含 in-flight 采样拒绝的生产方法回归。

采用完整 Chromium 无界面模式后，NVIDIA Lovelace 真实 WebGPU 的4项回归全部通过：默认环境与PNG／JPEG实际像素、16采样、暂停继续、真实着色器错误后停止／重试／继续编辑、WebGL↔WebGPU切换。最终默认光追PNG为970×718、849种RGB，正常路径GPU验证错误0。三周期首次暴露每轮3张派生纹理泄漏，补齐会话LUT、quad材质及未绑定的空图集所有者后，每次退出geometry4／textures4完全相同；某一dispose抛错也不阻止其余清理和GPU首因显示。失败报告保留，不以GPU计数代替VRAM字节测量。最新156项／17文件单元与集成、4套严格TS通过；普通浏览器回归及最终构建记录见webgpu-fix-validation.json。

实际用户确认另一任务正在调整UI；保留它的源码，用独立缓存、关闭HMR／watch的1421测试服务器，未停止1420开发服务器。工具提示遮挡选择项的真实失败已保留，共享Tooltip增加pointer-events-none后真实鼠标切换通过。默认headless-shell的DXIL Error87是独立测试环境问题，8项设备探测证据保留。不得将浏览器硬件实测补作Tauri原生／macOS验收；用户确认没有未保存工程，已允许源码刷新，未继续原生GUI。根因、复现步骤与范围见WEBGPU-FIX.md。

用户请求实际WebGL／WebGPU切换、three-mesh-bvh、three-gpu-pathtracer和环境贴图。已确认环境贴图随工程保存；按已说明的推荐方案增加当前视口PNG输出。BVH实例拾取、双backend路径封装、环境数据／便携资源链、设置与viewport已集成；R01–R09矩阵见RENDERING.md。核对并精确锁定BVH0.9.15／pathtracer0.0.26，使用发布包真实两backend入口。

实际通过123项／15文件单元与集成、四套严格TS、格式／零警告lint／架构／token／Skills检查、Rust18项及删HDR／EXR原图后跨目录TS↔Rust便携文件链。最终完整39项真实浏览器回归335.541秒、0跳过／失败／flaky：含实际16采样光追、暂停继续、PNG像素、三次资源退出、环境保存重开、50大型工程循环和5GLB。生产资源4组检查通过，Windows优化release／NSIS已重新构建，最终哈希见rendering-release-artifacts.json；未安装／启动release宿主。匹配可编辑工程、门动画GLB和PNG在examples/rendering，固定报告与SHA清单随附。

上一轮软件GPU三种探测均没有adapter；本轮完整Chromium已在真实NVIDIA设备验证成功切换与光追。真实device-loss、新Windows原生GUI与macOS仍未运行，用户物理Escape停止仍受尊重。偏好写入／关闭失败重试9项模拟宿主集成不冒充原生标题栏操作。最初23通过／16服务器连接失败、旧光追背景texture泄漏、HMR中断、三轮UI失败保留；最终复测由Playwright自身拥有Vite，未降低断言。

## 工具增量：oxfmt／oxlint（2026-10-03）

应用户要求接入 oxfmt 0.71.0、oxlint 1.86.0，采用 Google TypeScript 开源规范的项目适配版，精确依赖、共享编辑器设置、零警告质量入口和 Windows CI 已落地。直接 Prettier 依赖及配置已移除。规范及有理由的局部例外在 CODE-QUALITY.md；工具版本、执行结果与范围在 code-quality-validation.json。原始 PRD、固定 Skills、生成 token CSS和历史证据保留，不为排版改变校验内容。

格式及安全修复统一花括号／类型导入；React 引用更新移入 layout effect，runtime 注册／按实例清理在服务层完成，状态栏改用 output。保持 React refs、immutability 和依赖规则启用。严格类型检查发现自动修复改变 TypedArray.map 语义后，已恢复明确 Array.from，几何断言不变。

本次 check、四套严格类型检查、71项单元／集成、生产构建通过；14项相关浏览器回归及4组实际生产资源检查通过，实际 GLB Validator零错误零警告。首次浏览器执行被沙箱 spawn EPERM 阻塞，获准执行后原测试通过，失败记录保留。没有执行原生 GUI、Rust新测试或重新打包 NSIS；下文33项全套与安装包是此前交付证据，不代表工具接入后的全套／桌面回归。验收42行与原有状态不变，CI尚未在远端运行。

## 分阶段交付

下表为原PRD的阶段交付基线；上述渲染扩展和最新验证补充它，原A01–A42的33通过／5未完整验证／4环境阻塞状态不变。

| 阶段             | 当前实现与运行证据                                                                                                                                                              | 剩余验收                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1 工程基础       | 五包工作区与公开边界、三项官方固定版本 Skills 实装与实际读取、shadcn 共享组件、双语及三态主题、单原生 Three Canvas；严格类型／边界／token／生成一致性检查通过                   | macOS 初始化与系统主题实际切换未执行                                                                                   |
| 2 首条完整功能链 | 真实鼠标两段 L 墙、门放置移动、实体洞口、A/B 独立图片、非整周期连续 UV、尺寸改动及撤销、独立快照 GLB 和每门 Open/Close；独立加载及 Validator 通过                               | 最终运行时修订的原生整链回归未执行                                                                                     |
| 3 建筑编辑       | 墙端点、厚矩形楼板及角点、门窗、楼层、显式封板、表面／连续组材质、数值草稿、吸附／输入路由／预览事务及撤销重做已实施                                                            | 窗拖动相机矩阵缺陷已修复；墙端点属性／鼠标对比、板上下材质和跨层命中全部通过最终浏览器回归。原生完整路径待补验         |
| 4 工程与导出     | Rust 二进制 IPC、便携资源 ZIP 容器、严格版本校验、原子保存／打开／另存为、设置分离；Rust14项、TS↔Rust互通、原生中文路径文件流程及门动画产物通过；两套可编辑示例和 GLB 已生成    | 真实磁盘满、部分原生失败弹层与 macOS 迁移尚未验证                                                                      |
| 5 审查与交付     | Impeccable实际context／detect与组合审查、生产样式／双语／双主题、71项单元／集成、33项最终端到端、20次GPU循环、50次大型工程循环及5导出已执行；最终Windows优化release与NSIS已构建 | 33项验收通过、5项已实现未完整验证、4项环境阻塞。安装／release宿主启动、原生关闭／系统主题、macOS、外部初心者测试未验证 |

阶段划分未限制开发范围；没有空面板、假数据按钮或固定模型替代编辑能力。完整状态逐行见 ACCEPTANCE.md；命令、原始测量和失败记录见 TEST-RESULTS.md、各 validation JSON 与 test-results。

## 已确认与实现决定

Q2 用户确认：允许指定收口，保持纹理实际尺寸。UI 显示收口与 T 形实际可见边界走向，不宣称非整周期闭环处处无条件无缝。Q5 最低系统／CPU架构／参考设备仍待用户确定；软件 WebGL 的性能实测不是正式达标结果。

普通实现决定：米、Y 向上、稳定 A/B 表面身份；版本1 ZIP .building，PNG/JPEG资源内嵌和SHA256去重；公开输出 GLB；命令与局部变更集；纯 TypeScript 几何，基准未证明加速必要性前不用 Worker/WASM。JSON glTF 生成器单独校验但不增加多文件菜单。

## 已修复的真实缺陷

核心错误码漏译和 shadcn 默认阴影颜色已修复并完整回归。L 形墙加门在2.7m改长时的 EPS 微小切片会产生退化三角形，已修复并保留几何回归。连续材质初次组操作、重复收口组、删除／撤销后的楼层会话、门并发动画、显示 clones 生命周期、图片 CPU 缓存删除与同ID替换已修复，各有对应真实操作或资源断言。

首次Rust release构建发生Windows文件共享错误，降低Cargo并发到2后完成，未关闭类型检查或删测试。原生驱动保留4次失败及原因，最终19个case通过；这些采自最终运行时修订前。浏览器整组曾14通过／1窗拖动失败，保留截图／trace，定位为相机矩阵未及时同步，旧代码确定复现1524px偏差；产品修复后同路径连续5次及当时21项整组均通过。保存期间继续编辑的真实UI竞态也已修复，旧保存不会放行New/Open/Close丢弃新数据。

最后UI审查将原生title替换为可双主题核验的共享Tooltip；真实关闭Settings发现受控Dialog焦点丢失，已在共享组件中修复并回归。新增连接实体／多视角截图、完整门编辑恢复、图片晚到／主题实际渲染、损坏文件实际打开和5项双语双主题UI状态。最终33项／16文件全部通过，耗时250.26秒，0跳过／失败／flaky；原21项报告单独保存，没有覆盖旧失败记录。最终NSIS也包含Tooltip及焦点修复，文件哈希已重新计算。

## 继续工作约束

从本文件、ACCEPTANCE.md、RENDERING.md、KNOWN-ISSUES.md恢复。用户物理Escape已停止原生Computer Use，本轮不继续原生GUI。CLI、源码和浏览器验证可以继续；浏览器结果不填补原生或macOS缺口。WebGPU修复最新完整证据以webgpu-fix-validation.json和webgpu-fix-release-artifacts.json为准；上一轮123／39／Rust18及包含Dialog resize修复的NSIS为历史证据。剩余工作见矩阵和KNOWN-ISSUES，源码改变后应重跑对应验证并重建产物。其他71／33／14报告与此前release哈希继续保留。

自动审批拒绝临时上游 .agents/impeccable-source 目录的递归清理，返回原因是策略阻止。目录保留并由 .gitignore 忽略；不绕过拒绝，不影响软件运行。Skills 实际安装文件和许可证完整保留。
