// A separate database preserves the former independent calculator's data.
export function saveNamespace(url) {
  const path = new URL('.', url).pathname;
  return path === '/' ? 'gaculator-firebird' : `gaculator-firebird:${path}`;
}

export function openSaves(name = 'gaculator-firebird') {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other calculator windows to open storage.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export function storedState(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', value ? 'readwrite' : 'readonly');
    const store = tx.objectStore('state');
    const request = value ? store.put(value, 'current') : store.get('current');
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('State transaction failed.'));
  });
}

export function validateSave(value, identity) {
  if (!value || value.format !== 1 || value.identity !== identity ||
      !(value.bytes instanceof Uint8Array) || value.bytes.length < 64 || value.bytes.length > 170 * 1024 * 1024 ||
      !Number.isFinite(value.savedAt)) throw new Error('Saved state is incompatible or damaged; keep/export the backup before changing builds.');
  return value;
}
