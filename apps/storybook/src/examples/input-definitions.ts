import inputSource from './input.example.tsx?raw';
import textareaSource from './textarea.example.tsx?raw';
import passwordSource from './password.example.tsx?raw';
import searchSource from './search.example.tsx?raw';
import numberSource from './input-number.example.tsx?raw';
import selectSource from './select.example.tsx?raw';
import checkboxSource from './checkbox.example.tsx?raw';
import checkboxGroupSource from './checkbox-group.example.tsx?raw';
import radioSource from './radio.example.tsx?raw';
import radioGroupSource from './radio-group.example.tsx?raw';
import switchSource from './switch.example.tsx?raw';
import sliderSource from './slider.example.tsx?raw';
import inputConfig from '../config/input.json';
import textareaConfig from '../config/textarea.json';
import passwordConfig from '../config/password.json';
import searchConfig from '../config/search.json';
import numberConfig from '../config/input-number.json';
import selectConfig from '../config/select.json';
import checkboxConfig from '../config/checkbox.json';
import checkboxGroupConfig from '../config/checkbox-group.json';
import radioConfig from '../config/radio.json';
import radioGroupConfig from '../config/radio-group.json';
import switchConfig from '../config/switch.json';
import sliderConfig from '../config/slider.json';
import { defineExample } from './definition';
import {
  api,
  boolean,
  choice,
  control,
  number,
  options,
  readOnly,
  status,
  string,
  text,
  width,
} from '../config/common';
import type { ConfigSchema } from '../playground/schema';

const textApi = [
  api.value,
  {
    prop: 'onValueChange',
    type: '(value: string) => void',
    defaultValue: '—',
    description: 'Reports draft text, including clear. Does not imply a business command.',
  },
  api.commit,
  api.ref,
];
const multilineText = Object.fromEntries(
  Object.entries(text).filter(([key]) => !['allowClear', 'prefix', 'suffix'].includes(key)),
);
const binarySchema: ConfigSchema = {
  ...control,
  readOnly,
  status,
  defaultChecked: boolean('Initial uncontrolled selection.'),
  name: string('Native form field name.'),
  value: string('Native form submission value.'),
};
const binaryApi = [
  {
    prop: 'checked / defaultChecked / onCheckedChange',
    type: 'boolean / boolean / (checked: boolean) => void',
    defaultValue: 'false',
    description:
      'Controlled and uncontrolled selection share the same checked-change callback; readOnly prevents changes.',
  },
  api.children,
  {
    ...api.ref,
    type: 'Ref<HTMLButtonElement>',
    description: 'Targets the underlying checkbox, radio or switch button.',
  },
];
const groupSchema: ConfigSchema = {
  ...control,
  readOnly,
  status,
  options,
  orientation: choice(
    ['horizontal', 'vertical'],
    'Direction of related choices; vertical by default.',
  ),
};
const groupApi = [
  {
    prop: 'value / defaultValue / onValueChange',
    type: 'string[] / string[] / (values: string[]) => void',
    defaultValue: '[]',
    description: 'Controlled/uncontrolled checked values refer to stable option values.',
  },
  {
    prop: 'options',
    type: '{ value: string; label: ReactNode; disabled?: boolean }[]',
    defaultValue: 'required',
    description: 'Accessible labels and stable identifiers. A disabled option cannot be toggled.',
  },
];

