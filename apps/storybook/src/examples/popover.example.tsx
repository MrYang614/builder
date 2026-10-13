import { useState } from 'react';
import { Button, Input, Popover } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: Omit<ComponentProps<typeof Popover>, 'trigger'>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="example-row">
      <Popover
        {...args}
        open={open}
        onOpenChange={setOpen}
        trigger={<Button>Controlled popover</Button>}
      >
        <div className="example-stack">
          <Input placeholder="Editable content / 内容" allowClear />
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </Button>
        </div>
      </Popover>
      <Popover {...args} trigger={<Button variant="outline">Uncontrolled popover</Button>}>
        <p>Popover remains aligned with its trigger in both themes.</p>
      </Popover>
    </div>
  );
}
