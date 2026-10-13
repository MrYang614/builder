import type { ComponentProps } from 'react';
import { RadioGroup as Primitive } from 'radix-ui';
import { cn } from '../lib/utils';

export function Segmented({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      data-slot="segmented"
      className={cn('inline-flex min-w-0 rounded-md bg-muted p-1', className)}
      {...props}
    />
  );
}

export function SegmentedItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      data-slot="segmented-item"
      className={cn(
        'inline-flex min-w-0 items-center justify-center gap-2 rounded-sm px-3 text-sm text-muted-foreground outline-none data-[state=checked]:bg-background data-[state=checked]:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}
