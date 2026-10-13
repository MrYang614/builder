import type { ReactElement } from 'react';
import { DropdownMenu as Primitive, DropdownMenuContent } from '../primitives/menu';
import { MenuItems, type MenuContentProps } from './menu-items';

export interface DropdownMenuProps extends MenuContentProps {
  trigger: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  disabled?: boolean;
  modal?: boolean;
}

export function DropdownMenu({
  trigger,
  items,
  onSelect,
  emptyLabel,
  side = 'bottom',
  align = 'start',
  disabled = false,
  ...props
}: DropdownMenuProps) {
  return (
    <Primitive.Root {...props}>
      <Primitive.Trigger asChild disabled={disabled}>
        {trigger}
      </Primitive.Trigger>
      <DropdownMenuContent side={side} align={align}>
        <MenuItems parts={Primitive} items={items} onSelect={onSelect} emptyLabel={emptyLabel} />
      </DropdownMenuContent>
    </Primitive.Root>
  );
}
