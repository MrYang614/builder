import type { PreviewArgs } from './schema';
import { addons } from 'storybook/preview-api';
import { STORY_CHANGED } from 'storybook/internal/core-events';

export type HmrDraft = {
  code: string;
  config: string;
  args: PreviewArgs;
  baseline: { source: string; config: string };
};
type DraftStore = {
  drafts: Map<string, HmrDraft>;
  owners: Map<string, symbol>;
  updating: boolean;
  pendingResets: Map<string, () => void>;
};
const previous: unknown = import.meta.hot?.data.storybookDraftStore;
const store: DraftStore =
  previous && typeof previous === 'object' && 'drafts' in previous
    ? (previous as DraftStore)
    : { drafts: new Map(), owners: new Map(), updating: false, pendingResets: new Map() };
store.pendingResets ??= new Map();
if (import.meta.hot) {
  // Vite's hot data is page memory, never browser persistence or a file-write service.
  import.meta.hot.data.storybookDraftStore = store;
}
const channel = addons.getChannel();
const leaveStory = () => {
  store.drafts.clear();
  for (const resetArgs of store.pendingResets.values()) {
    resetArgs();
  }
  store.pendingResets.clear();
};
// Storybook emits this only for actual story/view-mode navigation, after tearing down old renders.
channel.on(STORY_CHANGED, leaveStory);
import.meta.hot?.dispose(() => {
  channel.off(STORY_CHANGED, leaveStory);
});

/** Only HMR creates a restorable snapshot; ordinary navigation always begins from repository files. */
export function peekHmrDraft(storyId: string): HmrDraft | undefined {
  return store.drafts.get(storyId);
}

/** Claims a mounted preview before an old HMR instance's deferred cleanup runs. */
export function claimDraft(storyId: string): symbol {
  const owner = Symbol(storyId);
  store.owners.set(storyId, owner);
  store.pendingResets.delete(storyId);
  store.updating = false;
  return owner;
}

/** Real story exits discard args; refresh cleanup followed by a new owner preserves the HMR snapshot. */
export function releaseDraft(storyId: string, owner: symbol, resetArgs: () => void) {
  queueMicrotask(() => {
    if (store.owners.get(storyId) !== owner) {
      return;
    }
    store.owners.delete(storyId);
    if (store.drafts.has(storyId)) {
      // Storybook applies its virtual-story HMR asynchronously, after Vite's afterUpdate event.
      store.pendingResets.set(storyId, resetArgs);
    } else if (!store.updating) {
      store.drafts.delete(storyId);
      resetArgs();
    }
  });
}

/** Captures pre-update args before Storybook installs new CSF baselines. */
export function saveHmrDraft(storyId: string, draft: HmrDraft) {
  store.updating = true;
  store.drafts.set(storyId, draft);
}

export function finishHmrUpdate() {
  store.updating = false;
}

export function discardHmrDraft(storyId: string) {
  store.drafts.delete(storyId);
}
