# 基础 UI 组件体系

桌面编辑器与独立 Storybook 直接消费同一套 `@building/ui`。公共组件用严格语义 props 封装结构、外观和交互；Radix/shadcn 组合保留在 `src/primitives`。验收状态见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 公共 API 规则

- 有 `size` 的组件使用 `sm` / `md` / `lg`，默认 `md`，表示紧凑、标准、舒适密度。各家族按职责决定实际高度，不承诺所有家族相同像素尺寸；TextArea、范围 Slider、内容容器和多选标签还会随内容增长。
- 有 `width` 的组件使用 `full` / `auto`。Input 家族、InputNumber、Select、Slider 默认 `full`；Button、Segmented、ToggleGroup 默认 `auto`。页面容器负责排列、区域大小与响应布局。
- `InputNumber precision` 可选，限制显示与新输入的小数位数，规范到0–15整数；未指定时保留通用完整精度。编辑器的 `Numeric` 统一传2：完整数字输入／粘贴和科学计数按四舍五入收敛，中间态／IME仍可编辑；聚焦、失焦和格式化不改未编辑正式数据。配置精度时有效键盘step至少一个对应十进制单位，舍入后仍检查min/max。
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
| Select                        | `multiple=false`、`searchable=false`、`allowClear=false`、`defaultOpen=false`、`appearance=default`、`valueFormat=text`（`numeric`仅给选中值和选项使用等宽数字字体）、`size=md`、`width=full`，没有隐式选中首项。单选清空发出 undefined，多选清空发出 []；禁用/只读不能打开或变更。                                                   |
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

主编辑器开发使用 1420，编辑器回归、硬件 WebGPU 与 Storybook 各使用独立配置管理测试服务器；以配置中的端口为准。报告与截图存于被忽略的 `.test-artifacts/`，测试结束释放自己的服务器，不复用陈旧开发实例。

详细依赖兼容依据、支持的 import / 图标、schema、HMR、目录说明和新增示例流程在 [Storybook README](../apps/storybook/README.md)。页面 TSX 通过锁定的 Sucrase 编译，支持 TypeScript/JSX、多个公共 UI 家族、React 状态和回调；允许导入 react、@building/ui 及文档列明的 lucide 图标。浏览器编译不是 TypeScript 语义类型检查，本地示例仍由严格 tsc 检查。

JSON与Controls共用Storybook args，示例接收当前args；节点、图标与回调留在TSX。源码编译错误、配置错误和运行错误分别呈现，旧有效预览有明确标记；修正后恢复。Reset example恢复最新基线和示例局部state，Copy code复制当前可见源码并按revision更新反馈。浏览器编辑只留页面内存，没有文件写回、localStorage/sessionStorage/IndexedDB草稿自动保存；标准Controls保存按钮已关闭并经absence断言验证。刷新与真实侧栏重入应从仓库基线恢复；对应回归见 `apps/storybook/tests/manager-memory.spec.ts`。Storybook自身界面偏好与示例草稿分开记录，不把前者误判为草稿持久化。

本地修改共享组件由Vite HMR更新实际实现；本地示例和JSON更新可恢复基线，已有浏览器草稿保留并提示基线变化。对应 HMR、活跃草稿、Reset 与字节恢复回归见 `apps/storybook/tests/playground.spec.ts`。新增家族时补齐公共类型、语义props、适用状态stories、真实TSX/JSON/schema、目录入口和交互/边界测试。

## 风格、架构和维护边界

当前Nova视觉采用紧凑中性灰、克制蓝色、默认暗色与完整亮色语义token。界面使用本地打包Inter Variable，精确数值使用本地JetBrains Mono Variable；两个Latin WOFF2共88,660字节、SIL OFL 1.1，中文使用PingFang SC／Microsoft YaHei UI等系统回退，完整字体来源与分发说明见 `packages/ui/FONT-LICENSES.txt`。页面布局、材质预览图片和 Canvas 样式继续归应用；组件外观由 UI 包控制。公共家族没有建筑、EditorCore、Three.js 或 Tauri 依赖。正式编辑器仍为单 Tauri WebView / 主 Canvas，Storybook 的标准 iframe 预览和浏览器编译器不进入桌面生产依赖图。

仓库本地shadcn 4.21.1精确锁定；当前两份components.json使用 `style=radix-nova`、neutral基色、CSS variables与lucide，`ui=@building/ui/primitives`保持公共primitive入口。preset尝试发现当前CLI不支持旧 `base` 键，已将其移除；生成器不能覆盖公共封装。完整 apply 受 barrel 扫描与 UI workspace 框架识别限制；实际在 desktop 成功应用 theme/font 子集，再整合到语义源，没有全量覆盖公共组件。Nova双主题颜色仍只修改 `tokens/source.json` 并运行 `npm run tokens`；不保留第二套原始色表，也不改变模型材质数据例外。

`scripts/check.mjs` 检查公共组件调用外观覆盖、包边界、Storybook 依赖、颜色、文件大小与既定生成规则。正式编辑器禁止 Storybook / Sucrase 依赖；生产模块图另有回归入口。没有为了组件库引入 iframe 到编辑器、R3F、Next.js、后台业务服务或插件架构。原生 GUI 停止边界继续生效；浏览器证据不会补填 Windows 原生或 macOS 验收。
