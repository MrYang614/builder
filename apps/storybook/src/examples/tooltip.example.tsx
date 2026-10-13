import { Button, Tooltip } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: Omit<ComponentProps<typeof Tooltip>, 'children'>) {
  return (
    <div className="example-row">
      <Tooltip {...args}>
        <Button variant="outline">Hover or focus / 焦点提示</Button>
      </Tooltip>
      <Tooltip content="A disabled action still explains its purpose.">
        <Button disabled>Disabled action</Button>
      </Tooltip>
    </div>
  );
}
