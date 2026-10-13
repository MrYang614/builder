import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import {
  Tooltip as TooltipPrimitive,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../primitives/tooltip';

export interface TooltipProps {
  children: ReactElement;
  content: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
  disabled?: boolean;
}

/** Radix owns hover, focus, dismissal and portal cleanup; content remains noninteractive. */
export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delayDuration = 250,
  disabled = false,
  ...props
}: TooltipProps) {
  if (disabled || !content) {
    return children;
  }
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipPrimitive {...props}>
        <TooltipTrigger asChild>
          {isValidElement<{ disabled?: boolean }>(children) && children.props.disabled ? (
            <span className="inline-flex shrink-0">{children}</span>
          ) : (
            children
          )}
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={6}
          className="max-w-[min(20rem,calc(100vw-2rem))] break-words"
        >
          {content}
        </TooltipContent>
      </TooltipPrimitive>
    </TooltipProvider>
  );
}

export type TooltipProviderProps = ComponentProps<typeof TooltipProvider>;
export { TooltipProvider };
