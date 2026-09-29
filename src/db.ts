/** Kleine IndexedDB-laag: sleutel/waarde, plays en selecties. */
import type { Play, Squad } from './types'

const DB_NAME = 'polobord'
const VERSION = 1
type StoreName = 'kv' | 'plays' | 'squads'

let dbp: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('plays')) db.createObjectStore('plays', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('squads')) db.createObjectStore('squads', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      }),
  )
}

export const kvGet = <T>(key: string) => tx<T>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T>)
export const kvSet = (key: string, value: unknown) => tx('kv', 'readwrite', (s) => s.put(value, key))

export const playsAll = () => tx<Play[]>('plays', 'readonly', (s) => s.getAll() as IDBRequest<Play[]>).then((r) => r ?? [])
export const playPut = (p: Play) => tx('plays', 'readwrite', (s) => s.put(p))
export const playDelete = (id: string) => tx('plays', 'readwrite', (s) => s.delete(id))

export const squadsAll = () => tx<Squad[]>('squads', 'readonly', (s) => s.getAll() as IDBRequest<Squad[]>).then((r) => r ?? [])
export const squadPut = (q: Squad) => tx('squads', 'readwrite', (s) => s.put(q))
export const squadDelete = (id: string) => tx('squads', 'readwrite', (s) => s.delete(id))

/** Vraag de browser om de opslag niet op te ruimen (Safari ruimt anders na 7 dagen niet-gebruik op). */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {})
}
