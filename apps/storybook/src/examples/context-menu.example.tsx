import { useState } from 'react';
import { Button, ContextMenu } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(
  args: Omit<ComponentProps<typeof ContextMenu>, 'children' | 'items'>,
) {
  const [selected, setSelected] = useState('None');
  return (
    <div className="example-stack">
      <ContextMenu
        {...args}
        items={[
          {
            id: 'copy',
            label: 'Copy / 复制',
            onSelect: () => {
              setSelected('Copy');
            },
          },
          { id: 'paste', label: 'Paste unavailable', disabled: true },
          {
            id: 'remove',
            label: 'Remove / 删除',
            destructive: true,
            onSelect: () => {
              setSelected('Remove');
            },
          },
        ]}
      >
        <Button variant="outline">Right click or Shift+F10</Button>
      </ContextMenu>
      <output>Selected: {selected}</output>
    </div>
  );
}
