# 实际执行记录

## 双主题、窗口尺寸与提交前验证（2026-10-04）

当前用户要求仅亮／暗直接切换和1600×900启动窗口，覆盖原系统跟随条件，原始验收行与历史报告保留。已核对前次任务的31项主题专项、12项窗口布局全部通过和Windows优化程序／NSIS构建成功；缺失汇总补齐为theme-toggle-validation.json，内含原始报告路径、产物长度与SHA256。

提交前check、四套严格类型、164项／17文件单元集成、Rust20项及生产构建通过；独立生产浏览器4组通过，实际GLB零错误／零警告、四个门动画片段。完整浏览器53／53通过（455.019秒）、实际WebGPU4／4通过（28.352秒），均0失败／跳过／flaky。正常GPU错误0，故障注入11条错误为预期负向证据；三次退出geometry4／textures4一致，50大型工程循环与5导出通过。报告及日志独立保存在test-results/commit-preflight/browser-20261004；为保留历史证据，测试副本只调整输出／相对导入路径，原断言及测试SHA256保持。

新增Git换行规则后，独立暂存检出的架构／token／生成CSS／固定Skills哈希检查通过。此处限于浏览器、模拟IPC、纯数据、构建及静态校验；未启动新原生宿主、安装程序或macOS。

## WebGPU sampler 修复最终结果（2026-10-04）

实际RTX4070 SUPER／完整Chromium无界面WebGPU的4项回归全部通过，30.470秒，0跳过／失败／flaky。默认、PNG／JPEG环境均完成16采样；实际PNG970×718、849种RGB；正常路径GPU验证错误0。真实缺失sampler的故障注入产生9条预期GPU错误，首条可见原因保留，停止采样、重试16及继续编辑通过。三次正常退出geometry4／textures4稳定；该计数不代表VRAM字节峰值。

| 实际命令／专项                                                                                                                                                           | 结果                           | 证据与范围                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                                                                                          | 验证通过                       | 格式、oxlint零警告、架构／公开导出／token／生成／Skills；test-results/webgpu-sampler/check-release-verified.log                                 |
| `npm run typecheck`                                                                                                                                                      | 验证通过                       | 四套严格TS；typecheck-release-verified.log                                                                                                      |
| `npm test`                                                                                                                                                               | 156／156、17文件通过           | 含实际NodeBuilder5、环境9、runtime24及PathSession12；unit-release-verified.json，GPU分配边界的模拟不冒充硬件                                    |
| `npm run test:webgpu`                                                                                                                                                    | 4／4通过                       | hardware-release-verified：实际GPU采样、PNG／JPEG、暂停继续、双backend切换、首错误／重试和三周期                                                |
| `npm run test:regression -- tests/rendering.browser.spec.ts tests/rendering-ui.browser.spec.ts tests/environment-pathtrace.browser.spec.ts tests/header.browser.spec.ts` | 14／14通过、0跳过／失败／flaky | 最终runtime修订后真实鼠标、文件、GLB、双语／双主题、WebGL光追；regression-release-verified.log；软件WebGL浏览器范围                             |
| `npm run test:rust`                                                                                                                                                      | 18／18通过                     | 本轮rust.log；实际Rust宿主测试，没有启动GUI                                                                                                     |
| `npm run build`                                                                                                                                                          | 验证通过                       | build-release-verified.log；保留chunk大小警告                                                                                                   |
| `node .test-artifacts/webgpu-production-smoke.mjs`                                                                                                                       | 4组通过                        | 编译后的真实页面、无DEV探针、单Canvas、双主题双语／焦点、参数编辑、实际GLB Validator零错误／零警告、两门4动画；production/production-smoke.json |
| `CARGO_BUILD_JOBS=2 npm run tauri -- build --bundles nsis`                                                                                                               | 验证通过                       | Windows x64优化release／NSIS，release-build.log；安装包2451155字节，NotSigned；没有安装／启动release宿主                                        |

