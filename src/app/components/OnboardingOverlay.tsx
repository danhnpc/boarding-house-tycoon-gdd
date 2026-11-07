// Four-step onboarding overlay (GDD 9.2):
// 1. Collect the first rent.
// 2. Accept the first candidate.
// 3. Open Room Detail.
// 4. Upgrade or build a room when the player can afford it.
// Each step advances when its action completes; the tour is skippable and its
// completion is saved (open-questions C3 default).

import { useEffect, useState } from 'react';
import {
  completeOnboardingStep,
  dismissOnboarding,
  onboardingProgress,
} from '../onboarding-state';
import { useGameStore, useUiStore } from '../../state/game-store';
import { t } from '../i18n';
import { STARTING_CASH_MINOR } from '../../domain/config/balance';

export function OnboardingOverlay() {
  const [progress, setProgress] = useState(onboardingProgress);
  const gameState = useGameStore((s) => s.gameState);
  const selectedRoomId = useUiStore((s) => s.selectedRoomId);

  useEffect(() => {
    if (gameState === null || progress.dismissed) {
      return;
    }
    const cashCollected = gameState.player.cashMinorUnits > STARTING_CASH_MINOR;
    const firstTenantAccepted = gameState.missions.completedMissionNumbers.includes(1);
    const roomDetailOpened = selectedRoomId !== null;
    const invested =
      gameState.building.rooms.some((room) => room.level >= 2) ||
      gameState.building.rooms.length >= 3;

    let highest = progress.completed;
    const bump = (step: number) => {
      highest = Math.max(highest, step);
    };
    if (cashCollected) bump(1);
    if (firstTenantAccepted) bump(2);
    if (roomDetailOpened) bump(3);
    if (invested) bump(4);

    if (highest !== progress.completed) {
      setProgress(completeOnboardingStep(highest));
    }
  }, [gameState, selectedRoomId, progress]);

  if (gameState === null || progress.dismissed) {
    return null;
  }

  const currentStep = Math.min(progress.completed + 1, 4);

  return (
    <aside className="onboarding" aria-label={t('onboarding.title')} data-step={currentStep}>
      <strong>{t('onboarding.title')}</strong>
      <span className="onboarding-step">{t('onboarding.step', { n: currentStep })}</span>
      <p>{t(`onboarding.step.${currentStep}.text`)}</p>
      <button type="button" onClick={() => setProgress(dismissOnboarding())}>
        {t('onboarding.skip')}
      </button>
    </aside>
  );
}
