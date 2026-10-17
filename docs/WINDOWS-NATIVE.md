# Windows 原生桌面验证记录

2026-10-03 实际在 Windows 11 专业版 10.0.26200（build 26200）运行 Tauri 桌面进程。不是浏览器适配器，也没有 mock IPC。执行的是 `target/debug/builder.exe` 加 Vite 开发前端；此记录不代表安装包已经安装验证，也不代表之后修改的所有代码已经重新完成原生回归。

历史原生结果：`tests/artifacts/native/results.json` 保留一次 Windows 运行的成功和失败尝试，`finalCases` 汇总最终状态，`retries` 解释重试。新的运行通过 `BUILDING_EVIDENCE_ROOT` 隔离到 `.test-artifacts/native/`，避免覆盖已跟踪证据；截图、实际 `.building`、实际 `.glb`、Validator 报告及独立加载结果均位于运行目录。

## 实际版本与来源

| 部件                              | 实际版本 / 情况                                              |
| --------------------------------- | ------------------------------------------------------------ |
| Tauri Rust / tauri-build / dialog | 2.12.1 / 2.7.1 / 2.8.1，Cargo 精确锁定                       |
| tauri-driver                      | 2.1.0，`cargo install tauri-driver --version 2.1.0 --locked` |
| Microsoft Edge / msedgedriver     | 154.0.4258.48 / 154.0.4258.48                                |
| WebView2 运行时                   | 原生 WebDriver 响应报告 MicrosoftEdge=154.0.4258.53          |
| 驱动下载                          | Microsoft 官方 Edge WebDriver，匹配已安装 Edge 版本          |
| OS 文件对话框                     | 实际 Windows 打开 / 另存为；Computer Use 实际点击及输入      |

