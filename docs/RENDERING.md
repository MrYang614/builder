# 渲染与交互运行时

GPU、调度、后处理、采样和资源释放由 `packages/three-runtime` 持有。UI 只发命令并订阅低频状态；详细模块所有权见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 用户操作与数据边界

默认使用 WebGL。显式切换 WebGPU 只有实际 backend 初始化成功才显示成功，失败保留原渲染器；不能把 Three 自动 fallback 当作 WebGPU。切换上下文替换主 Canvas／renderer，保持 Scene、Camera、EditorCore、会话与历史；主题或语言变化不替换 Renderer。

视口渲染入口提供实时后处理与光追；设置提供采样、效果和环境参数。光追支持目标采样、暂停／继续、退出与保存当前 PNG。它使用整栋正式建筑和当前门姿态的干净快照，不含网格、选择、吸附或其他层 ghost。编辑／相机操作期间实时显示，正式变化后重建一致快照；不逐帧写工程或 React／IPC。

环境接受等距柱状 HDR／EXR／PNG／JPEG，可设强度 0–10、Y 旋转 0–360°和背景。单文件 64 MiB、单边 8192、总像素 32 Mi、工程 256 MiB；它与墙板 PNG／JPEG 材质分开。环境是工程数据，主题不会改写；移除引用与资源是一条可撤销命令。

GLB 导出建筑及门动画，不携带全景照明；保存 `.building` 才保留环境。PNG 按当前视口尺寸输出，无离线超分辨率或降噪承诺。导出只读固定 revision，通过共享 builder 重建，不借用显示覆盖材质。

## 实现约束

- `three-mesh-bvh` 使用实例级 raycast，不修改全局原型；indirect 保留索引、group 和 face 身份，导出默认不构树。
- 实时编辑按 ChangeSet 局部重建。光追合并 BVH 来自独立正式快照，200 ms 合并频繁修改，陈旧构建不能覆盖新版本；当前不引入 Worker／WASM。
- WebGL 使用 GTAOPass 与深度重投影 TAA，OutputPass 在末端；TAA 使用 8 个 Halton 样本、深度拒绝与 YCoCg 邻域裁剪。WebGPU 的 GTAONode 使用独立深度／法线 pre-pass，TRAANode 使用 beauty／depth／velocity，避免 pass 自引用。
- 默认 GTAO／TAA 开启；相机、场景、环境、DPR、尺寸和效果变化丢弃历史。实时后处理与光追采样链分开，不把 TAA 当作光追降噪。
- 光追／WebGPU 依赖按需加载，采样 UI 状态最多每 500 ms 发布；暂停、完成和销毁停止采样。WebGL preserveDrawingBuffer 保证 PNG 读取，其缓冲成本不声称为提速。
- 环境解码、后端初始化与采样只接受当前请求版本。销毁先停 RAF 和异步调度，再释放借用者、建筑、环境、灯光阴影和 renderer；迟到任务自行释放。
- legacy 光追驱动适配补齐其未公开释放的派生 target／纹理。借入建筑材质与环境仍归原 owner，不把资源计数等同 VRAM 字节。
- 本机 backend 偏好与工程分离，写入串行；关闭等待最新写入，失败阻止关闭并可重试。

依赖版本以锁文件为准。官方资料：[BVH](https://github.com/gkjohnson/three-mesh-bvh)、[pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)、[WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)。本地 API 以锁定包的类型和源码核对。

## 吸附与瞬态反馈

`RuntimeSnapping` 投影到当前编辑平面，`RuntimeSnapIndex` 按楼层缓存正式候选，geometry 共享真实墙并集周界。材质变化不重建索引；相机、resize、主题与语言仅清反馈，下一输入用新矩阵。ghost、隐藏、预览和辅助不成为目标。

默认公差 0.16 m、网格 0.1 m，提供点／线／网格／全部模式，Alt／Option 暂时绕过。墙绘制与端点先限制有效轴，再按有效锚点求解；整体移动保留抓取偏移。端点／角点直接采用精确 resolved point，预览和提交共用结果，不为显示两位小数而量化正式坐标。

标记复用位置缓冲，坐标在局部 DOM 更新，目标类型变化才发布状态；没有逐帧全局 React／IPC。相机、离开、失焦、取消、模式与文档变化清反馈；dispose 释放 GPU 和 DOM。静止编辑预览不持续驱动 TAA，提交后恢复有限细化。

Three 共享阴影深度材质可能保留旧 sampler。`shadow-materials.ts` 用公开 onBeforeShadow 管理借用状态：不透明轮廓不采样无用 diffuse map，masked／alpha-hashed 保留图片；只在 sampler 策略变化时更新版本，不拥有或释放 Three 阴影材质。

## 验证入口与剩余范围

单元覆盖见 bvh、pathtracing、runtime、环境和资源测试；实际浏览器覆盖见 `tests/rendering.browser.spec.ts`、`tests/postprocessing.browser.spec.ts`、`tests/environment-pathtrace.browser.spec.ts`、`tests/snapping.browser.spec.ts`，硬件路径见 `tests/webgpu.hardware.ts` 和 `tests/webgpu-error.hardware.ts`。

最近相关 E2E 为 29／30：吸附测试中的光追采样 10 秒后为 0，独立重放再次失败，原因未定。早期硬件通过不覆盖这次失败。当前结果见 [PROGRESS.md](PROGRESS.md)，限制见 [KNOWN-ISSUES.md](KNOWN-ISSUES.md)；详细输出只写本地 `.test-artifacts/`。

补验须记录真实 Windows／macOS 系统、GPU、驱动与 WebView 版本：验证实际 WebGPU backend、目标采样、PNG、编辑／相机复位、20 次切换／退出资源、真实设备丢失、系统环境文件对话框、偏好关闭／重启和跨目录重开。macOS 另补 Command、触控板和工程迁移。浏览器、软件 GPU 或 mock 不替代原生／安装／Q5 性能验收。