export const input = defineExample(
  'Input',
  inputSource,
  inputConfig,
  text,
  'Text, clear action, prefixes and suffixes with controlled and uncontrolled values.',
  'Tab focuses the input; Enter commits; Escape restores a draft; IME composition is preserved.',
  textApi,
);
export const textarea = defineExample(
  'Input.TextArea',
  textareaSource,
  textareaConfig,
  {
    ...multilineText,
    rows: { ...number('Visible rows when autoSize is disabled.'), minimum: 1, integer: true },
    autoSize: {
      type: 'object',
      description: 'Automatic sizing enabled by boolean or explicit row bounds.',
      alternatives: [boolean('Enable or disable automatic row sizing.')],
      orderedBounds: ['minRows', 'maxRows'],
      properties: {
        minRows: { ...number('Minimum visible rows.'), minimum: 1, integer: true, defaultValue: 2 },
        maxRows: { ...number('Maximum visible rows before scrolling.'), minimum: 1, integer: true },
      },
    },
    showCount: boolean('Shows current and maximum character counts.'),
    font: choice(['default', 'code'], 'Semantic text or code typography; default by default.'),
  },
  'Multiline input with bounded autoSize and live character count.',
  'Tab moves focus; Enter adds a line; Escape cancels an active draft.',
  [
    ...textApi.filter((field) => field.prop !== 'ref'),
    {
      ...api.ref,
      type: 'Ref<HTMLTextAreaElement>',
      description: 'Targets the native multiline input.',
    },
    {
      prop: 'autoSize / countLabel',
      type: 'boolean | { minRows?: number; maxRows?: number } / (count: number, max?: number) => string',
      defaultValue: 'false / built-in label',
      description: 'Rows grow within configured bounds. Count label can be localized through code.',
    },
  ],
);
export const password = defineExample(
  'Input.Password',
  passwordSource,
  passwordConfig,
  {
    ...text,
    visibilityToggle: boolean('Shows the keyboard-accessible visibility toggle; true by default.'),
    showPasswordLabel: string('Accessible show password label.'),
    hidePasswordLabel: string('Accessible hide password label.'),
  },
  'Password visibility is local UI state and never changes the value.',
  'Tab reaches the reveal button; Space toggles visibility without losing the draft.',
  textApi,
);
export const search = defineExample(
  'Input.Search',
  searchSource,
  searchConfig,
  {
    ...text,
    searchLabel: string('Accessible search action label.'),
    loading: boolean('Disables search activation while pending.'),
  },
  'Search submission is separate from draft text changes.',
  'Enter or search action submits; IME Enter does not submit.',
  [
    ...textApi,
    {
      prop: 'onSearch',
      type: '(query: string) => void',
      defaultValue: '—',
      description:
        'Called by the search action or noncomposing Enter. Configure its callback in TSX.',
    },
  ],
);
export const inputNumber = defineExample(
  'InputNumber',
  numberSource,
  numberConfig,
  {
    ...control,
    width,
    readOnly,
    status,
    defaultValue: { ...number('Initial numeric value; null represents empty.'), nullable: true },
    min: number('Minimum accepted numeric value.'),
    max: number('Maximum accepted numeric value.'),
    step: { ...number('Keyboard step increment.'), minimum: 0 },
    precision: {
      ...number('Decimal places (0–15). Unset keeps full precision.'),
      minimum: 0,
      maximum: 15,
    },
    allowClear: boolean('Shows a clear action; null is submitted for empty.'),
    suffix: string('Trailing unit.'),
    prefix: string('Leading unit.'),
    invalidMessage: string('Localized invalid numeric draft message.'),
  },
  'Numeric drafts preserve intermediate text, rejection and full formal precision.',
  'Enter or blur commits once; Escape cancels; Arrow keys step; IME Enter is ignored.',
  [
    { ...api.value, type: 'number | null / number | null', defaultValue: 'null' },
    {
      prop: 'onValueChange',
      type: '(value: number | null) => void',
      defaultValue: '—',
      description: 'Reports valid draft numeric changes. onCommit owns accepted final values.',
    },
    {
      ...api.commit,
      type: '(value: number | null) => boolean | void / (invalid: boolean) => void',
    },
    api.ref,
  ],
);
export const select = defineExample(
  'Select',
  selectSource,
  selectConfig,
  {
    ...control,
    readOnly,
    status,
    width,
    options,
    searchable: boolean('Shows search input and matches labels or searchText.'),
    allowClear: boolean('Shows clear selection action.'),
    placeholder: string('Hint when nothing is selected.'),
    emptyText: string('Content when search returns no options.'),
    searchPlaceholder: string('Hint in search field.'),
    clearLabel: string('Accessible clear action label.'),
  },
  'Grouped, searchable single and multiple selection; edit options JSON to test dynamic lists.',
  'Arrow keys navigate enabled options, Enter chooses, Escape closes and restores focus.',
  [
    {
      prop: 'multiple',
      type: 'false | true',
      defaultValue: 'false',
      description: 'Discriminates single string selection and multiple string[] selection.',
    },
    {
      prop: 'value / defaultValue / onValueChange',
      type: 'string | undefined or string[] / corresponding callback',
      defaultValue: 'value/defaultValue: not set (empty selection displays [])',
      description:
        'Controlled/uncontrolled value. Single clear emits undefined; multiple clear emits [].',
    },
    {
      prop: 'options',
      type: '{ value: string; label: ReactNode; group?: string; disabled?: boolean; searchText?: string }[]',
      defaultValue: 'required',
      description:
        'Stable unique identifiers; nodes and icons use TSX, plain labels are JSON-editable.',
    },
    api.open,
    {
      prop: 'icon / appearance / tooltip',
      type: 'LucideIcon / default | icon / string',
      defaultValue: '— / default / —',
      description: 'Explicit icon selector extension for compact application toolbars.',
    },
    {
      ...api.ref,
      type: 'Ref<HTMLButtonElement>',
      description: 'Targets the selector trigger button.',
    },
  ],
);
export const checkbox = defineExample(
  'Checkbox',
  checkboxSource,
  checkboxConfig,
  { ...binarySchema, indeterminate: boolean('Shows a mixed state; does not imply checked=true.') },
  'Labeled checkbox with mixed state and disabled/readonly behavior.',
  'Tab focuses the checkbox; Space toggles; readonly and disabled keep their value.',
  binaryApi,
);
export const checkboxGroup = defineExample(
  'Checkbox.Group',
  checkboxGroupSource,
  checkboxGroupConfig,
  groupSchema,
  'Multiple related choices with controlled and uncontrolled group values.',
  'Tab visits enabled controls; Space toggles one option.',
  groupApi,
);
export const radio = defineExample(
  'Radio',
  radioSource,
  radioConfig,
  binarySchema,
  'Standalone selection indicator; use Radio.Group for mutually exclusive choices.',
  'Tab focuses the control; Space selects it.',
  binaryApi,
);
export const radioGroup = defineExample(
  'Radio.Group',
  radioGroupSource,
  radioGroupConfig,
  groupSchema,
  'Mutually exclusive choices organized by stable option values.',
  'Tab enters the group; Arrow keys move selection; disabled options are skipped.',
  [
    {
      ...groupApi[0],
      type: 'string / string / (value: string) => void',
      defaultValue: 'value: not set / defaultValue: ""',
    },
    groupApi[1],
  ],
);
export const switchExample = defineExample(
  'Switch',
  switchSource,
  switchConfig,
  binarySchema,
  'Immediate on/off selection with visible accessible labels.',
  'Tab focuses; Space toggles; readonly and disabled prevent changes.',
  binaryApi,
);
export const slider = defineExample(
  'Slider',
  sliderSource,
  sliderConfig,
  {
    ...control,
    width,
    min: number('Minimum value; 0 by default.'),
    max: number('Maximum value; 100 by default.'),
    step: { ...number('Step increment; 1 by default.'), minimum: 0 },
    orientation: choice(['horizontal', 'vertical'], 'Slider direction.'),
    label: string('Accessible thumb name.'),
    thumbLabels: {
      type: 'array',
      items: string('Accessible name for one thumb.'),
      description: 'Names corresponding to each controlled thumb.',
    },
    readOnly,
  },
  'Single and range sliders use the same public implementation.',
  'Arrow keys step; Home and End choose bounds; Tab visits thumbs.',
  [
    {
      prop: 'value / defaultValue / onValueChange / onValueCommit',
      type: 'number[] / number[] / (values: number[]) => void',
      defaultValue: '[min]',
      description:
        'Draft changes and completed interaction are distinct callbacks; one slider can expose several thumbs.',
    },
    {
      ...api.ref,
      type: 'Ref<HTMLSpanElement>',
      description: 'Targets the underlying slider root.',
    },
  ],
);
