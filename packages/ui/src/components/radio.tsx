import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { RadioControl, RadioRoot } from '../primitives/choice-controls';
import { useFieldControl } from './form';
import { choiceLabelSize, nextRadioValue } from './choice-shared';
import type { ChoiceAppearance, ChoiceOption } from './choice-shared';

export interface RadioGroupProps
  extends
    ChoiceAppearance,
    Omit<
      ComponentProps<typeof RadioRoot>,
      'className' | 'style' | 'children' | 'onValueChange' | 'asChild' | 'orientation'
    > {
  options: readonly ChoiceOption[];
  onValueChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}

/** Radix owns arrow navigation and form participation; callers supply complete stable options. */
function RadioGroup({
  options,
  label,
  size = 'md',
  status,
  disabled,
  readOnly,
  orientation = 'vertical',
  onValueChange,
  ...props
}: RadioGroupProps) {
  const field = useFieldControl();
  const baseId = useId();
  const blocked = Boolean(disabled || field.disabled);
  const [local, setLocal] = useState(props.defaultValue ?? '');
  const selected = props.value ?? local;
  const latestSelection = useRef(selected);
  useLayoutEffect(() => {
    latestSelection.current = selected;
  }, [selected]);
  const publish = (next: string) => {
    if (readOnly || blocked || next === latestSelection.current) {
      return;
    }
    latestSelection.current = next;
    if (props.value === undefined) {
      setLocal(next);
    }
    onValueChange?.(next);
  };
  return (
    <fieldset disabled={blocked} className="m-0 min-w-0 border-0 p-0">
      {label ? <legend className="mb-2 text-sm font-medium">{label}</legend> : null}
      <RadioRoot
        {...props}
        id={props.id ?? field.id}
        value={selected}
        aria-label={props['aria-label'] ?? label}
        aria-labelledby={
          props['aria-label'] || label
            ? props['aria-labelledby']
            : (props['aria-labelledby'] ?? field.labelledBy)
        }
        aria-describedby={
          [props['aria-describedby'], field.describedBy].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={props['aria-invalid'] ?? (field.invalid || status === 'error' || undefined)}
        aria-readonly={readOnly || undefined}
        required={props.required ?? field.required}
        disabled={blocked}
        orientation={orientation}
        className={cn(
          'flex gap-3',
          orientation === 'vertical' ? 'flex-col items-start' : 'flex-row flex-wrap',
        )}
        onValueChange={publish}
        onKeyDownCapture={(event) => {
          latestSelection.current = selected;
          props.onKeyDownCapture?.(event);
          const next = nextRadioValue(event, options, {
            disabled: blocked,
            readOnly,
            orientation,
            dir: props.dir,
            loop: props.loop,
          });
          if (next !== undefined) {
            publish(next);
          }
        }}
        onPointerDownCapture={(event) => {
          latestSelection.current = selected;
          props.onPointerDownCapture?.(event);
        }}
      >
        {options.map((option) => {
          const id = `${baseId}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                'inline-flex min-w-0 items-center gap-2 leading-relaxed',
                choiceLabelSize[size],
                (blocked || option.disabled) && 'cursor-not-allowed opacity-50',
              )}
            >
              <RadioControl
                id={id}
                value={option.value}
                disabled={blocked || option.disabled}
                size={size}
                status={status ?? (field.invalid ? 'error' : undefined)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </RadioRoot>
    </fieldset>
  );
}

export interface RadioProps
  extends
    ChoiceAppearance,
    Omit<
      ComponentProps<typeof RadioControl>,
      'className' | 'style' | 'value' | 'asChild' | 'onChange'
    > {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  value?: string;
  name?: string;
  label?: ReactNode;
}

/** A standalone radio represents one choice; use Radio.Group for mutually exclusive option sets. */
function RadioSingle({
  checked,
  defaultChecked = false,
  onCheckedChange,
  value = 'on',
  name,
  children,
  label,
  size = 'md',
  status,
  disabled,
  readOnly,
  ...props
}: RadioProps) {
  const field = useFieldControl();
  const blocked = Boolean(disabled || field.disabled);
  const [local, setLocal] = useState(defaultChecked);
  const generatedId = useId();
  return (
    <RadioRoot
      value={(checked ?? local) ? value : ''}
      name={name}
      disabled={blocked}
      required={props.required ?? field.required}
      onValueChange={() => {
        if (readOnly) {
          return;
        }
        if (checked === undefined) {
          setLocal(true);
        }
        onCheckedChange?.(true);
      }}
    >
      <label
        htmlFor={props.id ?? field.id ?? generatedId}
        className={cn('inline-flex items-center gap-2', choiceLabelSize[size])}
      >
        <RadioControl
          {...props}
          id={props.id ?? field.id ?? generatedId}
          value={value}
          size={size}
          status={status ?? (field.invalid ? 'error' : undefined)}
          disabled={blocked}
          aria-invalid={props['aria-invalid'] ?? (field.invalid || status === 'error' || undefined)}
          aria-describedby={
            [props['aria-describedby'], field.describedBy].filter(Boolean).join(' ') || undefined
          }
          aria-readonly={readOnly || undefined}
        />
        {(label ?? children) ? <span>{label ?? children}</span> : null}
      </label>
    </RadioRoot>
  );
}

export const Radio = Object.assign(RadioSingle, { Group: RadioGroup });
