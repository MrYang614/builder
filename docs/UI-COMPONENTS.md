# 基础 UI 组件体系

桌面编辑器与独立 Storybook 直接消费同一套 `@building/ui`。公共组件通过严格类型的语义 props 封装常用结构、外观和交互；底层 Radix/shadcn 组合保留在 `src/primitives`。本文件记录完整公共 API、组件覆盖与调用迁移，不替代 [ACCEPTANCE.md](ACCEPTANCE.md) 的原生验收。

## 验证记录的范围

下表的“验证通过”只表示已保存的指定源码、CLI或浏览器用例通过。最新已完成证据为 [Storybook完整64／64报告](../test-results/ui-foundation-2026-10-13/storybook-results-final.json) 与 [独占GPU编辑器60／60报告](../test-results/ui-foundation-2026-10-13/editor-results-final.json)：35个家族入口、294个stories及35个docs、输入／浮层／菜单／切换、420px布局、代码／配置错误恢复、Controls同步和本地HMR均通过。此前 [Storybook初轮报告](../test-results/ui-foundation-2026-10-13/storybook-results-full-initial.json) 的窄屏／HMR失败和编辑器并发GPU失败原样保留，不用后续通过反推原失败原因。

家族 stories 包括默认、亮暗主题、窄容器以及适用的尺寸、variant、禁用、只读、loading、错误、受控和非受控状态。浏览器“渲染通过”验证真实公开组件能编译、挂载且无页面错误，不等同每个props组合都做了人工交互、屏幕阅读器认证或Windows/Tauri/macOS验收。干净npm ci、format／lint:fix／check、五套TS、374项／41文件单元、Rust25、桌面前端及Storybook静态build已通过；日志、SHA、原始失败与截图位于 `test-results/ui-foundation-2026-10-13/`。最终64／64包含新增manager Default／Disabled的整页刷新、真实侧栏重入、variant Reset和全浏览器存储不变断言；可选Review自动持久化已关闭，6008最终静态构建另经人工刷新／重入确认。首次失败报告保留。

## 公共 API 规则

- 有 `size` 的组件使用 `sm` / `md` / `lg`，默认 `md`，表示紧凑、标准、舒适密度。各家族按职责决定实际高度，不承诺所有家族相同像素尺寸；TextArea、范围 Slider、内容容器和多选标签还会随内容增长。
- 有 `width` 的组件使用 `full` / `auto`。Input 家族、InputNumber、Select、Slider 默认 `full`；Button、Segmented、ToggleGroup 默认 `auto`。页面容器负责排列、区域大小与响应布局。
- `variant` 表达组件用途，枚举由家族定义；输入与选择的 `status` 是 `error` / `warning`。没有 status 表示正常。两者不接受任意 CSS 或 Tailwind 字符串。
- 受控值使用 `value` + `onValueChange`，非受控初值使用 `defaultValue`。不在同一实例中切换受控模式；`defaultValue` 不作为后续外部同步入口。
- 勾选使用 `checked` / `defaultChecked` + `onCheckedChange`；普通浮层使用 `open` / `defaultOpen` + `onOpenChange`。ContextMenu 由触发事件的位置打开，仅提供 `onOpenChange`，不提供受控 `open` / `defaultOpen`。
- `onValueChange` 表达输入/选择变化，不执行建筑命令。Input 家族与 InputNumber 的 `onCommit` 表达草稿确认，返回 `false` 保留可修正内容，返回 `true` / `void` 接受。领域校验、EditorCore 命令、撤销和历史仍由应用层负责。
- `disabled` 阻止交互，`readOnly` 在适用控件中保留读值和焦点并阻止变更。Form.Section / Form.Item 的禁用 context 合并到子字段；子字段不能用 `disabled={false}` 绕过禁用字段组。`loading` 仅在适用异步动作中提供，阻止重复触发。
- ref 只在有明确 DOM 目标的家族提供：Button / Button.Icon 指向 button；Input / Password / Search / InputNumber 指向 input；TextArea 指向 textarea；Select 指向触发 button；Dialog / ConfirmDialog / Popover 指向内容 div。Checkbox / Radio / Switch 的 ref 指向其实际 Radix 按钮控件；其余继承 ref 的 Root 指向对应根元素，Slider 根 ref 不等于第一个 thumb。
- options 的 `value` 和菜单项 `id` 必须唯一且稳定。SelectOption / ChoiceOption 的 label 可以是 ReactNode；自定义 Select label 使用 `searchText` 提供可搜索文字。TabItem / SegmentedOption / ToggleOption 的 label 是 string，便于键盘及图标模式提供确定名称。
- `ComponentIcon` 是 SVG 组件或 ReactElement；前后缀、标题、内容、action、footer 等明确 ReactNode 插槽在 TSX 中定义。JSON 配置只表达有 schema 的可序列化 props，不编码回调或 ReactNode。
- 原生属性冲突通过 `Omit` 和显式类型解决。公共组件不接收用于内部外观修正的 `className` / `style`，没有把任意样式字符串换名为新 prop。
- `Form.Item` 建立稳定的 label/control/help/error 关联，并把 required、invalid 和 disabled 传给字段。Group / Section 是字段组织入口；普通 label 不需要调用者再拼装。

