// MVP-completion screen (GDD 7.2, open-questions C5): one congratulation with
// a run summary, then the player continues freely — no new missions.

import { useState } from 'react';
import { activeMission } from '../../../domain/mission/missions';
import { useGameStore } from '../../../state/game-store';
import { useSettingsStore } from '../../settings-state';
import { dismissCongratulation, onboardingProgress } from '../../onboarding-state';
import { t } from '../../i18n';
import { formatCash } from '../../format/cash';

export function CongratulationScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const storedDismissed = useSettingsStore((s) => s.congratsDismissed);
  const setCongratsDismissed = useSettingsStore((s) => s.setCongratsDismissed);
  const [mountedFlag, setMountedFlag] = useState(() =>
    onboardingProgress().congratsDismissed,
  );
  const dismissed = mountedFlag || storedDismissed;

  if (gameState === null || dismissed) {
    return null;
  }
  if (activeMission(gameState) !== null) {
    return null; // chain not finished yet
  }

  const rooms = gameState.building.rooms;
  const occupied = rooms.filter((room) => room.tenantId !== null).length;
  const level3 = rooms.filter((room) => room.level === 3).length;

  return (
    <div className="event-dialog-backdrop" role="presentation">
      <section className="event-dialog congrats" aria-label={t('congrats.title')}>
        <h2>{t('congrats.title')}</h2>
        <p>{t('congrats.note')}</p>
        <ul>
          <li>{t('congrats.stat.rooms', { n: rooms.length })}</li>
          <li>{t('congrats.stat.occupied', { n: occupied })}</li>
          <li>{t('congrats.stat.level3', { n: level3 })}</li>
          <li>{t('congrats.stat.cash', { amount: formatCash(gameState.player.cashMinorUnits) })}</li>
          <li>
            {t('congrats.stat.lifetimeGross', {
              amount: formatCash(gameState.player.lifetimeGrossIncomeMinorUnits),
            })}
          </li>
        </ul>
        <button
          type="button"
          onClick={() => {
            dismissCongratulation();
            setMountedFlag(true);
            setCongratsDismissed(true);
          }}
        >
          {t('congrats.continue')}
        </button>
      </section>
    </div>
  );
}