汇总、源文件SHA、原始报告路径与平台限制见 [webgpu-fix-validation.json](webgpu-fix-validation.json)，产物SHA与锁文件／原PRD校验见 [webgpu-fix-release-artifacts.json](webgpu-fix-release-artifacts.json)。普通回归与硬件套件顺序拥有1421独立服务器／缓存、关闭HMR与watch，1420用户开发服务器未停止；用户确认并行UI任务，其修改保留。

修复前sampler遗漏、默认headless-shell的DXIL Error87、每周期3张／2张纹理增长、Tooltip阻挡选择和并行UI HMR中断均保留，早期已通过报告也单独归档。旧33／39等整组为历史证据；本轮是14项相关完整路径，不声称重新执行整个PRD。未继续原生GUI、系统安装、真实device-loss或macOS，原A01–A42平台状态保持。

日期：2026-10-03。Windows 11 10.0.26200 x64，AMD Ryzen 7 7800X3D、32GB内存，Node26.1.0／npm12.2.0／Rust1.92.0。仅记录实际命令结果；浏览器、debug桌面、生产资源、release构建、系统安装分别列出。

## npm ci 文件占用恢复（2026-10-03）

用户执行 `npm ci` 时，删除 `lightningcss.win32-x64-msvc.node` 返回 EPERM。实际进程模块检查确认本项目 Vite（PID 38060，命令含 `D:\Code\builder\node_modules\vite\bin\vite.js` 和 `apps/desktop/vite.config.ts`）已加载该文件；目标文件非只读且 ACL 含修改权限。仅停止该 Vite 进程后，使用现有 npm 12.2.0 执行 `npm ci` 成功，安装 463 包、审计 469 包。

重装前后 `package-lock.json` SHA256 均为 `CAE454653A1273678DC880D5D2F64A1150EC36D8213FDFFFA6555150653E73FA`。`npm run check`、`npm test`（71/71）、`npm run build` 均通过。现有生产冒烟脚本仅改输出路径后运行，4组通过，实际下载 GLB 的 Validator 错误／警告均为0、含两门4个开关片段；新证据单独保存在 [恢复验证目录](../test-results/npm-ci-recovery-20261003/production-smoke.json)，未覆盖此前测试报告与截图。

安装仍报告7项 high 审计告警及 esbuild postinstall 未获 allowScripts 放行；构建保留原有 chunk 大小告警。未修改依赖版本、脚本授权或执行 `npm audit fix --force`。本次没有产品源码或 Rust 改动，验证属于依赖恢复与 Chromium 生产页面冒烟，不补充 Tauri 原生、安装或 macOS 验收。