## 完整覆盖与调用迁移矩阵

Story 与示例两列分别相对于 `apps/storybook/src/stories/` 和 `apps/storybook/src/examples/`。表内应用路径相对于 `apps/desktop/src/`；“无正式调用”表示本次新增可消费基础组件，没有为凑覆盖把它强行插入建筑业务。验证代码在下表后展开为真实测试文件和用例。

| 家族                        | 旧 API / 重复实现                                                               | 新 API / 迁移结果                                                                       | 正式应用调用文件                                                                                                                                                | Story / 实际示例                                            | 验证及状态                                                            |
| --------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Button                      | Button 的默认/图标尺寸、className；楼层和对象项的外观 CSS                       | Button：size、width、alignment、wrap、icon、suffix、loading                             | `App.tsx`；`ui/Floors.tsx`；`ui/Inspector.tsx`；`ui/MaterialFields.tsx`；`ui/RenderingSettings.tsx`；`ui/ToolOptions.tsx`；`ui/RenderControls.tsx`；弹窗 footer | `button.stories.tsx` / `button.example.tsx`                 | C、B1；验证通过                                                       |
| Button.Icon                 | 顶层 IconButton；Button 图标 size；Tooltip 重复包裹                             | 必填 label/icon，统一尺寸与 tooltip；关闭动作使用 danger-ghost                          | `App.tsx`；`ui/Floors.tsx`；`ui/HeaderPreferences.tsx`；`ui/WindowControls.tsx`                                                                                 | `button-icon.stories.tsx` / `button.example.tsx`            | C、B5：禁用与提示；验证通过                                           |
| Button.Group                | 没有共享组 API，相关动作直接排列                                                | 静态 family 成员；fieldset 组、label、方向；页面布局仍独立                              | 无正式调用；示例中的成组动作已消费                                                                                                                              | `button-group.stories.tsx` / `button.example.tsx`           | C、B1；验证通过                                                       |
| Input                       | Input 接收外观覆盖；fields 文本草稿自行组合事件                                 | 文本 value 事件、可选 commit 草稿、清空、前后缀；保留 color/file 原生专用分支           | `ui/fields.tsx`；`ui/MaterialFields.tsx` 的颜色字段                                                                                                             | `input.stories.tsx` / `input.example.tsx`                   | C、I1、I2；验证通过                                                   |
| Input.TextArea              | 无共享家族 API                                                                  | 唯一拼写 TextArea；autoSize、showCount、maxLength、font、草稿确认                       | 无正式调用；Storybook 编辑器使用同一实现                                                                                                                        | `input-text-area.stories.tsx` / `textarea.example.tsx`      | C、I1：行数上限、字数与滚动；验证通过                                 |
| Input.Password              | 无共享家族 API                                                                  | value 与显隐状态分离；显隐按钮不丢失输入焦点                                            | 无正式调用                                                                                                                                                      | `input-password.stories.tsx` / `password.example.tsx`       | C、I1：显隐、值与焦点；验证通过                                       |
| Input.Search                | 无共享家族 API                                                                  | 当前草稿的 Enter / 按钮搜索；清空与 loading                                             | 无正式调用                                                                                                                                                      | `input-search.stories.tsx` / `search.example.tsx`           | C、I1：当前中文/英文搜索值；验证通过                                  |
| InputNumber                 | `ui/fields.tsx` Numeric 自有 state、格式化及键盘/blur 逻辑                      | 独立 number/null API；中间文本只留草稿，精度与 commit/IME/取消由组件处理                | `ui/fields.tsx`；经 Numeric 供 Floors、Inspector、MaterialFields、RenderingSettings、SnappingSettings 使用                                                      | `input-number.stories.tsx` / `input-number.example.tsx`     | C、I2；验证通过                                                       |
| Select                      | Select Root/Trigger/Value/Content/Item；Choice 和 HeaderChoice 重复拼装         | options 完整 selector；单选/多选、搜索、清空、分组、禁用、空结果、图标触发              | `ui/fields.tsx`；`ui/HeaderPreferences.tsx`                                                                                                                     | `select.stories.tsx` / `select.example.tsx`                 | C、I3、N；验证通过（含420px布局）                                     |
| Checkbox                    | 原生 checkbox 与 Input type=checkbox 混用                                       | checked/defaultChecked/onCheckedChange、indeterminate、字段状态和标签                   | `ui/ToolOptions.tsx`；`ui/MaterialFields.tsx`；`ui/RenderingSettings.tsx`                                                                                       | `checkbox.stories.tsx` / `checkbox.example.tsx`             | C、I4；验证通过                                                       |
| Checkbox.Group              | 无共享组 API                                                                    | options + string[] 成员选择，稳定 value、禁用/只读、方向和组名称                        | 无正式调用                                                                                                                                                      | `checkbox-group.stories.tsx` / `checkbox-group.example.tsx` | C、I4：多选、禁用项；验证通过                                         |
| Radio                       | 无共享组件                                                                      | 单独的 checked/defaultChecked/onCheckedChange；互斥选择使用 Group                       | 无正式调用                                                                                                                                                      | `radio.stories.tsx` / `radio.example.tsx`                   | C：全部状态渲染；验证通过（渲染范围）                                 |
| Radio.Group                 | 无共享组 API                                                                    | options + string；Radix 焦点配合同步箭头选择，快速 keyup 不丢事件                       | 无正式调用                                                                                                                                                      | `radio-group.stories.tsx` / `radio-group.example.tsx`       | C、I4：跳过禁用、环回、一次回调、修饰键；验证通过                     |
| Switch                      | 无共享组件                                                                      | checked/defaultChecked/onCheckedChange，禁用/只读与标签                                 | 无正式调用                                                                                                                                                      | `switch.stories.tsx` / `switch.example.tsx`                 | C、I4；验证通过                                                       |
| Slider                      | 已公开 Slider，无正式应用调用；范围标签需调用者补齐                             | number[] 单值/范围；thumbLabels、onValueChange/onValueCommit、readOnly                  | 无正式调用                                                                                                                                                      | `slider.stories.tsx` / `slider.example.tsx`                 | C、B7：标签焦点、只读键盘与范围变更；验证通过                         |
| Form.Item / Group / Section | Field、FieldGroup、FieldSet、FieldLegend、FieldLabel；字段外观和 label 重复组合 | 一个 Form 家族；关联标签/帮助/错误/必填、组列数/密度、禁用 section                      | `ui/fields.tsx`；`ui/Floors.tsx`；`ui/Inspector.tsx`；`ui/MaterialFields.tsx`；`ui/RenderDialog.tsx`；`ui/RenderingSettings.tsx`；`ui/SnappingSettings.tsx`     | `form.stories.tsx` / `form.example.tsx`                     | C、I1/I2、B2/B7：字段关联与焦点；验证通过                             |
| Tooltip                     | Root/Trigger/Content；图标入口重复包裹                                          | content + 单个 children；图标按钮和 Select 图标外观内部集成提示                         | `ui/ToolOptions.tsx` 直接使用；App、Floors、HeaderPreferences、WindowControls 经完整组件消费                                                                    | `tooltip.stories.tsx` / `tooltip.example.tsx`               | C、B5：禁用提示、Escape；验证通过                                     |
| Popover                     | 无共享公共组件                                                                  | trigger、标题/描述/正文/关闭控制，size/side/align，受控/非受控                          | 无正式调用；Select 内部借用 Radix定位原语                                                                                                                       | `popover.stories.tsx` / `popover.example.tsx`               | C、B5：关闭与焦点恢复；验证通过                                       |
| DropdownMenu                | 无共享公共组件                                                                  | MenuItem 配置 action、separator、group、submenu、checkbox、radio；完整触发和定位        | 无正式调用                                                                                                                                                      | `dropdown-menu.stories.tsx` / `dropdown-menu.example.tsx`   | C、B4：键盘、禁用、子菜单、勾选/radio、关闭；验证通过                 |
| ContextMenu                 | 无共享公共组件                                                                  | 复用 MenuItem；右键及 Shift+F10/Menu key 触发，无独立 open prop                         | 无正式调用                                                                                                                                                      | `context-menu.stories.tsx` / `context-menu.example.tsx`     | C、B4：右键、键盘打开/选择/关闭；验证通过                             |
| Dialog                      | Root/Content/Title/Description/Footer/Trigger；调用者控制宽高、滚动及组合       | title/description/children/footer/trigger/size；内部滚动、关闭、焦点恢复和 draft Escape | `ui/SettingsDialog.tsx`；`ui/RenderDialog.tsx`；`ui/confirm.tsx`                                                                                                | `dialog.stories.tsx` / `dialog.example.tsx`                 | C、B2：description、焦点 trap、草稿 Escape、opener 恢复；验证通过     |
| ConfirmDialog               | 原有应用 ConfirmProvider 是业务承诺/三选一确认，无通用 UI 组件                  | 新增通用二选一 async 确认；应用 save/discard/cancel 继续由 provider + 高层 Dialog 负责  | 新 ConfirmDialog 无正式调用；`ui/confirm.tsx` 已移除低层 Dialog 拼装，保留应用 promise 结算职责                                                                 | `confirm-dialog.stories.tsx` / `confirm-dialog.example.tsx` | C、B3、L：失败重试、防重/防误关闭、迟到请求隔离；验证通过             |
| Tabs                        | 无共享组件                                                                      | TabItem[]，自动/手动激活、方向、尺寸和 line/pills                                       | 无正式调用                                                                                                                                                      | `tabs.stories.tsx` / `tabs.example.tsx`                     | C、B6：跳过禁用、手动激活与关联 panel；验证通过                       |
| Segmented                   | 无共享组件                                                                      | SegmentedOption[]，受控/非受控互斥选择；同步键盘 value + Radix焦点                      | 无正式调用                                                                                                                                                      | `segmented.stories.tsx` / `segmented.example.tsx`           | C、B6：快速箭头选择及一次回调；验证通过                               |
| Toggle                      | 已有低层 Toggle；App/ToolOptions 自行包裹提示                                   | pressed/defaultPressed/onPressedChange、icon/label/tooltip、统一尺寸                    | `ui/ToolOptions.tsx` 的吸附开关                                                                                                                                 | `toggle.stories.tsx` / `toggle.example.tsx`                 | C：全部状态渲染；验证通过（渲染范围）；正式应用交互结果见对应回归记录 |
| ToggleGroup                 | Root/Item；工具、相机的选项与图标/提示重复组合                                  | ToggleOption[]；单选/多选、iconOnly、tooltip、禁用；不再公开 Item 顶层入口              | `App.tsx` 工具选择；`ui/ToolOptions.tsx` 相机控制                                                                                                               | `toggle-group.stories.tsx` / `toggle-group.example.tsx`     | C、B6：真实 radio角色、键盘焦点和选中；验证通过                       |
| Accordion                   | 无共享组件                                                                      | items，single/multiple 类型区分 value，单项可关闭                                       | 无正式调用                                                                                                                                                      | `accordion.stories.tsx` / `accordion.example.tsx`           | C、B6：跳过禁用 header，键盘展开；验证通过                            |
| Alert                       | Alert/AlertTitle/AlertDescription；调用者重复拼装正文与 action                  | title/description/children/icon/action/onClose，default/destructive/success/warning     | `App.tsx` 错误提示                                                                                                                                              | `alert.stories.tsx` / `alert.example.tsx`                   | C、B3 的拒绝错误提示；验证通过                                        |
| Badge                       | 无共享组件                                                                      | variant、size、icon、children                                                           | 无正式调用；Storybook 目录消费                                                                                                                                  | `badge.stories.tsx` / `badge.example.tsx`                   | C：全部语义 variants 与尺寸渲染；验证通过（渲染范围）                 |
| Card                        | 无共享组件                                                                      | title/description/extra/content/footer、size                                            | 无正式调用；Storybook 目录消费                                                                                                                                  | `card.stories.tsx` / `card.example.tsx`                     | C：真实内容、尺寸和主题渲染；验证通过（渲染范围）                     |
| Separator                   | 已有内部文件，顶层未导出；Field 内消费                                          | 公开 orientation/decorative；原 Field primitive 的内部引用独立                          | 无正式调用                                                                                                                                                      | `separator.stories.tsx` / `separator.example.tsx`           | C：两个方向与语义状态渲染；验证通过（渲染范围）                       |
| Empty                       | 无共享组件                                                                      | title/description/icon/action/size，不提供假交互                                        | 无正式调用                                                                                                                                                      | `empty.stories.tsx` / `empty.example.tsx`                   | C：空状态与 action 槽渲染；验证通过（渲染范围）                       |
| Skeleton                    | 无共享组件                                                                      | lines/shape/animated/label                                                              | 无正式调用                                                                                                                                                      | `skeleton.stories.tsx` / `skeleton.example.tsx`             | C：text/circle/rectangle 和减少动画状态渲染；验证通过（渲染范围）     |
| Spinner                     | 无共享组件                                                                      | size/label，status 可访问名称与 reduced-motion                                          | 无正式调用                                                                                                                                                      | `spinner.stories.tsx` / `spinner.example.tsx`               | C、B1：status 名称；验证通过                                          |
| Progress                    | 无共享组件                                                                      | value/null/max/label/showValue/size/status，有限值钳制/不确定进度                       | 无正式调用                                                                                                                                                      | `progress.stories.tsx` / `progress.example.tsx`             | C、B1：可访问值与上限；验证通过                                       |

