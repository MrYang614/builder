import { useState } from 'react';
import { Alert, Button } from '@building/ui';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Alert>) {
  const [visible, setVisible] = useState(true);
  return (
    <div className="example-stack">
      {visible ? (
        <Alert
          {...args}
          onClose={() => {
            setVisible(false);
          }}
          action={
            <Button variant="outline" size="sm">
              Retry / 重试
            </Button>
          }
        />
      ) : (
        <Button
          onClick={() => {
            setVisible(true);
          }}
        >
          Show alert again
        </Button>
      )}
      <Alert variant="success" title="Saved / 已保存" description="The action completed." />
      <Alert
        variant="warning"
        title="Review changes"
        description="A longer message can wrap in a narrow inspector panel without hiding its action."
      />
    </div>
  );
}
