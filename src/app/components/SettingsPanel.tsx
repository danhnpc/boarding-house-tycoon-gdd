import { useEffect } from 'react';
import { IndexedDbSaveAdapter, requestPersistentStorage } from '../../persistence/indexeddb-adapter';
import {
  loadSoundPreference,
  saveSoundPreference,
  useSettingsStore,
} from '../settings-state';
import { t } from '../i18n';

const adapter = new IndexedDbSaveAdapter();

export function SettingsPanel() {
  const open = useSettingsStore((s) => s.open);
  const toggleOpen = useSettingsStore((s) => s.toggleOpen);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const storagePersisted = useSettingsStore((s) => s.storagePersisted);
  const setStoragePersisted = useSettingsStore((s) => s.setStoragePersisted);

  useEffect(() => {
    // Preference + storage status hydrate with the panel's first mount.
    setSoundEnabled(loadSoundPreference());
    void navigator.storage?.persisted?.().then(setStoragePersisted);
  }, [setSoundEnabled, setStoragePersisted]);

  if (!open) {
    return (
      <button
        type="button"
        className="settings-gear"
        aria-label="Cài đặt"
        onClick={toggleOpen}
      >
        ⚙️
      </button>
    );
  }

  return (
    <aside className="settings-panel" aria-label="Cài đặt">
      <h3>Cài đặt</h3>
      <label className="settings-row">
        <span>Âm thanh</span>
        <input
          type="checkbox"
          checked={soundEnabled}
          onChange={(event) => {
            const enabled = event.target.checked;
            setSoundEnabled(enabled);
            saveSoundPreference(enabled);
          }}
        />
      </label>
      <p className="settings-note">Hiệu ứng âm thanh ra mắt ở bản cập nhật sau.</p>

      <div className="settings-row">
        <span>
          Bộ nhớ lớn:{' '}
          {storagePersisted === null
            ? 'đang kiểm tra'
            : storagePersisted
              ? 'đã bật (dữ liệu khó bị xoá)'
              : 'chưa bật'}
        </span>
        {storagePersisted === false ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void requestPersistentStorage().then((granted) => {
                setStoragePersisted(granted);
              });
            }}
          >
            Xin cấp quyền
          </button>
        ) : null}
      </div>

      <p className="settings-note">
        Trên iOS Safari, thêm game vào Home Screen để tránh trình duyệt dọn dữ
        liệu khi lâu không mở.
      </p>

      <button
        type="button"
        className="danger"
        onClick={() => {
          const confirmed = window.confirm(
            'Xoá toàn bộ tiến trình trên thiết bị này? Hành động không thể hoàn tác.',
          );
          if (!confirmed) {
            return;
          }
          void adapter.clear().then(() => {
            window.location.reload();
          });
        }}
      >
        Xoá save game
      </button>

      <button type="button" className="secondary" onClick={toggleOpen}>
        {t('close')}
      </button>
    </aside>
  );
}
