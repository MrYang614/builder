import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
import type { ComponentSize } from './component-types';

export type CardProps = Omit<ComponentProps<'section'>, 'className' | 'style' | 'title'> & {
  title?: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  footer?: ReactNode;
  size?: ComponentSize;
};

export function Card({
  title,
  description,
  extra,
  footer,
  children,
  size = 'md',
  ...props
}: CardProps) {
  return (
    <section
      data-slot="card"
      {...props}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-lg border bg-card text-card-foreground',
        size === 'sm' ? 'p-3' : size === 'lg' ? 'p-6' : 'p-4',
      )}
    >
      {(title || description || extra) && (
        <div data-slot="card-header" className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="m-0 text-base font-semibold">{title}</h3>}
            {description && (
              <p className="mt-1 mb-0 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {extra}
        </div>
      )}
      <div data-slot="card-content" className="min-w-0">
        {children}
      </div>
      {footer && (
        <div data-slot="card-footer" className="flex flex-wrap items-center gap-2 border-t pt-3">
          {footer}
        </div>
      )}
    </section>
  );
}
