import buttonSource from './button.example.tsx?raw';
import buttonIconSource from './button-icon.example.tsx?raw';
import formSource from './form.example.tsx?raw';
import buttonConfig from '../config/button.json';
import buttonIconConfig from '../config/button-icon.json';
import formConfig from '../config/form.json';
import { defineExample } from './definition';
import { api, boolean, choice, control, disabled, string, width } from '../config/common';
import { componentDefaults } from '../config/component-defaults';

export const button = defineExample(
  'Button · Button.Icon · Button.Group',
  buttonSource,
  buttonConfig,
  {
    ...control,
    variant: choice(
      ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link', 'danger-ghost'],
      'Semantic action emphasis.',
    ),
    width,
    alignment: choice(['center', 'start', 'between'], 'Content alignment inside the button.'),
    loading: boolean('Shows spinner, blocks repeat clicks and exposes pending state.'),
    wrap: boolean('Allows long labels to wrap within their layout width; false by default.'),
    loadingLabel: string('Accessible pending action name.'),
  },
  'Complete buttons, accessible icon actions and unified groups without appearance overrides.',
  'Tab focuses enabled actions; Enter or Space activates; loading blocks repeat activation.',
  [
    api.children,
    {
      prop: 'icon / suffix',
      type: 'ReactNode | SVG component / ReactNode',
      defaultValue: '—',
      description: 'Leading icon and trailing content. Define nodes and icons in code.',
    },
    {
      prop: 'onClick / ref',
      type: 'MouseEventHandler<HTMLButtonElement> / Ref<HTMLButtonElement>',
      defaultValue: '—',
      description: 'Native event and focus target.',
    },
    {
      prop: 'Button.Icon: label / icon / tooltip',
      type: 'string / ReactNode | SVG component / boolean | string',
      defaultValue: 'required / required / true',
      description: 'Visible hover/focus explanation and required accessible name.',
    },
    {
      prop: 'Button.Group: label / orientation',
      type: 'string / horizontal | vertical',
      defaultValue: '— / horizontal',
      description: 'Groups related actions; layout only, no shared selection state.',
    },
  ],
);
export const form = defineExample(
  'Form.Item · Form.Group · Form.Section',
  formSource,
  formConfig,
  {
    label: string('Visible field label, linked to its first child control.'),
    help: string('Supplemental text associated through aria-describedby.'),
    error: string('Visible error; associates aria-invalid and aria-describedby.'),
    announceError: boolean(
      'Announces changed errors; true by default. Disable when the application already announces the same business error.',
    ),
    required: boolean('Required indicator and accessible required state.'),
    disabled,
    orientation: choice(['vertical', 'horizontal'], 'Label and control arrangement.'),
    id: string('Stable field control identifier.'),
    htmlFor: string('Explicit label target if needed.'),
  },
  'Shared labels, help, errors and field organization preserve input semantics.',
  'Click the label to focus the field; Tab follows native control order.',
  [
    api.children,
    {
      prop: 'Form.Group: gap / columns',
      type: 'compact | comfortable / 1 | 2',
      defaultValue: 'compact / 1',
      description: 'Semantic spacing and responsive field columns.',
    },
    {
      prop: 'Form.Section: title / description / disabled',
      type: 'ReactNode / ReactNode / boolean',
      defaultValue: '— / — / false',
      description:
        'fieldset and legend organize related controls; disabled propagates native disabling.',
    },
  ],
);
export const buttonIcon = defineExample(
  'Button.Icon',
  buttonIconSource,
  buttonIconConfig,
  {
    ...control,
    label: string('Required accessible action name.'),
    variant: button.schema.variant,
    tooltip: {
      ...boolean('Shows accessible hover/focus hint; a string customizes the hint.'),
      alternatives: [string('Explicit tooltip text.')],
    },
    loading: boolean('Shows pending status and prevents repeat activation.'),
    loadingLabel: string('Optional localized pending name.'),
  },
  'Complete icon actions with required accessible names and built-in hover/focus hints.',
  'Tab focuses enabled actions; Enter or Space activates; disabled actions retain hover explanations.',
  [
    {
      prop: 'icon',
      type: 'ReactElement | SVG component',
      defaultValue: 'Required',
      description: 'An icon is supplied by the TSX example.',
    },
    {
      prop: 'tooltip',
      type: 'boolean | string',
      defaultValue: 'true',
      description: 'False removes the hint; true uses label; a string customizes content.',
    },
    {
      prop: 'onClick / ref',
      type: 'MouseEventHandler<HTMLButtonElement> / Ref<HTMLButtonElement>',
      defaultValue: 'Not set',
      description: 'Native activation and focus target.',
    },
  ],
);
export const buttonGroup = {
  ...button,
  name: 'Button.Group',
  configTarget: 'Child Button',
  notes:
    'The group organizes related actions. JSON controls configure its child Button components; Group public props are children, label and orientation.',
  schema: Object.fromEntries(
    Object.entries(componentDefaults('Button.Group', button.schema)).map(([prop, field]) => [
      prop,
      { ...field, description: `Child Button prop. ${field.description}` },
    ]),
  ),
  api: [
    {
      prop: 'children',
      type: 'ReactNode',
      defaultValue: 'Required',
      description:
        'Related action components; the group does not own their appearance or selection.',
    },
    {
      prop: 'label',
      type: 'string',
      defaultValue: 'Not set',
      description: 'Accessible group name.',
    },
    {
      prop: 'orientation',
      type: 'horizontal | vertical',
      defaultValue: 'horizontal',
      description: 'Direction of the action group.',
    },
  ],
};
