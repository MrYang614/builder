import type { ComponentProps } from 'react';
import { Progress as Primitive } from 'radix-ui';
import { cn } from '../lib/utils';

export function Progress({
  className,
  value,
  max = 100,
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <Primitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-full rounded-full bg-primary transition-transform motion-reduce:transition-none',
          value == null && 'motion-safe:animate-pulse',
        )}
        style={{
          transform:
            value == null ? 'translateX(-50%)' : `translateX(-${100 - (value / max) * 100}%)`,
        }}
      />
    </Primitive.Root>
  );
}
