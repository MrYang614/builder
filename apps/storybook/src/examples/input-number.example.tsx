import { useState } from 'react';
import { Form, InputNumber } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof InputNumber>) {
  const [value, setValue] = useState<number | null>(args.defaultValue ?? 3.141592653589793);
  const [error, setError] = useState('');
  const [commits, setCommits] = useState(0);
  function commit(next: number | null) {
    if (next === null || next <= 0) {
      setError('Enter a positive number.');
      return false;
    }
    setValue(next);
    setError('');
    setCommits((count) => count + 1);
    return true;
  }
  return (
    <div className="example-stack">
      <Form.Item
        label="Controlled height / 高度"
        help="Enter or blur commits once. Escape cancels. Rejected drafts remain editable."
        error={error}
      >
        <InputNumber {...args} value={value} onCommit={commit} />
      </Form.Item>
      <Form.Item label="Uncontrolled number">
        <InputNumber {...args} />
      </Form.Item>
      <output>
        Formal value: {value}; accepted commits: {commits}
      </output>
    </div>
  );
}
