import { useState } from 'react';
import { Form, Input, InputNumber, Select } from '@building/ui';
import { useOptionalLanguage } from './i18n';

/** Uses two-decimal edits without rounding untouched Core values; empty drafts never commit. */
export function Numeric({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => boolean | void;
}) {
  const [invalid, setInvalid] = useState(false);
  const language = useOptionalLanguage();
  return (
    <Form.Item
      label={label}
      orientation="horizontal"
      announceError={false}
      error={
        invalid
          ? (language?.t('inputInvalid') ?? 'Enter a valid value and confirm again.')
          : undefined
      }
    >
      <InputNumber
        size="sm"
        precision={2}
        aria-invalid={invalid}
        value={value}
        onCommit={(next) => (next === null ? false : onCommit(next))}
        onCommitErrorChange={setInvalid}
      />
    </Form.Item>
  );
}

/** The UI package owns IME and commit timing; this adapter submits only accepted text changes. */
export function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => boolean | void;
}) {
  const [invalid, setInvalid] = useState(false);
  const language = useOptionalLanguage();
  return (
    <Form.Item
      label={label}
      orientation="horizontal"
      announceError={false}
      error={
        invalid
          ? (language?.t('inputInvalid') ?? 'Enter a valid value and confirm again.')
          : undefined
      }
    >
      <Input
        size="sm"
        aria-invalid={invalid}
        value={value}
        onCommit={onCommit}
        onCommitErrorChange={setInvalid}
      />
    </Form.Item>
  );
}

/** Presents one complete selector without repeating primitive composition in each inspector field. */
export function Choice({
  label,
  value,
  options,
  onChange,
  valueFormat,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  valueFormat?: 'text' | 'numeric';
}) {
  return (
    <Form.Item label={label} orientation="horizontal">
      <Select
        size="sm"
        aria-label={label}
        value={value}
        options={options}
        valueFormat={valueFormat}
        onValueChange={(next) => {
          if (next !== undefined) {
            onChange(next);
          }
        }}
      />
    </Form.Item>
  );
}
