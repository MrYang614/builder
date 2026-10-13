import { Badge } from '@building/ui';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Badge>) {
  return (
    <div className="example-row">
      <Badge {...args} icon={<Check />}>
        Saved / 已保存
      </Badge>
      <Badge {...args}>Long status description</Badge>
      <Badge variant="success">Ready</Badge>
      <Badge variant="warning">Review</Badge>
      <Badge variant="destructive">Failed</Badge>
    </div>
  );
}