参考：[Tauri 原生 WebDriver](https://v2.tauri.app/develop/tests/webdriver/)、[Tauri Rust 原始二进制 IPC](https://v2.tauri.app/develop/calling-rust/)、[Dialog 插件](https://v2.tauri.app/plugin/dialog/)、[Microsoft Edge WebDriver](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/)。

## 执行方式

从仓库根目录执行。先启动 Vite，再生成实际桌面可执行文件。不要在原生交互测试中热更新 App；开发时一次 App HMR 导致编辑会话重新初始化，此次干扰已在重试记录中保留。

```powershell
npm run dev
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
```

本次 helper 使用工具进程启动，未另开可见终端。以下是等效可复现的隐藏 helper 启动方式；路径必须替换为本机已检查的官方驱动。`$nativeDriverProcess` 保留启动返回的 PID，便于只关闭本次 helper。

```powershell
$nativeDriverExecutable = 'D:\Code\builder\apps\desktop\src-tauri\.webdriver\edge-154.0.4258.48\msedgedriver.exe'
$tauriDriverExecutable = 'C:\Users\52683\.cargo\bin\tauri-driver.exe'
$nativeDriverProcess = Start-Process -FilePath $tauriDriverExecutable -ArgumentList @('--native-driver', $nativeDriverExecutable, '--port', '4444', '--native-port', '4445') -WindowStyle Hidden -PassThru
```

下列阶段经过实际执行。测试使用 W3C 鼠标 / 键盘动作和真实按钮；`window.__editor` 只读取文档、历史、诊断及投影坐标以定位真实鼠标点击，不提交命令或修改文档。OS 对话框阶段必须等待人在真实对话框中操作完成，不能提前执行 `verify-*`。

```powershell
node tests/desktop.mjs start
node tests/desktop.mjs save
# 在真实保存对话框选择 .test-artifacts/native/中文 native project.building
node tests/desktop.mjs verify-save
node tests/desktop.mjs open
# 在真实打开对话框选择刚保存的 .building
node tests/desktop.mjs verify-open
node tests/desktop.mjs restart
node tests/desktop.mjs open
# 重启后再次从真实打开对话框选择同一工程
node tests/desktop.mjs verify-open
node tests/desktop.mjs enrich
node tests/desktop.mjs resave
node tests/desktop.mjs export
# 在真实 GLB 保存对话框选择 .test-artifacts/native/中文 native door.glb
node tests/desktop.mjs verify-export
node tests/desktop.mjs independent-export
```

实际验证通过：单窗口单 Canvas；真实鼠标创建直角墙；尺寸输入；文本 Delete 隔离；撤销重做；设置弹窗输入隔离；双语双主题保持 Renderer；进程重启偏好持久化；中文含空格路径原生保存和打开；真实门放置及拖动（仅一条撤销）；45° 半开门；墙大面 A/B 不同图片、厚度纯色；原路径覆盖保存；实际 Rust 原始二进制 GLB 写盘；Validator 零错误、零警告；独立 GLTFLoader 加载文件中的图片、半开姿态、独立 Open/Close 动画，动画运行时支点和门框位置固定。

`independent-export` 的测试字节通过 WebDriver 测试通道传入独立 GLTFLoader；这是读取实际磁盘产物的验证，产品文件 IPC 本身使用原始二进制 Request/Response，没有 JSON 数字数组或 Base64 传输 GLB。

TypeScript 与 Rust 工程 ZIP 格式还进行了双向互通验证。原执行脚本在 `.webdriver/interoperability.ts`，同一逻辑已交付为：

```powershell
npx tsx tests/native-container.ts
```

Rust 14 项文件可靠性测试实际通过，包含跨目录迁移及删除原始图片、图片去重、未知字段/版本、截断/坏路径、缺失图片/校验损坏、真实图像解码与限制、GLB 二进制及失败保护、独立偏好文件、扩展名、容器原始二进制接口、整包替换、Windows 只读目标保留原文件。此类文件服务测试与原生 UI 路径分开记录。

## 重试与尚未验证

首次 `verify-open` 超时：对 OS 对话框使用了失效的可访问元素索引，文件尚未真正打开。刷新观察后实际双击文件，再次打开和文档比较通过。

首次 `enrich` 超时：实时读取发现工程为空且 ID 已变化；与测试期间 App HMR 重挂载一致。冻结源码更新并重新打开已保存工程后，真实门放置/拖动/材质/保存均通过。这次失败不隐去，也不据此把射线拾取判定为产品缺陷。

首次 `verify-export` 超时：OS 保存对话框尚未确认，旧可访问索引失效。刷新对话框后按观察到的按钮坐标确认保存，重新验证通过，实际 GLB 产物存在。

原生 Windows 标题栏关闭的“保存/放弃/取消”路径未验证。附加 `close-prepare` 对未保存标签断言超时；随后 Computer Use 被用户物理 Escape 中止，未执行标题栏关闭点击，也不再进行 Computer Use 操作。不能把已实现的 close guard 或其他弹窗测试写成此项通过。

macOS 环境不可运行，macOS 安装、Metal/WebGL 表现、原生文件对话框和快捷键保持环境阻塞；需要在真实 Mac 上按同样流程执行。系统主题运行期变化和默认系统启动闪屏没有在此原生运行中完整验证；对应自动化浏览器检查不能替代这部分原生结论。性能参考硬件的产品结论另见主验收矩阵。

## helper 清理

本次停止 Computer Use 后保留 debug app 和 tauri-driver，未操纵系统安装。已保存工程及导出在仓库内。清理 WebDriver 会话是测试 helper 结束操作，若需要保留当前未保存测试会话应先自行保存。

```powershell
node tests/desktop.mjs finish
# 只对本次 Start-Process 返回的 helper PID，先确认路径，再结束。
$nativeDriverProcess.Refresh()
if (-not $nativeDriverProcess.HasExited -and $nativeDriverProcess.Path -eq $tauriDriverExecutable) {
  Stop-Process -Id $nativeDriverProcess.Id
}
```

本次工具启动的 driver 对应工具执行会话 85540，可由持有该会话的执行工具结束；不要按进程名称批量结束所有浏览器、builder 或 driver，也不要关闭用户其他窗口。若未保留 PID，可先用 `Get-Process` 按精确可执行路径和启动时间人工确认本次 helper，再针对确认后的 PID 操作。
