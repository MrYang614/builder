import { Badge, Button, Card, Input } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Card>) {
  return (
    <Card
      {...args}
      extra={<Badge variant="outline">Draft / 草稿</Badge>}
      footer={<Button variant="outline">Continue / 继续</Button>}
    >
      <Input placeholder="Project name / 项目名称" allowClear />
      <p>A longer body paragraph demonstrates actual content wrapping.</p>
    </Card>
  );
}
