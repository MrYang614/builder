import { cn } from '../lib/utils';

export interface SkeletonProps {
  lines?: number;
  shape?: 'text' | 'circle' | 'rectangle';
  animated?: boolean;
  label?: string;
}

export function Skeleton({
  lines = 3,
  shape = 'text',
  animated = true,
  label = 'Loading',
}: SkeletonProps) {
  const count = Number.isFinite(lines) ? Math.max(1, Math.min(20, Math.round(lines))) : 3;
  return (
    <div
      data-slot="skeleton"
      aria-busy="true"
      aria-label={label}
      className="flex w-full flex-col gap-2"
    >
      {Array.from({ length: shape === 'text' ? count : 1 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={cn(
            'bg-muted',
            animated && 'motion-safe:animate-pulse',
            shape === 'circle'
              ? 'size-10 rounded-full'
              : shape === 'rectangle'
                ? 'h-24 w-full rounded-md'
                : 'h-4 w-full rounded-sm last:w-3/4',
          )}
        />
      ))}
    </div>
  );
}
