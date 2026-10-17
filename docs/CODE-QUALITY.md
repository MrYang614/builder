# 代码规范与质量工具

2026-10-03。本项目采用 [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) 的可适用部分，结合 Oxc 原生规则和本项目的架构、token、国际化检查。Google 的开源规范来自企业内部实践，文档采用 [CC BY 3.0](https://github.com/google/styleguide)；这里是明确记录差异的项目适配，不声称等同 Google 内部工具链或完整 Google 合规。

## 工具与范围

| 工具       | 锁定版本    | 职责                                                            |
| ---------- | ----------- | --------------------------------------------------------------- |
| oxfmt      | 0.71.0，MIT | JS/TS/TSX、JSON、CSS、HTML、YAML及维护文档排版                  |
| oxlint     | 1.86.0，MIT | 正确性、TypeScript类型导入、React Hooks、可访问性及模块导入检查 |
| TypeScript | 保持6.0.3   | 严格类型检查，包括纯核心／几何与Node构建配置                    |

Oxc两项工具的Node兼容范围均为 `^20.19.0 || >=22.12.0`，本机Node26.1.0实际执行通过。依赖以精确版本写入package.json和package-lock.json，使用npm工作区。直接Prettier依赖和两份旧配置已移除，不维护第二套格式规范；上游生成工具若仍间接引用Prettier，不参与项目格式检查。

配置及API依据 [Oxfmt配置](https://oxc.rs/docs/guide/usage/formatter/config)、[Oxlint配置](https://oxc.rs/docs/guide/usage/linter/config.html) 与安装包内的JSON Schema复核。格式配置 `.oxfmtrc.json`、lint配置 `.oxlintrc.json` 均显式用于CLI，编辑器使用相同本地工具及配置。

## 自动实施的规范

- UTF-8、LF、两空格缩进、分号、单引号；JSX属性使用双引号，多行尾逗号。
- 100列宽沿用已有项目设置，作为对Google格式细节的显式适配；不引入其内部格式化器。
- 控制流统一花括号，优先const，禁止var、debugger、eval、隐式eval。
- 严格比较；`value == null`只作为同时判断null和undefined的明确例外。
- 类型专用导入明确使用type；允许 `import('module').Type` 类型查询，保留浏览器测试的独立类型注解。
- 正式源码禁止显式any、TS忽略注释；测试仍须通过同样严格tsc，探针的运行时外部边界可使用已有any。产品源码console只允许warn/error，脚本可输出测试与构建结果。
- 检查Hooks调用与依赖、JSX key、外链、ARIA属性、标签关联、键盘交互、重复／自引用导入。Oxc正确性类别中的TypeScript、Unicorn、Oxc、React、jsx-a11y、import规则一起启用。
- 所有诊断阻止合并或构建，警告也返回非零；未使用的局部禁用注释会被报告。这里只使用安全 `--fix`，不使用 `--fix-suggestions` 或 `--fix-dangerously`。

Google规范中仍需代码审查的内容包括API命名、文档、模块职责与复杂度；不会用“lint通过”替代这些判断。项目的稳定领域ID、纯计算、命令边界和语义token要求继续由原有检查及测试落实，不被通用lint替代。

## 文件大小与注释

手写产品 TypeScript／Rust 源文件暂定上限为 500 行。`npm run check` 对 `apps/desktop/src`、`apps/desktop/src-tauri/src` 和 `packages` 中的 `.ts`、`.tsx`、`.rs` 文件逐个计数；不计生成文件、锁文件或第三方代码。测试文件可因大量独立场景、故障注入及运行时探针超过上限，但应按场景组织并复用清晰的测试辅助函数，不能用压缩断言或堆积到辅助文件的方式规避规则。

迁移期间曾保存逐文件超限基线。2026-10-11 全仓审查将其余五项按完整职责拆分，`scripts/check.mjs` 已移除全部旧例外，统一执行 500 行上限。未来新增例外仍须在规则评审中说明职责边界、当前行数及拆分会破坏内聚的具体原因，不能只因为文件历史悠久而保留。

`Inspector.tsx` 的完整面级材质、资源导入及连续性命令职责已提取到 `MaterialFields.tsx`，其余对象尺寸字段仍在 Inspector；二者各自订阅现有服务，选中对象 key 保持草稿生命周期。该 UI 大小例外已删除。Core、validation、geometry 与 Rust storage 的职责边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

`packages/three-runtime/src/runtime.ts` 已从1806行拆为不超过500行的协调入口：指针事务、预览、拾取、正式场景、选择辅助、动画、渲染器／后处理、环境、光追快照及RAF各由内聚模块持有状态与资源。模块通过明确的窄接口连接，不传入整个ThreeRuntime或共享可变context；异步请求版本与资源释放先后顺序仍由对应owner保证。`pathtracing.ts` 的backend驱动与释放适配进入 `pathtrace-drivers.ts`，会话只保留采样生命周期。两文件的逐文件大小例外已删除，整个three-runtime包都受默认500行门禁约束。

公开业务函数、生命周期方法、异步状态转换和资源所有者应有简洁注释，说明用途及关键状态约束、副作用、资源释放责任或性能取舍。简单回调不需要注释。注释需随实现变化维护。当前规则由代码评审落实：自动检查注释存在与否会奖励重复函数名或无信息注释，无法可靠判断其是否准确解释了真实约束，因此不以注释数量或 AST 存在性冒充质量检查。

当前保留TypeScript6，未开启 [Oxlint type-aware模式](https://oxc.rs/docs/guide/usage/linter/type-aware.html)：当前官方兼容要求为TypeScript7及额外oxlint-tsgolint依赖。这次工具接入不顺带升级编译器；`typecheck`保留官方tsc的四套严格检查，不声称它能替代未启用的no-floating-promises等类型感知lint规则。

## 有理由的局部例外

这些例外写在实际代码旁，只关闭对应位置的一条规则；禁止对整包关闭检查来制造通过。

| 位置／规则                                                  | 保留原因                                                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| EditorCore／SessionStore／Signal／门动画的no-useless-spread | 订阅者或动画Map可在回调提交命令时变化，复制集合固定一次派发范围，不能直接迭代会被修改的活集合                                          |
| 文件名清洗的no-control-regex                                | 明确去除Windows文件名中的ASCII控制字符；保留真实文件规则                                                                               |
| 图片异步测试探针的no-this-alias                             | 捕获原生HTMLImageElement接收者，延迟真实事件后仍以同一对象调用监听器                                                                   |
| shadcn Field的prefer-tag-over-role                          | 公开API是通用div属性和组合容器，role=group合法，不强行改fieldset导致公共类型和浏览器默认布局改变                                       |
| 原生Header的no-noninteractive-element-interactions          | 原生标题栏背景需要鼠标拖动／双击；保留banner地标而不伪装按钮或增加焦点，最小化／最大化／关闭由实际按钮提供键盘操作，仅豁免该Header标签 |

React refs／immutability／exhaustive-deps均保持启用。渲染期间写ref已改为layout effect；服务层通过attachRuntime及按实例detach清理桥接，主题／语言切换不重建Renderer。状态栏使用语义output。

## 格式化排除

第三方Skills有固定SHA256，token CSS与生成器逐字比较，原始PRD和验收表的42行条件精确校验。故排除 `.agents`、生成CSS、原文两份Markdown、测试／构建产物、Tauri生成schema、示例source JSON及锁文件；源token JSON、实际源码和测试仍在检查中。导入、Tailwind类与package.json不自动排序，保留副作用导入及数据键顺序。完整列表在 `.oxfmtrc.json` 和 `.oxlintrc.json`。

## 日常命令与CI

`.gitattributes`将维护源码与生成文本的检出换行固定为LF，避免Windows默认autocrlf破坏格式及生成CSS检查。固定Skills、原PRD／验收文件、示例source JSON保持原始字节，不通过Git换行转换改变其哈希或证据。提交前还核对暂存Skills的SHA256与清单一致；工作区检查通过不能代替检出内容核验。

```powershell
npm run format          # 写入格式
npm run format:check    # 只检查
npm run lint            # 零警告检查
npm run lint:fix        # 仅安全自动修复，剩余问题仍失败
npm run typecheck       # workspace、node、无DOM core及geometry
npm run check           # 格式 + lint + 架构/token/Skills/行数检查
npm run verify          # check + typecheck + 单元测试 + 生产构建
```

`npm run build`已有check前置，Tauri构建继续复用此入口。VS Code／兼容编辑器推荐 [官方Oxc扩展](https://oxc.rs/docs/guide/usage/formatter/editors.html)，仅源代码语言启用保存格式化；不更改用户全局设置，不声称已经安装编辑器扩展。

`.github/workflows/quality.yml`提供Windows代码质量流程：push／PR／手动触发，最小contents:read权限，checkout v6和setup-node v7锁定实际官方标签提交，Node26.1.0／npm12.2.0、npm ci、npm run verify。工作流配置存在不等于远程 CI 已通过，也不代表 Tauri／macOS 验收；以实际远程运行结果为准。

## 验证与产物

Storybook 源码、示例和浏览器测试也参加格式、lint 与独立类型检查。UI 包禁止建筑、Three 与 Tauri 依赖；桌面禁止 Storybook／Sucrase 依赖。公共 UI 调用由 AST 检查禁止 className/style 外观覆盖。

Select 的丰富选项使用 APG combobox/listbox/option 主动后代模式；局部 `prefer-tag-over-role` 仅覆盖原生 option 不能承载的外部 slots，不关闭整包检查。

测试源码纳入版本管理，报告、截图、trace、基准与安装产物统一写入被忽略的 `.test-artifacts/`。`docs/` 不存逐轮运行报告；[PROGRESS.md](PROGRESS.md) 和 [KNOWN-ISSUES.md](KNOWN-ISSUES.md) 只记录最近结果、当前失败与平台限制。UI 改动仍须实际检查中英文截图，删除旧产物不能变成未验证通过。
