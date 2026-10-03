import type { ComponentProps } from 'react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/** An icon action keeps its accessible name and hint together, including when disabled. */
export function IconButton({
  label,
  children,
  variant = 'ghost',
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'size'> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button aria-label={label} size="icon" variant={variant} {...props}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
