import { Progress as Primitive } from '../primitives/progress';
import { cn } from '../lib/utils';
import type { ComponentSize } from './component-types';

export interface ProgressProps {
  value?: number | null;
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: ComponentSize;
  status?: 'default' | 'success' | 'warning' | 'error';
}

/** A null value announces indeterminate work; finite progress is clamped to the documented range. */
export function Progress({
  value = null,
  max = 100,
  label = 'Progress',
  showValue = false,
  size = 'md',
  status = 'default',
}: ProgressProps) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100;
  const current =
    value != null && Number.isFinite(value) ? Math.max(0, Math.min(limit, value)) : null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {showValue && (
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{label}</span>
          {current != null && <span>{Math.round((current / limit) * 100)}%</span>}
        </div>
      )}
      <Primitive
        aria-label={label}
        value={current}
        max={limit}
        className={cn(
          size === 'sm' ? 'h-1' : size === 'lg' ? 'h-3' : 'h-2',
          status === 'success' && '[&_[data-slot=progress-indicator]]:bg-success',
          status === 'warning' && '[&_[data-slot=progress-indicator]]:bg-warning',
          status === 'error' && '[&_[data-slot=progress-indicator]]:bg-destructive',
        )}
      />
    </div>
  );
}
