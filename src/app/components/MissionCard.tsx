import { MAIN_MISSIONS, activeMission } from '../../domain/mission/missions';
import { useGameStore } from '../../state/game-store';
import { t } from '../i18n';
import { formatCash } from '../format/cash';

function objectiveKey(kind: string, target: number): string {
  switch (kind) {
    case 'TENANTS_COUNT':
      return `mission.objective.tenants.${target}`;
    case 'ROOM_AT_LEVEL':
      return `mission.objective.roomLevel.${target}`;
    case 'ROOMS_BUILT':
      return `mission.objective.roomsBuilt.${target}`;
    case 'OCCUPIED_ROOMS':
      return `mission.objective.occupied.${target}`;
    case 'ROOMS_AT_LEVEL_2_PLUS':
      return `mission.objective.level2plus.${target}`;
    default:
      return 'mission.done';
  }
}

export function MissionCard() {
  const gameState = useGameStore((s) => s.gameState);
  if (gameState === null) {
    return null;
  }
  const mission = activeMission(gameState);
  if (mission === null) {
    return <p className="mission-card">{t('mission.done')}</p>;
  }
  const inChain = MAIN_MISSIONS.some((m) => m.number === mission.number);
  if (!inChain) {
    return null;
  }
  const key = objectiveKey(mission.objective.kind, mission.objective.target);
  const objectiveText = t(key).startsWith('mission.') ? key : t(key);

  return (
    <p className="mission-card">
      {t('mission.active', {
        number: mission.number,
        objective: objectiveText,
      })}{' '}
      · {t('mission.reward', { amount: formatCash(mission.rewardMinor) })}
    </p>
  );
}
