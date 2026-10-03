# 可编辑的环境光照与光追样例

本目录的工程、GLB 和 PNG 来自实际光追测试成功的同一次下载，已逐件核对 SHA-256。对应 `rendering-final` 首轮中该用例通过，整组为 23 项通过、16 项因开发服务器退出失败；该用例成功不代表那次完整回归通过。

`pathtrace-environment.building` 由真实鼠标墙体、楼板和门工具创建，再通过应用的“保存”操作下载。包含两段直角墙、一块厚楼板、一扇带独立开关动画的门，以及嵌入工程的 32×16 HDR 全景。环境强度为 1.3，旋转为 35°，显示全景背景关闭。打开后可继续编辑，资源不依赖原始图片路径。

`pathtrace-environment.glb` 通过应用的“导出 GLB”操作下载，使用同一套建筑几何、材质和门动画逻辑。GLB 包含建筑和门的独立 Open/Close 动画，不包含环境光照、背景、相机、灯光或编辑辅助。要还原此 PNG 的环境光照，应在编辑器中打开 `.building` 工程，或在外部查看器中单独配置环境。

`pathtrace-environment.png` 是该工程当前视口实际完成 16 次采样后，通过“保存渲染 PNG”下载的光追结果。它来自 Windows Chromium 的 SwiftShader 软件 WebGL，具有采样噪声和固定视角，并非原生桌面、硬件 WebGPU或收敛图像质量的验收证明。光追场景使用正式整栋快照，移除网格、选中框、吸附提示和楼层半透明显示状态；纯色背景用于覆盖光追内部背景纹理的释放回归。

HDR 是本仓库测试程序原创的天空渐变与高亮光源图案，使用完整 RGBE 像素和 Radiance 扫描行 RLE 编码，经实际 Three HDRLoader 解码后通过真实文件选择导入。生成代码位于 `tests/rendering.browser.spec.ts` 的 `panorama` 函数，格式依据 [Radiance picture format](https://floyd.lbl.gov/radiance/refer/Notes/picture_format.html)，不使用外部照片或第三方图片。该程序生成 HDR 与对应样例 PNG 可按 CC0-1.0 复制、分发和嵌入。

固定验证证据为本目录的 `validation.json`：实际开始、暂停、继续、16 次采样、PNG 像素检查、三轮进入退出资源计数、工程内 HDR 原字节一致性及 GLB Validator 错误/警告数。它是这次成功用例的报告副本，仅用 oxfmt 格式化 JSON 排版，未改变任何解析后的数据或数值；后续回归可更新 `docs/rendering-pathtrace-validation.json`，不改变此样例的固定证据。`manifest.json` 分别记录原始报告的 `sourceReportSha256` 和格式化副本的 `fixedEvidenceSha256`，以及成功用例、来源路径和三件二进制样例的大小与 SHA-256，便于确认它们属于同一次下载。

复现：安装依赖与 Chromium 后执行 `npx playwright test tests/rendering.browser.spec.ts --grep "real WebGL path tracing" --output test-results/rendering-reproduce --reporter list`。输出目录包含应用实际下载的文件；测试不会通过命令注入或固定模型替代建墙操作。