### 对应的真实浏览器用例

| 代码 | 文件 / 用例                                                                                                                        | 已验证内容                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C    | `apps/storybook/tests/catalog.spec.ts`；`all <family> stories render the shared implementation`                                    | 每个家族遍历 index.json 中全部 stories；真实共享导入、源码/配置/运行错误与 pageerror 为零。目录用例还检查全部入口和 props 文档。 |
| I1   | `apps/storybook/tests/inputs.spec.ts`；`input family clears, reveals passwords, resizes text and submits the current search value` | 受控清空及焦点、Password 显隐与焦点、TextArea 自动行数/字数/滚动、中文与英文 Search、disabled/readOnly。                         |
| I2   | 同文件；`numeric and text commit drafts preserve precision, IME, rejection and external updates`                                   | 中间态、正式精度、不按字提交、Enter/blur 去重、非法/业务拒绝、IME、外部变更与 Escape、错误恢复。                                 |
| I3   | 同文件；`select supports searchable groups, disabled options, multiple values, clear and dynamic options`                          | 搜索输入焦点、分组、禁用、空结果、单/多选、清空、动态 label 和选中身份、Escape 返回焦点。                                        |
| I4   | 同文件；`checkbox, radio and switch preserve keyboard and disabled or read-only behavior`                                          | 勾选/组/开关、禁用与只读；Radio 快速箭头、禁用跳过/环回、每次变更一次回调、修饰键保持。                                          |
| B1   | `apps/storybook/tests/components.spec.ts`；`loading action blocks repeat activation and progress exposes clamped values`           | loading 防重、按钮键盘动作、按钮组、Progress 钳制/显示值、Spinner status 名称。                                                  |
| B2   | 同文件；`dialog protects draft Escape, traps focus and restores a controlled opener`                                               | 标签/description、输入自动焦点、草稿 Escape 不关闭、Tab trap、关闭后真实 opener 恢复。                                           |
| B3   | 同文件；`confirmation retains a rejected action, retries, and blocks dismissal during pending work`                                | async 拒绝后错误保留、重试、pending 防重复/禁关闭、成功关闭和再次打开。                                                          |
| B4   | 同文件；`dropdown and context menus navigate disabled entries and submenus`                                                        | 键盘跳过禁用、子菜单、选择/关闭/恢复，ContextMenu 右键与 Shift+F10，checkbox keepOpen 与 radio。                                 |
| B5   | 同文件；`popover restores focus and disabled icon actions retain explanatory tooltips`                                             | Popover 定位内容与关闭、trigger 焦点、禁用图标提示与 Escape。                                                                    |
| B6   | 同文件；`organization families expose keyboard choice and associated panels`                                                       | Tabs 手动激活与 panel、Segmented 快速箭头及单次回调、ToggleGroup 当前 Radix radio角色与键盘、Accordion disabled skip。           |
| B7   | 同文件；`readonly slider values stay keyboard stable and labels link to the first thumb`                                           | 字段 label 令首 thumb 获焦点、readonly 不被箭头/Home 修改、范围 thumb 键盘变更。                                                 |
| L    | `apps/storybook/tests/confirmation-lifecycle.spec.ts`                                                                              | 外部关闭 pending 受控确认、重新打开恢复 enabled、旧 Promise 完成不能关闭新确认。                                                 |

