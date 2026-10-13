import { useState } from 'react';
import { Slider } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Slider>) {
  const [value, setValue] = useState([40]);
  return (
    <div className="example-stack">
      <Slider {...args} value={value} onValueChange={setValue} />
      <Slider {...args} defaultValue={[20, 70]} />
      <output>Controlled value: {value.join(', ')}</output>
    </div>
  );
}
