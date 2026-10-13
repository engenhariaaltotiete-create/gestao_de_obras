import type { Work } from "../model";

let dbPromise:
  Promise<IDBDatabase> | undefined;

const db = () =>
  (
    dbPromise ??= new Promise<IDBDatabase>(
      (resolve, reject) => {
        const request = indexedDB.open(
          "sgo-drafts-v1",
          1,
        );

        request.onupgradeneeded = () => {
          request.result.createObjectStore(
            "drafts",
          );
        };

        request.onsuccess = () =>
          resolve(request.result);

        request.onerror = () =>
          reject(request.error);
      },
    )
  );

export async function saveDraft(
  key: string,
  value: Work | null,
) {
  const database = await db();

  await new Promise<void>(
    (resolve, reject) => {
      const transaction =
        database.transaction(
          "drafts",
          "readwrite",
        );

      const store =
        transaction.objectStore("drafts");

      if (value) {
        store.put(value, key);
      } else {
        store.delete(key);
      }

      transaction.oncomplete = () =>
        resolve();

      transaction.onerror = () =>
        reject(transaction.error);
    },
  );
}

export async function loadDraft(
  key: string,
) {
  const database = await db();

  return new Promise<
    Work | undefined
  >(
    (resolve, reject) => {
      const request = database
        .transaction("drafts")
        .objectStore("drafts")
        .get(key);

      request.onsuccess = () =>
        resolve(request.result);

      request.onerror = () =>
        reject(request.error);
    },
  );
}
