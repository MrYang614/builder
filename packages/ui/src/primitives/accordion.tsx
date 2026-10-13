import type { ComponentProps } from 'react';
import { Accordion as Primitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export const Accordion = Primitive.Root;
export const AccordionItem = Primitive.Item;

export function AccordionTrigger({
  children,
  className,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Header className="m-0">
      <Primitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group flex w-full items-center justify-between gap-4 rounded-sm py-3 text-left text-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </Primitive.Trigger>
    </Primitive.Header>
  );
}

export function AccordionContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      data-slot="accordion-content"
      className={cn('pb-3 text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}
