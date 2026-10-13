import type { ComponentProps } from 'react';
import { Toggle as Primitive } from '../primitives/toggle';
import { renderIcon, type ComponentIcon, type ComponentSize } from './component-types';
import { Tooltip } from './tooltip';

export type ToggleProps = Omit<
  ComponentProps<typeof Primitive>,
  'className' | 'style' | 'size' | 'asChild'
> & {
  size?: ComponentSize;
  label?: string;
  icon?: ComponentIcon;
  tooltip?: string;
};

/** Preserves an explicit native accessible name when the optional semantic label is omitted. */
export function Toggle({ children, size = 'md', label, icon, tooltip, ...props }: ToggleProps) {
  const toggle = (
    <Primitive
      {...props}
      size={size === 'md' ? 'default' : size}
      aria-label={label ?? props['aria-label']}
    >
      {icon && renderIcon(icon)}
      {children}
    </Primitive>
  );
  return tooltip ? <Tooltip content={tooltip}>{toggle}</Tooltip> : toggle;
}
