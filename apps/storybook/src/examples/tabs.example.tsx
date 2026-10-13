import { useState } from 'react';
import { Tabs } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: Omit<ComponentProps<typeof Tabs>, 'items'>) {
  const [value, setValue] = useState('details');
  const items = [
    { value: 'details', label: 'Details / 详情', content: <p>Project details panel.</p> },
    {
      value: 'materials',
      label: 'Materials / 材质',
      content: <p>Materials panel with longer English and 中文 text.</p>,
    },
    { value: 'locked', label: 'Disabled', disabled: true, content: <p>Unavailable.</p> },
  ];
  return (
    <div className="example-stack">
      <Tabs {...args} items={items} value={value} onValueChange={setValue} />
      <Tabs {...args} items={items} defaultValue="materials" />
    </div>
  );
}
