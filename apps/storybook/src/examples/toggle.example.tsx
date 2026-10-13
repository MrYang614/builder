import { useState } from 'react';
import { Toggle } from '@building/ui';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Toggle>) {
  const [pressed, setPressed] = useState(false);
  return (
    <div className="example-row">
      <Toggle {...args} pressed={pressed} onPressedChange={setPressed} icon={<Check />}>
        Controlled / 受控
      </Toggle>
      <Toggle {...args} defaultPressed>
        Uncontrolled / 非受控
      </Toggle>
      <output>Pressed: {String(pressed)}</output>
    </div>
  );
}
