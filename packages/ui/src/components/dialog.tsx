import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type Ref,
} from 'react';
import {
  Dialog as DialogPrimitive,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../primitives/dialog';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Alert } from './alert';
import type { ComponentSize } from './component-types';

export interface DialogProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  trigger?: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: ComponentSize;
  dismissible?: boolean;
  closeLabel?: string;
  showCloseButton?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  role?: 'dialog' | 'alertdialog';
  ref?: Ref<HTMLDivElement>;
}

/** The primitive preserves draft Escape handling, the focus trap, scroll visibility and opener restoration. */
export function Dialog({
  title,
  description,
  children,
  footer,
  trigger,
  size = 'md',
  dismissible = true,
  closeLabel = 'Close',
  showCloseButton = true,
  initialFocusRef,
  role = 'dialog',
  ref,
  ...props
}: DialogProps) {
  return (
    <DialogPrimitive {...props}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        ref={ref}
        role={role}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...(showCloseButton && dismissible
          ? { showCloseButton: true, closeLabel }
          : { showCloseButton: false })}
        className={cn(
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
        onEscapeKeyDown={(event) => {
          if (!dismissible) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (!dismissible) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          if (initialFocusRef?.current) {
            event.preventDefault();
            initialFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </DialogPrimitive>
  );
}

export interface ConfirmDialogProps extends Omit<
  DialogProps,
  'footer' | 'dismissible' | 'role' | 'initialFocusRef'
> {
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  destructive?: boolean;
  loading?: boolean;
  confirmErrorLabel?: string;
}

/** Async confirmation closes only after success; stale completion cannot update a replaced or unmounted dialog. */
export function ConfirmDialog({
  open,
  defaultOpen = false,
  onOpenChange,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
  confirmErrorLabel = 'The action failed. Please try again.',
  children,
  ...props
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const isOpen = open ?? internalOpen;
  const [previousOpen, setPreviousOpen] = useState(isOpen);
  // An externally closed/reopened confirmation starts a fresh request state.
  // This guarded render adjustment avoids showing a stale pending action for one frame.
  if (previousOpen !== isOpen) {
    setPreviousOpen(isOpen);
    setPending(false);
    setError(undefined);
  }
  useEffect(() => {
    if (!isOpen) {
      generation.current += 1;
      busy.current = false;
    }
  }, [isOpen]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  function changeOpen(next: boolean) {
    setInternalOpen(next);
    setError(undefined);
    onOpenChange?.(next);
    if (!next) {
      onCancel?.();
    }
  }
  async function confirm() {
    if (busy.current || loading) {
      return;
    }
    busy.current = true;
    const current = ++generation.current;
    setPending(true);
    setError(undefined);
    try {
      await onConfirm();
      if (current === generation.current) {
        setInternalOpen(false);
        onOpenChange?.(false);
      }
    } catch (failure) {
      if (current === generation.current) {
        setError(failure instanceof Error ? failure.message : confirmErrorLabel);
      }
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <Dialog
      {...props}
      open={isOpen}
      onOpenChange={changeOpen}
      role="alertdialog"
      initialFocusRef={cancelRef}
      dismissible={!pending && !loading}
      showCloseButton={false}
      footer={
        <>
          <Button
            ref={cancelRef}
            variant="outline"
            disabled={pending || loading}
            onClick={() => changeOpen(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={pending || loading}
            onClick={() => {
              void confirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error && <Alert variant="destructive" description={error} />}
    </Dialog>
  );
}
