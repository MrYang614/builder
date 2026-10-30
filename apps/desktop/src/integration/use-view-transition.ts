import { useEffect, useRef } from 'react';
import { useEditor, useSignal } from '../app/services';

/** Bridges boundary-only UI state to the runtime-owned reference sequence; busy requests are ignored. */
export function useViewTransition() {
  const services = useEditor();
  const state = useSignal(services.viewTransition);
  const request = useRef<{ id: number; origin: '3d' | 'plan' | null }>({ id: 0, origin: null });
  useEffect(() => {
    // The lifecycle object stays stable; cleanup must invalidate the latest in-flight request.
    const current = request.current;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => services.runtimeRef.current?.cancelViewTransition();
    media.addEventListener('change', cancel);
    return () => {
      current.id++;
      media.removeEventListener('change', cancel);
      cancel();
      const origin = current.origin;
      if (origin) {
        services.viewMode.set(origin);
        services.viewTransition.set({ phase: 'idle', visible: origin });
      }
    };
  }, [services]);

  const switchView = async (target: '3d' | 'plan') => {
    const origin = services.viewMode.get();
    const runtime = services.runtimeRef.current;
    const framing = services.readPlanFraming();
    if (
      state.phase !== 'idle' ||
      services.viewTransition.get().phase !== 'idle' ||
      target === origin ||
      !runtime ||
      !framing
    ) {
      return;
    }
    const id = ++request.current.id;
    request.current.origin = origin;
    services.viewTransition.set({
      phase: target === '3d' ? 'enter-fade' : 'exit-orbit',
      visible: origin,
    });
    services.viewMode.set(target);
    let completed = false;
    try {
      completed = await runtime.transitionView(target, framing, {
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onPhase: (phase) => {
          if (id === request.current.id && phase !== 'idle') {
            services.viewTransition.set({ phase, visible: phase === 'exit-fade' ? 'plan' : '3d' });
          }
        },
      });
    } catch (error) {
      services.notice.set({
        key: 'geometry.failed',
        params: { reason: String(error) },
        error: true,
      });
    } finally {
      if (id === request.current.id) {
        request.current.origin = null;
        const settled = completed ? target : origin;
        services.viewMode.set(settled);
        services.viewTransition.set({ phase: 'idle', visible: settled });
      }
    }
  };
  return { state, switchView, transitioning: state.phase !== 'idle' };
}