这些用例通过不证明尚未执行的物理触摸、完整辅助技术、操作系统焦点/DPI、多屏或原生 WebView 行为。新增源码后必须复跑相应场景；不能只凭旧报告沿用状态。

| 代码 | 文件 / 已完成用例                                                                                                                               | 验证内容                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N    | `apps/storybook/tests/catalog.spec.ts`；`narrow CJK layout and positioned overlays remain within the preview viewport`                          | 420px完整页面不横向溢出，Select浮层在视口内，暗色窄Dialog可打开/关闭；最新64／64通过。                                                                         |
| H    | `apps/storybook/tests/playground.spec.ts`；`local component, example and configuration HMR preserve browser drafts and refresh reset baselines` | 真实修改组件／TSX／JSON并观察HMR，已有草稿保留，Reset使用最新基线；482源码／配置输入SHA一致，试改按原字节恢复。                                                |
| P    | 同文件的代码／JSON错误恢复、Controls双向同步、无代码／配置改动的局部state重置、组件默认值／基线文档审计                                         | 全部在最新64／64通过；Controls用例包含Update story／Create new story两个保存按钮absence断言。iframe刷新恢复已测；新发现的manager刷新／重新进入路径另列待复验。 |

### 开发工具与迁移检查

| 要求                                        | 实现 / 调用点                                                                                                                                     | 对应验证                                                                                                    | 本表状态                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 真实独立 Storybook 与完整目录               | `apps/storybook/package.json`、`.storybook/main.ts` / `preview.tsx`、`src/stories`；目录 `overview.stories.tsx`                                   | C；35入口、294stories、35docs，最新完整64／64                                                               | 验证通过（浏览器渲染范围）        |
| TSX 与 JSON 临时编辑 / 错误恢复             | `src/playground`；Sucrase、schema、边界；全部stories消费同一Playground                                                                            | P；代码/JSON/运行错误恢复、页面内存、iframe刷新及Reset状态；6008静态人工编辑证据                            | 验证通过（指定路径）              |
| Controls 与 JSON 同一状态来源               | `story-helpers.tsx` 的 `useArgs`；JSON解析与schema更新args                                                                                        | P的双向同步用例；`storybook-delivery.log`                                                                   | 验证通过                          |
| 标准Controls不能把临时编辑写回story         | `.storybook/preview.tsx` 官方`controls.disableSaveFromUI: true`                                                                                   | P精确检查Update story/Create new story按钮不存在；最新64／64和`storybook-build-delivery.log`                | 验证通过                          |
| 本地源码 / 示例 / JSON HMR 与浏览器草稿共存 | 页面内存快照、baseline提示、明确Reset、编译版本与监听清理                                                                                         | H；`source-restoration.json`：483项、changed[]、restoredExactly=true                                        | 验证通过（已测本地HMR路径）       |
| 420px中英文页面与浮层布局                   | 共享semantic props + 可收缩workshop容器；props表内部横向滚动                                                                                      | N；初轮失败保留，最新64／64对应场景通过                                                                     | 验证通过（指定视口）              |
| 正式调用去除低层拼装与外观覆盖              | 上述正式文件；旧低层顶层入口移除，无正式primitive引用；约82行重复CSS移除                                                                          | check.log架构/外观规则；editor-exclusive.log同源同断言独占GPU60／60                                         | 验证通过（源码与浏览器条件）      |
| 独立静态构建、类型与生产依赖隔离            | Storybook专属编译器/预览依赖；五套严格TS与包边界规则                                                                                              | clean npm ci；check.log；374项/41文件unit、Rust25；desktop-build.log／storybook-build-delivery.log          | 验证通过（CLI／构建条件）         |
| Storybook manager刷新／重新进入恢复仓库基线 | 真实entry用公开resetArgs/context.initialArgs恢复当前variant；HMR草稿恢复除外；features.experimentalReview=false阻止可选Review自动写sessionStorage | manager-memory.spec.ts两变体严格通过、最终64／64；manual-browser/manager-refresh-final.json最终静态人工复验 | 验证通过（实际manager与静态构建） |

