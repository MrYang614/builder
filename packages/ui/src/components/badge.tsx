import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { renderIcon, type ComponentIcon, type ComponentSize } from './component-types';

export type BadgeProps = Omit<ComponentProps<'span'>, 'className' | 'style'> & {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning';
  size?: ComponentSize;
  icon?: ComponentIcon;
};

export function Badge({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      {...props}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 font-medium [&_svg]:size-3 [&_svg]:shrink-0',
        size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'px-3 py-1 text-sm' : 'text-xs',
        variant === 'default'
          ? 'border-primary bg-primary text-primary-foreground'
          : variant === 'destructive'
            ? 'border-destructive bg-destructive text-destructive-foreground'
            : variant === 'success'
              ? 'border-success/30 text-success'
              : variant === 'warning'
                ? 'border-warning/40 text-warning'
                : variant === 'outline'
                  ? 'text-foreground'
                  : 'border-transparent bg-secondary text-secondary-foreground',
      )}
    >
      {icon && renderIcon(icon)}
      {children}
    </span>
  );
}
