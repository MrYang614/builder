import type { ComponentProps } from 'react';
import { Popover as Primitive } from 'radix-ui';
import { cn } from '../lib/utils';

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-4 text-popover-foreground shadow-md shadow-shadow outline-none',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
