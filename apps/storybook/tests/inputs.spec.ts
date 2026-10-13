import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Compiles a real public-API example through the same browser editor shipped in every story. */
async function openExample(page: Page, source: string) {
  await page.goto('/iframe.html?id=input-input--default&viewMode=story');
  await page.getByLabel('Editable TSX code').fill(source);
  const stage = page.getByTestId('preview-stage');
  await expect(stage.getByTestId('input-harness')).toBeVisible();
  return stage;
}

test('input family clears, reveals passwords, resizes text and submits the current search value', async ({
  page,
}, testInfo) => {
  const stage = await openExample(
    page,
    `
import { useState } from 'react';
import { Form, Input } from '@building/ui';
export default function Demo() {
  const [name, setName] = useState('建筑名称');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  return <div data-testid="input-harness">
    <Form.Item label="Name"><Input value={name} onValueChange={setName} allowClear /></Form.Item>
    <Form.Item label="Password"><Input.Password defaultValue="private" /></Form.Item>
    <Form.Item label="Description"><Input.TextArea autoSize={{minRows:2,maxRows:4}} showCount maxLength={120} /></Form.Item>
    <Form.Item label="Search"><Input.Search value={query} onValueChange={setQuery} onSearch={setSubmitted} allowClear /></Form.Item>
    <output data-testid="submitted">{submitted}</output>
    <Form.Item label="Read only"><Input value="Read only" readOnly allowClear /></Form.Item>
    <Form.Item label="Disabled"><Input value="Disabled" disabled allowClear /></Form.Item>
  </div>;
}`,
  );
  const name = stage.getByLabel('Name', { exact: true });
  await expect(name).toHaveValue('建筑名称');
  await name.focus();
  await stage.getByRole('button', { name: 'Clear input', exact: true }).click();
  await expect(name).toHaveValue('');
  await expect(name).toBeFocused();
  await name.fill('Tower 甲');

  const password = stage.getByLabel('Password', { exact: true });
  await password.focus();
  await expect(password).toHaveAttribute('type', 'password');
  await stage.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('private');
  await expect(password).toBeFocused();
  await stage.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');

  const description = stage.getByLabel('Description', { exact: true });
  const initialHeight = await description.evaluate((element) => element.clientHeight);
  const longDescription = Array.from({ length: 10 }, (_, index) => `第 ${index + 1} 行`).join('\n');
  await description.fill(longDescription);
  await expect(
    stage.getByRole('status').filter({ hasText: `${longDescription.length} / 120` }),
  ).toBeVisible();
  const resized = await description.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      height: element.clientHeight,
      max:
        Number.parseFloat(computed.lineHeight) * 4 +
        Number.parseFloat(computed.paddingTop) +
        Number.parseFloat(computed.paddingBottom),
      overflow: computed.overflowY,
    };
  });
  expect(resized.height).toBeGreaterThan(initialHeight);
  expect(resized.height).toBeLessThanOrEqual(resized.max + 1);
  expect(resized.overflow).toBe('auto');

  const search = stage.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill('木结构');
  await search.press('Enter');
  await expect(stage.getByTestId('submitted')).toHaveText('木结构');
  await search.fill('steel');
  // Chromium reports host styles for this vendor pseudo-element. Exercise its former hit area instead.
  // A native search comparison clears at this point; the shared input must retain its value.
  const bounds = await search.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width - 8, bounds!.y + bounds!.height / 2);
  await expect(search).toHaveValue('steel');
  await stage.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(stage.getByTestId('submitted')).toHaveText('steel');
  await expect(stage.getByLabel('Read only', { exact: true })).not.toBeEditable();
  await expect(stage.getByLabel('Disabled', { exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('input-family.png'), fullPage: true });
});

