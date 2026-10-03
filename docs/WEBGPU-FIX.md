# WebGPU 环境采样器修复

2026-10-04。用户实际首条错误为 WGSL 的 `unresolved value 'nodeUniform16_sampler'`，后续 Invalid CommandBuffer／Queue.Submit 是同一编译失败的结果。

## 根因与实现

默认环境原先使用 Float32 DataTexture 的双 Nearest 默认值。three-gpu-pathtracer 0.0.26 的环境预处理虽然把像素转换成 HalfFloat，却保留原过滤器；锁定 Three 0.186.1 的 WGSLNodeBuilder 因双 Nearest 将它视为不可过滤，在注册绑定与生成声明时都省略 sampler。上游 EquirectHdrInfoNode 的原生 WGSL 仍直接引用 textureSampleLevel；用户提供的 `.rgb` 与 `uv` 对应其中的环境方向采样函数。错误发生在着色器解析阶段，后续 CommandBuffer／提交错误来自无效计算管线，不能据此归因于墙体索引、材质分组或设备显存。

`tests/webgpu-sampler.test.ts` 运行真实发布版 ComputeKernel 与 Three NodeBuilder，复现遗漏，并检查产品工厂输出的实际 WGSL 声明及绑定。这是没有 GPU 的代码生成回归；实际硬件编译和采样另由浏览器套件检查。仅改变像素类型仍保留双 Nearest，所以不能单独解决此问题。

`packages/three-runtime/src/environment.ts` 的 `createDefaultEnvironmentTexture()` 生成独立 2×1 默认环境；`createPathTracingEnvironmentTexture(original)` 为已导入环境生成独立像素。两者统一为线性 RGBA HalfFloat、双 Linear、无 mipmap、全景反射映射，避免环境采样依赖 float32-filterable 特性。`runtime.ts` 只将派生纹理交给干净光追场景，建筑几何、材质仍复用正式快照的共享构建逻辑。

PNG／JPEG 另有独立兼容问题：TextureLoader 返回普通图片，缺少上游重要性采样器直接读取的 `image.data`。派生转换等待浏览器真实解码，使用 sRGB Canvas2D 读回完整 RGBA，再把 RGB 转成线性，alpha只按其数值转换；HDR／EXR复制已有浮点像素，保留动态范围、名称与 flipY，由上游对自身副本处理翻转。临时读回画布在 finally 中立即归零释放。原始图片字节、借用 texture／source、过滤器、栅格环境及工程历史保持。转换失败抛出可见错误，不返回占位纹理。`tests/environment-runtime.test.ts` 检查转换、朝向与真实上游重要性采样；`tests/environment-pathtrace.browser.spec.ts` 通过实际文件上传和浏览器解码执行 PNG／JPEG 的完整 16 采样与返回实时编辑流程，按测试配置明确选择 WebGL 或 WebGPU。

`runtime.ts` 接入 Three 的实际 `onError`，保留此前回调。当前光追的首条 GPU 错误会停止会话、清理干净建筑与派生环境，恢复当前 backend 的实时编辑，并在界面显示具体原因。后续回调因已离开光追模式而不改写提示；进行中的采样读回通过 disposed／version 检查丢弃过期结果，帧异常也不覆盖已经显示的首条光追错误。切换 renderer／销毁时恢复原回调，旧 renderer 的错误不改写当前状态。设备丢失另走切回 WebGL 的实现路径，其实际验收范围仍按下文平台限制记录。

## 资源所有权与退出清理

PathTraceSession 借用干净 Scene、相机和 renderer，只拥有上游光追器的派生资源；runtime 则拥有干净建筑及其资源池、派生环境纹理。重建先构造并校验工程 ID、revision、请求版本与 renderer 身份，过期结果直接释放；替换、返回实时编辑、错误退出和 runtime 销毁都释放对应派生对象。原显示建筑及正式资源保持自己的生命周期。

runtime退出先分离全部会话、建筑、派生环境引用，清除待重建定时器与高频标记，再分别释放；某一所有者抛错不阻止其他清理，原始清理异常保留console.warn与可见cleanupFailed提示。GPU错误路径随后仍显示首条shader原因。三项生产方法回归分别模拟会话／建筑／环境释放异常，检查其他资源释放、借用资源保留、定时器取消及实际重建／采样／再次退出；这属于无GPU集成测试，不伪称已注入真实驱动释放失败。

WebGPU 适配层先调用上游公开 `tracer.dispose()` 释放计算缓冲、目标、BVH、环境 CDF 与缓存，再在 finally 中补齐 0.0.26 的所有权遗漏。补充集合在公开释放前捕获，以 Set 按对象身份去重：

- `material.turquinTexture`：每个光追器自己的查表纹理。
- `_blitQuad`、`_atlasDebugQuad`、`_sampleDensityQuad`、`_debugBoundsQuad` 的 material：FullScreenQuad.dispose 释放几何，上游公开退出未释放这些材质。
- `_bvhData.textureAtlas.texture` 与 `_pathTracer.lightsInfo.iesAtlas.texture`：没有建筑图片或 IES 贴图的图集可能作为普通 1×1 纹理被采样，目标从未实际绑定；AtlasTexture.dispose 仅释放 render target 及其 quad material，未绑定的目标没有建立负责释放这份纹理分配的监听器，因此还须直接释放图集纹理。

