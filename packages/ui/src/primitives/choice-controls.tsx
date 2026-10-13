import type { ComponentProps } from 'react';
import {
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioPrimitive,
  Switch as SwitchPrimitive,
} from 'radix-ui';
import { CheckIcon, CircleIcon, MinusIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ControlSize, ControlStatus } from './input-group';

const controlFocus =
  'shrink-0 border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[status=error]:border-destructive data-[status=warning]:border-warning';

/** Internal Radix checkbox keeps its hidden form input and indeterminate keyboard behavior. */
export function CheckboxControl({
  size = 'md',
  status,
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root> & { size?: ControlSize; status?: ControlStatus }) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      data-slot="checkbox"
      data-status={status}
      className={cn(
        controlFocus,
        'rounded-sm bg-background data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center [&_svg]:size-3.5">
        {props.checked === 'indeterminate' ? <MinusIcon /> : <CheckIcon />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const RadioRoot = RadioPrimitive.Root;

export function RadioControl({
  size = 'md',
  status,
  className,
  ...props
}: ComponentProps<typeof RadioPrimitive.Item> & { size?: ControlSize; status?: ControlStatus }) {
  return (
    <RadioPrimitive.Item
      {...props}
      data-slot="radio"
      data-status={status}
      className={cn(
        controlFocus,
        'rounded-full bg-background text-primary data-[state=checked]:border-primary',
        size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4',
        className,
      )}
    >
      <RadioPrimitive.Indicator className="flex items-center justify-center">
        <CircleIcon className="size-2 fill-current" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Item>
  );
}

export function SwitchControl({
  size = 'md',
  status,
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root> & { size?: ControlSize; status?: ControlStatus }) {
  return (
    <SwitchPrimitive.Root
      {...props}
      data-slot="switch"
      data-status={status}
      className={cn(
        controlFocus,
        'inline-flex items-center rounded-full bg-input px-0.5 transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        size === 'sm' ? 'h-4 w-7' : size === 'lg' ? 'h-6 w-11' : 'h-5 w-9',
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block rounded-full bg-background shadow-xs shadow-shadow transition-transform data-[state=unchecked]:translate-x-0',
          size === 'sm'
            ? 'size-3 data-[state=checked]:translate-x-3'
            : size === 'lg'
              ? 'size-5 data-[state=checked]:translate-x-5'
              : 'size-4 data-[state=checked]:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
