import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';

export const inputSizes = { sm: 'h-7 text-xs', md: 'h-8 text-sm', lg: 'h-9 text-sm' };
export type ControlSize = keyof typeof inputSizes;
export type ControlStatus = 'error' | 'warning';
// Neutral hover must yield to keyboard focus and validation, regardless of generated variant order.
export const inputSurface =
  'rounded-md border border-input bg-control text-foreground outline-none transition-[border-color,box-shadow] [&:hover:not(:focus-within):not([data-status]):not([data-disabled=true])]:border-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 data-[status=error]:border-destructive data-[status=error]:focus-within:ring-destructive/20 dark:data-[status=error]:focus-within:ring-destructive/40 data-[status=warning]:border-warning data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50';

/** Internal shadcn input-group boundary; wrappers choose semantic size and status. */
export function InputGroup({
  size = 'md',
  width = 'full',
  status,
  disabled,
  children,
}: {
  size?: ControlSize;
  width?: 'full' | 'auto';
  status?: ControlStatus;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="input-group"
      data-status={status}
      data-disabled={disabled}
      className={cn(
        'flex min-w-0 items-center gap-1.5 px-2',
        inputSurface,
        inputSizes[size],
        width === 'full' ? 'w-full' : 'w-auto',
      )}
    >
      {children}
    </div>
  );
}

/** Native input is kept unstyled inside its group so adornments share one focus surface. */
export function InputGroupInput(props: ComponentProps<'input'>) {
  return (
    <input
      {...props}
      data-slot="input"
      className="h-full w-full min-w-0 border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed file:mr-2 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-foreground [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
    />
  );
}

export function InputGroupAddon({ children }: { children: ReactNode }) {
  return (
    <span
      data-slot="input-addon"
      className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-4"
    >
      {children}
    </span>
  );
}

export function InputGroupButton({ children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      type="button"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
