import { useState } from 'react';
import { Button, ConfirmDialog } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: Omit<ComponentProps<typeof ConfirmDialog>, 'onConfirm'>) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <div className="example-stack">
      <div className="example-row">
        <Button
          variant="outline"
          onClick={() => {
            setOpen(true);
          }}
        >
          Controlled confirmation
        </Button>
        <ConfirmDialog
          {...args}
          open={open}
          onOpenChange={setOpen}
          onConfirm={() => {
            setCount((value) => value + 1);
          }}
        />
        <ConfirmDialog
          {...args}
          trigger={<Button>Uncontrolled confirmation</Button>}
          onConfirm={() => {
            setCount((value) => value + 1);
          }}
        />
      </div>
      <output>Confirmed: {count}</output>
    </div>
  );
}
