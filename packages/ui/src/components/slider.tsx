import type { ComponentProps } from 'react';
import { Slider as Primitive } from '../primitives/slider';
import { cn } from '../lib/utils';
import { useFieldControl } from './form';
import type { ComponentSize, ComponentWidth } from './component-types';

export type SliderProps = Omit<
  ComponentProps<typeof Primitive>,
  'className' | 'style' | 'asChild' | 'thumbLabels' | 'controlId'
> & {
  size?: ComponentSize;
  width?: ComponentWidth;
  label?: string;
  thumbLabels?: readonly string[];
};

/** Readonly sliders retain focus and announce values while pointer and adjustment keys cannot edit them. */
export function Slider({
  size = 'md',
  width = 'full',
  label,
  thumbLabels,
  readOnly = false,
  id,
  disabled,
  min = 0,
  defaultValue,
  onValueChange,
  onValueCommit,
  onKeyDownCapture,
  onPointerDownCapture,
  ...props
}: SliderProps) {
  const field = useFieldControl();
  return (
    <Primitive
      {...props}
      min={min}
      defaultValue={defaultValue ?? [min]}
      controlId={id ?? field.id}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? field.invalid}
      readOnly={readOnly}
      thumbLabels={thumbLabels ?? (label ? [label] : undefined)}
      disabled={Boolean(disabled) || field.disabled}
      onValueChange={readOnly ? undefined : onValueChange}
      onValueCommit={readOnly ? undefined : onValueCommit}
      className={cn(
        width === 'auto' && 'w-48',
        size === 'sm'
          ? '[&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-track]]:h-1'
          : size === 'lg'
            ? '[&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-track]]:h-2'
            : undefined,
      )}
      onPointerDownCapture={(event) => {
        onPointerDownCapture?.(event);
        if (readOnly) {
          event.preventDefault();
        }
      }}
      onKeyDownCapture={(event) => {
        onKeyDownCapture?.(event);
        if (
          readOnly &&
          [
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'Home',
            'End',
            'PageUp',
            'PageDown',
          ].includes(event.key)
        ) {
          event.preventDefault();
        }
      }}
    />
  );
}
