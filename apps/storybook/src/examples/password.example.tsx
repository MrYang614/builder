import { useState } from 'react';
import { Form, Input } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Input.Password>) {
  const [value, setValue] = useState(String(args.defaultValue ?? 'correct-horse'));
  return (
    <div className="example-stack">
      <Form.Item label="Controlled password / 密码">
        <Input.Password {...args} value={value} onValueChange={setValue} />
      </Form.Item>
      <Form.Item label="Uncontrolled password">
        <Input.Password {...args} defaultValue="sample-password" />
      </Form.Item>
    </div>
  );
}
