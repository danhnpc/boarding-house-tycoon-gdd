import { useOfflineToastStore } from '../../state/game-store';
import { t } from '../i18n';

export function OfflineToast() {
  const toast = useOfflineToastStore((s) => s.offlineToast);
  const dismiss = useOfflineToastStore((s) => s.dismissOfflineToast);
  if (toast === null) {
    return null;
  }
  return (
    <p className="offline-toast">
      {t('offline.earned', { amount: toast.creditedCash.toLocaleString('vi-VN') })}
      <button type="button" onClick={dismiss}>
        {t('close')}
      </button>
    </p>
  );
}
