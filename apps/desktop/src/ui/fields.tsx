import { useEffect, useId, useRef, useState } from 'react';
import {
  Input,
  Field,
  FieldLabel,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@building/ui';
export function Numeric({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => boolean | void;
}) {
  const id = useId(),
    ref = useRef<HTMLInputElement>(null),
    [draft, setDraft] = useState(String(value)),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (document.activeElement !== ref.current) {
      setDraft(String(Number(value.toFixed(4))));
      setInvalid(false);
    }
  }, [value]);
  const commit = () => {
    if (draft.trim() === '' || !Number.isFinite(Number(draft))) {
      setInvalid(true);
      return;
    }
    if (Number(draft) === value) {
      setInvalid(false);
      return;
    }
    const ok = onCommit(Number(draft));
    setInvalid(ok === false);
  };
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        ref={ref}
        id={id}
        inputMode="decimal"
        data-escape-handled="true"
        value={draft}
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(String(value));
            setInvalid(false);
            e.stopPropagation();
          }
        }}
      />
    </Field>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((o) => (
              <SelectItem value={o.value} key={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
