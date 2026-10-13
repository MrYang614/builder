import { useState } from 'react';
import { ToggleGroup } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(
  args: Omit<
    ComponentProps<typeof ToggleGroup>,
    'type' | 'options' | 'value' | 'defaultValue' | 'onValueChange'
  >,
) {
  const [single, setSingle] = useState('left');
  const [multiple, setMultiple] = useState<string[]>(['left']);
  const options = [
    { value: 'left', label: 'Left / 左' },
    { value: 'center', label: 'Center / 中' },
    { value: 'right', label: 'Right / 右', disabled: true },
  ];
  return (
    <div className="example-stack">
      <ToggleGroup
        {...args}
        label="Single selection"
        type="single"
        options={options}
        value={single}
        onValueChange={setSingle}
      />
      <ToggleGroup
        {...args}
        label="Multiple selection"
        type="multiple"
        options={options}
        value={multiple}
        onValueChange={setMultiple}
      />
      <ToggleGroup
        {...args}
        type="single"
        label="Uncontrolled"
        options={options}
        defaultValue="center"
      />
    </div>
  );
}
