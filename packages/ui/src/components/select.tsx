import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '../lib/utils';
import { inputSizes, inputSurface } from '../primitives/input-group';
import type { ControlSize, ControlStatus } from '../primitives/input-group';
import { useFieldControl } from './form';

export interface SelectOption {
  value: string;
  label: ReactNode;
  searchText?: string;
  group?: string;
  disabled?: boolean;
}

interface SelectSharedProps extends Omit<
  ComponentProps<'button'>,
  'className' | 'style' | 'value' | 'defaultValue' | 'onChange' | 'size' | 'children'
> {
  options: readonly SelectOption[];
  searchable?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: ReactNode;
  clearLabel?: string;
  size?: ControlSize;
  width?: 'full' | 'auto';
  status?: ControlStatus;
  readOnly?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: LucideIcon;
  appearance?: 'default' | 'icon';
  /** Changes numeric glyphs without coercing option values, labels or selection behavior. */
  valueFormat?: 'text' | 'numeric';
  tooltip?: string;
}

export type SelectProps = SelectSharedProps &
  (
    | {
        multiple?: false;
        value?: string;
        defaultValue?: string;
        onValueChange?: (value: string | undefined) => void;
      }
    | {
        multiple: true;
        value?: readonly string[];
        defaultValue?: readonly string[];
        onValueChange?: (value: string[]) => void;
      }
  );

