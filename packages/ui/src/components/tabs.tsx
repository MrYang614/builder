import type { ComponentProps, ReactNode } from 'react';
import { Tabs as Primitive, TabsList, TabsContent, TabsTrigger } from '../primitives/tabs';
import { cn } from '../lib/utils';
import { renderIcon, type ComponentIcon, type ComponentSize } from './component-types';

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
  icon?: ComponentIcon;
  disabled?: boolean;
}

export type TabsProps = Omit<
  ComponentProps<typeof Primitive>,
  'className' | 'style' | 'children' | 'asChild'
> & {
  items: readonly TabItem[];
  size?: ComponentSize;
  variant?: 'line' | 'pills';
  label?: string;
};

/** Radix couples tabs and panels with keyboard navigation and focus semantics. */
export function Tabs({
  items,
  size = 'md',
  variant = 'line',
  label,
  orientation = 'horizontal',
  defaultValue,
  ...props
}: TabsProps) {
  return (
    <Primitive
      {...props}
      defaultValue={defaultValue ?? items.find((item) => !item.disabled)?.value}
      orientation={orientation}
      className={cn('flex min-w-0 gap-4', orientation === 'vertical' ? 'flex-row' : 'flex-col')}
    >
      <TabsList
        aria-label={label}
        className={cn(
          orientation === 'vertical' ? 'flex-col items-stretch' : 'flex-wrap',
          variant === 'pills' ? 'rounded-md bg-muted p-1' : 'border-b',
        )}
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              size === 'sm' ? 'h-7 text-xs' : size === 'lg' ? 'h-10' : 'h-9',
              variant === 'pills'
                ? 'data-[state=active]:bg-background data-[state=active]:text-foreground'
                : 'rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary',
            )}
          >
            {item.icon && renderIcon(item.icon)}
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item) => (
        <TabsContent key={item.value} value={item.value}>
          {item.content}
        </TabsContent>
      ))}
    </Primitive>
  );
}
