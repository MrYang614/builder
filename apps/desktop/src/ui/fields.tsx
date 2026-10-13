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
/** Removes binary arithmetic tails only in the display; tiny values never round to zero. */
function numericDisplay(value: number): string {
  const rounded = Number(value.toPrecision(15));
  return String(Number.isFinite(rounded) && (rounded !== 0 || value === 0) ? rounded : value);
}

/** Keeps exact formal precision; untouched display formatting never creates a command. */
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
    [draft, setDraft] = useState(numericDisplay(value)),
    [invalid, setInvalid] = useState(false),
    [edited, setEdited] = useState(false);
  useEffect(() => {
    if (document.activeElement !== ref.current) {
      setDraft(numericDisplay(value));
      setInvalid(false);
      setEdited(false);
    }
  }, [value]);
  const commit = () => {
    if (!edited) {
      setDraft(numericDisplay(value));
      setInvalid(false);
      return;
    }
    if (draft.trim() === '' || !Number.isFinite(Number(draft))) {
      setInvalid(true);
      return;
    }
    if (Number(draft) === value) {
      setInvalid(false);
      setEdited(false);
      return;
    }
    const ok = onCommit(Number(draft));
    setInvalid(ok === false);
    if (ok !== false) {
      setEdited(false);
    }
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
          setEdited(true);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(numericDisplay(value));
            setEdited(false);
            setInvalid(false);
            e.stopPropagation();
          }
        }}
      />
    </Field>
  );
}

/** Reconciles committed text with undo while retaining active or rejected input drafts. */
export function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => boolean | void;
}) {
  const id = useId(),
    ref = useRef<HTMLInputElement>(null),
    [draft, setDraft] = useState(value),
    [invalid, setInvalid] = useState(false),
    [edited, setEdited] = useState(false);
  useEffect(() => {
    if (document.activeElement !== ref.current) {
      setDraft(value);
      setInvalid(false);
      setEdited(false);
    }
  }, [value]);
  const commit = () => {
    if (!edited) {
      setDraft(value);
      setInvalid(false);
      return;
    }
    const rejected = draft !== value && onCommit(draft) === false;
    setInvalid(rejected);
    if (!rejected) {
      setEdited(false);
    }
  };
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        ref={ref}
        id={id}
        value={draft}
        aria-invalid={invalid}
        data-escape-handled="true"
        onChange={(event) => {
          setDraft(event.target.value);
          setEdited(true);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            setDraft(value);
            setEdited(false);
            setInvalid(false);
            event.stopPropagation();
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
