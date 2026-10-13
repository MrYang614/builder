import { useState } from 'react';
import { Segmented } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: Omit<ComponentProps<typeof Segmented>, 'options'>) {
  const [value, setValue] = useState('front');
  const options = [
    { value: 'front', label: 'Front / 正面' },
    { value: 'side', label: 'Side / 侧面' },
    { value: 'locked', label: 'Locked', disabled: true },
  ];
  return (
    <div className="example-stack">
      <Segmented {...args} options={options} value={value} onValueChange={setValue} />
      <Segmented {...args} options={options} defaultValue="side" />
      <output>Selected: {value}</output>
    </div>
  );
}
