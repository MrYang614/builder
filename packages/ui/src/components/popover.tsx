import { useId, type ReactElement, type ReactNode, type Ref } from 'react';
import { XIcon } from 'lucide-react';
import {
  Popover as Primitive,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '../primitives/popover';
import { Button } from './button';
import type { ComponentSize } from './component-types';

export interface PopoverProps {
  trigger: ReactElement;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  size?: ComponentSize;
  modal?: boolean;
  closeLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/** Portal positioning and return focus stay with Radix; a visible close action is optional. */
export function Popover({
  trigger,
  title,
  description,
  children,
  side = 'bottom',
  align = 'center',
  size = 'md',
  closeLabel,
  ref,
  ...props
}: PopoverProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Primitive {...props}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        ref={ref}
        side={side}
        align={align}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={size === 'sm' ? 'w-56' : size === 'lg' ? 'w-96' : 'w-72'}
      >
        <div className="flex flex-col gap-3">
          {(title || closeLabel) && (
            <div className="flex items-center justify-between gap-2">
              {title && (
                <div id={titleId} className="text-sm font-medium">
                  {title}
                </div>
              )}
              {closeLabel && (
                <PopoverClose asChild>
                  <Button.Icon label={closeLabel} icon={XIcon} tooltip={false} size="sm" />
                </PopoverClose>
              )}
            </div>
          )}
          {description && (
            <p id={descriptionId} className="m-0 text-xs text-muted-foreground">
              {description}
            </p>
          )}
          {children}
        </div>
      </PopoverContent>
    </Primitive>
  );
}