## 公共类型与合理扩展入口

所有下列类型都从 `@building/ui` 顶层公开导出，使用者无需引用内部组件源文件：

| 家族                      | 公开类型                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共用                      | `ComponentSize`、`ComponentWidth`、`ComponentIcon`                                                                                                    |
| Button                    | `ButtonProps`、`IconButtonProps`、`ButtonGroupProps`、`ButtonVariant`；IconButtonProps 是 `Button.Icon` 的 props 类型，不代表恢复顶层 IconButton 组件 |
| Input                     | `InputProps`、`TextAreaProps`、`PasswordProps`、`SearchProps`                                                                                         |
| InputNumber / Select      | `InputNumberProps`、`SelectProps`、`SelectOption`                                                                                                     |
| Checkbox / Radio / Switch | `CheckboxProps`、`CheckboxGroupProps`、`RadioProps`、`RadioGroupProps`、`SwitchProps`、`ChoiceOption`                                                 |
| Form                      | `FormProps`、`FormItemProps`、`FormGroupProps`、`FormSectionProps`                                                                                    |
| Tooltip / Popover         | `TooltipProps`、`TooltipProviderProps`、`PopoverProps`                                                                                                |
| 菜单                      | `DropdownMenuProps`、`ContextMenuProps`、`MenuItem`                                                                                                   |
| Dialog / ConfirmDialog    | `DialogProps`、`ConfirmDialogProps`                                                                                                                   |
| 切换与组织                | `TabsProps`、`TabItem`、`SegmentedProps`、`SegmentedOption`、`ToggleProps`、`ToggleGroupProps`、`ToggleOption`、`AccordionProps`、`AccordionItemData` |
| 展示与反馈                | `AlertProps`、`BadgeProps`、`CardProps`、`SeparatorProps`、`EmptyProps`、`SkeletonProps`、`SpinnerProps`、`ProgressProps`、`SliderProps`              |

