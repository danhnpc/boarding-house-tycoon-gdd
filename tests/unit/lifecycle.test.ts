// Lifecycle flush wiring (ADR 0002): listeners save on hide, are idempotent,
// and are removable. Uses a minimal fake window; no DOM required.

import { describe, expect, it, vi } from 'vitest';
import { installLifecycleFlush, removeLifecycleFlush } from '../../src/platform/lifecycle';
import type { GameApp } from '../../src/application/game-app';

function fakeWindow(initial: 'visible' | 'hidden' = 'visible') {
  const target = new EventTarget();
  const doc = { visibilityState: initial };
  const win = Object.assign(target, { document: doc });
  return {
    win: win as unknown as Window,
    setVisibility(state: 'visible' | 'hidden') {
      doc.visibilityState = state;
      target.dispatchEvent(new Event('visibilitychange'));
    },
    pagehide() {
      target.dispatchEvent(new Event('pagehide'));
    },
  };
}

function fakeGame() {
  const saveNow = vi.fn(() => Promise.resolve());
  return { game: { saveNow } as unknown as GameApp, saveNow };
}

describe('lifecycle flush', () => {
  it('saves when the page becomes hidden and on pagehide, not when visible', () => {
    const { win, setVisibility, pagehide } = fakeWindow();
    const { game, saveNow } = fakeGame();
    installLifecycleFlush(game, win);

    setVisibility('visible');
    expect(saveNow).toHaveBeenCalledTimes(0);

    setVisibility('hidden');
    expect(saveNow).toHaveBeenCalledTimes(1);

    pagehide();
    expect(saveNow).toHaveBeenCalledTimes(2);
    removeLifecycleFlush(win);
  });

  it('installing twice does not double-register listeners', () => {
    const { win, pagehide } = fakeWindow();
    const { game, saveNow } = fakeGame();
    installLifecycleFlush(game, win);
    installLifecycleFlush(game, win);

    pagehide();
    expect(saveNow).toHaveBeenCalledTimes(1);
    removeLifecycleFlush(win);
  });

  it('removeLifecycleFlush stops further saves', () => {
    const { win, setVisibility, pagehide } = fakeWindow();
    const { game, saveNow } = fakeGame();
    installLifecycleFlush(game, win);
    removeLifecycleFlush(win);

    setVisibility('hidden');
    pagehide();
    expect(saveNow).toHaveBeenCalledTimes(0);
  });
});
