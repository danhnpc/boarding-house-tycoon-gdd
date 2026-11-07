import { gameBridge } from '../../game/bridge/gameBridge';

// Spike-only static labels. Real room data comes from the canonical
// GameState in Phase 1; player-facing copy moves into src/locales/vi.json
// in Phase 2 (tech doc 15, Phase 2 open items).
const ROOM_LABELS: Record<string, string> = {
  'room-1': 'Room 1',
  'room-2': 'Room 2',
  'room-3': 'Room 3',
};

interface RoomDetailPanelProps {
  roomId: string;
}

export function RoomDetailPanel({ roomId }: RoomDetailPanelProps) {
  return (
    <aside className="room-panel" aria-label="Room Detail">
      <h2>{ROOM_LABELS[roomId] ?? roomId}</h2>
      <dl>
        <dt>Level</dt>
        <dd>Level 1 (placeholder)</dd>
        <dt>Status</dt>
        <dd>Selected via Phaser hit area</dd>
      </dl>
      <button
        type="button"
        onClick={() => gameBridge.sendCommand({ type: 'CLEAR_SELECTION' })}
      >
        Close
      </button>
    </aside>
  );
}
