import { useId, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { CheckboxControl } from '../primitives/choice-controls';
import { useFieldControl } from './form';
import { choiceLabelSize } from './choice-shared';
import type { ChoiceAppearance, ChoiceOption } from './choice-shared';

export interface CheckboxProps
  extends
    Omit<
      ComponentProps<typeof CheckboxControl>,
      | 'className'
      | 'style'
      | 'checked'
      | 'defaultChecked'
      | 'onCheckedChange'
      | 'asChild'
      | 'size'
      | 'status'
    >,
    ChoiceAppearance {
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
}

/** Wraps Radix's native form and keyboard semantics with a label and one boolean value event. */
function CheckboxSingle({
  children,
  label,
  checked,
  defaultChecked = false,
  indeterminate = false,
  onCheckedChange,
  size = 'md',
  status,
  disabled,
  readOnly,
  ...props
}: CheckboxProps) {
  const field = useFieldControl();
  const generatedId = useId();
  const [localChecked, setLocalChecked] = useState(defaultChecked);
  const selected = checked ?? localChecked;
  const blocked = Boolean(disabled || field.disabled);
  const id = props.id ?? field.id ?? generatedId;
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex min-w-0 items-center gap-2 leading-relaxed',
        choiceLabelSize[size],
        blocked && 'cursor-not-allowed opacity-50',
      )}
    >
      <CheckboxControl
        {...props}
        id={id}
        checked={indeterminate ? 'indeterminate' : selected}
        size={size}
        status={status ?? (field.invalid ? 'error' : undefined)}
        disabled={blocked}
        required={props.required ?? field.required}
        aria-readonly={readOnly || undefined}
        aria-invalid={props['aria-invalid'] ?? (field.invalid || status === 'error' || undefined)}
        aria-describedby={
          [props['aria-describedby'], field.describedBy].filter(Boolean).join(' ') || undefined
        }
        onCheckedChange={(next) => {
          if (readOnly) {
            return;
          }
          const result = next === true;
          if (checked === undefined) {
            setLocalChecked(result);
          }
          onCheckedChange?.(result);
        }}
      />
      {(label ?? children) ? <span>{label ?? children}</span> : null}
    </label>
  );
}

export interface CheckboxGroupProps extends ChoiceAppearance {
  options: readonly ChoiceOption[];
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
  name?: string;
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  id?: string;
  'aria-label'?: string;
}

/** Array membership stays keyed by option value even when options are reordered or temporarily absent. */
function CheckboxGroup({
  options,
  value,
  defaultValue = [],
  onValueChange,
  name,
  label,
  orientation = 'vertical',
  id,
  'aria-label': ariaLabel,
  ...appearance
}: CheckboxGroupProps) {
  const field = useFieldControl();
  const blocked = Boolean(appearance.disabled || field.disabled);
  const generatedId = useId();
  const [localValue, setLocalValue] = useState(defaultValue);
  const selected = value ?? localValue;
  return (
    <fieldset
      id={id ?? field.id}
      disabled={blocked}
      aria-label={ariaLabel ?? label}
      aria-labelledby={ariaLabel || label ? undefined : field.labelledBy}
      aria-describedby={field.describedBy}
      aria-invalid={field.invalid || appearance.status === 'error' || undefined}
      className="m-0 min-w-0 border-0 p-0"
    >
      {label ? <legend className="mb-2 text-sm font-medium">{label}</legend> : null}
      <div
        className={cn(
          'flex gap-3',
          orientation === 'vertical' ? 'flex-col items-start' : 'flex-row flex-wrap',
        )}
      >
        {options.map((option) => (
          <CheckboxSingle
            {...appearance}
            id={`${id ?? generatedId}-${option.value}`}
            key={option.value}
            name={name}
            value={option.value}
            required={false}
            checked={selected.includes(option.value)}
            disabled={blocked || option.disabled}
            onCheckedChange={(next) => {
              const result = next
                ? [...selected, option.value]
                : selected.filter((entry) => entry !== option.value);
              if (value === undefined) {
                setLocalValue(result);
              }
              onValueChange?.(result);
            }}
          >
            {option.label}
          </CheckboxSingle>
        ))}
      </div>
    </fieldset>
  );
}

export const Checkbox = Object.assign(CheckboxSingle, { Group: CheckboxGroup });
