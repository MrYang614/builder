# Windows 原生验证指南

这是 Tauri／WebView2 实际宿主流程，区别于浏览器适配器。历史 debug 宿主曾完成墙、门、双面图片、中文路径保存／打开、二进制 GLB 与独立动画加载；当前 UI、安装包和全部关闭路径仍需补验。历史 Computer Use 被用户物理 Escape 停止，未继续操作，不能将本文作为当前原生验收通过证明。

## 准备

按锁文件安装，使用与实际 Edge／WebView2 匹配的官方 msedgedriver 和 tauri-driver，记录本次版本。

```powershell
npm ci
npm run dev
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
```

参考：[Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/)、[二进制 IPC](https://v2.tauri.app/develop/calling-rust/)、[Edge WebDriver](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/)。

截图、工程、导出与日志使用 `.test-artifacts/native/`；`BUILDING_EVIDENCE_ROOT` 可隔离运行。原生交互期间避免 App HMR 重置编辑会话。下面替换为已检查的本机绝对路径，隐藏启动并保留 PID：

```powershell
$nativeDriverExecutable = 'C:\Tools\msedgedriver.exe'
$tauriDriverExecutable = 'C:\Tools\tauri-driver.exe'
$nativeDriverProcess = Start-Process -FilePath $tauriDriverExecutable -ArgumentList @('--native-driver', $nativeDriverExecutable, '--port', '4444', '--native-port', '4445') -WindowStyle Hidden -PassThru
```

## 流程

`tests/desktop.mjs` 使用 W3C 鼠标／键盘；诊断只读取文档、历史与投影，编辑仍通过 UI。系统对话框实际确认后再执行 verify。

```powershell
node tests/desktop.mjs start
node tests/desktop.mjs save
# 系统对话框保存 .test-artifacts/native/中文 native project.building
node tests/desktop.mjs verify-save
node tests/desktop.mjs open
# 系统对话框打开刚保存的工程
node tests/desktop.mjs verify-open
node tests/desktop.mjs restart
node tests/desktop.mjs open
node tests/desktop.mjs verify-open
node tests/desktop.mjs enrich
node tests/desktop.mjs resave
node tests/desktop.mjs export
# 系统对话框保存 .test-artifacts/native/中文 native door.glb
node tests/desktop.mjs verify-export
node tests/desktop.mjs independent-export
```

核对单窗口／Canvas、单次拖动历史、输入 Delete／IME 隔离、双语双主题、相机与 Renderer 保持、原子保存／重开／资源迁移、独立 GLB 图片／门支点及动画。TS↔Rust 互通另执行 `npx tsx tests/native-container.ts`；文件服务测试不等于系统对话框和真实磁盘满通过。

发布前补标题栏保存／放弃／取消与失败保护、偏好 flush／重启、安装／卸载／签名、GPU／设备丢失、DPI 与多屏。macOS 在真实 Mac 运行，不从 Windows 或浏览器外推。

## 结束

```powershell
node tests/desktop.mjs finish
$nativeDriverProcess.Refresh()
if (-not $nativeDriverProcess.HasExited -and $nativeDriverProcess.Path -eq $tauriDriverExecutable) {
  Stop-Process -Id $nativeDriverProcess.Id
}
```

先保存需要保留的测试工程，仅结束已核实路径与 PID 的本次 helper；不要按进程名称批量结束用户窗口。简短交付说明记录结果和限制，详细产物不提交。
