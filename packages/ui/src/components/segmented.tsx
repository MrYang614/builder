import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { Segmented as Primitive, SegmentedItem } from '../primitives/segmented';
import { cn } from '../lib/utils';
import { nextRadioValue } from './choice-shared';
import {
  renderIcon,
  type ComponentIcon,
  type ComponentSize,
  type ComponentWidth,
} from './component-types';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: ComponentIcon;
  disabled?: boolean;
}

export type SegmentedProps = Omit<
  ComponentProps<typeof Primitive>,
  'className' | 'style' | 'children' | 'asChild'
> & {
  options: readonly SegmentedOption[];
  size?: ComponentSize;
  width?: ComponentWidth;
  label?: string;
};

export function Segmented({
  options,
  size = 'md',
  width = 'auto',
  label,
  defaultValue,
  value,
  onValueChange,
  onKeyDownCapture,
  onPointerDownCapture,
  orientation = 'horizontal',
  ...props
}: SegmentedProps) {
  const [local, setLocal] = useState(
    defaultValue ?? options.find((option) => !option.disabled)?.value ?? '',
  );
  const selected = value ?? local;
  const latestSelection = useRef(selected);
  useLayoutEffect(() => {
    latestSelection.current = selected;
  }, [selected]);
  // Publish once per gesture before Radix's deferred focus can lose fast keyup state.
  function publish(next: string) {
    if (props.disabled || next === latestSelection.current) {
      return;
    }
    latestSelection.current = next;
    if (value === undefined) {
      setLocal(next);
    }
    onValueChange?.(next);
  }
  return (
    <Primitive
      {...props}
      value={selected}
      onValueChange={publish}
      onKeyDownCapture={(event) => {
        latestSelection.current = selected;
        onKeyDownCapture?.(event);
        const next = nextRadioValue(event, options, {
          disabled: props.disabled,
          orientation,
          dir: props.dir,
          loop: props.loop,
        });
        if (next !== undefined) {
          publish(next);
        }
      }}
      onPointerDownCapture={(event) => {
        latestSelection.current = selected;
        onPointerDownCapture?.(event);
      }}
      aria-label={label}
      orientation={orientation}
      className={cn(
        width === 'full' ? 'w-full' : 'w-fit',
        orientation === 'vertical' && 'flex-col',
      )}
    >
      {options.map((option) => (
        <SegmentedItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            size === 'sm' ? 'h-6 text-xs' : size === 'lg' ? 'h-8' : 'h-7',
            width === 'full' && 'flex-1',
          )}
        >
          {option.icon && renderIcon(option.icon)}
          {option.label}
        </SegmentedItem>
      ))}
    </Primitive>
  );
}
