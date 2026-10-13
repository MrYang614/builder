import { useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { EyeIcon, EyeOffIcon, SearchIcon, XIcon } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '../primitives/input-group';
import type { ControlSize, ControlStatus } from '../primitives/input-group';
import { useFieldControl } from './form';
import { parseTextDraft, textDisplay, useInputDraft } from './input-draft';
import { TextArea } from './input-text-area';

type NativeInput = Omit<
  ComponentProps<'input'>,
  'className' | 'style' | 'size' | 'prefix' | 'value' | 'defaultValue' | 'onChange'
>;
interface SharedInputProps extends NativeInput {
  value?: string;
  defaultValue?: string;
  size?: ControlSize;
  width?: 'full' | 'auto';
  status?: ControlStatus;
  prefix?: ReactNode;
  suffix?: ReactNode;
  allowClear?: boolean;
  clearLabel?: string;
  onValueChange?: (value: string) => void;
  onCommit?: (value: string) => boolean | void;
  onCommitErrorChange?: (invalid: boolean) => void;
}
export type InputProps =
  | (SharedInputProps & { type?: Exclude<NativeInput['type'], 'color' | 'file'>; onChange?: never })
  | (SharedInputProps & { type: 'color' | 'file'; onChange?: ComponentProps<'input'>['onChange'] });

interface InputControlProps extends SharedInputProps {
  onChange?: ComponentProps<'input'>['onChange'];
  action?: ReactNode;
  onEnter?: (value: string) => void;
}

/** Provides value events and optional commit drafts without exposing the group's visual styling. */
function InputControl({
  value,
  defaultValue = '',
  onValueChange,
  onCommit,
  onCommitErrorChange,
  size = 'md',
  width = 'full',
  status,
  prefix,
  suffix,
  action,
  allowClear = false,
  clearLabel = 'Clear input',
  disabled,
  readOnly,
  type = 'text',
  ref,
  onChange,
  onEnter,
  onFocus,
  onBlur,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: InputControlProps) {
  const field = useFieldControl();
  const blocked = Boolean(disabled || field.disabled);
  const localRef = useRef<HTMLInputElement | null>(null);
  const draft = useInputDraft({
    value,
    defaultValue,
    format: textDisplay,
    parse: parseTextDraft,
    onValueChange,
    onCommit,
    onCommitErrorChange,
    disabled: blocked,
    readOnly,
  });
  const invalid = draft.invalid || field.invalid || status === 'error';
  const nativeFile = type === 'file';
  return (
    <InputGroup size={size} width={width} status={invalid ? 'error' : status} disabled={blocked}>
      {prefix ? <InputGroupAddon>{prefix}</InputGroupAddon> : null}
      <InputGroupInput
        {...props}
        ref={(element) => {
          localRef.current = element;
          if (typeof ref === 'function') {
            return ref(element);
          }
          if (ref) {
            ref.current = element;
          }
        }}
        id={props.id ?? field.id}
        aria-describedby={
          [props['aria-describedby'], field.describedBy].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={props['aria-invalid'] ?? (invalid || undefined)}
        required={props.required ?? field.required}
        disabled={blocked}
        readOnly={readOnly}
        type={type}
        value={nativeFile ? undefined : draft.text}
        data-escape-handled={onCommit ? 'true' : undefined}
        onChange={(event) => {
          if (!nativeFile) {
            draft.change(event.target.value);
          }
          onChange?.(event);
        }}
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
          // Modal capture prevents Escape dismissal; the owned draft still needs to cancel locally.
          if (event.key === 'Escape' && onCommit) {
            event.stopPropagation();
            draft.reset();
            return;
          }
          if (event.defaultPrevented) {
            return;
          }
          if (event.key === 'Enter' && (onCommit || onEnter)) {
            event.preventDefault();
            draft.commit('enter');
            onEnter?.(draft.draft.current);
          }
        }}
      />
      {allowClear && draft.text && !blocked && !readOnly && !nativeFile ? (
        <InputGroupButton
          aria-label={clearLabel}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            draft.change('');
            localRef.current?.focus();
          }}
        >
          <XIcon />
        </InputGroupButton>
      ) : null}
      {suffix ? <InputGroupAddon>{suffix}</InputGroupAddon> : null}
      {action}
    </InputGroup>
  );
}

function TextInput(props: InputProps) {
  return <InputControl {...props} />;
}

export interface PasswordProps extends Omit<SharedInputProps, 'type'> {
  visibilityToggle?: boolean;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}
/** Password visibility stays local and never changes the value or browser autocomplete semantics. */
function Password({
  visibilityToggle = true,
  showPasswordLabel = 'Show password',
  hidePasswordLabel = 'Hide password',
  ...props
}: PasswordProps) {
  const field = useFieldControl();
  const [visible, setVisible] = useState(false);
  return (
    <InputControl
      {...props}
      type={visible ? 'text' : 'password'}
      action={
        visibilityToggle ? (
          <InputGroupButton
            aria-label={visible ? hidePasswordLabel : showPasswordLabel}
            aria-pressed={visible}
            disabled={Boolean(props.disabled || field.disabled)}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        ) : undefined
      }
    />
  );
}

export interface SearchProps extends Omit<SharedInputProps, 'type'> {
  onSearch?: (value: string) => void;
  searchLabel?: string;
  loading?: boolean;
}
/** Enter and the explicit search button use the same current draft, including uncontrolled values. */
function Search({ onSearch, searchLabel = 'Search', loading = false, ref, ...props }: SearchProps) {
  const field = useFieldControl();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <InputControl
      {...props}
      ref={(element) => {
        inputRef.current = element;
        if (typeof ref === 'function') {
          return ref(element);
        }
        if (ref) {
          ref.current = element;
        }
      }}
      type="search"
      prefix={props.prefix ?? <SearchIcon />}
      onEnter={loading ? undefined : onSearch}
      action={
        <InputGroupButton
          aria-label={searchLabel}
          disabled={Boolean(props.disabled || field.disabled) || loading}
          aria-busy={loading || undefined}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onSearch?.(inputRef.current?.value ?? '')}
        >
          <SearchIcon />
        </InputGroupButton>
      }
    />
  );
}

export const Input = Object.assign(TextInput, { TextArea, Password, Search });