重复 session／driver dispose 由已释放标志拦截；公开 dispose 抛错仍执行补充清理并保留异常。适配层不遍历或释放借用 Scene 的 geometry、material、环境、背景、相机、renderer 或共享随机提供器的蓝噪声纹理。`tests/pathtracing.test.ts` 使用真实 Three 资源和未绑定 render target，检查三次会话、共享字段去重、公开释放清空字段后抛错及借用资源保护；其中 `random.blueNoise` 是表达共享借用对象的 mock 字段，驱动边界不作 GPU 实测声明。现有 WebGL 适配另外释放上游遗漏的派生 targets、uniform 资源、混合材质及 Color 背景纹理，并恢复临时捕获的 renderer 方法。

这些适配针对精确锁定的 0.0.26 私有资源结构；升级依赖时须重新核对公开 dispose 和资源所有权，运行单元与实际 backend 循环回归。没有修改 node_modules、屏蔽 GPU 验证、替换着色器结果或改工程数据来制造成功。

官方来源：[Three WGSLNodeBuilder r186](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgpu/nodes/WGSLNodeBuilder.js)、[发布版环境节点](https://github.com/gkjohnson/three-gpu-pathtracer/blob/v0.0.26/src/webgpu/EquirectHdrInfoNode.js)、[上游环境像素预处理](https://github.com/gkjohnson/three-gpu-pathtracer/blob/v0.0.26/src/uniforms/EquirectHdrInfoUniform.js)、[Three GPU错误回调](https://threejs.org/docs/pages/Renderer.html#onError)、[公开光追释放](https://github.com/gkjohnson/three-gpu-pathtracer/blob/v0.0.26/src/webgpu/WebGPUPathTracer.js)、[图集释放](https://github.com/gkjohnson/three-gpu-pathtracer/blob/v0.0.26/src/webgpu/AtlasTexture.js)、[FullScreenQuad](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/postprocessing/Pass.js)。

## 执行方式与平台范围

```powershell
npm ci
npx playwright install chromium
npm run check
npm run typecheck
npm test
npm run test:regression -- --output test-results/webgpu-sampler/regression
npm run test:webgpu -- --output test-results/webgpu-sampler/hardware-final
npm run build
$env:CARGO_BUILD_JOBS = '2'
npm run tauri -- build --bundles nsis
```

普通浏览器回归独立拥有1421端口服务器，采用软件WebGL；硬件套件使用完整Chromium的无界面模式，在同一端口独立运行，要求真正WebGPU backend、16采样、真实PNG、无GPU验证错误，不将无adapter转换为跳过或成功。两套不可同时占用该端口。1420用户开发服务器未停止。

本机Windows11、RTX4070 SUPER（NVIDIA Lovelace）、驱动32.0.15.9186。默认Playwright headless-shell可取得adapter但requestDevice发生DXIL Error87；完整bundled Chromium、已安装Chrome与Edge均完成真正设备计算，读回[7,10,13,16]。该测试环境差异通过选择完整Chromium解决，没有改系统DLL、驱动或产品启动参数。8种方案和官方参数出处见 `test-results/webgpu-sampler/device-probes/summary.json`。

本轮不运行原生GUI、系统安装或macOS。浏览器真实硬件渲染可以证明本机WebGPU编译和采样，不能填补Tauri WebView2／macOS支持、真实device-loss恢复、参考硬件性能和VRAM字节峰值验收。

## 当前验证

最终硬件套件4/4通过，30.470秒，0跳过／失败／flaky。默认环境实际16采样，970×718 PNG含849种RGB，正常路径GPU验证错误0；PNG／JPEG分别通过实际文件导入、浏览器解码和WebGPU采样。真实注入一次缺失sampler的GPU编译错误，确认首条可见错误、8帧不再采样、重试16采样及墙体4.4m正式编辑通过；该故障case中的GPU错误是预期负向证据，单独保存，不混入正常路径零错误结论。

三次正常会话退出后geometry4／textures4一致，派生会话和独立建筑均释放，单Canvas、原Scene／Camera／工程保持。补齐前每轮3张和2张纹理增长、Tooltip遮挡选项及并行UI修改导致的HMR中断记录全部保留。非交互Tooltip补pointer-events-none后，真实鼠标选择WebGL再WebGPU通过，不使用force点击或放宽断言。

最终硬件原始报告及PNG见 `test-results/webgpu-sampler/hardware-release-verified`，JSON为 `hardware-results.json`，日志为 `hardware-release-verified.log`。最新普通回归、单元、Rust、质量／构建和产物汇总在 [webgpu-fix-validation.json](webgpu-fix-validation.json)、[webgpu-fix-release-artifacts.json](webgpu-fix-release-artifacts.json)。旧渲染证据已复制到 `test-results/webgpu-sampler/baseline-docs`；原A01–A42条件及平台状态不改变。
