import { useState } from 'react';
import { Button, Dialog, Form, Input } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Dialog>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="example-row">
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open controlled dialog
      </Button>
      <Dialog
        {...args}
        open={open}
        onOpenChange={setOpen}
        footer={
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Done / 完成
          </Button>
        }
      >
        <Form.Item label="Project name">
          <Input defaultValue="Courtyard" allowClear />
        </Form.Item>
      </Dialog>
      <Dialog {...args} trigger={<Button variant="outline">Open uncontrolled dialog</Button>}>
        <p>This independent dialog restores focus to its trigger.</p>
      </Dialog>
    </div>
  );
}
