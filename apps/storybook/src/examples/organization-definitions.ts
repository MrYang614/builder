import tabsSource from './tabs.example.tsx?raw';
import segmentedSource from './segmented.example.tsx?raw';
import toggleSource from './toggle.example.tsx?raw';
import toggleGroupSource from './toggle-group.example.tsx?raw';
import accordionSource from './accordion.example.tsx?raw';
import tabsConfig from '../config/tabs.json';
import segmentedConfig from '../config/segmented.json';
import toggleConfig from '../config/toggle.json';
import toggleGroupConfig from '../config/toggle-group.json';
import accordionConfig from '../config/accordion.json';
import { defineExample } from './definition';
import { api, boolean, choice, control, size, string, width } from '../config/common';

const choiceApi = [
  {
    prop: 'value / defaultValue / onValueChange',
    type: 'string / string / (value: string) => void',
    defaultValue: 'value: not set / defaultValue: first enabled option',
    description:
      'Caller owns controlled choice; defaultValue initializes independent local choice.',
  },
  {
    prop: 'options',
    type: '{ value: string; label: string; disabled?: boolean; icon?: ReactElement | SVG component }[]',
    defaultValue: 'required',
    description: 'Stable identifiers, visible labels and optional icons.',
  },
];
export const tabs = defineExample(
  'Tabs',
  tabsSource,
  tabsConfig,
  {
    size,
    variant: choice(['line', 'pills'], 'Underline or filled tab treatment; line by default.'),
    orientation: choice(['horizontal', 'vertical'], 'Tab list direction.'),
    activationMode: choice(
      ['automatic', 'manual'],
      'Automatic arrows activate; manual arrows focus and Enter activates.',
    ),
  },
  'Typed tab items combine accessible labels, content panels and disabled states.',
  'Arrow keys move through enabled tabs; Home and End move to list ends.',
  [
    choiceApi[0],
    {
      prop: 'items',
      type: '{ value: string; label: string; content: ReactNode; disabled?: boolean; icon?: ReactElement | SVG component }[]',
      defaultValue: 'required',
      description: 'Each tab owns a correctly associated panel; content belongs in TSX.',
    },
  ],
);
export const segmented = defineExample(
  'Segmented',
  segmentedSource,
  segmentedConfig,
  { ...control, width },
  'Exclusive compact view switching, using the same selection semantics as Radio.Group.',
  'Arrow keys select the next enabled option; Tab enters or leaves the group.',
  choiceApi,
);
export const toggle = defineExample(
  'Toggle',
  toggleSource,
  toggleConfig,
  {
    ...control,
    variant: choice(['default', 'outline'], 'Toggle surface emphasis.'),
    label: string('Accessible name for an icon-only toggle.'),
  },
  'One independent pressed action with controlled and uncontrolled values.',
  'Tab focuses; Enter or Space toggles pressed state.',
  [
    {
      prop: 'pressed / defaultPressed / onPressedChange',
      type: 'boolean / boolean / (pressed: boolean) => void',
      defaultValue: 'false',
      description: 'Controlled or local pressed state with aria-pressed.',
    },
    api.children,
    {
      prop: 'icon',
      type: 'ReactElement | SVG component',
      defaultValue: '—',
      description: 'Optional icon, defined in TSX.',
    },
    {
      ...api.ref,
      type: 'Ref<HTMLButtonElement>',
      description: 'Targets the pressed-action button.',
    },
  ],
);
export const toggleGroup = defineExample(
  'ToggleGroup',
  toggleGroupSource,
  toggleGroupConfig,
  {
    ...control,
    variant: choice(['default', 'outline'], 'Group surface emphasis.'),
    iconOnly: boolean('Uses accessible icon-only options.'),
    tooltip: boolean('Shows option labels on hover/focus for icon-only controls.'),
  },
  'Single and multiple pressed selections share typed options and consistent sizing.',
  'Arrow keys navigate; Enter or Space toggles; disabled options are skipped.',
  [
    {
      prop: 'type',
      type: 'single | multiple',
      defaultValue: 'single',
      description: 'Discriminates string and string[] values.',
    },
    {
      ...choiceApi[0],
      type: 'string | string[] / corresponding callback',
      defaultValue: 'value: not set / defaultValue: "" (single) or [] (multiple)',
    },
    choiceApi[1],
    { prop: 'label', type: 'string', defaultValue: '—', description: 'Accessible group name.' },
  ],
);
export const accordion = defineExample(
  'Accordion',
  accordionSource,
  accordionConfig,
  { disabled: boolean('Disables all expandable section headers; false by default.') },
  'Single or multiple open sections retain reliable primitive keyboard interactions.',
  'Tab visits headers; Arrow keys, Home and End navigate; Enter or Space expands.',
  [
    {
      prop: 'type / collapsible',
      type: 'single | multiple / boolean (single only)',
      defaultValue: 'single / true',
      description:
        'Controls whether one or several items can expand and whether a single open item can close.',
    },
    {
      prop: 'items',
      type: '{ value: string; title: ReactNode; content: ReactNode; disabled?: boolean }[]',
      defaultValue: 'required',
      description: 'Stable item identifier and accessible header/content relationship.',
    },
    {
      prop: 'value / defaultValue / onValueChange',
      type: 'string | string[] / corresponding callback',
      defaultValue: 'uncontrolled',
      description: 'Discriminated by type; controlled and uncontrolled are shown above.',
    },
  ],
);