test('numeric and text commit drafts preserve precision, IME, rejection and external updates', async ({
  page,
}, testInfo) => {
  const stage = await openExample(
    page,
    `
import { useState } from 'react';
import { Button, Form, Input, InputNumber } from '@building/ui';
export default function Demo() {
  const [value, setValue] = useState(0.12345678912345678);
  const [calls, setCalls] = useState(0);
  const [text, setText] = useState('Initial');
  const [textCalls, setTextCalls] = useState(0);
  return <div data-testid="input-harness">
    <Form.Item label="Dimension"><InputNumber value={value} invalidMessage="Enter a valid number" onCommit={(next) => {setCalls(c => c+1); if(next === null || next <= 0) return false; setValue(next); return true;}} /></Form.Item>
    <Form.Item label="Committed text"><Input value={text} onCommit={(next) => {setTextCalls(c => c+1); if(next === 'reject') return false; setText(next); return true;}} /></Form.Item>
    <output data-testid="formal">{String(value)}</output><output data-testid="calls">{calls}</output>
    <output data-testid="text-formal">{text}</output><output data-testid="text-calls">{textCalls}</output>
    <Button onClick={() => setValue(4.125)}>External value</Button>
    <Button onClick={() => {}}>Blur target</Button>
  </div>;
}`,
  );
  const number = stage.getByLabel('Dimension', { exact: true });
  const blur = stage.getByRole('button', { name: 'Blur target' });
  await expect(number).toHaveValue('0.123456789123457');
  await number.focus();
  await blur.click();
  await expect(stage.getByTestId('formal')).toHaveText('0.12345678912345678');
  await expect(stage.getByTestId('calls')).toHaveText('0');
  await number.fill('1.25');
  await expect(stage.getByTestId('calls')).toHaveText('0');
  await number.press('Enter');
  await blur.click();
  await expect(stage.getByTestId('calls')).toHaveText('1');
  await expect(stage.getByTestId('formal')).toHaveText('1.25');

  await number.fill('-');
  await number.press('Enter');
  await expect(number).toHaveAttribute('aria-invalid', 'true');
  await expect(stage.getByRole('alert')).toHaveText('Enter a valid number');
  await expect(stage.getByTestId('calls')).toHaveText('1');
  await number.fill('-2');
  await number.press('Enter');
  await blur.click();
  await expect(number).toHaveValue('-2');
  await expect(number).toHaveAttribute('aria-invalid', 'true');
  await expect(stage.getByTestId('calls')).toHaveText('2');
  await number.fill('2.75');
  await number.dispatchEvent('compositionstart');
  await number.press('Enter');
  await expect(stage.getByTestId('calls')).toHaveText('2');
  await number.dispatchEvent('compositionend');
  await number.press('Enter');
  await blur.click();
  await expect(stage.getByTestId('calls')).toHaveText('3');
  await expect(number).not.toHaveAttribute('aria-invalid', 'true');

  await number.fill('9.5');
  await stage.getByRole('button', { name: 'External value' }).dispatchEvent('click');
  await expect(stage.getByTestId('formal')).toHaveText('4.125');
  await expect(number).toHaveValue('9.5');
  await number.press('Escape');
  await expect(number).toHaveValue('4.125');
  await blur.click();
  await expect(stage.getByTestId('calls')).toHaveText('3');

  const text = stage.getByLabel('Committed text', { exact: true });
  await text.fill('中文');
  await text.dispatchEvent('compositionstart');
  await text.press('Enter');
  await expect(stage.getByTestId('text-calls')).toHaveText('0');
  await text.dispatchEvent('compositionend');
  await text.press('Enter');
  await blur.click();
  await expect(stage.getByTestId('text-calls')).toHaveText('1');
  await expect(stage.getByTestId('text-formal')).toHaveText('中文');
  await text.fill('reject');
  await text.press('Enter');
  await blur.click();
  await expect(text).toHaveValue('reject');
  await expect(text).toHaveAttribute('aria-invalid', 'true');
  await expect(stage.getByTestId('text-calls')).toHaveText('2');
  await text.press('Escape');
  await expect(text).toHaveValue('中文');
  await page.screenshot({ path: testInfo.outputPath('commit-drafts.png'), fullPage: true });
});

