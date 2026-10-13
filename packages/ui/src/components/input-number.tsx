import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '../primitives/input-group';
import type { ControlSize, ControlStatus } from '../primitives/input-group';
import { useFieldControl } from './form';
import { numericDisplay, useInputDraft } from './input-draft';

export interface InputNumberProps extends Omit<
  ComponentProps<'input'>,
  | 'className'
  | 'style'
  | 'size'
  | 'type'
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'prefix'
  | 'min'
  | 'max'
  | 'step'
> {
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (value: number | null) => void;
  onCommit?: (value: number | null) => boolean | void;
  onCommitErrorChange?: (invalid: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: ControlSize;
  width?: 'full' | 'auto';
  status?: ControlStatus;
  prefix?: ReactNode;
  suffix?: ReactNode;
  allowClear?: boolean;
  clearLabel?: string;
  invalidMessage?: string;
}

/** Keeps decimal intermediate text and commits only valid values; display rounding never creates a write. */
export function InputNumber({
  value,
  defaultValue = null,
  onValueChange,
  onCommit,
  onCommitErrorChange,
  min,
  max,
  step,
  size = 'md',
  width = 'full',
  status,
  prefix,
  suffix,
  allowClear = false,
  clearLabel = 'Clear number',
  invalidMessage,
  disabled,
  readOnly,
  onFocus,
  onBlur,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: InputNumberProps) {
  const field = useFieldControl();
  const blocked = Boolean(disabled || field.disabled);
  const errorId = useId();
  const draft = useInputDraft({
    value,
    defaultValue,
    format: numericDisplay,
    parse: (text) => {
      if (text.trim() === '') {
        return { valid: true, value: null };
      }
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) {
        return { valid: false };
      }
      const parsed = Number(text);
      if (
        !Number.isFinite(parsed) ||
        (min !== undefined && parsed < min) ||
        (max !== undefined && parsed > max)
      ) {
        return { valid: false };
      }
      return { valid: true, value: parsed };
    },
    onValueChange,
    onCommit,
    onCommitErrorChange,
    disabled: blocked,
    readOnly,
  });
  const invalid = draft.invalid || field.invalid || status === 'error';
  return (
    <div
      data-slot="input-number"
      className={width === 'full' ? 'w-full min-w-0' : 'w-auto min-w-0'}
    >
      <InputGroup size={size} width={width} status={invalid ? 'error' : status} disabled={blocked}>
        {prefix ? <InputGroupAddon>{prefix}</InputGroupAddon> : null}
        <InputGroupInput
          {...props}
          id={props.id ?? field.id}
          type="text"
          inputMode={props.inputMode ?? 'decimal'}
          aria-describedby={
            [
              props['aria-describedby'],
              field.describedBy,
              draft.invalid && invalidMessage ? errorId : undefined,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-invalid={props['aria-invalid'] ?? (invalid || undefined)}
          required={props.required ?? field.required}
          disabled={blocked}
          readOnly={readOnly}
          value={draft.text}
          data-escape-handled="true"
          onChange={(event) => draft.change(event.target.value)}
          onFocus={(event) => {
            draft.setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            draft.setFocused(false);
            draft.commit();
            onBlur?.(event);
          }}
          onCompositionStart={(event) => {
            draft.setComposing(true);
            onCompositionStart?.(event);
          }}
          onCompositionEnd={(event) => {
            draft.setComposing(false);
            onCompositionEnd?.(event);
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (draft.composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
              return;
            }
            // Modal capture prevents Escape dismissal; numeric drafts still cancel locally.
            if (event.key === 'Escape') {
              event.stopPropagation();
              draft.reset();
              return;
            }
            if (event.defaultPrevented) {
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              draft.commit('enter');
            } else if (
              step !== undefined &&
              step > 0 &&
              (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
              !blocked &&
              !readOnly
            ) {
              event.preventDefault();
              const current = Number(draft.draft.current);
              if (Number.isFinite(current)) {
                const next = Math.max(
                  min ?? -Infinity,
                  Math.min(max ?? Infinity, current + (event.key === 'ArrowUp' ? step : -step)),
                );
                draft.change(String(next));
              }
            }
          }}
        />
        {allowClear && draft.text && !blocked && !readOnly ? (
          <InputGroupButton
            aria-label={clearLabel}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => draft.change('')}
          >
            <XIcon />
          </InputGroupButton>
        ) : null}
        {suffix ? <InputGroupAddon>{suffix}</InputGroupAddon> : null}
      </InputGroup>
      {draft.invalid && invalidMessage ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
          {invalidMessage}
        </p>
      ) : null}
    </div>
  );
}
