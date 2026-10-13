import { useState } from 'react';
import { Accordion } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(
  args: Omit<
    ComponentProps<typeof Accordion>,
    'type' | 'items' | 'value' | 'defaultValue' | 'onValueChange' | 'collapsible'
  >,
) {
  const [value, setValue] = useState('details');
  const items = [
    {
      value: 'details',
      title: 'Details / 详情',
      content: <p>Long bilingual detail text stays readable inside a narrow panel.</p>,
    },
    { value: 'material', title: 'Materials / 材质', content: <p>Material properties.</p> },
    { value: 'locked', title: 'Disabled', disabled: true, content: <p>Unavailable.</p> },
  ];
  return (
    <div className="example-stack">
      <Accordion
        {...args}
        type="single"
        items={items}
        value={value}
        onValueChange={setValue}
        collapsible
      />
      <Accordion {...args} type="multiple" items={items} defaultValue={['details', 'material']} />
    </div>
  );
}
