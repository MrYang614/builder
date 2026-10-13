import type { ComponentProps, ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, XIcon } from 'lucide-react';
import { Alert as AlertPrimitive, AlertDescription, AlertTitle } from '../primitives/alert';
import { cn } from '../lib/utils';
import { Button } from './button';
import { renderIcon, type ComponentIcon } from './component-types';

export type AlertProps = Omit<ComponentProps<'div'>, 'className' | 'style' | 'title'> & {
  variant?: 'default' | 'destructive' | 'success' | 'warning';
  title?: ReactNode;
  description?: ReactNode;
  icon?: ComponentIcon | false;
  action?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
};

/** Feedback is readable in either theme; the alert role is reserved for meaningful live messages. */
export function Alert({
  title,
  description,
  children,
  variant = 'default',
  icon,
  action,
  onClose,
  closeLabel = 'Dismiss',
  ...props
}: AlertProps) {
  const Icon =
    variant === 'success'
      ? CircleCheck
      : variant === 'warning'
        ? TriangleAlert
        : variant === 'destructive'
          ? CircleAlert
          : Info;
  return (
    <AlertPrimitive
      {...props}
      variant={variant === 'destructive' ? 'destructive' : 'default'}
      className={cn(
        variant === 'success' && 'text-success [&_[data-slot=alert-description]]:text-foreground',
        variant === 'warning' && 'text-warning [&_[data-slot=alert-description]]:text-foreground',
      )}
    >
      {icon !== false && (icon ? renderIcon(icon) : <Icon aria-hidden="true" />)}
      {title && <AlertTitle className="line-clamp-none pr-6">{title}</AlertTitle>}
      {(description || children) && (
        <AlertDescription>
          {description}
          {children}
        </AlertDescription>
      )}
      {action && <div className="col-start-2 mt-2">{action}</div>}
      {onClose && (
        <div className="absolute right-2 top-2">
          <Button.Icon
            label={closeLabel}
            icon={XIcon}
            tooltip={false}
            size="sm"
            onClick={onClose}
          />
        </div>
      )}
    </AlertPrimitive>
  );
}
