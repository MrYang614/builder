import { useState } from 'react';
import { Radio } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Radio>) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="example-stack">
      <Radio {...args} checked={checked} onCheckedChange={setChecked}>
        Controlled radio / 单选项
      </Radio>
      <Radio {...args} defaultChecked>
        Uncontrolled radio
      </Radio>
      <output>Checked: {String(checked)}</output>
    </div>
  );
}
