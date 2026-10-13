import { useState } from 'react';
import { Checkbox } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Checkbox>) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="example-stack">
      <Checkbox {...args} checked={checked} onCheckedChange={setChecked}>
        Controlled / 受控
      </Checkbox>
      <Checkbox {...args} defaultChecked>
        Uncontrolled / 非受控
      </Checkbox>
      <Checkbox {...args} indeterminate>
        Indeterminate / 部分选中
      </Checkbox>
      <output>Checked: {String(checked)}</output>
    </div>
  );
}
