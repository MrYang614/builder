import { useState } from 'react';
import { Button } from '@building/ui';
import { Save, Plus } from 'lucide-react';
import type { ComponentProps } from 'react';

export default function Example(args: Omit<ComponentProps<typeof Button.Icon>, 'icon'>) {
  const [count, setCount] = useState(0);
  return (
    <div className="example-stack">
      <Button.Group label="Icon actions">
        <Button.Icon
          {...args}
          icon={Save}
          onClick={() => {
            setCount((value) => value + 1);
          }}
        />
        <Button.Icon {...args} icon={Plus} label="Add item / 添加" />
      </Button.Group>
      <output>Save count: {count}</output>
    </div>
  );
}
