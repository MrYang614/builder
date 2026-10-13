import { useState } from 'react';
import { Switch } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Switch>) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="example-stack">
      <Switch {...args} checked={checked} onCheckedChange={setChecked}>
        Enable preview / 启用预览
      </Switch>
      <Switch {...args} defaultChecked>
        Uncontrolled switch
      </Switch>
      <output>Enabled: {String(checked)}</output>
    </div>
  );
}