test('select supports searchable groups, disabled options, multiple values, clear and dynamic options', async ({
  page,
}, testInfo) => {
  const stage = await openExample(
    page,
    `
import { useState } from 'react';
import { Button, Form, Select } from '@building/ui';
export default function Demo() {
  const [single, setSingle] = useState('a');
  const [multiple, setMultiple] = useState(['a']);
  const [dynamic, setDynamic] = useState(false);
  const options = [{value:'a',label:dynamic ? 'Alpha updated' : 'Alpha',group:'English'},{value:'b',label:'Beta',group:'English'},{value:'c',label:'Disabled',disabled:true,group:'English'},{value:'zh',label:'中文选项',group:'中文'}];
  return <div data-testid="input-harness">
    <Form.Item label="Single"><Select aria-label="Single" value={single} options={options} onValueChange={setSingle} searchable allowClear /></Form.Item>
    <Form.Item label="Multiple"><Select aria-label="Multiple" value={multiple} options={options} onValueChange={setMultiple} multiple searchable allowClear /></Form.Item>
    <output data-testid="single-value">{single || 'empty'}</output><output data-testid="multiple-value">{multiple.join(',') || 'empty'}</output>
    <Button onClick={() => setDynamic(true)}>Update options</Button>
  </div>;
}`,
  );
  const single = stage.getByRole('combobox', { name: 'Single', exact: true });
  await single.focus();
  await single.press('Enter');
  await expect(page.getByRole('group', { name: 'English', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Disabled', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  const search = page.getByRole('combobox', { name: 'Search options', exact: true });
  await expect(search).toBeFocused();
  expect(
    await search.evaluate((element) => ({
      visible: element.matches(':focus-visible'),
      ring: getComputedStyle(element).boxShadow !== 'none',
    })),
  ).toEqual({ visible: true, ring: true });
  await search.fill('no matching item');
  await expect(page.getByText('No options found', { exact: true })).toBeVisible();
  await search.fill('中文');
  await expect(page.getByRole('option', { name: '中文选项', exact: true })).toBeVisible();
  await search.press('Enter');
  await expect(stage.getByTestId('single-value')).toHaveText('zh');
  await expect(single).toBeFocused();
  await stage.getByRole('button', { name: 'Clear selection' }).first().click();
  await expect(stage.getByTestId('single-value')).toHaveText('empty');
  await single.press('ArrowDown');
  await page.getByRole('option', { name: 'Alpha', exact: true }).click();
  await stage.getByRole('button', { name: 'Update options' }).click();
  await expect(single).toHaveText('Alpha updated');

  const multiple = stage.getByRole('combobox', { name: 'Multiple', exact: true });
  await multiple.click();
  await page.getByRole('option', { name: 'Beta', exact: true }).click();
  await expect(stage.getByTestId('multiple-value')).toHaveText('a,b');
  await expect(multiple).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('option', { name: 'Alpha updated', exact: true }).click();
  await expect(stage.getByTestId('multiple-value')).toHaveText('b');
  await page.getByRole('combobox', { name: 'Search options' }).press('Escape');
  await expect(multiple).toBeFocused();
  await stage.getByRole('button', { name: 'Clear selection' }).last().click();
  await expect(stage.getByTestId('multiple-value')).toHaveText('empty');
  await multiple.click();
  await page.screenshot({ path: testInfo.outputPath('select-groups.png'), fullPage: true });
});

test('checkbox, radio and switch preserve keyboard and disabled or read-only behavior', async ({
  page,
}, testInfo) => {
  const stage = await openExample(
    page,
    `
import { useState } from 'react';
import { Checkbox, Radio, Switch } from '@building/ui';
export default function Demo() {
  const [checked, setChecked] = useState(false);
  const [group, setGroup] = useState(['a']);
  const [radio, setRadio] = useState('a');
  const [radioCalls, setRadioCalls] = useState(0);
  const [on, setOn] = useState(false);
  const options = [{value:'a',label:'Alpha'},{value:'b',label:'Beta'},{value:'c',label:'Disabled',disabled:true}];
  return <div data-testid="input-harness">
    <Checkbox checked={checked} onCheckedChange={setChecked} label="Checkbox" />
    <Checkbox disabled label="Disabled checkbox" />
    <Checkbox checked readOnly label="Read only checkbox" />
    <Checkbox.Group label="Checkbox choices" options={options} value={group} onValueChange={setGroup} />
    <Radio.Group label="Radio choices" options={options} value={radio} onValueChange={(next) => {setRadio(next);setRadioCalls(c => c+1);}} orientation="horizontal" />
    <Switch checked={on} onCheckedChange={setOn} label="Switch" />
    <Switch disabled label="Disabled switch" />
    <output data-testid="checked">{String(checked)}</output><output data-testid="group">{group.join(',')}</output><output data-testid="radio">{radio}</output><output data-testid="radio-calls">{radioCalls}</output><output data-testid="switch">{String(on)}</output>
  </div>;
}`,
  );
  const checkbox = stage.getByRole('checkbox', { name: 'Checkbox', exact: true });
  await checkbox.focus();
  await checkbox.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(stage.getByTestId('checked')).toHaveText('true');
  await expect(stage.getByRole('checkbox', { name: 'Disabled checkbox' })).toBeDisabled();
  const readonly = stage.getByRole('checkbox', { name: 'Read only checkbox' });
  await readonly.press('Space');
  await expect(readonly).toBeChecked();
  const checks = stage.getByRole('group', { name: 'Checkbox choices', exact: true });
  await checks.getByRole('checkbox', { name: 'Beta', exact: true }).check();
  await expect(stage.getByTestId('group')).toHaveText('a,b');
  await expect(checks.getByRole('checkbox', { name: 'Disabled', exact: true })).toBeDisabled();

  const radios = stage.getByRole('radiogroup', { name: 'Radio choices', exact: true });
  await radios.getByRole('radio', { name: 'Alpha', exact: true }).focus();
  await radios.getByRole('radio', { name: 'Alpha', exact: true }).press('ArrowRight');
  await expect(radios.getByRole('radio', { name: 'Beta', exact: true })).toBeChecked();
  await expect(stage.getByTestId('radio')).toHaveText('b');
  await expect(stage.getByTestId('radio-calls')).toHaveText('1');
  await radios.getByRole('radio', { name: 'Beta', exact: true }).press('ArrowRight');
  await expect(radios.getByRole('radio', { name: 'Alpha', exact: true })).toBeChecked();
  await expect(stage.getByTestId('radio-calls')).toHaveText('2');
  await radios.getByRole('radio', { name: 'Alpha', exact: true }).press('Shift+ArrowRight');
  await expect(radios.getByRole('radio', { name: 'Alpha', exact: true })).toBeChecked();
  await expect(stage.getByTestId('radio-calls')).toHaveText('2');
  await expect(radios.getByRole('radio', { name: 'Disabled', exact: true })).toBeDisabled();
  const toggle = stage.getByRole('switch', { name: 'Switch', exact: true });
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).toBeChecked();
  await expect(stage.getByTestId('switch')).toHaveText('true');
  await expect(stage.getByRole('switch', { name: 'Disabled switch' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('choice-keyboard.png'), fullPage: true });
});