/** Combobox options remain keyed by stable values; the Radix popover owns dismissal and focus restoration. */
export function Select(props: SelectProps) {
  const {
    options,
    searchable = false,
    allowClear = false,
    placeholder = 'Select an option',
    searchPlaceholder = 'Search options',
    emptyText = 'No options found',
    clearLabel = 'Clear selection',
    size = 'md',
    width = 'full',
    status,
    readOnly,
    disabled,
    open: controlledOpen,
    defaultOpen = false,
    onOpenChange,
    icon: Icon,
    appearance = 'default',
    valueFormat = 'text',
    tooltip,
    value,
    defaultValue,
    onValueChange: _onValueChange,
    multiple = false,
    onKeyDown,
    ref,
    ...buttonProps
  } = props;
  const field = useFieldControl();
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const blocked = Boolean(disabled || field.disabled);
  const invalid = field.invalid || status === 'error';
  const [localValue, setLocalValue] = useState<string | readonly string[] | undefined>(
    defaultValue,
  );
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeValue, setActiveValue] = useState<string>();
  const current = value ?? localValue;
  const selected = typeof current === 'string' ? [current] : (current ?? []);
  const open = !blocked && !readOnly && (controlledOpen ?? localOpen);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return options.filter(
      (option) =>
        !needle ||
        (
          option.searchText ??
          (typeof option.label === 'string' || typeof option.label === 'number'
            ? String(option.label)
            : option.value)
        )
          .toLocaleLowerCase()
          .includes(needle),
    );
  }, [options, query]);
  const enabled = visible.filter((option) => !option.disabled);
  const active =
    enabled.find((option) => option.value === activeValue) ??
    enabled.find((option) => selected.includes(option.value)) ??
    enabled[0];
  const activeId = active ? `${listId}-${options.indexOf(active)}` : undefined;
  const groups = useMemo(() => {
    const result = new Map<string, SelectOption[]>();
    for (const option of visible) {
      const key = option.group ?? '';
      const members = result.get(key) ?? [];
      members.push(option);
      result.set(key, members);
    }
    return Array.from(result);
  }, [visible]);
  useLayoutEffect(() => {
    if (open && activeId) {
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeId]);

  const setOpen = (next: boolean) => {
    if (next && (blocked || readOnly)) {
      return;
    }
    if (controlledOpen === undefined) {
      setLocalOpen(next);
    }
    onOpenChange?.(next);
    if (!next) {
      setQuery('');
      setActiveValue(undefined);
    }
    setTooltipOpen(false);
  };
  const publish = (next: string[]) => {
    if (multiple) {
      if (value === undefined) {
        setLocalValue(next);
      }
      if (props.multiple) {
        props.onValueChange?.(next);
      }
    } else {
      if (value === undefined) {
        setLocalValue(next[0]);
      }
      if (!props.multiple) {
        props.onValueChange?.(next[0]);
      }
    }
  };
  const choose = (option: SelectOption) => {
    if (blocked || readOnly || option.disabled) {
      return;
    }
    publish(
      multiple
        ? selected.includes(option.value)
          ? selected.filter((entry) => entry !== option.value)
          : [...selected, option.value]
        : [option.value],
    );
    if (!multiple) {
      setOpen(false);
    }
  };
  const navigate = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    const index = enabled.findIndex((option) => option.value === active?.value);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next =
        enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length];
      setActiveValue(next?.value);
    } else if (event.key === 'Enter' || (event.key === ' ' && event.target === listRef.current)) {
      event.preventDefault();
      if (active) {
        choose(active);
      }
    } else if ((event.key === 'Home' || event.key === 'End') && event.target === listRef.current) {
      event.preventDefault();
      setActiveValue(event.key === 'Home' ? enabled[0]?.value : enabled.at(-1)?.value);
    } else if (
      event.key.length === 1 &&
      event.target === listRef.current &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = Date.now();
      const needle =
        `${now - typeahead.current.at < 600 ? typeahead.current.text : ''}${event.key}`.toLocaleLowerCase();
      typeahead.current = { text: needle, at: now };
      const ordered = [...enabled.slice(index + 1), ...enabled.slice(0, index + 1)];
      const match =
        ordered.find((option) =>
          (option.searchText ?? String(option.label)).toLocaleLowerCase().startsWith(needle),
        ) ??
        ordered.find((option) =>
          (option.searchText ?? String(option.label))
            .toLocaleLowerCase()
            .startsWith(event.key.toLocaleLowerCase()),
        );
      if (match) {
        setActiveValue(match.value);
      }
    }
  };
  const labels = selected.map(
    (entry) => options.find((option) => option.value === entry)?.label ?? entry,
  );
  const display = labels.length ? (
    multiple ? (
      <span className="flex min-w-0 flex-wrap gap-1">
        {labels.map((label, index) => (
          <span
            key={selected[index]}
            className="truncate rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
          >
            {label}
          </span>
        ))}
      </span>
    ) : (
      labels[0]
    )
  ) : (
    placeholder
  );
  // oxlint-disable jsx-a11y/prefer-tag-over-role -- ARIA select-only combobox uses a button trigger; native select cannot host searchable rich/multiple options in the same controlled widget.
  const trigger = (
    <PopoverPrimitive.Trigger asChild>
      <button
        {...buttonProps}
        ref={ref}
        id={buttonProps.id ?? field.id}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-readonly={readOnly || undefined}
        aria-required={buttonProps['aria-required'] ?? (field.required || undefined)}
        aria-invalid={buttonProps['aria-invalid'] ?? (invalid || undefined)}
        aria-describedby={
          [buttonProps['aria-describedby'], field.describedBy].filter(Boolean).join(' ') ||
          undefined
        }
        disabled={blocked}
        data-slot={appearance === 'icon' ? 'select-icon-trigger' : 'select-trigger'}
        data-status={invalid ? 'error' : status}
        data-disabled={blocked}
        data-placeholder={!labels.length || undefined}
        className={cn(
          'flex min-w-0 items-center gap-2 outline-none [&_svg]:size-4 [&_svg]:shrink-0',
          appearance === 'icon'
            ? 'size-8 shrink-0 justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
            : cn(
                'justify-between px-2 data-[placeholder]:text-muted-foreground',
                inputSurface,
                inputSizes[size],
                width === 'full' ? 'w-full' : 'w-auto',
              ),
          multiple && appearance !== 'icon' && 'h-auto min-h-8 py-1',
        )}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setActiveValue(
              event.key === 'ArrowDown'
                ? (selected.find((entry) => enabled.some((option) => option.value === entry)) ??
                    enabled[0]?.value)
                : enabled.at(-1)?.value,
            );
            setOpen(true);
          }
        }}
      >
        {Icon ? <Icon /> : null}
        <span
          className={cn(
            appearance === 'icon' ? 'sr-only' : 'min-w-0 flex-1 truncate text-left',
            valueFormat === 'numeric' && labels.length > 0 && 'font-mono tabular-nums',
          )}
        >
          {display}
        </span>
        {appearance !== 'icon' ? <ChevronDownIcon className="text-muted-foreground" /> : null}
      </button>
    </PopoverPrimitive.Trigger>
  );
  // oxlint-enable jsx-a11y/prefer-tag-over-role
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <div
        data-slot="select"
        className={cn(
          'flex min-w-0 items-center gap-1',
          width === 'full' && appearance !== 'icon' ? 'w-full' : 'w-auto',
        )}
      >
        {tooltip ? (
          <TooltipPrimitive.Provider delayDuration={350}>
            <TooltipPrimitive.Root open={tooltipOpen && !open} onOpenChange={setTooltipOpen}>
              <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
              <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                  sideOffset={8}
                  className="z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm shadow-shadow"
                >
                  {tooltip}
                </TooltipPrimitive.Content>
              </TooltipPrimitive.Portal>
            </TooltipPrimitive.Root>
          </TooltipPrimitive.Provider>
        ) : (
          trigger
        )}
        {allowClear && selected.length && !blocked && !readOnly ? (
          <button
            type="button"
            aria-label={clearLabel}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => publish([])}
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
        {buttonProps.name
          ? selected.map((entry) => (
              <input
                type="hidden"
                key={entry}
                name={buttonProps.name}
                value={entry}
                disabled={blocked}
              />
            ))
          : null}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={5}
          align="start"
          data-slot="select-content"
          className="z-50 w-(--radix-popover-trigger-width) min-w-44 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md shadow-shadow outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (searchable) {
              searchRef.current?.focus();
            } else {
              listRef.current?.focus();
            }
          }}
        >
          {searchable ? (
            <div className="mb-1 border-b px-2 pb-1">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveValue(undefined);
                }}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-controls={listId}
                aria-expanded={open}
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                className="h-8 w-full min-w-0 rounded-sm bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                onKeyDown={navigate}
              />
            </div>
          ) : null}
          {/* oxlint-disable jsx-a11y/prefer-tag-over-role -- ARIA listbox/option roles support rich labels and active-descendant keyboard focus; native option elements cannot render these accessible option slots outside select. */}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={buttonProps['aria-label'] ?? placeholder}
            aria-multiselectable={multiple || undefined}
            aria-activedescendant={searchable ? undefined : activeId}
            tabIndex={searchable ? -1 : 0}
            className="max-h-64 overflow-y-auto outline-none"
            onKeyDown={navigate}
          >
            {groups.map(([group, members]) => (
              <fieldset
                aria-label={group || undefined}
                key={group || 'ungrouped'}
                className="m-0 min-w-0 border-0 p-0"
              >
                {group ? (
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group}
                  </div>
                ) : null}
                {members.map((option) => (
                  <div
                    id={`${listId}-${options.indexOf(option)}`}
                    key={option.value}
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected.includes(option.value)}
                    aria-disabled={option.disabled || undefined}
                    data-active={active?.value === option.value || undefined}
                    className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[active=true]:bg-accent data-[active=true]:text-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    onPointerMove={() => {
                      if (!option.disabled) {
                        setActiveValue(option.value);
                      }
                    }}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        choose(option);
                      }
                    }}
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 break-words',
                        valueFormat === 'numeric' && 'font-mono tabular-nums',
                      )}
                    >
                      {option.label}
                    </span>
                    {selected.includes(option.value) ? (
                      <CheckIcon className="size-4 shrink-0" />
                    ) : null}
                  </div>
                ))}
              </fieldset>
            ))}
            {!visible.length ? (
              <output className="block px-3 py-5 text-center text-sm text-muted-foreground">
                {emptyText}
              </output>
            ) : null}
          </div>
          {/* oxlint-enable jsx-a11y/prefer-tag-over-role */}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
