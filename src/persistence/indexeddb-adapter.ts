// Raw IndexedDB adapter (ADR 0002). The domain never sees this layer; the
// adapter stays replaceable so a cloud adapter can take its place later.
// Phase 2 adds the atomic offline checkpoint transaction beside these calls.

const DATABASE_NAME = 'boarding-house-tycoon';
const DATABASE_VERSION = 1;
const STORE_NAME = 'saves';
const SAVE_KEY = 'slot-1';

export interface SaveAdapter {
  read(): Promise<unknown | null>;
  write(record: unknown): Promise<void>;
  clear(): Promise<void>;
}

export class IndexedDbSaveAdapter implements SaveAdapter {
  async read(): Promise<unknown | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(SAVE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async write(record: unknown): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, SAVE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => reject(tx.error ?? new Error('write transaction aborted'));
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => reject(tx.error ?? new Error('clear transaction aborted'));
      tx.onerror = () => reject(tx.error);
    });
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/** Storage-durability request (ADR 0002/0003; skill rule 9). Best-effort. */
export function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) {
    return Promise.resolve(false);
  }
  return navigator.storage.persist().catch(() => false);
}
