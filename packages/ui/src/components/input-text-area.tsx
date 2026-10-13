import { useLayoutEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { inputSurface } from '../primitives/input-group';
import type { ControlSize, ControlStatus } from '../primitives/input-group';
import { useFieldControl } from './form';
import { parseTextDraft, textDisplay, useInputDraft } from './input-draft';

export interface TextAreaProps extends Omit<
  ComponentProps<'textarea'>,
  'className' | 'style' | 'value' | 'defaultValue' | 'onChange'
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onCommit?: (value: string) => boolean | void;
  onCommitErrorChange?: (invalid: boolean) => void;
  size?: ControlSize;
  width?: 'full' | 'auto';
  status?: ControlStatus;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  showCount?: boolean;
  countLabel?: (count: number, maxLength?: number) => string;
  font?: 'default' | 'code';
}

/** Fits content within row bounds and releases its width observer when replaced or unmounted. */
export function TextArea({
  value,
  defaultValue = '',
  onValueChange,
  onCommit,
  onCommitErrorChange,
  size = 'md',
  width = 'full',
  status,
  autoSize = false,
  showCount = false,
  countLabel,
  font = 'default',
  disabled,
  readOnly,
  ref,
  onFocus,
  onBlur,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: TextAreaProps) {
  const field = useFieldControl();
  const blocked = Boolean(disabled || field.disabled);
  const localRef = useRef<HTMLTextAreaElement | null>(null);
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
  const minRows =
    typeof autoSize === 'object' ? Math.max(1, autoSize.minRows ?? 2) : (props.rows ?? 2);
  const maxRows =
    typeof autoSize === 'object' ? Math.max(minRows, autoSize.maxRows ?? Infinity) : Infinity;
  useLayoutEffect(() => {
    const element = localRef.current;
    if (!element || !autoSize) {
      return;
    }
    const resize = () => {
      const computed = getComputedStyle(element);
      const rowHeight = Number.parseFloat(computed.lineHeight);
      const borders =
        Number.parseFloat(computed.borderTopWidth) + Number.parseFloat(computed.borderBottomWidth);
      const inset =
        Number.parseFloat(computed.paddingTop) +
        Number.parseFloat(computed.paddingBottom) +
        borders;
      element.style.height = 'auto';
      element.style.height = `${Math.max(minRows * rowHeight + inset, Math.min(element.scrollHeight + borders, maxRows * rowHeight + inset))}px`;
      element.style.overflowY = element.scrollHeight > element.clientHeight ? 'auto' : 'hidden';
    };
    resize();
    let previousWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== previousWidth) {
        previousWidth = element.clientWidth;
        resize();
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.style.height = '';
      element.style.overflowY = '';
    };
  }, [autoSize, minRows, maxRows, draft.text]);
  return (
    <div
      data-slot="textarea-wrapper"
      className={cn('flex min-w-0 flex-col gap-1', width === 'full' ? 'w-full' : 'w-auto')}
    >
      <textarea
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
        rows={autoSize ? minRows : (props.rows ?? 3)}
        value={draft.text}
        data-slot="textarea"
        data-status={invalid ? 'error' : status}
        data-disabled={blocked}
        data-escape-handled={onCommit ? 'true' : undefined}
        className={cn(
          'w-full min-w-0 px-3 py-2 placeholder:text-muted-foreground',
          inputSurface,
          size === 'sm'
            ? 'text-xs leading-5'
            : size === 'lg'
              ? 'text-base leading-7'
              : 'text-sm leading-6',
          autoSize ? 'resize-none' : 'resize-y',
          font === 'code' && 'font-mono',
        )}
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
          // Modal capture prevents Escape dismissal; the multiline draft still cancels locally.
          if (event.key === 'Escape' && onCommit) {
            event.stopPropagation();
            draft.reset();
            return;
          }
          if (event.defaultPrevented) {
            return;
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onCommit) {
            event.preventDefault();
            draft.commit('enter');
          }
        }}
      />
      {showCount ? (
        <output className="self-end text-xs tabular-nums text-muted-foreground" aria-live="off">
          {countLabel?.(draft.text.length, props.maxLength) ??
            `${draft.text.length}${props.maxLength === undefined ? '' : ` / ${props.maxLength}`}`}
        </output>
      ) : null}
    </div>
  );
}
