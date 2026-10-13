import { expect, test } from '@playwright/test';

test('closing a pending controlled confirmation isolates stale completion from a reopened dialog', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=actions-button--default&viewMode=story');
  await page.getByLabel('Editable TSX code', { exact: true }).fill(`import * as React from 'react';
import { useRef, useState } from 'react';
import { Button, ConfirmDialog } from '@building/ui';
export default function Example() {
  const [open, setOpen] = useState(false);
  const finish = useRef(() => {});
  return <div data-testid="confirmation-case"><Button onClick={() => setOpen(true)}>Open confirmation</Button><ConfirmDialog open={open} onOpenChange={setOpen} title="Replaceable action" description="This action may be replaced externally." confirmLabel="Confirm action" cancelLabel="Cancel action" onConfirm={() => new Promise<void>((resolve) => { finish.current = resolve; })}><Button onClick={() => setOpen(false)}>Close externally</Button><Button onClick={() => finish.current()}>Finish stale request</Button></ConfirmDialog></div>;
}`);
  await expect(page.getByTestId('preview-stage').getByTestId('confirmation-case')).toBeVisible();
  const opener = page.getByRole('button', { name: 'Open confirmation' });
  await opener.click();
  const dialog = page.getByRole('alertdialog', { name: 'Replaceable action' });
  await dialog.getByRole('button', { name: 'Confirm action' }).click();
  await expect(dialog.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close externally' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByRole('button', { name: 'Confirm action' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Finish stale request' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm action' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel action' }).click();
  await expect(dialog).toBeHidden();
});
