// Stores a music file the player picked on their own machine (IndexedDB), so it survives restarts.
// The file never leaves the computer and is not part of the repository.
const DB = 'cyberdeck-music';
const STORE = 'tracks';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export const saveCustomTrack = (file) => tx('readwrite', (s) => s.put({ blob: file, name: file.name, type: file.type }, 'custom'));
export const loadCustomTrack = () => tx('readonly', (s) => s.get('custom')).catch(() => undefined);
export const deleteCustomTrack = () => tx('readwrite', (s) => s.delete('custom'));

// Credits for known official tracks, matched by file name.
const KNOWN = [
  {
    match: /rebel\s*path/i,
    credit: '"The Rebel Path" — P.T. Adamczyk · Cyberpunk 2077 Original Score · © CD PROJEKT S.A.',
  },
];

export function creditFor(name) {
  const k = KNOWN.find((x) => x.match.test(name));
  return k ? k.credit : `"${name.replace(/\.[^.]+$/, '')}" — custom track loaded by the player`;
}