| 实际命令／专项                                                 | 结果                                                                          | 范围                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                | 通过                                                                          | workspace依赖／公开导出、颜色字面量／生成shadcn阴影、双主题token键／生成一致性、Skills标识／固定主文件SHA256                                                                                                                                  |
| `npm test`                                                     | 最终71/71通过，14:46在Tooltip／Dialog焦点修复后重新执行                       | core38、topology组合3、geometry8、export5、容器5、UI合约12；UI测试实际构建生产CSS，没有复用旧dist                                                                                                                                             |
| `npm run --workspace @building/editor-core typecheck`          | 通过                                                                          | ES2022无DOM／无Node ambient types，strict                                                                                                                                                                                                     |
| `npx tsc --noEmit -p packages/building-geometry/tsconfig.json` | 通过                                                                          | 同样独立无DOM；无React／Three／Tauri／UI依赖                                                                                                                                                                                                  |
| `npx tsc --noEmit -p tsconfig.node.json`                       | 通过                                                                          | 根配置委托正式应用Vite配置，去掉旧模板类型忽略，不保留失效第二套配置                                                                                                                                                                          |
| `npm run test:rust`                                            | 14/14通过（最终重新运行）                                                     | 图片／ZIP／未知版本字段／迁移／错误／设置分离／raw二进制／原子覆盖、真实Windows只读目标保持旧文件                                                                                                                                             |
| `npx tsx tests/native-container.ts`                            | 通过（最终重新运行）                                                          | 浏览器ZIP→Rust解码→RustZIP→浏览器解码，全文参数、图片字节、schema一致                                                                                                                                                                         |
| `tests/editor.spec.ts`                                         | 4项通过                                                                       | 真鼠标L墙／门／板／封板、单次拖动历史与取消、真实导入／保存／删源图／迁移／重开／GLB、主题／双语／输入／idle                                                                                                                                  |
| `tests/materials.browser.spec.ts`                              | 2项通过                                                                       | 用户指定非整周期收口／移动收口／保持物理尺寸，连续材质4面batch并单次撤销，整层删除准确影响／取消／Undo                                                                                                                                        |
| `tests/runtime.browser.spec.ts`                                | 5项通过                                                                       | 20轮创建删除／选择／主题／项目替换资源释放；楼板角点、非法门预览；相机暂挂工具／主题保相机；两门并发；真实窗放置／尺寸／移动／删除恢复及导出实际洞口                                                                                          |
| `tests/door-roundtrip.browser.spec.ts`                         | 1项通过                                                                       | 同一45°门Save文件→Open重开→真实拖动→改铰链／方向→保存／导出，独立加载新支点及4动画，各0/50/100%稳定、不改其他门／工程                                                                                                                         |
| `tests/wall-roundtrip.browser.spec.ts`                         | 1项通过                                                                       | 同一真实鼠标L墙和门，属性／端点拖动3.2m的实际GLB几何及连续UV fingerprint相同，预览不落工程／历史，release仅一条历史，Undo／Esc恢复；4实际GLB独立加载与Validator零错误零警告                                                                   |
| `tests/slab-floor.browser.spec.ts`                             | 2项通过                                                                       | 真鼠标厚楼板上下独立材质、独立加载单闭合实体／厚度／纯色侧面；ghost墙板门窗选择、材质、放置及off-grid端点／角点吸附全部排除，实际render透明及current positive control                                                                         |
| `tests/snapshot.browser.spec.ts`                               | 2项通过                                                                       | 真UI Save后继续编辑：实际ZIP捕获旧版本、当前新版本仍dirty、New不能丢弃；真实GLB编码期间改参数，独立加载保持捕获几何。延迟hash／canvas平台工作确定性复现竞态，不伪造命令或文件                                                                 |
| `tests/resources.browser.spec.ts`                              | 1项通过                                                                       | 20次实际PNG解码／GPU像素绘制，删除资源及同ID图片替换CPU缓存释放；旧GPU租约只在引用结束释放，旧texture恰好dispose一次                                                                                                                          |
| `tests/async-theme.browser.spec.ts`                            | 2项通过                                                                       | 真图片load晚到期间UI新建，旧缓存／模型／帧不回流；实际Scene渲染采集建筑材质及贴图UUID、灯光／曝光不变，网格／轴／描边／面／铰链／吸附／预览匹配主题token                                                                                      |
| `tests/connections.browser.spec.ts`                            | 3项通过                                                                       | 真鼠标直线／L／T，各实际GLB独立加载核对闭合实体、体积、边界射线、无内部端盖／重叠／退化面，Validator0错误0警告；每种3次真相机旋转截图审查                                                                                                     |
| `tests/door-edit.browser.spec.ts`                              | 1项通过                                                                       | 真鼠标放门、UI改宽高、移动、直接删门、一次Undo；7个实际GLB核对洞口面积及边界、删除恢复原墙、Undo恢复门与孔并独立播放动画                                                                                                                      |
| `tests/file-failure.browser.spec.ts`                           | 1项通过                                                                       | 保存有效ZIP后真实文件选择截断／未知版本／图片损坏文件，错误可见、当前工程／saved状态／好文件SHA256不变，好文件Open恢复                                                                                                                        |
| `tests/ui-states.browser.spec.ts`                              | 5项通过                                                                       | 英中×亮暗4组合真实Tooltip／箭头／菜单／Dialog／错误／提示／disabled／focus、900×600；Settings关闭恢复焦点，system media保持数值草稿／焦点／相机／选择                                                                                         |
| `tests/export.browser.spec.ts`                                 | 1项通过                                                                       | 真实图片嵌入、A/B像素不同／纯色厚度、非整周期内外角UV、静态45°与完整开关、主题语义不变、Validator0错误0警告                                                                                                                                   |
| `tests/export-samples.spec.ts`                                 | 1项通过                                                                       | 两层两门不同铰链／方向、有封板／无封板两个工程及GLB；每个clip独立0/50/100%；单位／玻璃／资源，Validator0错误0警告                                                                                                                             |
| `tests/performance.browser.spec.ts`                            | 1项通过；**性能目标未判通过**                                                 | 正式3层100墙60门窗24板20独立2KPNG，1920×1080渲染，真实Open、相机、50编辑／删除／撤销／切层循环、5实际下载GLB／Validator0错误0警告                                                                                                             |
| `node scripts/production-smoke.mjs`                            | 4组检查通过                                                                   | 实际编译资产、无DEVinstrument、单Canvas、双语双主题／Portal、900×600无横溢、参数编辑与实际GLB下载／Validator0错误0警告；**不是release Tauri启动**                                                                                             |
| Windows原生WebDriver／OS对话框                                 | 19个finalCases通过                                                            | 真实debug Tauri／WebView2；保留4原始失败及重试。完整流程／scope见WINDOWS-NATIVE.md。Computer Use停止后没有继续原生UI动作                                                                                                                      |
| `npm run build`                                                | strict检查／TS／Vite通过                                                      | 最终主JS1113.93KB／316.97KB gzip，CSS43.66KB；chunkwarning保留，未关闭类型检查                                                                                                                                                                |
| `npm run tauri -- build --bundles nsis`                        | 第一次环境文件共享失败；`CARGO_BUILD_JOBS=2`成功；最终源码14:45–14:50构建完成 | Rustrelease优化编译，真实x64可执行文件与NSIS生成；官方NSIS下载／哈希检查由Tauri执行。包含资源缓存／相机／保存竞态以及最后Tooltip／Dialog焦点修复，最终exe5599744B、installer2004932B；SHA256见release-artifacts.json，未安装／启动release宿主 |
| `npm audit --omit=dev --json`                                  | 0条                                                                           | 完整dev审计仍有shadcn工具链7条high，记录KNOWN-ISSUES，无force降级                                                                                                                                                                             |