默认只使用完整顶层家族。复杂组合确有高层 API 无法覆盖的需求时，可从 `@building/ui/primitives` 取明确命名空间：`ButtonPrimitive`、`DialogPrimitive`、`FieldPrimitive`、`InputPrimitive`、`InputGroupPrimitive`、`SelectPrimitive`、`TooltipPrimitive`、`PopoverPrimitive`、`TogglePrimitive`、`ToggleGroupPrimitive`、`MenuPrimitive`、`TabsPrimitive`、`AccordionPrimitive`、`SegmentedPrimitive`、`SliderPrimitive`、`ProgressPrimitive`、`LabelPrimitive`、`SeparatorPrimitive`、`AlertPrimitive`。包也声明 `components/*` / `primitives/*` 的文件级公开出口；不会允许跨包引用未导出的私有实现。

高级组合需要明确承担标题/描述、组名称、键盘顺序、焦点返回及资源清理责任，并记录实际扩展原因。该入口用于少量特殊组合，不用于把旧低层拼装或页面 className/style 外观覆盖搬回来。`TooltipProvider` 作为有实际延迟配置职责的 provider 保留顶层出口；普通 Tooltip 已能独立使用，无需强制额外 provider。

## 各家族准确默认值

下表列出可影响行为的默认值；完整原生属性与严格类型以源码及 Storybook props 表为准。未列出或无适用性的 size / width / loading / readOnly 不会人为添加。

