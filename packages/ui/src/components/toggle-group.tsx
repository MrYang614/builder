import { ToggleGroup as Primitive, ToggleGroupItem } from '../primitives/toggle-group';
import {
  renderIcon,
  type ComponentIcon,
  type ComponentSize,
  type ComponentWidth,
} from './component-types';
import { Tooltip } from './tooltip';

export interface ToggleOption {
  value: string;
  label: string;
  icon?: ComponentIcon;
  disabled?: boolean;
  tooltip?: string;
}

interface CommonProps {
  options: readonly ToggleOption[];
  label?: string;
  size?: ComponentSize;
  variant?: 'default' | 'outline';
  disabled?: boolean;
  iconOnly?: boolean;
  tooltip?: boolean;
  width?: ComponentWidth;
  orientation?: 'horizontal' | 'vertical';
}

export type ToggleGroupProps = CommonProps &
  (
    | {
        type?: 'single';
        value?: string;
        defaultValue?: string;
        onValueChange?: (value: string) => void;
      }
    | {
        type: 'multiple';
        value?: string[];
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
      }
  );

/** Stable option values and Radix roving focus support single or multiple selection without app assembly. */
export function ToggleGroup({
  options,
  label,
  size = 'md',
  variant = 'default',
  disabled = false,
  iconOnly = false,
  tooltip = false,
  width = 'auto',
  orientation = 'horizontal',
  ...selection
}: ToggleGroupProps) {
  const content = options.map((option) => {
    const item = (
      <ToggleGroupItem
        key={option.value}
        value={option.value}
        disabled={option.disabled}
        aria-label={iconOnly ? option.label : undefined}
      >
        {option.icon && renderIcon(option.icon)}
        {iconOnly ? <span className="sr-only">{option.label}</span> : option.label}
      </ToggleGroupItem>
    );
    return tooltip || option.tooltip ? (
      <Tooltip key={option.value} content={option.tooltip ?? option.label}>
        {item}
      </Tooltip>
    ) : (
      item
    );
  });
  const shared = {
    'aria-label': label,
    size: size === 'md' ? ('default' as const) : size,
    variant,
    disabled,
    orientation,
    spacing: 1,
    className: width === 'full' ? 'w-full [&_[data-slot=toggle-group-item]]:flex-1' : undefined,
  };
  return selection.type === 'multiple' ? (
    <Primitive {...selection} {...shared}>
      {content}
    </Primitive>
  ) : (
    <Primitive {...selection} {...shared} type="single">
      {content}
    </Primitive>
  );
}
