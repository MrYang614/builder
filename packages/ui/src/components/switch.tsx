import { useId, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { SwitchControl } from '../primitives/choice-controls';
import { useFieldControl } from './form';
import { choiceLabelSize } from './choice-shared';
import type { ChoiceAppearance } from './choice-shared';

export interface SwitchProps
  extends
    Omit<
      ComponentProps<typeof SwitchControl>,
      'className' | 'style' | 'onCheckedChange' | 'asChild' | 'size' | 'status'
    >,
    ChoiceAppearance {
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
}

/** Switch state changes are boolean events, while Radix preserves keyboard and hidden form behavior. */
export function Switch({
  children,
  label,
  checked,
  defaultChecked = false,
  onCheckedChange,
  size = 'md',
  status,
  disabled,
  readOnly,
  ...props
}: SwitchProps) {
  const field = useFieldControl();
  const generatedId = useId();
  const [local, setLocal] = useState(defaultChecked);
  const id = props.id ?? field.id ?? generatedId;
  const blocked = Boolean(disabled || field.disabled);
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex min-w-0 items-center gap-2 leading-relaxed',
        choiceLabelSize[size],
        blocked && 'cursor-not-allowed opacity-50',
      )}
    >
      <SwitchControl
        {...props}
        id={id}
        checked={checked ?? local}
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
          if (checked === undefined) {
            setLocal(next);
          }
          onCheckedChange?.(next);
        }}
      />
      {(label ?? children) ? <span>{label ?? children}</span> : null}
    </label>
  );
}
