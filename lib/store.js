// ブラウザ内(IndexedDB)への保存。作業の続き・AI画像の履歴を端末に保管します
const DB_NAME = 'ksvox-studio';
const STORE = 'kv';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export const idbGet = (key) => run('readonly', (s) => s.get(key));
export const idbSet = (key, value) => run('readwrite', (s) => s.put(value, key));
export const idbDel = (key) => run('readwrite', (s) => s.delete(key));

// 画像(キャンバス)→保存用データ。同じ画像は一度だけ変換する
const blobCache = new WeakMap();
export function rememberBlob(source, blob) {
  blobCache.set(source, blob);
}
export function sourceToBlob(source) {
  if (blobCache.has(source)) return Promise.resolve(blobCache.get(source));
  return new Promise((resolve) => {
    source.toBlob(
      (b) => {
        blobCache.set(source, b);
        resolve(b);
      },
      'image/jpeg',
      0.92
    );
  });
}
