import type { ConfigField, ConfigSchema } from '../playground/schema';

export const string = (description: string): ConfigField => ({ type: 'string', description });
export const boolean = (description: string): ConfigField => ({ type: 'boolean', description });
export const number = (description: string): ConfigField => ({ type: 'number', description });
export const choice = (options: readonly string[], description: string): ConfigField => ({
  type: 'string',
  options,
  description,
});
export const size = choice(
  ['sm', 'md', 'lg'],
  'Compact, standard or comfortable control density; md by default. Each family owns its dimensions.',
);
export const disabled = boolean(
  'Disables activation, input and focus where applicable; false by default.',
);
export const readOnly = boolean(
  'Keeps the displayed value and prevents editing; false by default.',
);
export const status = choice(
  ['error', 'warning'],
  'Adds semantic feedback; omitted for the ordinary state.',
);
export const width = choice(
  ['full', 'auto'],
  'Control fills its container or sizes to its content.',
);
export const control: ConfigSchema = { size, disabled };
export const text: ConfigSchema = {
  ...control,
  width,
  readOnly,
  status,
  defaultValue: string(
    'Initial uncontrolled text. Controlled value is supplied by the React example.',
  ),
  placeholder: string('Hint visible when empty; does not replace a field label.'),
  allowClear: boolean('Shows an accessible clear action when a writable value is nonempty.'),
  maxLength: { ...number('Maximum accepted character count.'), minimum: 0 },
  prefix: string('Serializable leading text; arbitrary nodes are configured in code.'),
  suffix: string(
    'Serializable trailing text, such as a unit; arbitrary nodes are configured in code.',
  ),
};
export const option = {
  type: 'object',
  description: 'Stable value, visible label, optional group and disabled state.',
  properties: {
    value: { ...string('Stable unique nonempty string identifier.'), required: true, minLength: 1 },
    label: {
      ...string('Visible label. ReactNode labels belong in code.'),
      required: true,
      minLength: 1,
    },
    disabled,
    group: string('Optional group label.'),
    searchText: string('Optional searchable text when the label is not plain text.'),
  },
} satisfies ConfigField;
export const options = {
  type: 'array',
  items: option,
  uniqueBy: 'value',
  description: 'Options with stable string values; changes are applied immediately.',
} satisfies ConfigField;
export const side = choice(
  ['top', 'right', 'bottom', 'left'],
  'Preferred placement; collision handling can reposition the overlay.',
);
export const align = choice(['start', 'center', 'end'], 'Aligns the overlay with its trigger.');
export const api = {
  value: {
    prop: 'value / defaultValue',
    type: 'string / string',
    defaultValue: 'value: not set / defaultValue: ""',
    description:
      'value is controlled by the caller; defaultValue sets only the initial local value.',
  },
  open: {
    prop: 'open / defaultOpen / onOpenChange',
    type: 'boolean / boolean / (open: boolean) => void',
    defaultValue: 'open: not set / defaultOpen: false / callback: not set',
    description:
      'Controlled or uncontrolled visibility. Change callback reports requests to open or close.',
  },
  ref: {
    prop: 'ref',
    type: 'Ref<HTMLInputElement>',
    defaultValue: '—',
    description: 'Targets the underlying input and supports native focus().',
  },
  children: {
    prop: 'children',
    type: 'ReactNode',
    defaultValue: '—',
    description: 'Content supplied in TSX; JSON cannot encode React elements.',
  },
  commit: {
    prop: 'onCommit / onCommitErrorChange',
    type: '(value: string) => boolean | void / (invalid: boolean) => void',
    defaultValue: '—',
    description:
      'Enter or blur commits once; false rejects while retaining editable draft. Escape reverts. IME Enter does not commit.',
  },
};
