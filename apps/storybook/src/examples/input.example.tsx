import { useState } from 'react';
import { Form, Input } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Input>) {
  const [value, setValue] = useState(String(args.defaultValue ?? '庭院 Courtyard'));
  return (
    <div className="example-stack">
      <Form.Item label="Controlled name / 名称" help="Clearing updates local React state.">
        <Input {...args} value={value} onValueChange={setValue} />
      </Form.Item>
      <Form.Item label="Uncontrolled input">
        <Input {...args} defaultValue="Independent draft" />
      </Form.Item>
      <output className="example-result">Current value: {value || '(empty)'}</output>
    </div>
  );
}
