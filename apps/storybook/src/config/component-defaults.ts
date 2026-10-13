import type { ConfigSchema, PreviewArgs } from '../playground/schema';

const text = {
  size: 'md',
  width: 'full',
  defaultValue: '',
  disabled: false,
  readOnly: false,
  allowClear: false,
};
const binary = { size: 'md', disabled: false, readOnly: false, defaultChecked: false, value: 'on' };
const group = { size: 'md', disabled: false, readOnly: false, orientation: 'vertical' };
const button = {
  size: 'md',
  variant: 'default',
  width: 'auto',
  alignment: 'center',
  loading: false,
  wrap: false,
  disabled: false,
};

// Reviewed against public wrappers and their pinned Radix/native fallback behavior.
const values: Record<string, PreviewArgs> = {
  Input: text,
  'Input.TextArea': { ...text, autoSize: false, showCount: false, rows: 3, font: 'default' },
  'Input.Password': {
    ...text,
    visibilityToggle: true,
    showPasswordLabel: 'Show password',
    hidePasswordLabel: 'Hide password',
  },
  'Input.Search': { ...text, searchLabel: 'Search', loading: false },
  InputNumber: { ...text, defaultValue: null },
  Select: {
    size: 'md',
    width: 'full',
    searchable: false,
    allowClear: false,
    placeholder: 'Select an option',
    searchPlaceholder: 'Search options',
    emptyText: 'No options found',
    clearLabel: 'Clear selection',
    disabled: false,
    readOnly: false,
  },
  Checkbox: { ...binary, indeterminate: false },
  'Checkbox.Group': group,
  Radio: binary,
  'Radio.Group': group,
  Switch: binary,
  Slider: {
    size: 'md',
    width: 'full',
    min: 0,
    max: 100,
    step: 1,
    orientation: 'horizontal',
    disabled: false,
    readOnly: false,
  },
  'Button · Button.Icon · Button.Group': button,
  'Button.Icon': { size: 'md', variant: 'ghost', loading: false, disabled: false, tooltip: true },
  'Button.Group': button,
  'Form.Item · Form.Group · Form.Section': {
    required: false,
    disabled: false,
    orientation: 'vertical',
    announceError: true,
  },
  Dialog: { size: 'md', dismissible: true, closeLabel: 'Close' },
  ConfirmDialog: { destructive: false, loading: false },
  Tooltip: { side: 'top', align: 'center', delayDuration: 250, disabled: false },
  Popover: { size: 'md', side: 'bottom', align: 'center', modal: false },
  DropdownMenu: { side: 'bottom', align: 'start', disabled: false },
  ContextMenu: { disabled: false },
  Tabs: { size: 'md', variant: 'line', orientation: 'horizontal', activationMode: 'automatic' },
  Segmented: { size: 'md', width: 'auto', disabled: false },
  Toggle: { size: 'md', variant: 'default', disabled: false },
  ToggleGroup: { size: 'md', variant: 'default', disabled: false, iconOnly: false, tooltip: false },
  Accordion: { disabled: false },
  Alert: { variant: 'default', closeLabel: 'Dismiss' },
  Badge: { variant: 'secondary', size: 'md' },
  Card: { size: 'md' },
  Separator: { orientation: 'horizontal', decorative: true },
  Empty: { size: 'md' },
  Skeleton: { lines: 3, shape: 'text', animated: true, label: 'Loading' },
  Spinner: { size: 'md', label: 'Loading' },
  Progress: {
    value: null,
    max: 100,
    label: 'Progress',
    showValue: false,
    size: 'md',
    status: 'default',
  },
};
const required: Record<string, readonly string[]> = {
  Select: ['options'],
  'Button.Icon': ['label'],
  'Checkbox.Group': ['options'],
  'Radio.Group': ['options'],
  Dialog: ['title'],
  ConfirmDialog: ['title', 'confirmLabel', 'cancelLabel'],
  Tooltip: ['content'],
  Empty: ['title'],
};

/** Component defaults never derive from scenario args; JSON baseline remains a separate column. */
export function componentDefaults(name: string, schema: ConfigSchema): ConfigSchema {
  const defaults = values[name];
  if (!defaults) {
    throw new Error(`No reviewed component default metadata for ${name}.`);
  }
  return Object.fromEntries(
    Object.entries(schema).map(([prop, field]) => {
      const label = required[name]?.includes(prop) ? 'Required' : 'Not set';
      return [
        prop,
        {
          ...field,
          defaultValue: Object.hasOwn(defaults, prop) ? defaults[prop] : undefined,
          defaultLabel: Object.hasOwn(defaults, prop) ? undefined : label,
        },
      ];
    }),
  );
}
