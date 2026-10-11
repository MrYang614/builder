# 渲染扩展

用户请求（2026-10-03）：实际切换 WebGL／WebGPU、接入 three-mesh-bvh 优化拾取、使用 three-gpu-pathtracer 光追，以及设置环境贴图。用户已确认环境贴图随工程携带；PNG输出按已说明的推荐方案实施。

2026-10-04修复补充：真实RTX4070 SUPER／完整Chromium已通过4项WebGPU硬件回归，默认与PNG／JPEG环境16采样、暂停继续、PNG像素、三次会话资源稳定、双backend切换及真实着色器错误后的重试／编辑均有实际证据。根因和当前结果见 [WEBGPU-FIX.md](WEBGPU-FIX.md)、[webgpu-fix-validation.json](webgpu-fix-validation.json)。下文123项／39项及软件GPU无adapter是上一轮历史证据；本轮不将浏览器硬件验证补作Tauri或macOS验收。

## 实施及验收追踪

| 编号 | 要求                                                           | 实现                                                                        | 测试／证据                                                                                                                                      | 状态         |
| ---- | -------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| R01  | 实际 WebGL／WebGPU 切换，明确能力失败，不丢工程、相机和选择    | three-runtime/renderer.ts、runtime.ts；RenderingSettings、HeaderPreferences | rendering.browser.spec.ts及webgpu.hardware.ts；失败保留WebGL；实际NVIDIA设备WebGL↔WebGPU通过，原Scene／Camera／工程保持、单Canvas；原生宿主待验 | 已实现未验证 |
| R02  | 后端偏好为本机设置，重启恢复；主题／语言不切换 renderer        | main.tsx、app/preferences.ts、platform、Rust settings；ViewportHost         | 设置迁移、9项串行写入／关闭回调测试；真实浏览器保存fallback并reload通过；原生标题栏关闭待补验                                                   | 已实现未验证 |
| R03  | BVH加速真实拾取、面身份不变、共享所有权与释放                  | bvh.ts、scene.ts；runtime firstHitOnly                                      | bvh.test.ts 6项、相关geometry／topology／export共22项；benchmark-bvh.json真实9692三角形96射线等价与释放                                         | 验证通过     |
| R04  | 两后端渐进光追、采样目标、暂停／继续、相机／编辑复位           | pathtracing.ts、runtime.ts、environment.ts                                  | pathtracing12／runtime24单元、真实NodeBuilder5项；WebGL与真实WebGPU16采样、PNG／JPEG、暂停继续／三周期通过；原生宿主待验                        | 已实现未验证 |
| R05  | 光追干净版本快照排除网格／选中／其他层半透明，编辑使用实时预览 | buildBuilding共享builder、runtime 独立Scene                                 | rendering-pathtrace-validation.json实际干净场景、辅助0、display override0、PNG像素与工程未改；WebGL范围                                         | 验证通过     |
| R06  | HDR／EXR／PNG／JPEG环境，强度／旋转／背景，撤销重做            | editor-core/environment.ts、three-runtime/environment.ts、RenderingSettings | core／导入／decoder单元及Rust校验；实际HDR导入、参数、4次Undo／Redo、损坏文件与双语modal错误                                                    | 验证通过     |
| R07  | 环境随工程保存、校验和、旧v1兼容、跨目录／原图删除后打开       | environment-resources ZIP、Rust／TS container                               | environment-container.ts真实HDR／EXR删原图迁移TS↔Rust；浏览器HDR保存、删图、移动目录、重开通过                                                  | 验证通过     |
| R08  | PNG实际输出，无辅助；GLB不被渲染器／环境状态污染               | capturePNG、savePNG／save_render_png；原GLB builder                         | 最终实际970×722 PNG的22859颜色；实际GLB独立GLTFLoader含门2动画、无环境／背景，Validator错误／警告0；原生PNG对话框待补验                         | 验证通过     |
| R09  | 重复切换／光追退出／设备丢失／异步旧结果释放，严格质量门禁     | renderer／path／环境请求序号与资源所有权                                    | WebGL三周期及既有50循环；WebGPU三次退出geometry4／textures4、真实shader错误后重试／继续编辑通过；156单元／4套TS；真实device-loss待验            | 已实现未验证 |

本表补充PRD原始A01–A42，不修改其场景、条件和平台状态。浏览器WebGPU实测、能力失败回退、Tauri实际宿主和macOS分别记录，不互相替代。