| 家族                          | 默认值 / 必填与事件约定                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                        | `variant=default`、`size=md`、`width=auto`、`alignment=center`、`wrap=false`、`loading=false`、`type=button`。loading 可使用 loadingLabel；icon 与 suffix 是明确插槽。                                                                                                                                                                |
| Button.Icon / Group           | Icon 必填 `label`、`icon`；`variant=ghost`、`tooltip=true`、`size=md`。Group `orientation=horizontal`，label 可选，没有共享选中状态。                                                                                                                                                                                                 |
| Input                         | 未受控 `defaultValue=''`；`size=md`、`width=full`、`allowClear=false`、`type=text`。清空文案可配置；color/file 原生专用分支不混入一般文本提交语义。                                                                                                                                                                                   |
| TextArea                      | `defaultValue=''`、`autoSize=false`、`showCount=false`、`font=default`；autoSize 对象默认最小 2 行、最大不限制，可指定 minRows/maxRows。普通 Enter 换行；提供 onCommit 时 Ctrl/Cmd+Enter 确认，blur 确认，Escape 取消。                                                                                                               |
| Password / Search             | Password `visibilityToggle=true`；显隐不改变值。Search `loading=false`，onSearch 接收当前文本，按钮与 Enter 共用路径。两者继承文本输入尺寸/宽度/清空默认值。                                                                                                                                                                          |
| InputNumber                   | `defaultValue=null`、`allowClear=false`、`size=md`、`width=full`；min/max/step 默认未指定。空字符串是 null；只有明确提供有效 step 时上下键步进。onValueChange/onCommit 的值均为 number/null。                                                                                                                                         |
| Select                        | `multiple=false`、`searchable=false`、`allowClear=false`、`defaultOpen=false`、`appearance=default`、`size=md`、`width=full`，没有隐式选中首项。单选清空发出 undefined，多选清空发出 []；禁用/只读不能打开或变更。                                                                                                                    |
| Checkbox / Radio / Switch     | 单控件 `defaultChecked=false`；Checkbox `indeterminate=false`。Checkbox.Group `defaultValue=[]`，Radio.Group 初值为空；两组 `orientation=vertical`。布尔控件事件为 onCheckedChange，组事件为 onValueChange。                                                                                                                          |
| Slider                        | `min=0`、`max=100`、`defaultValue=[min]`、`width=full`、`size=md`、`readOnly=false`；value 为 number[]，onValueChange 为拖动/键盘变化，onValueCommit 为结束确认；每个 thumb 可配置名称。                                                                                                                                              |
| Form                          | Item `orientation=vertical`、`required=false`、`disabled=false`、`announceError=true`；id/htmlFor 未传时生成稳定控制 id。Group `gap=compact`、`columns=1`。Section title/description 可选，disabled 默认 false，并合并父级禁用。                                                                                                      |
| Tooltip                       | 必填 content / 单个 children；`side=top`、`align=center`、`delayDuration=250`、`disabled=false`。底层独立 TooltipProvider 的 delayDuration 默认 0；普通 Tooltip 自带局部 provider。                                                                                                                                                   |
| Popover                       | 必填 trigger / children；`side=bottom`、`align=center`、`size=md`，Radix `modal=false`；closeLabel 未传不显示关闭按钮。                                                                                                                                                                                                               |
| DropdownMenu / ContextMenu    | 必填 items；DropdownMenu 必填 trigger，`side=bottom`、`align=start`、`disabled=false`，Radix modal 默认 true。ContextMenu 必填单个 children，disabled=false；右键、Shift+F10 或 Menu key 打开。                                                                                                                                       |
| Dialog                        | 必填 title；`size=md`、`dismissible=true`、`showCloseButton=true`、`closeLabel='Close'`、`role=dialog`；Radix modal 默认 true。正文滚动限制在视口内；可配置 initialFocusRef。                                                                                                                                                         |
| ConfirmDialog                 | 必填 title / confirmLabel / cancelLabel / onConfirm；`defaultOpen=false`、`destructive=false`、`loading=false`，固定 alertdialog、无右上关闭按钮，优先聚焦取消按钮。成功关闭，拒绝保留错误并允许重试；pending 时禁用确认/取消与用户 dismissal。                                                                                       |
| Tabs / Segmented              | Tabs `variant=line`、`size=md`、`orientation=horizontal`、Radix `activationMode=automatic`，非受控时默认首个可用 item。Segmented `width=auto`、`size=md`、`orientation=horizontal`，非受控时默认首个可用 option。                                                                                                                     |
| Toggle / ToggleGroup          | Toggle `variant=default`、`size=md`、Radix defaultPressed=false。ToggleGroup `type=single`、`variant=default`、`size=md`、`width=auto`、`orientation=horizontal`、`iconOnly=false`、`tooltip=false`，没有隐式选中。single 的 value/callback 为 string、角色为 radiogroup/radio；multiple 为 string[]、角色为 toolbar/pressed button。 |
| Accordion                     | `type=single`、single 的 `collapsible=true`，没有隐式展开。single 使用 string，multiple 使用 string[]；items 必须有稳定 value、title 和 content。                                                                                                                                                                                     |
| Alert / Badge / Card          | Alert `variant=default`，默认语义图标；icon=false 隐藏图标，onClose 才显示 dismiss。Badge `variant=secondary`、`size=md`。Card `size=md`，title/description/extra/footer 可选。                                                                                                                                                       |
| Separator / Empty             | Separator `orientation=horizontal`、`decorative=true`。Empty 必填 title，`size=md`，默认 Inbox 图标，icon=false 隐藏；action 在代码中提供。                                                                                                                                                                                           |
| Skeleton / Spinner / Progress | Skeleton `lines=3`、`shape=text`、`animated=true`、`label='Loading'`，lines 限制在 1–20。Spinner `size=md`、`label='Loading'`。Progress `value=null`（不确定）、`max=100`、`size=md`、`status=default`、`showValue=false`；非法 max 回退 100，有限值钳制在 0–max。                                                                    |

默认英文可访问文案都可经明确文案 props 改为本地语言；正式应用已沿原语言 owner 提供相应动作名称。TextArea 计数使用字符串 length，可自定义 countLabel；浏览器内不进行建筑合法性检查。

## 常用消费方式与输入语义

```tsx
import { Button, Dialog, Form, Input, InputNumber, Select } from '@building/ui';
import { Save } from 'lucide-react';

<Form.Group>
  <Form.Item label="名称" required help="请输入工程名称。" error={nameError}>
    <Input value={name} onValueChange={setName} allowClear />
  </Form.Item>
  <Form.Item label="高度">
    <InputNumber
      value={height}
      suffix="m"
      onCommit={(next) => next !== null && submitHeight(next)}
    />
  </Form.Item>
  <Select value={type} options={options} onValueChange={setType} searchable allowClear />
  <Button icon={Save} loading={saving}>
    保存
  </Button>
</Form.Group>;

<Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={500} showCount />;
<Input.Password visibilityToggle />;
<Input.Search allowClear onSearch={search} />;
<Button.Icon label="保存" icon={Save} />;
<Dialog open={open} onOpenChange={setOpen} title="设置" size="lg" footer={footer}>
  {content}
</Dialog>;
```

