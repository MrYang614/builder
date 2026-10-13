import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ComponentSize } from './component-types';

export interface SpinnerProps {
  label?: string;
  size?: ComponentSize;
}

export function Spinner({ label = 'Loading', size = 'md' }: SpinnerProps) {
  return (
    <output
      data-slot="spinner"
      aria-label={label}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle
        aria-hidden="true"
        className={cn(
          'motion-safe:animate-spin',
          size === 'sm' ? 'size-3' : size === 'lg' ? 'size-6' : 'size-4',
        )}
      />
      <span className="sr-only">{label}</span>
    </output>
  );
}