## 用户操作

设置中选择实时渲染器。默认WebGL；WebGPU仅在初始化后的真实backend为WebGPU时显示成功，失败保留原渲染器。WebGL与WebGPU上下文不能复用同一canvas，因此显式切换只替换renderer和主canvas；Scene、Camera、EditorCore、会话及命令历史保持。任意时刻只有一个挂载的主canvas，主题或语言切换不会重建它。

导入等距柱状全景（通常宽高2:1），设置环境强度0–10、Y轴旋转0–360°，可选择显示为背景。贴图独立于墙板材质，HDR／EXR不能用于墙板；单文件64MiB、单边8192像素、总像素32Mi、工程总限256MiB。背景与光照是工程数据，主题不会替换它们。清除环境保留资源以便再次选择；从工程删除贴图与解除引用合为一条可撤销命令。

开始光追后按目标采样累计，支持暂停、继续和保存当前PNG。光追显示整栋正式建筑及当前门姿态，排除编辑辅助与ghost材质。编辑草稿／相机操作期间显示实时画面，正式编辑完成后重新生成一致快照并累计；每次鼠标移动不提交工程，不做React／IPC帧更新。PNG按当前视口尺寸导出，不声称提供离线超分辨率或降噪。

GLB继续输出建筑及门动画；glTF标准工程导出不包含全景环境光照。需要恢复同一渲染环境应保存`.building`，需要展示画面应保存PNG。

## 依赖与实现决定

