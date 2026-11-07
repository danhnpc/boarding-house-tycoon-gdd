import {
  RENT_PER_GAME_DAY_MINOR,
  TENANT_BUDGET_PER_GAME_DAY_MINOR,
} from '../../domain/config/balance';
import { gameApp } from '../game-bootstrap';
import { useGameStore } from '../../state/game-store';
import { t } from '../i18n';
import { formatCash } from '../format/cash';

export function TenantPanel() {
  const gameState = useGameStore((s) => s.gameState);
  if (gameState === null) {
    return null;
  }
  const candidates = gameState.candidates;

  return (
    <aside className="tenant-panel" aria-label={t('tenant.title')}>
      <h3>{t('tenant.title')}</h3>
      {candidates.length === 0 ? <p>{t('tenant.noQueue')}</p> : null}
      {candidates.map((candidate) => {
        const budget = TENANT_BUDGET_PER_GAME_DAY_MINOR[candidate.archetype];
        const compatible = gameState.building.rooms.filter(
          (room) => room.tenantId === null && budget >= RENT_PER_GAME_DAY_MINOR[room.level],
        );
        return (
          <div key={candidate.candidateId} className="candidate">
            <strong>{t(`tenant.archetype.${candidate.archetype}`)}</strong>
            <span className="candidate-budget">
              {t('tenant.budget', { amount: formatCash(budget) })}
            </span>
            <div className="candidate-actions">
              {compatible.length === 0 ? (
                <span className="panel-error">Không có phòng trống phù hợp</span>
              ) : (
                compatible.map((room) => (
                  <button
                    key={room.roomId}
                    type="button"
                    onClick={() => {
                      const result = gameApp.execute({
                        type: 'ACCEPT_CANDIDATE',
                        candidateId: candidate.candidateId,
                        roomId: room.roomId,
                      });
                      if (!result.ok) {
                        console.error('accept failed', result.reason);
                      }
                    }}
                  >
                    {t('tenant.acceptInto', { n: room.roomId.slice(5) })}
                  </button>
                ))
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void gameApp.execute({
                    type: 'REJECT_CANDIDATE',
                    candidateId: candidate.candidateId,
                  });
                }}
              >
                {t('tenant.reject')}
              </button>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
