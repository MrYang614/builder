import { createContext, use, useState, type ReactNode } from 'react';
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
const Context = createContext<
  | ((message: string, save?: boolean, params?: Record<string, string | number>) => Promise<Result>)
  | null
>(null);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<{
    message: string;
    save: boolean;
    params?: Record<string, string | number>;
    resolve: (r: Result) => void;
  } | null>(null);
  const finish = (r: Result) => {
    pending?.resolve(r);
    setPending(null);
  };
  return (
    <Context
      value={(message, save = false, params) =>
        new Promise((resolve) => setPending({ message, save, params, resolve }))
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
