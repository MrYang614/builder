import { useState } from 'react';
import { Button, Form, Input } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Form.Item>) {
  const [value, setValue] = useState('Courtyard / 庭院');
  return (
    <Form.Section
      title="Project details / 项目资料"
      description="Field labels, help and errors are associated with their controls."
    >
      <Form.Group>
        <Form.Item {...args}>
          <Input value={value} onValueChange={setValue} allowClear />
        </Form.Item>
        <Form.Item label="Uncontrolled notes" help="Optional">
          <Input.TextArea defaultValue="A shared field container." rows={3} />
        </Form.Item>
      </Form.Group>
      <Button
        variant="outline"
        onClick={() => {
          setValue('');
        }}
      >
        Clear name
      </Button>
    </Form.Section>
  );
}
