import dialogSource from './dialog.example.tsx?raw';
import confirmSource from './confirm-dialog.example.tsx?raw';
import tooltipSource from './tooltip.example.tsx?raw';
import popoverSource from './popover.example.tsx?raw';
import dropdownSource from './dropdown-menu.example.tsx?raw';
import contextSource from './context-menu.example.tsx?raw';
import dialogConfig from '../config/dialog.json';
import confirmConfig from '../config/confirm-dialog.json';
import tooltipConfig from '../config/tooltip.json';
import popoverConfig from '../config/popover.json';
import dropdownConfig from '../config/dropdown-menu.json';
import contextConfig from '../config/context-menu.json';
import { defineExample } from './definition';
import { align, api, boolean, disabled, number, side, size, string } from '../config/common';

const menuApi = [
  {
    prop: 'items',
    type: 'MenuItem[] (action | separator | group | submenu | checkbox | radio)',
    defaultValue: 'required',
    description:
      'Stable id, label, icon, shortcut, disabled, destructive and callbacks are typed per item kind. Groups/submenus contain items; checkbox uses checked/onCheckedChange; radio uses value/onValueChange/options.',
  },
  {
    prop: 'trigger / children',
    type: 'ReactElement',
    defaultValue: 'required',
    description:
      'Single focusable trigger. ContextMenu instead attaches to its child and handles right click or keyboard.',
  },
  api.open,
];
export const dialog = defineExample(
  'Dialog',
  dialogSource,
  dialogConfig,
  {
    title: string('Required accessible dialog title.'),
    description: string('Dialog purpose, announced as description.'),
    size,
    dismissible: boolean('Allows Escape/outside/close action dismissal; true by default.'),
    closeLabel: string('Accessible close action label.'),
  },
  'Controlled and uncontrolled dialogs with shared title, content, footer and focus recovery.',
  'Tab stays in the dialog; Escape closes when dismissible; focus returns to the trigger.',
  [
    api.open,
    api.children,
    {
      prop: 'trigger / footer',
      type: 'ReactElement / ReactNode',
      defaultValue: '—',
      description:
        'Uncontrolled trigger and explicit footer actions. Controlled dialogs restore previous active focus.',
    },
    {
      prop: 'ref',
      type: 'Ref<HTMLDivElement>',
      defaultValue: '—',
      description: 'Targets the dialog content.',
    },
  ],
);
export const confirmDialog = defineExample(
  'ConfirmDialog',
  confirmSource,
  confirmConfig,
  {
    title: string('Confirmation title.'),
    description: string('Explains the consequence.'),
    confirmLabel: string('Required explicit confirm action label.'),
    cancelLabel: string('Required explicit cancel action label.'),
    destructive: boolean('Uses destructive action emphasis.'),
    loading: boolean('Pending confirmation prevents repeated activation.'),
  },
  'Shared confirmation behavior with async onConfirm and pending action state.',
  'Tab stays in the confirmation; Escape cancels; confirm activates once and returns focus.',
  [
    api.open,
    {
      prop: 'trigger',
      type: 'ReactElement',
      defaultValue: '—',
      description: 'Opens an uncontrolled confirmation.',
    },
    {
      prop: 'onConfirm / onCancel',
      type: '() => void | Promise<void> / () => void',
      defaultValue: 'required / —',
      description:
        'Async confirmation owns pending state. Callback failures remain recoverable in the dialog.',
    },
  ],
);
export const tooltip = defineExample(
  'Tooltip',
  tooltipSource,
  tooltipConfig,
  {
    content: string('Hover and focus explanation; ReactNode supported in code.'),
    side,
    align,
    delayDuration: { ...number('Delay before opening on hover, in milliseconds.'), minimum: 0 },
    disabled,
  },
  'One public tooltip wraps its trigger and supplies accessible hover/focus content.',
  'Tab focuses its child; focus opens the tooltip; Escape dismisses.',
  [
    api.open,
    {
      prop: 'children / content',
      type: 'ReactElement / ReactNode',
      defaultValue: 'required / required',
      description:
        'Exactly one trigger element. Disabled triggers are wrapped to preserve explanatory hover.',
    },
  ],
);
export const popover = defineExample(
  'Popover',
  popoverSource,
  popoverConfig,
  {
    title: string('Optional heading.'),
    description: string('Optional supporting description.'),
    size,
    side,
    align,
    modal: boolean('Optional modal focus behavior; false by default.'),
    closeLabel: string('Accessible close label.'),
  },
  'Anchored content with consistent sizing, headings and close action.',
  'Enter or Space opens; Escape closes and restores trigger focus.',
  [
    api.open,
    api.children,
    {
      prop: 'trigger',
      type: 'ReactElement',
      defaultValue: 'required',
      description: 'Focusable opening element; positioning responds to viewport collisions.',
    },
  ],
);
export const dropdownMenu = defineExample(
  'DropdownMenu',
  dropdownSource,
  dropdownConfig,
  { side, align, disabled },
  'Actions, checked items and submenus configured through typed item data.',
  'Enter or Space opens; Arrow keys navigate; Enter chooses; Escape returns focus.',
  menuApi,
);
export const contextMenu = defineExample(
  'ContextMenu',
  contextSource,
  contextConfig,
  { disabled },
  'Shared contextual actions with keyboard and pointer triggers.',
  'Shift+F10 or Menu key opens at focused child; Arrow keys navigate; Escape restores focus.',
  [
    menuApi[0],
    {
      prop: 'children',
      type: 'ReactElement',
      defaultValue: 'Required',
      description: 'Focusable child receives context-menu pointer and keyboard gestures.',
    },
    {
      prop: 'onOpenChange',
      type: '(open: boolean) => void',
      defaultValue: 'Not set',
      description:
        'Reports primitive-managed visibility; ContextMenu does not expose controlled open/defaultOpen props.',
    },
  ],
);
