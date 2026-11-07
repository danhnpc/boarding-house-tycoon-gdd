// Recoverable boot-error screen (skill rule 8): shows what went wrong, keeps
// the stored record until an explicit player choice, and offers retry or
// explicit destructive reset. Never silently starts a fresh game.

import { IndexedDbSaveAdapter } from '../../persistence/indexeddb-adapter';
import { resetOnboardingState } from '../onboarding-state';
import { useGameStore } from '../../state/game-store';

const adapter = new IndexedDbSaveAdapter();

export function BootErrorScreen() {
  const bootError = useGameStore((s) => s.bootError);
  if (bootError === null) {
    return null;
  }
  const corrupt = bootError.kind === 'corrupt';

  return (
    <div className="event-dialog-backdrop" role="presentation">
      <section className="event-dialog boot-error" aria-label="Lỗi lưu game">
        <h2>Không đọc được bản lưu</h2>
        <p>
          {corrupt
            ? 'Dữ liệu lưu trên máy này hỏng hoặc không chuẩn — tiến trình cũ không đọc được.'
            : 'Bản lưu này được ghi từ một phiên bản mới hơn của game.'}
        </p>
        <p className="panel-error">{bootError.raw}</p>
        <p className="settings-note">
          Bản lưu gốc vẫn được giữ nguyên trên máy. Lựa chọn của bạn:
        </p>
        <div className="panel-actions">
          <button type="button" className="secondary" onClick={() => window.location.reload()}>
            Thử tải lại
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              // Explicit player choice only (skill anti-pattern: silent reset).
              void adapter.clear().then(() => {
                resetOnboardingState();
                window.location.reload();
              });
            }}
          >
            Xoá save và chơi từ đầu
          </button>
        </div>
      </section>
    </div>
  );
}
