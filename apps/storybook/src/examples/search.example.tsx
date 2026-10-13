import { useState } from 'react';
import { Form, Input } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Input.Search>) {
  const [value, setValue] = useState(String(args.defaultValue ?? ''));
  const [query, setQuery] = useState('No search submitted');
  return (
    <div className="example-stack">
      <Form.Item label="Search components / 搜索组件">
        <Input.Search {...args} value={value} onValueChange={setValue} onSearch={setQuery} />
      </Form.Item>
      <Form.Item label="Uncontrolled search">
        <Input.Search {...args} onSearch={setQuery} />
      </Form.Item>
      <output className="example-result">Submitted query: {query}</output>
    </div>
  );
}
