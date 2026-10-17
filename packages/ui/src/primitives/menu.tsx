import type { ComponentProps } from 'react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import { cn } from '../lib/utils';

export { ContextMenu, DropdownMenu };
export const menuContentClass =
  'z-50 min-w-48 max-w-[calc(100vw-2rem)] max-h-[var(--radix-dropdown-menu-content-available-height,calc(100dvh-2rem))] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md shadow-shadow outline-none';
export const menuItemClass =
  'relative flex min-h-7 min-w-0 cursor-default select-none items-center gap-2 rounded-sm py-1 pl-7 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(menuContentClass, className)}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenu.Content>) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        data-slot="context-menu-content"
        className={cn(menuContentClass, className)}
        {...props}
      />
    </ContextMenu.Portal>
  );
}
