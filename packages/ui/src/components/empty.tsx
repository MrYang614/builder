import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { renderIcon, type ComponentIcon, type ComponentSize } from './component-types';
import { cn } from '../lib/utils';

export interface EmptyProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentIcon | false;
  action?: ReactNode;
  size?: ComponentSize;
}

export function Empty({ title, description, icon, action, size = 'md' }: EmptyProps) {
  return (
    <div
      data-slot="empty"
      className={cn(
        'flex min-w-0 flex-col items-center gap-3 text-center',
        size === 'sm' ? 'p-4' : size === 'lg' ? 'p-10' : 'p-6',
      )}
    >
      {icon !== false && (
        <div className="text-muted-foreground [&_svg]:size-7">
          {icon ? renderIcon(icon) : <Inbox aria-hidden="true" />}
        </div>
      )}
      <div className="max-w-prose">
        <p className="m-0 text-sm font-medium">{title}</p>
        {description && (
          <p className="mb-0 mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
