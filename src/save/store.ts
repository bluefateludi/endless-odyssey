const databaseName = 'endless-odyssey'
const storeName = 'characters'
const activeSlot = 'hero'

export class SaveConflict extends Error {}

export interface Slot<T> {
  schema: 1
  revision: number
  hero: T
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('请关闭另一个打开游戏的标签页，再重试。'))
  })
}

export async function readSlot<T>(isHero: (value: unknown) => value is T): Promise<Slot<T> | null> {
  const db = await openDatabase()
  try {
    const value = await new Promise<Slot<unknown> | undefined>((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get(activeSlot)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (value === undefined) return null
    if (value?.schema !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || !isHero(value.hero)) {
      throw new Error('无法读取此版本的角色存档。已保留原始记录。')
    }
    return { schema: 1, revision: value.revision, hero: value.hero }
  } finally {
    db.close()
  }
}

/** Compare the revision inside the same transaction as the write, including across tabs. */
export async function writeSlot<T>(hero: T, expectedRevision: number): Promise<number> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const previous = store.get(activeSlot)
      let conflict = false
      previous.onsuccess = () => {
        const saved = previous.result
        if (saved === undefined ? expectedRevision !== 0 : saved?.schema !== 1 || saved.revision !== expectedRevision) {
          conflict = true
          tx.abort()
          return
        }
        store.put({ schema: 1, revision: expectedRevision + 1, hero }, activeSlot)
      }
      tx.oncomplete = () => resolve(expectedRevision + 1)
      tx.onabort = () => reject(conflict ? new SaveConflict('其他标签页已有更新，请重新载入角色。') : tx.error ?? new Error('保存中断'))
      tx.onerror = () => reject(tx.error ?? new Error('保存失败'))
    })
  } finally {
    db.close()
  }
}
