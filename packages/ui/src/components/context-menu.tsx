import type { ReactElement } from 'react';
import { ContextMenu as Primitive, ContextMenuContent } from '../primitives/menu';
import { MenuItems, type MenuContentProps } from './menu-items';

export interface ContextMenuProps extends MenuContentProps {
  children: ReactElement;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  modal?: boolean;
}

export function ContextMenu({
  children,
  items,
  onSelect,
  emptyLabel,
  disabled = false,
  ...props
}: ContextMenuProps) {
  return (
    <Primitive.Root {...props}>
      <Primitive.Trigger
        asChild
        disabled={disabled}
        onKeyDown={(event) => {
          if (
            !disabled &&
            !event.defaultPrevented &&
            (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))
          ) {
            // WebViews do not consistently dispatch the native keyboard contextmenu event.
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            event.currentTarget.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: bounds.left + bounds.width / 2,
                clientY: bounds.top + bounds.height / 2,
              }),
            );
          }
        }}
      >
        {children}
      </Primitive.Trigger>
      <ContextMenuContent>
        <MenuItems parts={Primitive} items={items} onSelect={onSelect} emptyLabel={emptyLabel} />
      </ContextMenuContent>
    </Primitive.Root>
  );
}
