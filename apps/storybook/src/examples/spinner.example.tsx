import { Spinner } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Spinner>) {
  return (
    <div className="example-row">
      <Spinner {...args} />
      <span>Loading / 正在加载</span>
    </div>
  );
}
