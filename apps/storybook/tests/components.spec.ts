import { expect, test, type Page } from '@playwright/test';

/** Exercises the public API through the real compiler and Storybook preview shared with consumers. */
async function preview(page: Page, code: string) {
  await page.goto('/iframe.html?id=actions-button--default&viewMode=story');
  await page.getByLabel('Editable TSX code', { exact: true }).fill(code);
  await expect(page.getByText('Current code and configuration', { exact: true })).toBeVisible();
  await expect(
    page.getByTestId('preview-stage').locator('[data-testid="component-case"]'),
  ).toBeVisible();
}

test('loading action blocks repeat activation and progress exposes clamped values', async ({
  page,
}) => {
  await preview(
    page,
    `import * as React from 'react';
import { useState } from 'react';
import { Button, Progress, Spinner } from '@building/ui';
import { Save } from 'lucide-react';
export default function Example() {
  const [pending, setPending] = useState(false);
  const [count, setCount] = useState(0);
  return <div data-testid="component-case"><Button.Group label="Save actions">
    <Button icon={Save} loading={pending} onClick={() => { setCount(count + 1); setPending(true); }}>Save project</Button>
    <Button variant="outline" onClick={() => setPending(false)}>Finish</Button>
  </Button.Group><output>Actions {count}</output><Progress label="Export progress" value={140} max={100} showValue /><Spinner label="Preparing preview" /></div>;
}`,
  );
  const stage = page.getByTestId('preview-stage');
  const save = stage.getByRole('button', { name: 'Save project' });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await expect(stage.getByText('Actions 1')).toBeVisible();
  await stage.getByRole('button', { name: 'Finish' }).click();
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(stage.getByText('Actions 2')).toBeVisible();
  await expect(stage.getByRole('progressbar', { name: 'Export progress' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await expect(stage.getByText('100%', { exact: true })).toBeVisible();
  await expect(stage.getByRole('status', { name: 'Preparing preview' })).toBeVisible();
});

test('dialog protects draft Escape, traps focus and restores a controlled opener', async ({
  page,
}) => {
  await preview(
    page,
    `import * as React from 'react';
import { useState } from 'react';
import { Button, Dialog, Form, Input } from '@building/ui';
export default function Example() {
  const [open, setOpen] = useState(false);
  return <div data-testid="component-case"><Button onClick={() => setOpen(true)}>Edit project</Button>
    <Dialog title="Project settings" description="Edit the draft before saving." open={open} onOpenChange={setOpen} showCloseButton={false} footer={<Button onClick={() => setOpen(false)}>Done</Button>}>
      <Form.Item label="Project name"><Input defaultValue="Courtyard" onCommit={() => true} /></Form.Item>
    </Dialog></div>;
}`,
  );
  const opener = page.getByRole('button', { name: 'Edit project' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Project settings' });
  await expect(dialog).toHaveAccessibleDescription('Edit the draft before saving.');
  const input = dialog.getByLabel('Project name');
  await expect(input).toBeFocused();
  await input.fill('Uncommitted');
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('Courtyard');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await dialog.getByRole('button', { name: 'Done' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('confirmation retains a rejected action, retries, and blocks dismissal during pending work', async ({
  page,
}) => {
  await preview(
    page,
    `import * as React from 'react';
import { useRef, useState } from 'react';
import { Button, ConfirmDialog } from '@building/ui';
export default function Example() {
  const attempts = useRef(0);
  const finish = useRef(() => {});
  const [completed, setCompleted] = useState(false);
  return <div data-testid="component-case"><ConfirmDialog title="Delete item?" description="Confirm only after reviewing the item." trigger={<Button>Review delete</Button>} confirmLabel="Delete item" cancelLabel="Keep item" destructive onConfirm={() => {
    attempts.current += 1;
    if (attempts.current === 1) { throw new Error('Delete failed. Retry the action.'); }
    return new Promise<void>((resolve) => { finish.current = () => { setCompleted(true); resolve(); }; });
  }}><Button onClick={() => finish.current()}>Complete pending work</Button></ConfirmDialog><output>{completed ? 'Completed' : 'Awaiting confirmation'}</output></div>;
}`,
  );
  const opener = page.getByRole('button', { name: 'Review delete' });
  await opener.click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete item?' });
  await expect(dialog.getByRole('button', { name: 'Keep item' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete item', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Delete failed. Retry the action.');
  await dialog.getByRole('button', { name: 'Delete item', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Delete item', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Keep item' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Complete pending work' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByTestId('preview-stage').getByText('Completed', { exact: true }),
  ).toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByRole('button', { name: 'Delete item', exact: true })).toBeEnabled();
});

test('dropdown and context menus navigate disabled entries and submenus', async ({
  page,
}, testInfo) => {
  await preview(
    page,
    `import * as React from 'react';
import { useState } from 'react';
import { Button, DropdownMenu, ContextMenu } from '@building/ui';
export default function Example() {
  const [result, setResult] = useState('none');
  const [grid, setGrid] = useState(false);
  const [mode, setMode] = useState('plan');
  const items = [{ id:'disabled', label:'Unavailable', disabled:true }, { id:'save', label:'Save', onSelect:()=>setResult('save') }, { type:'submenu' as const,id:'more',label:'More',items:[{id:'copy',label:'Copy',onSelect:()=>setResult('copy')}] }, {type:'checkbox' as const,id:'grid',label:'Show grid',checked:grid,onCheckedChange:setGrid,keepOpen:true}, {type:'radio' as const,id:'mode',label:'Render mode',value:mode,onValueChange:setMode,options:[{value:'plan',label:'Plan mode'},{value:'model',label:'Model mode'}]}];
  return <div data-testid="component-case"><DropdownMenu trigger={<Button>Actions</Button>} items={items} /><ContextMenu items={items}><Button>Context actions</Button></ContextMenu><output>Selected {result}</output></div>;
}`,
  );
  const trigger = page
    .getByTestId('preview-stage')
    .getByRole('button', { name: 'Actions', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Unavailable' })).toHaveAttribute(
    'data-disabled',
    '',
  );
  await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'More' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', { name: 'Copy' })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('dropdown-submenu.png'), fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByTestId('preview-stage').getByText('Selected copy')).toBeVisible();
  await expect(trigger).toBeFocused();
  await page
    .getByTestId('preview-stage')
    .getByRole('button', { name: 'Context actions' })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('preview-stage').getByText('Selected save')).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('preview-stage').getByRole('button', { name: 'Context actions' }).focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('context-menu.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.click();
  await page.getByRole('menuitemcheckbox', { name: 'Show grid' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Show grid' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitemradio', { name: 'Model mode' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: 'Model mode' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
});

test('popover restores focus and disabled icon actions retain explanatory tooltips', async ({
  page,
}) => {
  await preview(
    page,
    `import * as React from 'react';
import { Button, Popover } from '@building/ui';
import { Plus } from 'lucide-react';
export default function Example() { return <div data-testid="component-case"><Popover trigger={<Button>Inspect details</Button>} title="Details" closeLabel="Close details"><Button>Inside popover</Button></Popover><Button.Icon label="Add item" icon={Plus} disabled tooltip="Adding is unavailable" /></div>; }
`,
  );
  const stage = page.getByTestId('preview-stage');
  const trigger = stage.getByRole('button', { name: 'Inspect details' });
  await trigger.click();
  const popover = page.getByRole('dialog', { name: 'Details' });
  await expect(popover).toBeVisible();
  await popover.getByRole('button', { name: 'Close details' }).click();
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();
  const disabled = stage.getByRole('button', { name: 'Add item' });
  await expect(disabled).toBeDisabled();
  await disabled.locator('..').hover();
  await expect(page.getByRole('tooltip')).toHaveText('Adding is unavailable');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
});

test('organization families expose keyboard choice and associated panels', async ({ page }) => {
  await preview(
    page,
    `import * as React from 'react';
import { useState } from 'react';
import { Tabs, Segmented, ToggleGroup, Accordion } from '@building/ui';
export default function Example() {
  const [choice, setChoice] = useState('plan');
  const [changes, setChanges] = useState(0);
  const options = [{value:'plan',label:'Plan'}, {value:'blocked',label:'Unavailable',disabled:true}, {value:'model',label:'Model'}];
  return <div data-testid="component-case"><Tabs label="Editor panels" items={[{value:'first',label:'First',content:'First panel'},{value:'blocked',label:'Blocked',content:'Blocked panel',disabled:true},{value:'last',label:'Last',content:'Last panel'}]} activationMode="manual" /><Segmented label="View" options={options} value={choice} onValueChange={(next) => {setChoice(next);setChanges((count) => count + 1);}} /><ToggleGroup label="Tools" options={options} defaultValue="plan" /><Accordion items={[{value:'first',title:'First section',content:'First detail'},{value:'blocked',title:'Blocked section',content:'Hidden detail',disabled:true},{value:'last',title:'Last section',content:'Last detail'}]} /><output>View {choice}</output><output>Selections {changes}</output></div>;
}`,
  );
  const stage = page.getByTestId('preview-stage');
  const tabs = stage.getByRole('tablist', { name: 'Editor panels' });
  await tabs.getByRole('tab', { name: 'First', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Last', exact: true })).toBeFocused();
  await expect(stage.getByRole('tabpanel')).toHaveText('First panel');
  await page.keyboard.press('Enter');
  await expect(stage.getByRole('tabpanel')).toHaveText('Last panel');
  const radios = stage.getByRole('radiogroup', { name: 'View', exact: true });
  await radios.getByRole('radio', { name: 'Plan' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(radios.getByRole('radio', { name: 'Model' })).toBeChecked();
  await expect(stage.getByText('View model')).toBeVisible();
  await expect(stage.getByText('Selections 1', { exact: true })).toBeVisible();
  const tools = stage.getByRole('radiogroup', { name: 'Tools' });
  await tools.getByRole('radio', { name: 'Plan', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tools.getByRole('radio', { name: 'Model' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(tools.getByRole('radio', { name: 'Model' })).toHaveAttribute('aria-checked', 'true');
  await stage.getByRole('button', { name: 'First section' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(stage.getByRole('button', { name: 'Last section' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stage.getByText('Last detail')).toBeVisible();
});

test('readonly slider values stay keyboard stable and labels link to the first thumb', async ({
  page,
}) => {
  await preview(
    page,
    `import * as React from 'react';
import { Form, Slider } from '@building/ui';
export default function Example() { return <div data-testid="component-case"><Form.Item label="Readonly height"><Slider defaultValue={[40]} readOnly thumbLabels={['Height']} /></Form.Item><Slider defaultValue={[25,75]} thumbLabels={['Minimum','Maximum']} /></div>; }
`,
  );
  const stage = page.getByTestId('preview-stage');
  await stage.getByText('Readonly height', { exact: true }).click();
  const height = stage.getByRole('slider', { name: 'Height' });
  await expect(height).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Home');
  await expect(height).toHaveAttribute('aria-valuenow', '40');
  await expect(height).toHaveAttribute('aria-readonly', 'true');
  const minimum = stage.getByRole('slider', { name: 'Minimum' });
  await minimum.focus();
  await page.keyboard.press('ArrowRight');
  await expect(minimum).toHaveAttribute('aria-valuenow', '26');
});
