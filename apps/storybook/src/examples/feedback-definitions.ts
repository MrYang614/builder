import alertSource from './alert.example.tsx?raw';
import badgeSource from './badge.example.tsx?raw';
import cardSource from './card.example.tsx?raw';
import separatorSource from './separator.example.tsx?raw';
import emptySource from './empty.example.tsx?raw';
import skeletonSource from './skeleton.example.tsx?raw';
import spinnerSource from './spinner.example.tsx?raw';
import progressSource from './progress.example.tsx?raw';
import alertConfig from '../config/alert.json';
import badgeConfig from '../config/badge.json';
import cardConfig from '../config/card.json';
import separatorConfig from '../config/separator.json';
import emptyConfig from '../config/empty.json';
import skeletonConfig from '../config/skeleton.json';
import spinnerConfig from '../config/spinner.json';
import progressConfig from '../config/progress.json';
import { defineExample } from './definition';
import { api, boolean, choice, number, size, string } from '../config/common';

export const alert = defineExample(
  'Alert',
  alertSource,
  alertConfig,
  {
    variant: choice(['default', 'destructive', 'success', 'warning'], 'Feedback meaning.'),
    title: string('Short feedback heading.'),
    description: string('Message and recovery guidance.'),
    closeLabel: string('Accessible close action name.'),
  },
  'Feedback carries a clear message, optional action and optional dismissal.',
  'Tab reaches actions and close; keyboard activation follows button semantics.',
  [
    api.children,
    {
      prop: 'icon / action / onClose',
      type: 'SVG component | ReactNode | false / ReactNode / () => void',
      defaultValue: 'semantic icon / — / —',
      description:
        'Icon and action are defined in code. Dismissal is present when onClose is supplied.',
    },
  ],
);
export const badge = defineExample(
  'Badge',
  badgeSource,
  badgeConfig,
  {
    size,
    variant: choice(
      ['default', 'secondary', 'outline', 'destructive', 'success', 'warning'],
      'Status emphasis and meaning.',
    ),
  },
  'Compact inline status with optional icon and bilingual/long labels.',
  'Noninteractive status; does not add an unnecessary focus stop.',
  [
    api.children,
    {
      prop: 'icon',
      type: 'ReactNode',
      defaultValue: '—',
      description: 'Optional leading icon, defined in code.',
    },
  ],
);
export const card = defineExample(
  'Card',
  cardSource,
  cardConfig,
  { size, title: string('Card heading.'), description: string('Supporting context.') },
  'Unified title, body, extra and footer slots with semantic internal spacing.',
  'Card is a structural container; inner controls retain native focus order.',
  [
    api.children,
    {
      prop: 'extra / footer',
      type: 'ReactNode / ReactNode',
      defaultValue: '— / —',
      description: 'Supplementary header content and footer actions; defined in code.',
    },
  ],
);
export const separator = defineExample(
  'Separator',
  separatorSource,
  separatorConfig,
  {
    orientation: choice(['horizontal', 'vertical'], 'Divider direction; horizontal by default.'),
    decorative: boolean(
      'Decorative separators are hidden from assistive technology; true by default.',
    ),
  },
  'Semantic divider between related content areas.',
  'No focus stop; nondecorative mode announces a separator.',
  [
    {
      prop: 'ref',
      type: 'Ref<HTMLDivElement>',
      defaultValue: '—',
      description: 'Underlying separator element.',
    },
  ],
);
export const empty = defineExample(
  'Empty',
  emptySource,
  emptyConfig,
  {
    size,
    title: string('Explains what is empty.'),
    description: string('Gives the next useful action.'),
  },
  'An empty state supplies a clear next step and optional action.',
  'Tab reaches the action; the empty state adds no artificial focus target.',
  [
    {
      prop: 'icon / action',
      type: 'ReactNode / ReactNode',
      defaultValue: 'built-in icon / —',
      description: 'Optional contextual icon and action defined in TSX.',
    },
  ],
);
export const skeleton = defineExample(
  'Skeleton',
  skeletonSource,
  skeletonConfig,
  {
    lines: { ...number('Text placeholder line count; 3 by default.'), minimum: 1, maximum: 20 },
    shape: choice(['text', 'circle', 'rectangle'], 'Placeholder shape.'),
    animated: boolean('Motion indicates pending work and honors reduced-motion preference.'),
    label: string('Accessible pending content description.'),
  },
  'Loading placeholders match content shapes and support reduced motion.',
  'Noninteractive status; inner placeholders are hidden from assistive technology.',
  [],
);
export const spinner = defineExample(
  'Spinner',
  spinnerSource,
  spinnerConfig,
  { size, label: string('Accessible loading status; Loading by default.') },
  'One shared loading indicator with semantic size and accessible status.',
  'Status announcement; no artificial focus target.',
  [],
);
export const progress = defineExample(
  'Progress',
  progressSource,
  progressConfig,
  {
    size,
    value: { ...number('Completed amount; null is indeterminate.'), nullable: true },
    max: { ...number('Total amount; 100 by default.'), minimum: 1 },
    label: string('Accessible progress name.'),
    showValue: boolean('Shows completed percentage.'),
    status: choice(['default', 'success', 'warning', 'error'], 'Progress meaning.'),
  },
  'Determinate and indeterminate progress with localized labels.',
  'Noninteractive progressbar; example advance action is keyboard accessible.',
  [
    {
      prop: 'value',
      type: 'number | null',
      defaultValue: 'required',
      description:
        'Caller owns progress. Values are clamped to the valid range; null omits aria-valuenow.',
    },
  ],
);
