import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Copy, Square, Minus, X } from 'lucide-react';
import { IconButton } from '@building/ui';
import { createWindowControls, type WindowControls as NativeWindowControls } from '../platform';
import { useEditor } from '../app/services';
import { useLanguage } from './i18n';

const interactiveHeaderSelector =
  'button,a,input,textarea,select,[role="button"],[role="combobox"],[data-slot="tooltip-trigger"],[contenteditable="true"]';

function isHeaderBackground(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    event.currentTarget.contains(target) &&
    !target.closest(interactiveHeaderSelector)
  );
}

export function HeaderWindow({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  const { t } = useLanguage();
  const services = useEditor();
  const [controls, setControls] = useState<NativeWindowControls | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    const failure = () => {
      if (active) {
        services.notice.set({ key: 'windowControlFailure', error: true });
      }
    };
    void createWindowControls()
      .then(async (next) => {
        if (!active || !next) {
          return;
        }
        setControls(next);
        const unsubscribe = await next.subscribeMaximized((value) => {
          if (active) {
            setMaximized(value);
          }
        }, failure);
        if (active) {
          cleanup = unsubscribe;
        } else {
          unsubscribe();
        }
      })
      .catch(failure);
    return () => {
      active = false;
      cleanup?.();
    };
  }, [services]);
  const act = async (action: () => Promise<void>) => {
    if (pending) {
      return;
    }
    setPending(true);
    try {
      await action();
    } catch {
      services.notice.set({ key: 'windowControlFailure', error: true });
    } finally {
      setPending(false);
    }
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native titlebar dragging keeps the header landmark; window actions already have keyboard-accessible buttons.
    <header
      className="main-toolbar"
      role="banner"
      onMouseDown={(event) => {
        if (!controls || event.button !== 0 || !isHeaderBackground(event)) {
          return;
        }
        event.preventDefault();
        if (event.detail === 1) {
          void act(() => controls.startDragging());
        }
      }}
      onDoubleClick={(event) => {
        if (controls && event.button === 0 && isHeaderBackground(event)) {
          event.preventDefault();
          void act(() => controls.toggleMaximize());
        }
      }}
    >
      {children}
      <div className="header-window">
        {actions}
        {controls && (
          <fieldset className="window-controls" aria-label={t('app')}>
            <IconButton
              label={t('windowMinimize')}
              disabled={pending}
              onClick={() => void act(() => controls.minimize())}
            >
              <Minus aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t(maximized ? 'windowRestore' : 'windowMaximize')}
              disabled={pending}
              onClick={() => void act(() => controls.toggleMaximize())}
            >
              {maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
            </IconButton>
            <IconButton
              label={t('windowClose')}
              className="window-close"
              disabled={pending}
              onClick={() => void act(() => controls.close())}
            >
              <X aria-hidden="true" />
            </IconButton>
          </fieldset>
        )}
      </div>
    </header>
  );
}