变量由调用方 React 状态或业务适配提供；可直接运行的完整示例在 `apps/storybook/src/examples`，其 TSX 参加严格类型检查。普通使用不需要重复拼装 primitive 或修正组件内边距、图标大小、错误色、边框、阴影和焦点外观。

`Input` / `InputNumber` 只拥有草稿。应用层 `Numeric` 拒绝 null，建筑合法性仍由 `services.submit` / EditorCore 决定。空白不变成 0；未编辑的数值显示格式化不产生舍入提交。Enter 后 blur 去重；显式再次 Enter 可重试业务拒绝；IME Enter 不提交；Escape 使用最新外部值取消。撤销/重做、动画完成值、迟到资源及保存保护继续走原命令链，不把历史或 GPU 所有权搬进 UI。

`Form.Item announceError={false}` 用于应用已在全局 alert 展示同一业务错误的字段：错误仍可见并通过 aria-describedby 关联，不重复播报。普通字段默认播报。应用 ConfirmProvider 保留 save/discard/cancel 及卸载/替换 promise 结算职责，完整 Dialog 承担通用焦点和弹层结构；通用二选一 ConfirmDialog 不替代领域流程。

## Storybook、代码编辑与扩展流程

从仓库根目录干净安装并启动：

```powershell
npm ci
npm run storybook          # http://127.0.0.1:6006
npm run build:storybook    # apps/storybook/dist
npm run test:storybook     # 独立 6007 浏览器测试服务器
```

质量与正式应用入口：

```powershell
npm run format
npm run lint:fix
npm run check
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:rust
```

上述命令的本次已完成结果见开头范围与开发工具矩阵；完整日志保留在独立证据目录，新增manager恢复路径修复后仍需复跑相应验证。没有降低断言、增加跳过或放宽超时。主编辑器开发使用1420，编辑器浏览器回归独占1421；Storybook开发6006、测试6007，静态人工浏览器验证使用6008，依赖缓存与正式应用分离。

详细依赖兼容依据、支持的 import / 图标、schema、HMR、目录说明和新增示例流程在 [Storybook README](../apps/storybook/README.md)。页面 TSX 通过锁定的 Sucrase 编译，支持 TypeScript/JSX、多个公共 UI 家族、React 状态和回调；允许导入 react、@building/ui 及文档列明的 lucide 图标。浏览器编译不是 TypeScript 语义类型检查，本地示例仍由严格 tsc 检查。

JSON与Controls共用Storybook args，示例接收当前args；节点、图标与回调留在TSX。源码编译错误、配置错误和运行错误分别呈现，旧有效预览有明确标记；修正后恢复。Reset example恢复最新基线和示例局部state，Copy code复制当前可见源码并按revision更新反馈。浏览器编辑只留页面内存，没有文件写回、localStorage/sessionStorage/IndexedDB草稿自动保存；标准Controls保存按钮已关闭并经absence断言验证。独立iframe刷新与离开后的基线恢复已有证据，manager刷新／重新进入的最新问题正在修复，不能据此提前宣称所有进入方式均通过。Storybook自身界面偏好与示例草稿分开记录，不把前者误判为草稿持久化。

本地修改共享组件由Vite HMR更新实际实现；本地示例和JSON更新可恢复基线，已有浏览器草稿保留并提示基线变化。三类真实文件改动、活跃草稿、Reset最新基线及精确字节恢复已在64／64完整套中通过，420px布局也已通过；新发现manager恢复路径单独待复验。新增家族时补齐公共类型、语义props、适用状态stories、真实TSX/JSON/schema、目录入口和交互/边界测试。

## 风格、架构和维护边界

桌面视觉保留紧凑编辑器、离线系统字体与亮暗语义 token。页面布局、材质预览图片和 Canvas 样式继续归应用；组件外观由 UI 包控制。公共家族没有建筑、EditorCore、Three.js 或 Tauri 依赖。正式编辑器仍为单 Tauri WebView / 主 Canvas，Storybook 的标准 iframe 预览和浏览器编译器不进入桌面生产依赖图。

shadcn 4.21.1 精确锁定；`packages/ui/components.json` 明确 `base=radix`、`ui=@building/ui/primitives`，CLI 写入 primitive 而不覆盖公共封装。新增颜色只修改双主题 `tokens/source.json` 并运行 `npm run tokens`；本轮没有新增原始颜色或改变模型材质例外。

`scripts/check.mjs` 检查公共组件调用外观覆盖、包边界、Storybook 依赖、颜色、文件大小与既定生成规则。正式编辑器禁止 Storybook / Sucrase 依赖；生产模块图另有回归入口。没有为了组件库引入 iframe 到编辑器、R3F、Next.js、后台业务服务或插件架构。原生 GUI 停止边界继续生效；浏览器证据不会补填 Windows 原生或 macOS 验收。
