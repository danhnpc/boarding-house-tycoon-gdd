// Lifecycle flush (ADR 0002, skill rules 9–10): best-effort save on
// visibilitychange/pagehide. Correctness must not depend on these callbacks —
// the 60-second autosave inside GameApp is the safety net.

import type { GameApp } from '../application/game-app';

let listeners: Array<[string, EventListener]> = [];

export function installLifecycleFlush(gameApp: GameApp, win: Window): void {
  const flush = () => {
    void gameApp.saveNow();
  };
  const onVisibility = () => {
    if (win.document.visibilityState === 'hidden') {
      flush();
    }
  };
  listeners = [
    ['visibilitychange', onVisibility],
    ['pagehide', flush],
  ];
  for (const [type, handler] of listeners) {
    win.addEventListener(type, handler, { passive: true });
  }
}

export function removeLifecycleFlush(win: Window): void {
  for (const [type, handler] of listeners) {
    win.removeEventListener(type, handler);
  }
  listeners = [];
}
