# 可编辑的环境光照与光追样例

本目录提供同一工程的可编辑文件、动画 GLB 和光追 PNG；`manifest.json` 记录三件样例的大小、SHA-256 和内容说明。

`pathtrace-environment.building` 由真实鼠标墙体、楼板和门工具创建，再通过应用的“保存”操作下载。包含两段直角墙、一块厚楼板、一扇带独立开关动画的门，以及嵌入工程的 32×16 HDR 全景。环境强度为 1.3，旋转为 35°，显示全景背景关闭。打开后可继续编辑，资源不依赖原始图片路径。

`pathtrace-environment.glb` 通过应用的“导出 GLB”操作下载，使用同一套建筑几何、材质和门动画逻辑。GLB 包含建筑和门的独立 Open/Close 动画，不包含环境光照、背景、相机、灯光或编辑辅助。要还原此 PNG 的环境光照，应在编辑器中打开 `.building` 工程，或在外部查看器中单独配置环境。

`pathtrace-environment.png` 是该工程当前视口实际完成 16 次采样后，通过“保存渲染 PNG”下载的光追结果。它来自 Windows Chromium 的 SwiftShader 软件 WebGL，具有采样噪声和固定视角，并非原生桌面、硬件 WebGPU或收敛图像质量的验收证明。光追场景使用正式整栋快照，移除网格、选中框、吸附提示和楼层半透明显示状态；纯色背景用于覆盖光追内部背景纹理的释放回归。

HDR 是本仓库测试程序原创的天空渐变与高亮光源图案，使用完整 RGBE 像素和 Radiance 扫描行 RLE 编码，经实际 Three HDRLoader 解码后通过真实文件选择导入。生成代码位于 `tests/rendering.browser.spec.ts` 的 `panorama` 函数，格式依据 [Radiance picture format](https://floyd.lbl.gov/radiance/refer/Notes/picture_format.html)，不使用外部照片或第三方图片。该程序生成 HDR 与对应样例 PNG 可按 CC0-1.0 复制、分发和嵌入。

复现：安装依赖与 Chromium 后执行 `npm run test:e2e -- tests/rendering.browser.spec.ts --grep "real WebGL path tracing"`。测试输出留在被 Git 忽略的 `.test-artifacts/`，不会写入本目录。
