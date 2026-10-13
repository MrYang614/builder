import { useState } from 'react';
import { Checkbox } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Checkbox.Group>) {
  const [value, setValue] = useState<string[]>(['front']);
  return (
    <div className="example-stack">
      <Checkbox.Group {...args} value={value} onValueChange={setValue} />
      <Checkbox.Group {...args} defaultValue={['side']} />
      <output>Selected: {value.join(', ')}</output>
    </div>
  );
}