## 导出与资源证据

`docs/export-validation.json` 保存两套示例、独立加载器与所有门动画采样。`docs/door-roundtrip-validation.json` 保存实际用户文件链和新支点；`tests/artifacts/native/independent-load.json` 是读取实际native写盘GLB的独立加载。纯色primitive保留无用途UV会产生Validator UNUSED_OBJECT information，已解释；这些不是error或warning。

`docs/runtime-validation.json` 记录20次空工程→实例→删除／替换后，geometry3、texture1稳定，其中texture仅Three0.186.1内部16×16DFG_LUT；工程pool材料／图片／引用为0。StrictMode实际created2／disposed1／active1，事件监听8，idle不增帧。不是把“剩1图片”当作无泄漏：测试审计了实际texture身份。

大型GPU循环固定geometry400／texture21（工程20＋内部DFG1），pool28材质／20工程图片／716引用，50轮和5导出都保持完全相同；8监听、单active runtime、RendererID不变。计数不等于VRAM字节或操作系统总内存。

## 性能实测及限制

NodeCPU基准 `npm run bench`：3层100墙60门窗24板20独立2048PNG，10预热＋50采样；最后核心提交P95约3.73ms，受影响4墙的拓扑／几何P95约111.10ms、合计约113.25ms。详情 `docs/benchmark-core.json`。没有GPU／IPC／文件IO测量。

浏览器实际版本为153.0.8010.12（来自原始JSON），采用ANGLE SwiftShader软件WebGL，实际Canvas像素1920×1080，CSS实际尺寸另记。`docs/benchmark-browser.json`：冷Open单次3382.4ms；50次Enter提交到首个渲染帧平均292.15ms／P95329.7ms；99个真实相机观察间隔平均52.86ms／P9566.7ms，观察18.92fps，包含15ms请求等待和Playwright协议开销；5次导出平均1426.9ms／P951627.6ms。50循环／5导出约2.2分钟完成，0页面异常、资源计数稳定。

