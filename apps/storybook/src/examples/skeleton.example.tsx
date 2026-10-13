import { Skeleton } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Skeleton>) {
  return (
    <div className="example-stack">
      <Skeleton {...args} />
      <Skeleton shape="circle" label="Loading avatar" />
      <Skeleton shape="rectangle" label="Loading preview" />
    </div>
  );
}
