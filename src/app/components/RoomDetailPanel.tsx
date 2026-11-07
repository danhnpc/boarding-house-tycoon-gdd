import { useState } from 'react';
import {
  MAX_LEVEL,
  RENT_PER_GAME_DAY_MINOR,
  TENANT_BUDGET_PER_GAME_DAY_MINOR,
  UPGRADE_COST_MINOR,
} from '../../domain/config/balance';
import { gameBridge } from '../../game/bridge/gameBridge';
import { gameApp } from '../game-bootstrap';
import { useGameStore, useUiStore } from '../../state/game-store';
import { t } from '../i18n';
import { formatCash } from '../format/cash';

interface RoomDetailPanelProps {
  roomId: string;
}

export function RoomDetailPanel({ roomId }: RoomDetailPanelProps) {
  const gameState = useGameStore((s) => s.gameState);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  if (gameState === null) {
    return null;
  }
  const room = gameState.building.rooms.find((r) => r.roomId === roomId);
  if (room === undefined) {
    return null;
  }
  const tenant =
    room.tenantId !== null
      ? gameState.tenants.find((tn) => tn.tenantId === room.tenantId)
      : undefined;
  const nextLevel = room.level < MAX_LEVEL ? (room.level + 1) as 2 | 3 : null;
  const unlocked = nextLevel === null ? false : nextLevel <= gameState.progression.unlockedMaxLevel;
  const upgradeCostMinor = nextLevel === null ? null : UPGRADE_COST_MINOR[nextLevel];
  const tenantBlocks =
    tenant !== undefined &&
    nextLevel !== null &&
    TENANT_BUDGET_PER_GAME_DAY_MINOR[tenant.archetype] <
      RENT_PER_GAME_DAY_MINOR[nextLevel];
  const upgradeReady =
    nextLevel !== null &&
    unlocked &&
    !tenantBlocks &&
    upgradeCostMinor !== null &&
    gameState.player.cashMinorUnits >= upgradeCostMinor;

  const runUpgrade = () => {
    const result = gameApp.execute({ type: 'UPGRADE_ROOM', roomId });
    setErrorReason(result.ok ? null : result.reason);
  };

  const runMoveOut = () => {
    if (!window.confirm(t('room.moveOutConfirm'))) {
      return;
    }
    const result = gameApp.execute({ type: 'MOVE_OUT', roomId });
    setErrorReason(result.ok ? null : result.reason);
  };

  const missing = nextLevel !== null && (!unlocked || tenantBlocks);

  return (
    <aside className="room-panel" aria-label={t('room.detail')}>
      <h2>
        Phòng {roomId.slice(5)} · {t('room.level', { level: room.level })}
      </h2>
      <dl>
        <dt>Người thuê</dt>
        <dd>{tenant ? t(`tenant.archetype.${tenant.archetype}`) : t('room.vacant')}</dd>
        <dt>Tiền thuê</dt>
        <dd>{t('room.rent', { amount: formatCash(RENT_PER_GAME_DAY_MINOR[room.level]) })}</dd>
      </dl>
      <div className="panel-actions">
        {nextLevel !== null ? (
          <button type="button" onClick={runUpgrade} disabled={!upgradeReady}>
            {t('room.upgradeToLevel', {
              level: nextLevel,
              amount: formatCash(upgradeCostMinor ?? 0),
            })}
            {missing ? ' — chưa thể nâng cấp' : ''}
          </button>
        ) : null}
        {tenant ? (
          <button type="button" className="secondary" onClick={runMoveOut}>
            {t('room.moveOut')}
          </button>
        ) : null}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            // Selection is UI-owned state: clear it via the UI store directly.
            if (import.meta.env.DEV) {
              console.log('[bht-close] clicked');
            }
            useUiStore.getState().clearSelection();
            gameBridge.sendCommand({ type: 'CLEAR_SELECTION' });
          }}
        >
          {t('close')}
        </button>
      </div>
      {errorReason !== null ? (
        <p className="panel-error">
          {t(`room.error.${errorReason}`) !== `room.error.${errorReason}`
            ? t(`room.error.${errorReason}`)
            : t('error.command', { reason: errorReason })}
        </p>
      ) : null}
    </aside>
  );
}
