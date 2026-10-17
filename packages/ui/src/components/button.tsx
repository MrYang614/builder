import type { ComponentProps, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button as ButtonPrimitive } from '../primitives/button';
import { cn } from '../lib/utils';
import { Tooltip } from './tooltip';
import {
  renderIcon,
  type ComponentIcon,
  type ComponentSize,
  type ComponentWidth,
} from './component-types';

export type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'link'
  | 'danger-ghost';
export type ButtonProps = Omit<ComponentProps<'button'>, 'className' | 'style'> & {
  variant?: ButtonVariant;
  size?: ComponentSize;
  width?: ComponentWidth;
  alignment?: 'start' | 'center' | 'between';
  wrap?: boolean;
  icon?: ComponentIcon;
  suffix?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
};

const sizes = { sm: 'sm', md: 'default', lg: 'lg' } as const;

/** Loading keeps the action's accessible name and blocks repeat submission at the native button. */
function ButtonRoot({
  variant = 'default',
  size = 'md',
  width = 'auto',
  alignment = 'center',
  wrap = false,
  icon,
  suffix,
  loading = false,
  loadingLabel,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      {...props}
      type={type}
      variant={variant === 'danger-ghost' ? 'ghost' : variant}
      size={sizes[size]}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        width === 'full' && 'w-full',
        alignment === 'start' && 'justify-start',
        alignment === 'between' && 'justify-between',
        variant === 'danger-ghost' && 'hover:bg-destructive hover:text-destructive-foreground',
        wrap && 'h-auto whitespace-normal text-left',
        wrap && (size === 'sm' ? 'min-h-7' : size === 'lg' ? 'min-h-9' : 'min-h-8'),
      )}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
      ) : icon ? (
        renderIcon(icon)
      ) : null}
      {loading && loadingLabel ? loadingLabel : children}
      {suffix && <span className="ml-auto text-xs text-current opacity-80">{suffix}</span>}
    </ButtonPrimitive>
  );
}

export type IconButtonProps = Omit<
  ButtonProps,
  'children' | 'aria-label' | 'width' | 'alignment' | 'suffix' | 'wrap'
> & {
  label: string;
  icon: ComponentIcon;
  tooltip?: boolean | string;
};

/** A disabled icon action still exposes its hint, while its native control retains the name. */
function ButtonIcon({
  label,
  icon,
  tooltip = true,
  variant = 'ghost',
  size = 'md',
  loading = false,
  loadingLabel,
  disabled,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <ButtonPrimitive
      {...props}
      type={type}
      aria-label={loading && loadingLabel ? loadingLabel : label}
      aria-busy={loading || undefined}
      variant={variant === 'danger-ghost' ? 'ghost' : variant}
      size={size === 'sm' ? 'icon-sm' : size === 'lg' ? 'icon-lg' : 'icon'}
      disabled={disabled || loading}
      className={
        variant === 'danger-ghost'
          ? 'hover:bg-destructive hover:text-destructive-foreground'
          : undefined
      }
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
      ) : icon ? (
        renderIcon(icon)
      ) : null}
    </ButtonPrimitive>
  );
  return tooltip ? (
    <Tooltip content={typeof tooltip === 'string' ? tooltip : label} side="bottom">
      <span className="inline-flex shrink-0">{button}</span>
    </Tooltip>
  ) : (
    button
  );
}

export interface ButtonGroupProps {
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  children: ReactNode;
}

function ButtonGroup({ label, orientation = 'horizontal', children }: ButtonGroupProps) {
  return (
    <fieldset
      data-slot="button-group"
      aria-label={label}
      className={cn(
        'm-0 inline-flex min-w-0 gap-1 border-0 p-0',
        orientation === 'vertical' ? 'flex-col' : 'flex-wrap items-center',
      )}
    >
      {children}
    </fieldset>
  );
}

export const Button = Object.assign(ButtonRoot, { Icon: ButtonIcon, Group: ButtonGroup });