这些结果**不能宣称达到PRD建议性能目标**：软件WebGL不是参考原生GPU；Q5硬件／正式门槛尚未确认。GPU计数循环通过与FPS／响应达标是两个结论。截图、实际大型工程与5GLB在test-results/performance，原始测量JSON随仓库保留；最终此次大型工程／GLB产物在test-results/final-delivery。

## 平台与产物

release exe／NSIS绝对路径、大小、SHA256和签名状态在 `docs/release-artifacts.json`。构建成功不等于安装／release启动通过。当前安装包未签名，未操作系统安装／卸载；物理Escape停止后不继续Computer Use。macOS无运行环境，全部原生／安装／跨平台迁移保持环境阻塞，步骤见README及KNOWN-ISSUES。

## 最终汇总

最终源码的 `npm run test:e2e -- --output test-results/final-delivery`：33项／16文件全部通过，耗时250.26秒，0跳过、0unexpected、0flaky（JSON保存于test-results/e2e-results.json；此前21项报告保存在e2e-21-before-ui-focus.json）。71项单元／集成、全部严格TS与包边界、Rust14项和容器互通均通过；实际生产资源4组检查及最后优化release／NSIS构建通过，SHA256已刷新。A01–A42原始通过条件校验通过，33项验证通过、5项已实现未完整验证、4项双平台环境阻塞，Q5单独待确认。

没有删除失败测试或关闭严格检查。保留首次L＋洞口EPS退化几何、漏译／默认阴影、native驱动4次失败、相机投影1524px旧代码复现、保存竞态、真实Dialog焦点缺陷以及新增测试器标签／观察hook／色彩转换／鼠标轨迹修正记录。最终窗投影修复先确定性验证5次，Dialog修复后5项专项再跑上述33项整组；未配置retry或添加sleep掩盖。

实际产物与源代码范围须分别理解：Windows真实debug宿主19个finalCases采自最后运行时修订前；最终UI／资源／相机／保存竞态经浏览器和生产资源验证，未补原生完整回归。NSIS生成成功但未安装、未启动release宿主。macOS、系统主题／关闭部分原生流程、外部初心者任务及正式硬件性能仍未完成，详见验收表与KNOWN-ISSUES。

## oxfmt／oxlint 接入验证（2026-10-03）

这次用户要求新增工具与企业开源规范，选用 Google TypeScript Style Guide 的项目适配版。oxfmt 0.71.0／oxlint 1.86.0精确锁定，移除直接Prettier及旧配置。首次589条诊断以控制流花括号／类型导入为主，保留初始诊断和81个原始维护源文件快照；安全自动修复引出的TypedArray.map类型错误由严格tsc捕获后修正，没有修改原测试断言。

