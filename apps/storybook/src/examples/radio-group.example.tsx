import { useState } from 'react';
import { Radio } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Radio.Group>) {
  const [value, setValue] = useState('front');
  return (
    <div className="example-stack">
      <Radio.Group {...args} value={value} onValueChange={setValue} />
      <Radio.Group {...args} defaultValue="side" />
      <output>Selected: {value}</output>
    </div>
  );
}
