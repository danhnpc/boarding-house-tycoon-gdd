// Onboarding + MVP-completion dismissals (GDD 9.2, open-questions C5).
// These are local-preference flags rather than gameplay state: they survive
// resets? No — wiping the save restarts the tour, by design. They live next
// to the save store so the Settings reset clears them together.

export interface OnboardingProgress {
  /** Highest COMPLETED step, 0–4 (GDD 9.2 has 4 steps). */
  completed: number;
  /** Tour was skipped or finished: no overlay. */
  dismissed: boolean;
  /** Congratulation screen was seen for this run. */
  congratsDismissed: boolean;
}

const PROGRESS_KEY = 'bht-onboarding';

function load(): OnboardingProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw === null) {
      return { completed: 0, dismissed: false, congratsDismissed: false };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { completed: 0, dismissed: false, congratsDismissed: false };
    }
    const record = parsed as Partial<OnboardingProgress>;
    return {
      completed: typeof record.completed === 'number' ? Math.max(0, Math.min(4, record.completed)) : 0,
      dismissed: record.dismissed === true,
      congratsDismissed: record.congratsDismissed === true,
    };
  } catch {
    return { completed: 0, dismissed: false, congratsDismissed: false };
  }
}

function save(progress: OnboardingProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Best-effort.
  }
}

export function onboardingProgress(): OnboardingProgress {
  return load();
}

export function completeOnboardingStep(completed: number): OnboardingProgress {
  const next = { ...load(), completed: Math.max(load().completed, completed) };
  if (next.completed >= 4) {
    next.dismissed = true;
  }
  save(next);
  return next;
}

export function dismissOnboarding(): OnboardingProgress {
  const next = { ...load(), dismissed: true };
  save(next);
  return next;
}

export function dismissCongratulation(): OnboardingProgress {
  const next = { ...load(), congratsDismissed: true };
  save(next);
  return next;
}

/** Settings reset clears the tour together with the save (GDD 9.4). */
export function resetOnboardingState(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Best effort.
  }
}
