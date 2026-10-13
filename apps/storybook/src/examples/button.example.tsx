import { useState } from 'react';
import { Button } from '@building/ui';
import { Save, Plus } from 'lucide-react';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Button>) {
  const [count, setCount] = useState(0);
  return (
    <div className="example-stack">
      <div className="example-row">
        <Button
          {...args}
          icon={Save}
          onClick={() => {
            setCount((value) => value + 1);
          }}
        >
          Save / 保存
        </Button>
        <Button {...args} wrap>
          A longer action label that wraps at narrow widths
        </Button>
      </div>
      <Button.Group label="Related actions">
        <Button {...args}>Save</Button>
        <Button {...args} variant="outline">
          Cancel
        </Button>
        <Button.Icon
          label="Add item / 添加"
          icon={Plus}
          disabled={args.disabled}
          size={args.size}
        />
      </Button.Group>
      <output className="example-result">Save count: {count}</output>
    </div>
  );
}
