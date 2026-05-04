'use client';

import { create } from 'zustand';

export type UiId = 'ui1a' | 'ui1b' | 'ui2';

export type UiStore = {
  activeUi: UiId;
  setActiveUi: (ui: UiId) => void;
  resetUi: () => void;
};

export const UI_STORAGE_KEY = 'branching-chat-prototype:ui:v2';
const DEFAULT_UI: UiId = 'ui2';

function readPersistedUi(): UiId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (raw === 'ui1a' || raw === 'ui1b' || raw === 'ui2') return raw;
    if (raw === 'ui1') return 'ui1a';
    return null;
  } catch {
    return null;
  }
}

function persistUi(ui: UiId) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_STORAGE_KEY, ui);
  } catch {
    // ignore
  }
}

function clearPersistedUi() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(UI_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const useUiStore = create<UiStore>(set => {
  const initial = readPersistedUi() ?? DEFAULT_UI;

  return {
    activeUi: initial,
    setActiveUi: ui => {
      persistUi(ui);
      set({ activeUi: ui });
    },
    resetUi: () => {
      clearPersistedUi();
      set({ activeUi: DEFAULT_UI });
    },
  };
});

