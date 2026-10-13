import { Separator } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Separator>) {
  return (
    <div className="example-stack">
      <p>Project / 项目</p>
      <Separator {...args} />
      <p>Materials / 材质</p>
    </div>
  );
}
