import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

export type ParsedDraft<T> = { valid: true; value: T } | { valid: false };

interface DraftOptions<T> {
  value?: T;
  defaultValue: T;
  format: (value: T) => string;
  parse: (draft: string) => ParsedDraft<T>;
  onValueChange?: (value: T) => void;
  onCommit?: (value: T) => boolean | void;
  onCommitErrorChange?: (invalid: boolean) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

/** Owns only a local draft; synchronous acceptance clears dirty state before a following blur. */
export function useInputDraft<T>({
  value,
  defaultValue,
  format,
  parse,
  onValueChange,
  onCommit,
  onCommitErrorChange,
  disabled,
  readOnly,
}: DraftOptions<T>) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const external = value === undefined ? uncontrolled : value;
  const [text, setText] = useState(() => format(external));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  const dirty = useRef(false);
  const draft = useRef(text);
  const composing = useRef(false);
  const attempted = useRef<string | undefined>(undefined);
  const latest = useRef(external);
  const clearError = useEffectEvent(() => onCommitErrorChange?.(false));
  useLayoutEffect(() => {
    latest.current = external;
    if (!focused.current || !dirty.current) {
      const next = format(external);
      draft.current = next;
      setText(next);
      dirty.current = false;
      attempted.current = undefined;
      setInvalid(false);
      clearError();
    }
  }, [external, format]);

  const setError = (next: boolean) => {
    setInvalid(next);
    onCommitErrorChange?.(next);
  };
  const change = (next: string) => {
    if (disabled || readOnly) {
      return;
    }
    draft.current = next;
    setText(next);
    dirty.current = true;
    attempted.current = undefined;
    setError(false);
    const parsed = parse(next);
    if (parsed.valid) {
      if (value === undefined && !onCommit) {
        setUncontrolled(parsed.value);
      }
      onValueChange?.(parsed.value);
    }
  };
  const reset = () => {
    const next = format(latest.current);
    draft.current = next;
    setText(next);
    dirty.current = false;
    attempted.current = undefined;
    setError(false);
  };
  const commit = (trigger: 'enter' | 'blur' = 'blur') => {
    if (disabled || readOnly || composing.current || !dirty.current) {
      return;
    }
    if (trigger === 'blur' && attempted.current === draft.current) {
      return;
    }
    attempted.current = draft.current;
    const parsed = parse(draft.current);
    if (!parsed.valid) {
      setError(true);
      return;
    }
    if (!Object.is(parsed.value, latest.current) && onCommit?.(parsed.value) === false) {
      setError(true);
      return;
    }
    if (value === undefined) {
      latest.current = parsed.value;
      setUncontrolled(parsed.value);
    }
    dirty.current = false;
    const next = format(parsed.value);
    draft.current = next;
    setText(next);
    setError(false);
  };
  const setFocused = (next: boolean) => {
    focused.current = next;
  };
  const setComposing = (next: boolean) => {
    composing.current = next;
  };
  return { text, invalid, setFocused, setComposing, composing, change, reset, commit, draft };
}

export const textDisplay = (value: string) => value;
export const parseTextDraft = (value: string): ParsedDraft<string> => ({ valid: true, value });
