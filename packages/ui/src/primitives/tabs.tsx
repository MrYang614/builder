import type { ComponentProps } from 'react';
import { Tabs as Primitive } from 'radix-ui';
import { cn } from '../lib/utils';

export const Tabs = Primitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      data-slot="tabs-list"
      className={cn('inline-flex min-w-0 items-center gap-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      data-slot="tabs-content"
      className={cn(
        'min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
}