| 命令／检查                           | 实际结果              | 范围与证据                                                                                                                           |
| ------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run format:check`               | 通过                  | oxfmt检查120个维护文件；原文PRD／验收条件、固定Skills、生成CSS及历史产物精确排除                                                     |
| `npm run lint`                       | 0错误、0警告          | 82个源码／测试／脚本文件，177规则；`test-results/code-quality/final-lint.json`                                                       |
| 临时lint门禁探针                     | 非零退出1，符合预期   | 松散比较报错、未使用禁用注释报警；探针随后移除，原输出`lint-gate-probe.txt`                                                          |
| `npm run check`／`npm run typecheck` | 通过                  | 新格式＋lint入口、原架构／token／Skills检查；workspace／Node／纯core／geometry四套严格tsc                                            |
| `npm test`                           | 71／71、6文件通过     | 同样的core／geometry／UI／export／container断言，未降低标准                                                                          |
| `npm run build`                      | 通过                  | Vite8.0.16生产资产；主JS1114.01KB／317.01KB gzip，CSS43.66KB；保留大chunk警告                                                        |
| 四组相关Playwright文件               | 14／14通过，约1.3分钟 | `ui-states`5、`runtime`5、`snapshot`2、`async-theme`2；真实鼠标／键盘、20次GPU循环、两门动画、保存／导出竞态、旧图片晚到及双语双主题 |
| `node scripts/production-smoke.mjs`  | 4组通过               | 实际新编译资产、单Canvas、900×600／Portal、真实编辑与下载120120B GLB；4段门动画，Validator0错误0警告                                 |
| 原生脚本字符串与语法                 | 通过                  | 除移除未用css声明，287／287保留字符串和模板片段cooked值完全不变；未执行原生GUI                                                       |

浏览器命令为 `node node_modules/@playwright/test/cli.js test tests/ui-states.browser.spec.ts tests/runtime.browser.spec.ts tests/snapshot.browser.spec.ts tests/async-theme.browser.spec.ts --output=test-results/code-quality/e2e-permitted --reporter=list`。默认沙箱首次执行因Chromium `spawn EPERM`无法启动；保留`test-results/code-quality/e2e`，获准执行同一测试后通过，不配置跳过／重试或降低断言。CLI和npm命令使用本机Node运行已安装npm CLI以绕过损坏的全局npm.ps1入口；没有更改用户全局npm配置。npm的allow-scripts环境警告不属于lint诊断。

完整本次记录在`docs/code-quality-validation.json`，源文件基线／原始诊断／字符串比较在`test-results/code-quality`。上面的33项全套、Rust14项、Windows原生19项和NSIS哈希是此前交付范围；本次仅新增相关14项与生产4组，没有重跑全套／Rust或重新构建安装包。旧生产报告／截图先复制到`test-results/code-quality/previous-production`，然后真实重测更新当前报告。GitHub Actions Windows质量流程已添加，尚未有远端运行证据。

## 渲染扩展最终验证（2026-10-03–04）

本节为新增WebGL／WebGPU切换、BVH拾取、渐进光追、工程环境全景和PNG输出的最新范围，补充以上历史结果。用户确认环境随工程携带；后端偏好仍在本机。原A01–A42场景／条件和33通过／5未完整验证／4环境阻塞不修改，新R01–R09矩阵见RENDERING.md。

| 实际命令／检查                                                                          | 结果                                                                                 | 证据与范围                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                                                                        | 15文件／123项通过；4套strict TS、格式、零警告lint、边界／token／Skills和生产构建通过 | `test-results/rendering-final-verify.log`；UI合约实际生成生产CSS，无DOM core／geometry单独检查，没有TS忽略或放宽规则                                                                                                                                                                                       |
| `npm run test:rust`                                                                     | 18通过、0失败／忽略                                                                  | `test-results/rendering-rust-final.log`；新增环境HDR／EXR携带、PNG二进制与失败保持旧文件、backend偏好迁移／分离；不是系统对话框GUI测试                                                                                                                                                                     |
| `npx tsx tests/environment-container.ts`                                                | 通过                                                                                 | `test-results/rendering-environment-container-final.log`、`.test-artifacts/environment-interoperability/result.json`；实际Windows文件删除原HDR／EXR、移动含中文路径工程、TS ZIP→Rust解码→Rust ZIP→TS解码，字节及正式环境参数一致                                                                           |
| `npx playwright test --reporter=list,json --output=test-results/rendering-owned-server` | 39/39，335.541秒，0跳过／unexpected／flaky                                           | `test-results/rendering-owned-server-e2e.json`／`.log`；`DEBUG=pw:webserver`实际记录Playwright启动、持有和结束Vite；全部原33项加6项新功能真实路径，没有重试配置                                                                                                                                            |
| 实际HDR便携及输入／UI                                                                   | 通过                                                                                 | `rendering-environment-validation.json`、`rendering-ui-validation.json`、`rendering-errors-validation.json`、`rendering-startup-preference-validation.json`；真鼠标L墙／板／门、真实HDR文件选择、参数／四次Undo／Redo、保存删原图移目录重开，四种语言主题／焦点／Esc／900×600／modal错误／保存fallback重启 |
| 实际WebGL光追／PNG／释放                                                                | 三周期均16采样通过                                                                   | `docs/rendering-pathtrace-validation.json`：实际shader、暂停不增采样／继续、970×722 PNG／22859 RGB色／亮度80.67–248.33；退出geometry19、textures4各轮相同，光追Scene／会话／独立pool释放，辅助／显示override为0，工程未改                                                                                  |
| `node scripts/production-smoke.mjs`                                                     | 4组通过；实际GLB Validator错误／警告0                                                | `test-results/rendering-production-smoke.log`、`docs/production-smoke.json`；最终编译资产、无DEV探针、单Canvas、英中主题／900×600／真实参数编辑及下载；没有启动release Tauri宿主                                                                                                                           |
| `npm run bench:bvh`                                                                     | 完成；96射线结果全部等价，所有引用释放                                               | `docs/benchmark-bvh.json`；一面9692三角形、96真实窗洞墙，构树9.207ms；原生拾取每96射线均值36.141ms／P95 39.718ms，BVH0.165ms／P95 0.284ms；CPU压力场景，不判正式性能达标                                                                                                                                   |
| PRD大型工程最终回归                                                                     | 50循环／5下载GLB通过                                                                 | `docs/benchmark-browser.json`及`test-results/rendering-owned-server/performance*`；3层100墙60门窗24板20独立2K图，实际1920×1080 Canvas；GPUgeometry400／textures21稳定、各GLB Validator0／0。Q5未确认，软件GPU不能认定FPS达标                                                                               |
| WebGPU实际能力探测与回退                                                                | 不可用时真实回退／错误通过；成功WebGPU环境阻塞                                       | 三份`docs/webgpu*-capability.json`均有API但adapter=null；`rendering-backend-validation.json`核对原renderer／Scene／Camera／工程及可继续编辑／Undo，不把Three内部WebGL fallback称为WebGPU                                                                                                                   |
| `CARGO_BUILD_JOBS=2 npm run tauri -- build --bundles nsis`                              | 最终Windows优化release及NSIS构建成功                                                 | `test-results/rendering-release-build.log`、`docs/rendering-release-artifacts.json`；包含最后Dialog resize修复，exe6497280B、NSIS2448689B，SHA256实测，未签名／未安装／未启动release                                                                                                                       |

新增单元／集成覆盖环境命令和历史、真实格式／尺寸／资源校验、decoder、BVH距离／UV／面身份与共享释放、光追适配和异步所有权、实际runtime方法调度、偏好串行快照／flush／关闭失败后恢复重试。其中9项偏好测试调用真实关闭保护注册，但host为模拟Tauri窗口；不声称真实标题栏关闭已验。

首轮整组`test-results/rendering-final-e2e.json`有23通过／16失败，光追三周期已通过，随后所有剩余测试`page.goto`因外部复用Vite退出报ERR_CONNECTION_REFUSED；原日志／trace保留，最终改由测试自己启动服务运行同一39项及断言。更早保留真实texture2→3泄漏、异步dynamic依赖重优化刷新未保存工程、开发中HMR中断、三轮设置Tab／Esc／resize失败，修复后全组通过。没有删测试、降低采样16、放宽资源相等、隐藏报错或设置retry。

WebGL库上游的legacy、Clock、maxLeafTris、Source弃用及软件GPU无并行shader扩展提示原样留在日志，区别于oxlint自身零警告要求。最终主JS1005.15KB／290.78KB gzip，CSS44.47KB／9.03KB gzip；WebGPU688.06KB／191.81KB gzip，HDR／EXR／光追按需chunk加载。Vite大chunk警告保留，未升阈值或虚报所有包体积小。

`examples/rendering`提供首轮成功光追case的匹配工程、GLB与16采样PNG，固定验证报告副本、原始来源和SHA清单随附；后一次随机采样PNG与它分别核对，不把它错误绑定到最新随机PNG。旧PRD产物／原NSIS已存`.test-artifacts/rendering-before-release`，旧生产报告／截图存`.test-artifacts/rendering-before-production`；渲染最终产物哈希是独立新报告，没有用旧安装包冒充新源码。

完整验证汇总为`docs/rendering-validation.json`。本次未操作用户停止的原生GUI，Windows新渲染系统对话框／原生关闭、真实WebGPU渲染／设备丢失、硬件收敛质量／性能、macOS和外部初心者任务保持未验证或环境阻塞。构建、浏览器和原生验收分别记录。
