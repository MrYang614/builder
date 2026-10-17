import { createContext, use, useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Label } from '../primitives/label';

interface FieldControl {
  id?: string;
  describedBy?: string;
  labelledBy?: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldControl>({
  invalid: false,
  required: false,
  disabled: false,
});

/** Controls reuse these associations without cloning children or knowing their component type. */
export function useFieldControl(): FieldControl {
  return use(FieldContext);
}

export interface FormItemProps {
  children: ReactNode;
  id?: string;
  htmlFor?: string;
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  announceError?: boolean;
  required?: boolean;
  disabled?: boolean;
  orientation?: 'vertical' | 'horizontal';
}

/** Owns a stable label/control/help/error relationship; domain validation remains with callers. */
function FormItem({
  children,
  id,
  htmlFor,
  label,
  help,
  error,
  announceError = true,
  required = false,
  disabled = false,
  orientation = 'vertical',
}: FormItemProps) {
  const parent = useFieldControl();
  const blocked = parent.disabled || disabled;
  const generatedId = useId();
  const controlId = htmlFor ?? id ?? generatedId;
  const helpId = `${controlId}-help`;
  const labelId = `${controlId}-label`;
  const errorId = `${controlId}-error`;
  const describedBy =
    [help ? helpId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext
      value={{
        id: controlId,
        labelledBy: label ? labelId : undefined,
        describedBy,
        invalid: Boolean(error),
        required,
        disabled: blocked,
      }}
    >
      <div
        data-slot="field"
        data-orientation={orientation}
        data-invalid={Boolean(error)}
        data-disabled={blocked}
        className={cn(
          'min-w-0 gap-1.5',
          orientation === 'vertical'
            ? 'flex flex-col'
            : label
              ? 'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-x-3'
              : 'grid grid-cols-1',
        )}
      >
        {label && (
          <Label
            id={labelId}
            data-slot="field-label"
            htmlFor={controlId}
            onClick={() => {
              // Radix thumbs and group containers are not native labelable elements.
              const control = document.getElementById(controlId);
              if (control && !control.matches('input,textarea,select,button')) {
                const focusTarget = control.matches('[tabindex]')
                  ? control
                  : control.querySelector<HTMLElement>(
                      'input:not(:disabled),button:not(:disabled),[tabindex="0"]',
                    );
                focusTarget?.focus();
              }
            }}
            className={cn('min-w-0 text-xs leading-snug', orientation === 'horizontal' && 'py-1.5')}
          >
            {label}
            {required && (
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            )}
          </Label>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {children}
          {help && (
            <p
              id={helpId}
              data-slot="field-description"
              className="m-0 text-xs leading-relaxed text-muted-foreground"
            >
              {help}
            </p>
          )}
          {error && (
            <p
              id={errorId}
              data-slot="field-error"
              role={announceError ? 'alert' : undefined}
              className="m-0 text-xs leading-relaxed text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </FieldContext>
  );
}

export interface FormGroupProps {
  children: ReactNode;
  gap?: 'compact' | 'comfortable';
  columns?: 1 | 2;
}

function FormGroup({ children, gap = 'compact', columns = 1 }: FormGroupProps) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        'grid min-w-0',
        gap === 'compact' ? 'gap-3' : 'gap-6',
        columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
      )}
    >
      {children}
    </div>
  );
}

export interface FormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}

function FormSection({ title, description, children, disabled = false }: FormSectionProps) {
  const parent = useFieldControl();
  const blocked = parent.disabled || disabled;
  return (
    <FieldContext value={{ ...parent, disabled: blocked }}>
      <fieldset
        data-slot="field-set"
        disabled={blocked}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
      >
        {title && (
          <legend data-slot="field-legend" className="mb-3 text-sm font-medium">
            {title}
          </legend>
        )}
        {description && <p className="m-0 text-xs text-muted-foreground">{description}</p>}
        {children}
      </fieldset>
    </FieldContext>
  );
}

export type FormProps = Omit<ComponentProps<'form'>, 'className' | 'style'>;

function FormRoot(props: FormProps) {
  return <form data-slot="form" {...props} />;
}

export const Form = Object.assign(FormRoot, {
  Item: FormItem,
  Group: FormGroup,
  Section: FormSection,
});
