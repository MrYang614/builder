import { useState } from 'react';
import { Form, Select } from '@building/ui';
import type { ComponentProps } from 'react';

type Args = Omit<
  ComponentProps<typeof Select>,
  'multiple' | 'value' | 'defaultValue' | 'onValueChange'
>;
export default function Example(args: Args) {
  const [single, setSingle] = useState<string | undefined>('courtyard');
  const [multiple, setMultiple] = useState<string[]>(['courtyard']);
  return (
    <div className="example-stack">
      <Form.Item label="Single / 单选">
        <Select {...args} value={single} onValueChange={setSingle} />
      </Form.Item>
      <Form.Item label="Multiple / 多选">
        <Select {...args} multiple value={multiple} onValueChange={setMultiple} />
      </Form.Item>
      <Form.Item label="Uncontrolled">
        <Select {...args} defaultValue="tower" />
      </Form.Item>
      <output>
        Single: {single ?? '(empty)'}; multiple: {multiple.join(', ') || '(empty)'}
      </output>
    </div>
  );
}
