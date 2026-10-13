import { useState } from 'react';
import { Button, Progress } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Progress>) {
  const [value, setValue] = useState(args.value ?? 45);
  return (
    <div className="example-stack">
      <Progress {...args} value={value} />
      <Button
        variant="outline"
        onClick={() => {
          setValue((current) => Math.min(current + 10, args.max ?? 100));
        }}
      >
        Advance / 增加
      </Button>
      <Progress label="Indeterminate / 未知进度" value={null} />
    </div>
  );
}
