import { useState } from 'react';
import { Button, DropdownMenu } from '@building/ui';
import { Save, Plus } from 'lucide-react';
import type { ComponentProps } from 'react';

export default function Example(
  args: Omit<ComponentProps<typeof DropdownMenu>, 'trigger' | 'items'>,
) {
  const [selected, setSelected] = useState('None');
  const [checked, setChecked] = useState(false);
  const items: ComponentProps<typeof DropdownMenu>['items'] = [
    {
      id: 'save',
      label: 'Save / 保存',
      icon: <Save />,
      shortcut: 'Ctrl+S',
      onSelect: () => {
        setSelected('Save');
      },
    },
    { id: 'disabled', label: 'Unavailable action', disabled: true },
    { id: 'separator', type: 'separator' },
    {
      id: 'show',
      type: 'checkbox',
      label: 'Show details / 显示详情',
      checked,
      onCheckedChange: setChecked,
    },
    {
      id: 'more',
      type: 'submenu',
      label: 'More actions',
      items: [
        {
          id: 'add',
          label: 'Add / 添加',
          icon: <Plus />,
          onSelect: () => {
            setSelected('Add');
          },
        },
      ],
    },
  ];
  return (
    <div className="example-stack">
      <DropdownMenu
        {...args}
        trigger={<Button variant="outline">Project menu / 项目菜单</Button>}
        items={items}
      />
      <output>
        Selected: {selected}; details: {String(checked)}
      </output>
    </div>
  );
}
