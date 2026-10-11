import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@building/ui';
import { useLanguage } from './i18n';
type Result = 'save' | 'discard' | 'confirm' | 'cancel';
type Pending = {
  message: string;
  save: boolean;
  params?: Record<string, string | number>;
  resolve: (r: Result) => void;
};
const Context = createContext<
  | ((message: string, save?: boolean, params?: Record<string, string | number>) => Promise<Result>)
  | null
>(null);
/** Owns one confirmation; replacement and unmount settle older callers as cancellation. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  useEffect(
    () => () => {
      pendingRef.current?.resolve('cancel');
      pendingRef.current = null;
    },
    [],
  );
  const finish = (r: Result) => {
    pendingRef.current?.resolve(r);
    pendingRef.current = null;
    setPending(null);
  };
  return (
    <Context
      value={(message, save = false, params) =>
        new Promise((resolve) => {
          pendingRef.current?.resolve('cancel');
          const next = { message, save, params, resolve };
          pendingRef.current = next;
          setPending(next);
        })
      }
    >
      {children}
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) {
            finish('cancel');
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>{t(pending?.save ? 'unsaved' : 'confirm')}</DialogTitle>
          <DialogDescription>{t(pending?.message ?? 'confirm', pending?.params)}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => finish('cancel')}>
              {t('cancel')}
            </Button>
            {pending?.save ? (
              <>
                <Button variant="secondary" onClick={() => finish('discard')}>
                  {t('discard')}
                </Button>
                <Button onClick={() => finish('save')}>{t('save')}</Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => finish('confirm')}>
                {t('delete')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Context>
  );
}
export function useConfirm() {
  const c = use(Context);
  if (!c) {
    throw new Error('ConfirmProvider required');
  }
  return c;
}
