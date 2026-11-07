import {
  BUILD_COST_MINOR,
  EVENT_COST_MINOR,
} from '../../domain/config/balance';
import { gameApp } from '../game-bootstrap';
import { useGameStore } from '../../state/game-store';
import { t } from '../i18n';
import { formatCash } from '../format/cash';

// Event dialog content is data, not sprinkled conditionals (tech doc 5.3).
const EVENT_CHOICES: Record<
  string,
  Array<{ id: string; labelKey: string; costMinor: number }>
> = {
  'utility-outage': [
    { id: 'pay', labelKey: 'event.choice.utility-outage.pay', costMinor: EVENT_COST_MINOR['utility-outage.pay'] },
    { id: 'wait', labelKey: 'event.choice.utility-outage.wait', costMinor: 0 },
  ],
  'hallway-clutter': [
    { id: 'warn', labelKey: 'event.choice.hallway-clutter.warn', costMinor: 0 },
    { id: 'hire', labelKey: 'event.choice.hallway-clutter.hire', costMinor: EVENT_COST_MINOR['hallway-clutter.hire'] },
  ],
  'water-tap': [
    { id: 'repair', labelKey: 'event.choice.water-tap.repair', costMinor: EVENT_COST_MINOR['water-tap.repair'] },
    { id: 'delay', labelKey: 'event.choice.water-tap.delay', costMinor: 0 },
  ],
  'noise-complaint': [
    { id: 'warn', labelKey: 'event.choice.noise-complaint.warn', costMinor: 0 },
    { id: 'mediator', labelKey: 'event.choice.noise-complaint.mediator', costMinor: EVENT_COST_MINOR['noise-complaint.mediator'] },
  ],
  'group-of-students': [
    { id: 'accept', labelKey: 'event.choice.group-of-students.accept', costMinor: 0 },
    { id: 'decline', labelKey: 'event.choice.group-of-students.decline', costMinor: 0 },
  ],
};

export function EventDialog() {
  const gameState = useGameStore((s) => s.gameState);
  if (gameState === null) {
    return null;
  }
  const eventId = gameState.events.activeEventId;
  if (eventId === null || EVENT_CHOICES[eventId] === undefined) {
    return null;
  }
  const choices = EVENT_CHOICES[eventId];
  const targetRoomId = (
    gameState.building.rooms.find(
      (room) => gameState.events.eventPayload?.targetTenantId !== undefined && room.tenantId === gameState.events.eventPayload?.targetTenantId,
      )?.roomId ?? '—'
  );

  return (
    <div className="event-dialog-backdrop" role="presentation">
      <section className="event-dialog" aria-label="Event">
        <h2>{t(`event.title.${eventId}`)}</h2>
        <p>
          {t(`event.desc.${eventId}`, { n: targetRoomId.slice(5) })}
        </p>
        <div className="panel-actions">
          {choices.map((choice) => {
            const affordable = gameState.player.cashMinorUnits >= choice.costMinor;
            return (
              <button
                key={choice.id}
                type="button"
                disabled={!affordable}
                onClick={() => {
                  const result = gameApp.execute({ type: 'RESOLVE_EVENT', choiceId: choice.id });
                  if (!result.ok) {
                    console.error('event resolve failed', result.reason);
                  }
                }}
              >
                {t(choice.labelKey, choice.costMinor === 0 ? undefined : { amount: formatCash(choice.costMinor) })}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// BUILD button strip is defined here for panel consumption.
export const BUILDABLE_ROOM_COSTS = BUILD_COST_MINOR;