锁定three-mesh-bvh 0.9.15、three-gpu-pathtracer 0.0.26（MIT），满足已安装Three0.186.1的peer要求。发布包根入口保留WebGLPathTracer，`/webgpu`提供真正WebGPUPathTracer；不能把Three自动WebGL fallback标成WebGPU。官方参考：[BVH](https://github.com/gkjohnson/three-mesh-bvh)、[pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)、[WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)。

BVH实例级raycast，不改全局原型；indirect模式保持索引、group和face身份，导出默认不构树。实时编辑按ChangeSet局部重建，光追库的全场景合并BVH使用独立正式快照，200ms合并频繁修改，陈旧构建不覆盖新版本；当前采用同步TypeScript构建，不引入Worker/WASM。环境数据与纹理同样有请求版本与显式释放。

`npm run bench:bvh` 实测一面有96个真实窗洞的墙，9692三角形，96条射线中72命中、24未命中；10轮预热后100轮交替测量。每批原生拾取平均36.141ms／P95 39.718ms，BVH平均0.165ms／P95 0.284ms；额外构树9.207ms。96条射线逐项比较距离、世界坐标、UV、法线、三角形及材质身份一致，最后共享引用为0、构树和释放各1次。原始记录见 [benchmark-bvh.json](benchmark-bvh.json)。这是CPU压力场景的观察结果，不代替普通墙、多对象遍历、原生GPU帧率或Q5正式性能验收；Windows CPU计数分辨率不足以把报告中的0解释为没有成本。

光追与WebGPU包按需加载。samples状态最多每500ms提交一次UI，采样循环归runtime拥有并在暂停／完成／销毁后停止。WebGL启用preserveDrawingBuffer以保证实际PNG读取，额外缓冲保留的性能成本不伪称为提速；BVHCPU基准、软件GPU及正式硬件性能分别记录。锁定版本的legacyWebGLPathTracer释放适配补齐它未公开完整释放的派生target／纹理等所有者，包括纯色背景的GradientEquirectTexture；借入建筑材质与环境仍由本项目所有者管理。保留上游legacy弃用提示，不把它混同于oxlint诊断；质量门禁仍要求lint零警告。

本机设置写入按实际请求快照串行，原生关闭前等待最新偏好写入，失败阻止关闭，恢复IO后关闭可重新尝试；9项测试覆盖延迟、并发、失败和关闭回调。这些是集成测试，不声称已经点击真实标题栏验证。环境导入、异步解码、后端初始化和设备丢失都只接受当前请求版本；实际提交后的旧renderer清理失败不把新backend误报成未切换，清理错误可见。

## 上一轮验证范围（2026-10-03）

已完成15文件／123项单元及集成、4套严格类型、零警告lint、格式、架构／token／Skills检查、Rust18项、真实环境文件互通，以及Windows优化release和NSIS重新构建。包含最后Dialog resize修复的产物大小、SHA256与未签名状态见 [rendering-release-artifacts.json](rendering-release-artifacts.json)，没有安装或启动release宿主。

最终完整39项全部通过，335.541秒，0跳过／unexpected／flaky；使用Playwright自身启动和管理的Vite，启动与结束日志完整保存于test-results/rendering-owned-server-e2e.log，JSON为同目录rendering-owned-server-e2e.json。包括全部6项新增渲染路径、真实WebGL16采样／PNG／三周期和50轮大型工程／5导出。编译后的生产资源4组检查也通过，无DEV探针、单Canvas、双主题双语、真实参数编辑／GLB Validator错误警告0，不是原生启动验收。

首轮整组39项为23通过／16失败：外部复用开发服务器退出后余16项均ERR_CONNECTION_REFUSED，失败JSON／trace完整保留于test-results/rendering-final。更早的修复前真实失败、texture计数增长、HMR导致未保存工程丢失的测试中断与三轮UI失败均保留，没有删除测试、降低采样或启用retry制造通过。实际光追报告见 [rendering-pathtrace-validation.json](rendering-pathtrace-validation.json)，HDR便携及干净GLB见 [rendering-environment-validation.json](rendering-environment-validation.json)。

最终三轮均实际完成16采样，退出后geometry19／textures4完全相同，独立光追Scene、会话与资源池已释放；计数包含当前建筑、环境和Three内部预过滤资源，不宣称总GPU内存为0或已测VRAM字节。实际PNG有22859种RGB、亮度范围80.67–248.33，正常显示墙、门及厚板，16采样仍有噪声。可编辑样例见 [examples/rendering](../examples/rendering/README.md)，它保存首轮成功光追case的匹配工程／GLB／PNG及固定证据；与最终复测随机采样PNG分别核对SHA，不混用报告。

本机三种启动探测均有navigator.gpu但requestAdapter返回null，真实WebGPU成功切换、WebGPU光追及设备丢失保持环境阻塞。Windows／macOS原生新功能与PNG系统对话框、原生偏好关闭流程均未运行。浏览器软件GPU结果不替代原生宿主、参考硬件性能或macOS验收；历史33项／工具增量14项和旧产物记录继续保留。

## 支持设备的待补验步骤

在待确认的Windows／macOS参考设备上，使用锁定依赖构建并实际启动Tauri宿主，记录系统、GPU、驱动和WebView版本。打开examples/rendering中的工程，选择墙体并移动相机，先保存一份对照工程；在设置选择WebGPU，只有实际初始化成功且设置／状态显示WebGPU才算进入该backend。检查原选择、相机、环境和Undo仍可用，再保存另一份工程，核对正式project.json一致。

选择16采样并开始光追，确认达到目标、暂停不继续计数、继续有效，实际保存PNG；移动相机及修改墙尺寸后确认从新版本重新累计，撤销恢复数据。重复WebGL／WebGPU切换及光追开始／退出20次，记录可见错误、资源计数和进程内存；主题、语言与面板切换应保持backend／相机／建筑光照。WebGPU采样结果、硬件收敛质量与真实设备丢失需独立保存证据，不用当前mock或软件WebGL报告补填。

分别用实际系统文件对话框导入HDR／EXR、保存、另存为、删除原图、跨目录重开以及PNG输出；修改backend偏好后从标题栏关闭并重启，核对偏好恢复与失败保护。macOS增加Command、触控板、系统主题及Windows工程迁移。自动浏览器默认强制SwiftShader，补验硬件时须另用实际硬件环境，不直接把现有测试启动参数当成GPU性能配置。

## 本轮实时后处理与光追入口（2026-10-11）

Three.js 0.186.1 已提供 `GTAONode`、`SSAONode` 与 `TRAANode`。本项目采用 `GTAONode`：它需要独立 pre-pass 的深度与法线；`TRAANode` 需要 beauty/depth/velocity，因此 WebGPU 链路将这些输入放在独立 pre-pass 与 scene pass 中，避免 pass 自引用。WebGL 采用维护成本更低的 `GTAOPass` 与本项目的深度重投影 TAA。光追输出走独立 PathTraceSession，不把实时后处理冒充光追降噪。

实时后处理默认 GTAO 与 TAA 开启，GTAO 使用低分辨率 AO 和保守强度，TAA 在相机、场景、环境、DPR、尺寸和效果切换时丢弃历史。WebGPU 的 `TRAANode` 历史由节点管理并在突变时重置；WebGL TAA 使用 8 个 Halton 抖动样本、深度不连续拒绝和 YCoCg 邻域裁剪。`OutputPass` 保持在 WebGL 链路末端，避免灰度 AO 纹理直接成为最终颜色。

后处理入口位于视口主工具栏；设置面板只提供采样、效果开关和环境参数。真实浏览器证据见 `tests/postprocessing.browser.spec.ts` 及 `test-results/postprocessing/evidence.json`；支持 WebGPU 设备证据见 `tests/webgpu.hardware.ts`。本轮未以浏览器结果替代 Tauri 原生或 macOS 验收。

后处理相对观察固定在同一“可编辑示例”场景：初始 1440×900、DPR 1，随后 1100×700、DPR 1；证据分别记录 GTAO/TAA 开关、相机操作、历史稳定状态和每次开关后的帧数／耗时。它用于复现开关成本与历史重建行为，不作为 Q5 目标硬件 FPS 或显存结论。

## 几何吸附与瞬态反馈（2026-10-11）

`RuntimeSnapping` 负责射线到当前编辑平面的投影、世界 XZ 候选索引和瞬态反馈。`RuntimeSnapIndex` 按当前楼层保留正式对象组，ChangeSet 更新几何签名；纯 geometry 的 `buildEffectiveWallSnapCandidates` 复用实际墙并集外露路径，几何变化时求解边界拓扑并复用未变化的 owner 组。材质变更不重建索引；相机、resize、主题、语言和工具变化只清除旧反馈，下一输入使用新矩阵投影。楼层／工程变化释放旧索引，ghost、隐藏对象、预览和辅助对象不成为目标。

默认开启，公差 0.16m、网格间距 0.1m；主工具栏显示状态，设置提供点／线／网格／全部模式。Alt／Option 临时绕过，材质工具沿用原始拾取。墙绘制和端点编辑先限制有效轴，候选公差仍以约束前的有效指针锚点计算。整对象移动保留一个正式节点及抓取偏移；端点／角点手柄沿编辑平面取精确目标，不携带抬高手柄在透视投影下的偏移。该节点直接取 resolved point，避免小数相减造成提交漂移。结果的 `distance` 是有效锚点输入距离，`rawPoint`／`pointerDistance` 另外记录未经抓取偏移的指针 XZ 坐标及距离；楼层与编辑平面确定 Y，吸附沿现有平面编辑，不引入竖向编辑能力。

点标记和有限线段网格条由 runtime 持有，只更新复用的位置缓冲；坐标读数局部写入 DOM，目标类型仅在转换时更新状态栏，没有逐帧 React 或 IPC。反馈不进入 ProjectDocument、GLB 或光追 snapshot。相机操作、离开视口、失焦、取消、模式切换和文档更新清除反馈；GPU 几何／材质与局部 DOM 在 dispose 中释放。静止编辑预览不持续驱动 TAA 采样，输入事件更新画面，提交／取消后恢复有限历史细化。

资源回归另发现 Three 共享阴影深度材质在有贴图→无贴图的轮廓间保留旧sampler，再上传已经释放的工程图片。`shadow-materials.ts` 通过公开 `onBeforeShadow` 回调处理借用材质：当前不透明轮廓不采样无用diffuse map，masked／alpha-hashed轮廓保留图片，sampler有无变化才更新材质版本。WeakMap记录借用状态，不拥有／释放Three阴影材质，连续同策略绘制不反复更新版本。正式网格共用该回调，工程图片仍只由ResourcePool按lease释放，不访问renderer私有属性。

## Runtime 所有权拆分（2026-10-11）

`ThreeRuntime` 保留稳定Scene／Camera／Controls和公开命令入口，`RuntimeRendering` 持有renderer切换、后处理和渲染状态，`RuntimeScheduler` 串行合并按需帧，`RuntimeEnvironment` 管理解码版本与纹理，`RuntimePathTracing` 持有干净建筑快照、采样session及重建计时器。backend驱动独立在pathtrace-drivers，完整模块边界见ARCHITECTURE.md。输入、辅助和正式场景资源分别由自己的owner释放，销毁先停调度、释放借用者，再释放灯光阴影与renderer；迟到采样不恢复已销毁状态。公开diagnostics及导出边界保持，验证与源文件哈希见runtime-refactor-validation.json，不据组织拆分宣称渲染速度提升。
