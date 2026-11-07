// Settings slice (GDD 9.4): sound toggle, storage-persist status, reset save
// with the destructive-action confirmation owned by the caller. Preferences
// are separate from the game save — resetting a save must not reset settings.

import { create } from 'zustand';

interface SettingsState {
  soundEnabled: boolean;
  storagePersisted: boolean | null;
  open: boolean;
  congratsDismissed: boolean;
  toggleOpen: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setStoragePersisted: (value: boolean) => void;
  setCongratsDismissed: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: true,
  storagePersisted: null,
  open: false,
  congratsDismissed: false,
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  setStoragePersisted: (storagePersisted) => set({ storagePersisted }),
  setCongratsDismissed: (congratsDismissed) => set({ congratsDismissed }),
}));

const SOUND_KEY = 'bht-sound-enabled';

export function loadSoundPreference(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function saveSoundPreference(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
  } catch {
    // Best effort.
  }
}
