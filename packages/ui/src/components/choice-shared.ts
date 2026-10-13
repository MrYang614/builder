import type { KeyboardEvent, ReactNode } from 'react';
import type { ControlSize, ControlStatus } from '../primitives/input-group';

export interface ChoiceOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface ChoiceAppearance {
  size?: ControlSize;
  status?: ControlStatus;
  disabled?: boolean;
  readOnly?: boolean;
}

export const choiceLabelSize = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

/** Publishes arrow selection before Radix's deferred focus, so a fast keyup cannot lose the value change. */
export function nextRadioValue(
  event: KeyboardEvent<HTMLElement>,
  options: readonly Pick<ChoiceOption, 'value' | 'disabled'>[],
  settings: {
    disabled?: boolean;
    readOnly?: boolean;
    orientation?: 'horizontal' | 'vertical';
    dir?: 'ltr' | 'rtl';
    loop?: boolean;
  },
): string | undefined {
  if (
    event.defaultPrevented ||
    settings.disabled ||
    settings.readOnly ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    !(event.target instanceof Element)
  ) {
    return undefined;
  }
  const item = event.target.closest('[role="radio"]');
  if (!item || item.closest('[role="radiogroup"]') !== event.currentTarget) {
    return undefined;
  }
  const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
  if (
    (!horizontal && !vertical) ||
    (settings.orientation === 'vertical' && horizontal) ||
    (settings.orientation === 'horizontal' && vertical)
  ) {
    return undefined;
  }
  const enabled = options.filter((option) => !option.disabled);
  const current = enabled.findIndex((option) => option.value === item.getAttribute('value'));
  if (current < 0 || enabled.length < 2) {
    return undefined;
  }
  let direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
  const rtl = (settings.dir ?? event.currentTarget.getAttribute('dir') ?? 'ltr') === 'rtl';
  if (horizontal && rtl) {
    direction *= -1;
  }
  const next = current + direction;
  if (settings.loop === false && (next < 0 || next >= enabled.length)) {
    return undefined;
  }
  return enabled[(next + enabled.length) % enabled.length]?.value;
}
