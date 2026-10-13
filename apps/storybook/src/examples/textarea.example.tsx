import { useState } from 'react';
import { Form, Input } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Input.TextArea>) {
  const [value, setValue] = useState(
    String(
      args.defaultValue ??
        '一段说明\nA longer description that wraps naturally in a narrow container.',
    ),
  );
  return (
    <div className="example-stack">
      <Form.Item
        label="Description / 描述"
        help="Add lines to exercise autoSize and character count."
      >
        <Input.TextArea {...args} value={value} onValueChange={setValue} />
      </Form.Item>
      <Form.Item label="Uncontrolled notes">
        <Input.TextArea {...args} defaultValue="Type notes here." />
      </Form.Item>
    </div>
  );
}
