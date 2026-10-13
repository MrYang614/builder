import { Check, ChevronRight } from 'lucide-react';
import { menuContentClass, menuItemClass, type DropdownMenu } from '../primitives/menu';
import { cn } from '../lib/utils';
import { renderIcon, type ComponentIcon } from './component-types';

interface MenuAction {
  id: string;
  label: string;
  icon?: ComponentIcon;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  keepOpen?: boolean;
  onSelect?: () => void;
}

export type MenuItem =
  | (MenuAction & { type?: 'item' })
  | { type: 'separator'; id: string }
  | { type: 'group'; id: string; label?: string; items: readonly MenuItem[] }
  | {
      type: 'submenu';
      id: string;
      label: string;
      icon?: ComponentIcon;
      disabled?: boolean;
      items: readonly MenuItem[];
    }
  | (Omit<MenuAction, 'destructive' | 'onSelect'> & {
      type: 'checkbox';
      checked: boolean | 'indeterminate';
      onCheckedChange: (checked: boolean) => void;
    })
  | {
      type: 'radio';
      id: string;
      label?: string;
      value: string;
      onValueChange: (value: string) => void;
      options: readonly { value: string; label: string; disabled?: boolean }[];
    };

type MenuParts = Pick<
  typeof DropdownMenu,
  | 'Item'
  | 'Label'
  | 'CheckboxItem'
  | 'RadioItem'
  | 'RadioGroup'
  | 'ItemIndicator'
  | 'Separator'
  | 'Group'
  | 'Sub'
  | 'SubTrigger'
  | 'SubContent'
  | 'Portal'
>;

export interface MenuContentProps {
  items: readonly MenuItem[];
  onSelect?: (id: string) => void;
  emptyLabel?: string;
}

/** Both menu families share the typed item model; Radix retains roving focus and typeahead. */
export function MenuItems({
  items,
  onSelect,
  emptyLabel = 'No actions available',
  parts,
}: MenuContentProps & { parts: MenuParts }) {
  const {
    Item,
    Label,
    CheckboxItem,
    RadioItem,
    RadioGroup,
    ItemIndicator,
    Separator,
    Group,
    Sub,
    SubTrigger,
    SubContent,
    Portal,
  } = parts;
  if (items.length === 0) {
    return (
      <Item className={menuItemClass} disabled>
        {emptyLabel}
      </Item>
    );
  }
  return items.map((item) => {
    if (item.type === 'separator') {
      return <Separator key={item.id} className="my-1 h-px bg-border" />;
    }
    if (item.type === 'group') {
      return (
        <Group key={item.id}>
          {item.label && (
            <Label className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {item.label}
            </Label>
          )}
          <MenuItems items={item.items} onSelect={onSelect} emptyLabel={emptyLabel} parts={parts} />
        </Group>
      );
    }
    if (item.type === 'submenu') {
      return (
        <Sub key={item.id}>
          <SubTrigger disabled={item.disabled} className={menuItemClass}>
            {item.icon && renderIcon(item.icon)}
            {item.label}
            <ChevronRight aria-hidden="true" className="ml-auto" />
          </SubTrigger>
          <Portal>
            <SubContent className={menuContentClass} sideOffset={4} alignOffset={-4}>
              <MenuItems
                items={item.items}
                onSelect={onSelect}
                emptyLabel={emptyLabel}
                parts={parts}
              />
            </SubContent>
          </Portal>
        </Sub>
      );
    }
    if (item.type === 'radio') {
      return (
        <RadioGroup key={item.id} value={item.value} onValueChange={item.onValueChange}>
          {item.label && (
            <Label className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {item.label}
            </Label>
          )}
          {item.options.map((option) => (
            <RadioItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              textValue={option.label}
              className={menuItemClass}
            >
              <ItemIndicator className="absolute left-2">
                <Check aria-hidden="true" />
              </ItemIndicator>
              {option.label}
            </RadioItem>
          ))}
        </RadioGroup>
      );
    }
    const content = (
      <>
        {item.icon && renderIcon(item.icon)}
        <span className="min-w-0 flex-1">{item.label}</span>
        {item.shortcut && (
          <span aria-hidden="true" className="ml-4 text-xs text-muted-foreground">
            {item.shortcut}
          </span>
        )}
      </>
    );
    if (item.type === 'checkbox') {
      return (
        <CheckboxItem
          key={item.id}
          checked={item.checked}
          disabled={item.disabled}
          onCheckedChange={item.onCheckedChange}
          onSelect={(event) => {
            if (item.keepOpen) {
              event.preventDefault();
            }
          }}
          textValue={item.label}
          className={menuItemClass}
        >
          <ItemIndicator className="absolute left-2">
            <Check aria-hidden="true" />
          </ItemIndicator>
          {content}
        </CheckboxItem>
      );
    }
    return (
      <Item
        key={item.id}
        disabled={item.disabled}
        textValue={item.label}
        className={cn(
          menuItemClass,
          item.destructive && 'text-destructive data-[highlighted]:text-destructive',
        )}
        onSelect={(event) => {
          if (item.keepOpen) {
            event.preventDefault();
          }
          item.onSelect?.();
          onSelect?.(item.id);
        }}
      >
        {content}
      </Item>
    );
  });
}
