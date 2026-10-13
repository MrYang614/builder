import { Button, Empty } from '@building/ui';
import { Plus } from 'lucide-react';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Empty>) {
  return <Empty {...args} action={<Button icon={Plus}>Create item / 创建</Button>} />;
}
